# HRMS Client & Work Order Module — VPS Deployment Activity Guide

**Target Server:** Hostinger KVM VPS (Ubuntu) — `193.203.161.161`
**Domain Standard:** `spandanatech.in` (e.g. `hrms.spandanatech.in` or `workorder.spandanatech.in`)
**Convention:** Follows `/home/ubuntu/` working directory & Nginx `/var/www/` static webroot pattern.

---

## Deployment Summary Table

| Parameter | Configuration |
|---|---|
| Application | HRMS Client Management and Work Order Management Module |
| Repository | `github.com/<your-username>/HRMS_Client_WorkOrder_Module_Code` |
| Server | Shared Hostinger KVM VPS (Ubuntu) — `193.203.161.161` |
| Code Location | `/home/ubuntu/HRMS_Client_WorkOrder_Module_Code` |
| Backend Runtime | Node.js (via nvm or system Node) |
| Backend Entry Point | `backend/server.js` |
| Backend Port | `5000` (PM2 process: `hrms-client-workorder-api`) |
| Database | MongoDB — `mongodb://127.0.0.1:27017/hrms_db` |
| Frontend Webroot | `/var/www/hrms-client-workorder/public` |
| Domain | `hrms.spandanatech.in` (or chosen subdomain) |
| SSL | Let's Encrypt via Certbot |

---

## Step-by-Step Deployment Instructions

### Step 1 — Confirm Backend Entry Point & Port

**Entry File:** `backend/server.js` (starts Express server on `process.env.PORT || 5000`).

Check port availability on the VPS:

```bash
sudo ss -tulnp | grep 5000
```

> If port 5000 is occupied, set `PORT=4002` or `4003` in your `.env` and PM2 ecosystem.

### Step 2 — Clone Repository to `/home/ubuntu`

> Do **not** clone directly into `/var/www/`. Keep source code and `.git` in `/home/ubuntu/`.

```bash
cd /home/ubuntu
git clone https://github.com/<your-username>/HRMS_Client_WorkOrder_Module_Code.git
cd HRMS_Client_WorkOrder_Module_Code
```

### Step 3 — Install Dependencies & Create `.env`

1. Install project dependencies:

   ```bash
   npm install
   ```

2. Create environment configuration:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` if necessary (`PORT=5000`, `MONGO_URI=mongodb://127.0.0.1:27017/hrms_db`).

### Step 4 — Verify MongoDB Service

Ensure MongoDB is running on the VPS:

```bash
sudo systemctl status mongod
# If not running:
sudo systemctl start mongod
```

### Step 5 — Configure PM2 Process Manager

`ecosystem.config.js` is already included in the repository root:

```js
module.exports = {
  apps: [
    {
      name: "hrms-client-workorder-api",
      cwd: "/home/ubuntu/HRMS_Client_WorkOrder_Module_Code",
      script: "backend/server.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        MONGO_URI: "mongodb://127.0.0.1:27017/hrms_db"
      }
    }
  ]
};
```

Start and save the process in PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 list
```

### Step 6 — Deploy Frontend Webroot

Copy frontend static assets to `/var/www/hrms-client-workorder/public`:

```bash
sudo mkdir -p /var/www/hrms-client-workorder/public
sudo cp -r /home/ubuntu/HRMS_Client_WorkOrder_Module_Code/public/* /var/www/hrms-client-workorder/public/
sudo chown -R root:www-data /var/www/hrms-client-workorder/public
sudo chmod -R 755 /var/www/hrms-client-workorder/public
```

### Step 7 — Add DNS A Record in Hostinger hPanel

In Hostinger DNS Management for `spandanatech.in`:

- **Type:** A
- **Name:** `hrms` (or `workorder`)
- **Points to:** `193.203.161.161`
- **TTL:** 3600

Verify DNS resolution on the VPS:

```bash
nslookup hrms.spandanatech.in
```

### Step 8 — Create Nginx Virtual Host Configuration

Create `/etc/nginx/sites-available/hrms-client-workorder`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name hrms.spandanatech.in;

    location / {
        root /var/www/hrms-client-workorder/public;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads/ {
        alias /home/ubuntu/HRMS_Client_WorkOrder_Module_Code/uploads/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
```

Enable the Nginx site and test syntax:

```bash
sudo ln -s /etc/nginx/sites-available/hrms-client-workorder /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 9 — Issue SSL Certificate via Certbot

```bash
sudo certbot --nginx -d hrms.spandanatech.in
```

Verify HTTPS access:

```bash
curl -I https://hrms.spandanatech.in
```

---

## Final Verification Checklist

- [ ] `pm2 list` shows `hrms-client-workorder-api` as **online**.
- [ ] `curl -I http://127.0.0.1:5000/api/clients` returns `200 OK`.
- [ ] `https://hrms.spandanatech.in` loads the frontend UI over HTTPS.
- [ ] Sample client & sample work order seed data initialized in MongoDB.

---

*SiteCare Web Solutions — Internal Deployment Reference*
