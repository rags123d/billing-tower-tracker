#!/usr/bin/env bash
# =============================================================================
# Billing Tower Tracker - VPS deploy script
# Server : Shared Hostinger KVM VPS (Ubuntu), runs as root
# Flow   : health checks -> git sync -> install -> build -> publish frontend
#          -> start BACKEND (Node API via PM2) -> start FRONTEND (Nginx) -> verify
#
# Usage  : bash deploy.sh                  deploy latest commit of $BRANCH
#          FORCE=1 bash deploy.sh          redeploy even if no new commits
#          BRANCH=develop bash deploy.sh   deploy a different branch
#          SKIP_PULL=1 bash deploy.sh      deploy the current checkout (rollback)
#          ALLOW_LOCALHOST=1 bash deploy.sh  ignore the localhost-in-bundle guard
# =============================================================================

set -Eeuo pipefail

# ----------------------------- Configuration ---------------------------------
APP_NAME="billing-tracker-api"
APP_DIR="/home/ubuntu/billing-tower-tracker"
WEBROOT="/var/www/billing-tracker/public"
PM2_CONFIG="ecosystem.config.cjs"
API_PORT="4000"
HEALTH_PATH="/api/auth/demo-users"
PUBLIC_URL="https://billing.spandanatech.in"
REMOTE="origin"
BRANCH="${BRANCH:-main}"
FORCE="${FORCE:-0}"
SKIP_PULL="${SKIP_PULL:-0}"
ALLOW_LOCALHOST="${ALLOW_LOCALHOST:-0}"
LOG_FILE="/var/log/billing-tracker-deploy.log"
LOCK_FILE="/var/lock/billing-tracker-deploy.lock"
TOTAL_STEPS=9

# Health thresholds
MEM_MIN_MB=300
DISK_WARN_PCT=85
DISK_FAIL_PCT=95

# ------------------------------ State ----------------------------------------
STEP=0
STEP_NAME="startup"
PREV_COMMIT=""
NEW_COMMIT=""
CODE_UPDATED=0
START_TS=$SECONDS

# ------------------------------ Logging --------------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_CYAN=""
fi

ts()     { date '+%Y-%m-%d %H:%M:%S'; }
log()    { printf '%s[%s]%s %s[INFO]%s  %s\n' "$C_DIM" "$(ts)" "$C_RESET" "$C_BLUE" "$C_RESET" "$*"; }
ok()     { printf '%s[%s]%s %s[ OK ]%s  %s\n' "$C_DIM" "$(ts)" "$C_RESET" "$C_GREEN" "$C_RESET" "$*"; }
warn()   { printf '%s[%s]%s %s[WARN]%s  %s\n' "$C_DIM" "$(ts)" "$C_RESET" "$C_YELLOW" "$C_RESET" "$*"; }
err()    { printf '%s[%s]%s %s[FAIL]%s  %s\n' "$C_DIM" "$(ts)" "$C_RESET" "$C_RED" "$C_RESET" "$*" >&2; }
die()    { err "$*"; exit 1; }
indent() { sed 's/^/        /'; }

step() {
  STEP=$((STEP + 1))
  STEP_NAME="$*"
  printf '\n%s========== Step %d/%d: %s ==========%s\n' "${C_BOLD}${C_CYAN}" "$STEP" "$TOTAL_STEPS" "$STEP_NAME" "$C_RESET"
}

check_url() {
  local url="$1" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)"
  if [ "$code" = "200" ]; then
    ok "${url} -> HTTP ${code}"
    return 0
  fi
  err "${url} -> HTTP ${code:-no response}"
  return 1
}

# ------------------------------ Traps ----------------------------------------
on_error() { err "Command failed at line $1: $2"; }

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    echo
    err "DEPLOY FAILED during step ${STEP}/${TOTAL_STEPS} (${STEP_NAME}), exit code ${code}"
    if [ "$CODE_UPDATED" = "1" ] && [ -n "$PREV_COMMIT" ]; then
      warn "Code was updated ${PREV_COMMIT} -> ${NEW_COMMIT}. To roll back:"
      warn "  cd ${APP_DIR} && git reset --hard ${PREV_COMMIT} && SKIP_PULL=1 bash deploy.sh"
      warn "Then revert the bad commit in git, or the next normal deploy will pull it again."
    fi
    warn "Full log: ${LOG_FILE}"
  fi
}

trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR
trap on_exit EXIT

# ------------------------------ Main -----------------------------------------
# Everything lives in main() so bash parses the whole file up front. This keeps
# the run safe even when "git merge" replaces deploy.sh while it is executing.
main() {
  [ "$(id -u)" -eq 0 ] || die "Run as root (PM2 apps on this server run under root): sudo bash deploy.sh"

  # Single-run lock + tee all output to a log file
  mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "Another deploy is already running (lock: ${LOCK_FILE})"
  exec > >(tee -a "$LOG_FILE") 2>&1

  echo
  log "Billing Tower Tracker deploy started"
  log "Host: $(hostname) | User: $(id -un) | Branch: ${BRANCH} | FORCE=${FORCE} SKIP_PULL=${SKIP_PULL}"

  # --------------------------------------------------------------------------
  step "Pre-flight checks"
  local cmd
  for cmd in git node npm pm2 nginx curl flock systemctl awk; do
    command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: ${cmd}"
  done
  ok "All required tools are installed"

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$node_major" -ge 18 ] || die "Node 18+ required (found $(node -v))"
  log "Node $(node -v) | npm $(npm -v) | PM2 $(pm2 -v 2>/dev/null | tail -n 1) | $(nginx -v 2>&1)"

  [ -d "${APP_DIR}/.git" ] || die "Not a git repository: ${APP_DIR}"
  cd "$APP_DIR"
  [ -f "$PM2_CONFIG" ] || die "Missing ${APP_DIR}/${PM2_CONFIG}"
  if [ -f .env ]; then ok ".env found"; else warn ".env missing - API will rely on PM2 env defaults"; fi
  ok "Project directory: ${APP_DIR}"

  # --------------------------------------------------------------------------
  step "System health check (CPU / memory / disk / services)"
  local cores load1 load5 load15
  cores="$(nproc)"
  read -r load1 load5 load15 _ < /proc/loadavg
  log "CPU cores: ${cores} | load average (1m/5m/15m): ${load1} / ${load5} / ${load15}"
  log "$(top -bn1 | grep -m1 'Cpu(s)' | sed 's/^ *//' || true)"
  if awk -v l="$load1" -v c="$cores" 'BEGIN { exit !(l > c) }'; then
    warn "1-minute load (${load1}) is above the core count (${cores}) - server is busy, build may be slow"
  else
    ok "CPU load is healthy"
  fi
  log "Top CPU consumers:"
  { ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -n 6 || true; } | indent

  local mem_total mem_avail
  mem_total="$(free -m | awk '/^Mem:/ {print $2}')"
  mem_avail="$(free -m | awk '/^Mem:/ {print $7}')"
  log "Memory: ${mem_avail} MB available of ${mem_total} MB total"
  if [ "$mem_avail" -lt "$MEM_MIN_MB" ]; then
    warn "Available memory is under ${MEM_MIN_MB} MB - the build may be killed by the OOM killer"
  else
    ok "Memory is sufficient"
  fi

  local disk_pct disk_free
  disk_pct="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
  disk_free="$(df -h / | awk 'NR==2 {print $4}')"
  log "Disk usage on /: ${disk_pct}% (${disk_free} free)"
  if [ "$disk_pct" -ge "$DISK_FAIL_PCT" ]; then
    die "Disk is ${disk_pct}% full - free up space before deploying"
  elif [ "$disk_pct" -ge "$DISK_WARN_PCT" ]; then
    warn "Disk is ${disk_pct}% full - consider cleaning up soon"
  else
    ok "Disk space is healthy"
  fi

  if systemctl is-active --quiet nginx; then ok "nginx is active"; else die "nginx is not running (check: systemctl status nginx)"; fi
  if systemctl is-active --quiet mongod; then ok "mongod is active"; else warn "mongod is not active - the API may fail if it needs MongoDB (check: systemctl status mongod)"; fi

  log "Current PM2 processes:"
  { pm2 list 2>/dev/null || true; } | indent

  # --------------------------------------------------------------------------
  step "Sync code from Git (${REMOTE}/${BRANCH})"
  local need_install=0
  PREV_COMMIT="$(git rev-parse --short HEAD)"
  log "Currently deployed: $(git log -1 --format='%h  %s  (%an, %ar)')"

  if [ -n "$(git -c core.fileMode=false status --porcelain --untracked-files=no)" ]; then
    git -c core.fileMode=false status --short --untracked-files=no | indent
    die "Tracked files were modified on the VPS. Make changes locally and push them. To discard the VPS edits: cd ${APP_DIR} && git checkout -- ."
  fi

  if [ "$SKIP_PULL" = "1" ]; then
    warn "SKIP_PULL=1 - deploying the current checkout as-is (${PREV_COMMIT})"
  else
    log "Fetching ${REMOTE}/${BRANCH}..."
    git fetch --prune "$REMOTE" "$BRANCH" 2>&1 | indent

    if [ "$(git rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]; then
      log "Switching to branch ${BRANCH}"
      git checkout "$BRANCH" 2>&1 | indent
    fi

    local local_sha remote_sha
    local_sha="$(git rev-parse HEAD)"
    remote_sha="$(git rev-parse "${REMOTE}/${BRANCH}")"

    if [ "$local_sha" = "$remote_sha" ]; then
      if [ "$FORCE" = "1" ]; then
        warn "No new commits, but FORCE=1 - redeploying anyway"
      else
        ok "Already up to date at ${PREV_COMMIT} - nothing to deploy (use FORCE=1 to redeploy anyway)"
        exit 0
      fi
    else
      log "Incoming commits:"
      git --no-pager log --oneline --no-decorate "${local_sha}..${remote_sha}" | indent
      git merge --ff-only "${REMOTE}/${BRANCH}" 2>&1 | indent
      CODE_UPDATED=1
    fi
  fi

  NEW_COMMIT="$(git rev-parse --short HEAD)"
  if [ "$PREV_COMMIT" != "$NEW_COMMIT" ]; then
    log "Files changed:"
    git --no-pager diff --stat "$PREV_COMMIT" "$NEW_COMMIT" | indent
  fi
  ok "Code is now at ${NEW_COMMIT}"

  if [ "$FORCE" = "1" ] || [ "$SKIP_PULL" = "1" ] || [ ! -d node_modules ]; then
    need_install=1
  elif ! git diff --quiet "$PREV_COMMIT" "$NEW_COMMIT" -- package.json package-lock.json; then
    need_install=1
  fi

  # --------------------------------------------------------------------------
  step "Install dependencies"
  if [ "$need_install" -eq 1 ]; then
    if [ -f package-lock.json ]; then
      log "Running npm ci (clean install from lockfile)"
      npm ci --include=dev --no-audit --no-fund 2>&1 | indent
    else
      log "No lockfile found - running npm install"
      npm install --include=dev --no-audit --no-fund 2>&1 | indent
    fi
    ok "Dependencies installed"
  else
    ok "package.json / lockfile unchanged - skipping install"
  fi

  # --------------------------------------------------------------------------
  step "Build frontend (Vite)"
  rm -rf dist
  npm run build 2>&1 | indent
  [ -f dist/index.html ] || die "Build finished but dist/index.html is missing"
  ok "Build complete: $(du -sh dist | cut -f1) in dist/, $(find dist -type f | wc -l) files"

  if grep -rqIE 'localhost:4000|127\.0\.0\.1:4000' dist; then
    err "The built bundle still references localhost:4000 - browsers would call the visitor's own machine:"
    { grep -rlIE 'localhost:4000|127\.0\.0\.1:4000' dist || true; } | indent
    if [ "$ALLOW_LOCALHOST" = "1" ]; then
      warn "ALLOW_LOCALHOST=1 - continuing anyway"
    else
      die "Replace hardcoded URLs with relative /api paths, push, and redeploy. The live site was NOT changed."
    fi
  else
    ok "No hardcoded localhost API URLs in the bundle"
  fi

  # --------------------------------------------------------------------------
  step "Publish frontend to Nginx webroot (${WEBROOT})"
  mkdir -p "$WEBROOT"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete dist/ "${WEBROOT}/"
  else
    find "$WEBROOT" -mindepth 1 -delete
    cp -r dist/. "${WEBROOT}/"
  fi
  chown -R root:www-data "$WEBROOT"
  chmod -R 755 "$WEBROOT"
  ok "Published $(find "$WEBROOT" -type f | wc -l) files to ${WEBROOT}"

  # --------------------------------------------------------------------------
  step "Start BACKEND server (Node/Express via PM2: ${APP_NAME})"
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    log "Process found - restarting with fresh environment"
  else
    log "Process not registered - starting it"
  fi
  pm2 startOrRestart "$PM2_CONFIG" --only "$APP_NAME" --update-env 2>&1 | indent
  pm2 save 2>&1 | indent
  ok "PM2 process started and process list saved for reboot"

  # --------------------------------------------------------------------------
  step "Start FRONTEND server (Nginx serving the React build)"
  log "Frontend is static files in ${WEBROOT}, served by Nginx; /api is proxied to the backend on port ${API_PORT}"
  nginx -t 2>&1 | indent
  systemctl reload nginx
  ok "FRONTEND server (Nginx) config is valid and reloaded - serving build ${NEW_COMMIT}"

  # --------------------------------------------------------------------------
  step "Post-deploy verification"
  local api_url="http://127.0.0.1:${API_PORT}${HEALTH_PATH}" up=0 i
  log "Waiting for API at ${api_url} (up to 30s)..."
  for i in $(seq 1 30); do
    if curl -fs -o /dev/null --max-time 3 "$api_url"; then
      up=1
      break
    fi
    sleep 1
  done
  if [ "$up" -ne 1 ]; then
    err "API did not respond within 30s. Last PM2 log lines:"
    { pm2 logs "$APP_NAME" --lines 30 --nostream 2>&1 || true; } | indent
    die "Backend is not healthy"
  fi
  ok "BACKEND is healthy on port ${API_PORT} (responded after ~${i}s)"

  local failed=0 pid1 pid2
  pid1="$(pm2 pid "$APP_NAME" 2>/dev/null | tail -n 1 || true)"
  sleep 3
  pid2="$(pm2 pid "$APP_NAME" 2>/dev/null | tail -n 1 || true)"
  if [ -n "$pid1" ] && [ "$pid1" != "0" ] && [ "$pid1" = "$pid2" ]; then
    ok "Process is stable (PID ${pid1}, no restart loop)"
  else
    err "PID changed or process is not running (${pid1:-none} -> ${pid2:-none}) - check: pm2 logs ${APP_NAME}"
    failed=1
  fi

  log "Checking FRONTEND over HTTPS..."
  check_url "${PUBLIC_URL}/" || failed=1
  log "Checking BACKEND through the Nginx /api proxy over HTTPS..."
  check_url "${PUBLIC_URL}${HEALTH_PATH}" || failed=1
  [ "$failed" -eq 0 ] || die "One or more verification checks failed"

  log "Final PM2 status:"
  { pm2 list 2>/dev/null || true; } | indent

  # --------------------------------------------------------------------------
  local elapsed=$((SECONDS - START_TS))
  echo
  printf '%s================================================================%s\n' "$C_GREEN" "$C_RESET"
  ok "DEPLOY SUCCESSFUL in ${elapsed}s"
  if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
    log "Commit: ${NEW_COMMIT} (redeploy, no new commits)"
  else
    log "Commit: ${PREV_COMMIT} -> ${NEW_COMMIT}"
  fi
  log "Live at: ${PUBLIC_URL}"
  log "Logs: pm2 logs ${APP_NAME}  |  ${LOG_FILE}"
  printf '%s================================================================%s\n' "$C_GREEN" "$C_RESET"
}

main "$@"
exit $?
