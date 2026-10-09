# Billing Tracker

A complete React + Vite + Express starter implementing the enterprise Billing Tower Tracker.

## Features
- **Authentication & Authorization**: Secure session-based login and logout with token expiration and protected APIs.
- **Role-Based Identities**: Supports Field Officers, System Administrators, and Finance Leads.
- **1-Click Quick Demo Login**: Fast testing switcher with pre-configured officer accounts.
- **Dynamic Workflow Stages**: Configurable stages by project type (BBMP Lakes, Standard).
- **Forward-Only Governance**: Enforced forward-only progression rules both in UI and API.
- **Immutable Audit Trail**: Tracks step changes, timestamps, and the specific authorizing officer who executed each step.
- **Completion Percentage & Live Status**: Visual stage progression indicators.
- **Documentation Photo Gallery**: Verification photo attachments with carousel navigation.
- **Responsive Layout**: High-end enterprise design system with dark topbar and glassmorphism accents.

## Demo User Accounts

| Role | Username / Email | Password | Department |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `billing_admin` or `billing_admin@billing.gov` | `Admin@Tower2026` | Executive & Systems Directorate |

## Run
Requirements: Node.js 18+.

```bash
npm install
npm run dev
```

Open:
- Frontend: http://localhost:5173
- API: http://localhost:4000

## API
### Authentication
- `POST /api/auth/login` - Body: `{ "identifier": "billing_admin", "password": "Admin@Tower2026" }`
- `POST /api/auth/logout` - Headers: `Authorization: Bearer <token>`
- `GET /api/auth/me` - Headers: `Authorization: Bearer <token>`
- `GET /api/auth/demo-users` - Public list of demo roles for quick login

### Billing & Workflows
- `GET /api/workflows`
- `GET /api/bills/BILL-1001` - Headers: `Authorization: Bearer <token>`
- `GET /api/bills/BILL-1001/audit` - Headers: `Authorization: Bearer <token>`
- `POST /api/bills/BILL-1001/transition` - Headers: `Authorization: Bearer <token>`
  - Body: `{ "step": 6 }`

## Production Note
The demo server stores sessions and data in memory for easy evaluation. For enterprise deployment, configure persistent databases (e.g., PostgreSQL / Redis) and production JWT/cookie configurations.
