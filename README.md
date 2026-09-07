# One 10 Events

Community events portal for the **Events Organising Committee (EOC), One10** (PS One-10, New Town).

Handles multi-campaign **subscriptions**, **verified digital receipts**, **double-entry accounting**, bank reconciliation, procurement, operations, and period close — starting with **Durgotsav 2026**.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 (CRA) + Tailwind + React Router |
| Backend | FastAPI + Motor (MongoDB) |
| Payments | Razorpay (test/live) |
| Auth | Emergent Google OAuth (committee admin) |

## Features

**Public**
- Platform home (One 10 Events) with published campaigns
- Household subscribe & pay (Razorpay or test simulate)
- Find / verify receipts
- Programme, participate (volunteer/performer), transparency report

**Committee admin**
- Collection (online + cash/UTR/cheque maker-checker)
- Reconciliation, accounting journals, trial balance
- Procurement, advances, expenses
- Operations (volunteers, sponsors, inventory, announcements)
- Campaign cycles (create / publish / activate)
- Audit trail, period close, role-based access

## Quick start

### 1. Environment

Copy `.env.example` to `backend/.env` (and set frontend env):

```bash
cp .env.example backend/.env
```

Minimum required:

- `MONGO_URL` — MongoDB connection string
- `DB_NAME` — e.g. `one10_events`
- `REACT_APP_BACKEND_URL` — backend origin for the CRA app (no trailing `/api`)

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

On startup the API seeds chart of accounts, towers/flats demo data, Durgotsav 2026 (active), and a draft Diwali Milan 2026 campaign.

### 3. Frontend

```bash
cd frontend
npm install
REACT_APP_BACKEND_URL=http://localhost:8000 npm start
```

Open http://localhost:3000

### 4. Committee login

Use Emergent Google OAuth via `/admin/login`. First user / emails in `BOOTSTRAP_ADMIN_EMAILS` become `system_admin` + `convenor`.

For local API testing without OAuth, see [auth_testing.md](auth_testing.md).

## Money & cycles

- All amounts are **integer paise**
- Active campaign is `active_cycle_id` in settings; public subscribe/receipts use that cycle
- Switch campaigns in **Admin → Settings → Campaigns**

Default Durgotsav 2026 subscription: **₹3,500** = ₹2,500 (Khuti/Durga/Lakshmi) + ₹300 (Kali) + ₹700 (Bijoya).

## Production checklist (EOC)

Before going live, confirm in Settings / env:

1. Legal identity, address, PAN/registration
2. Committee contacts and authorised signatory
3. Bank account + Razorpay **live** keys + webhook secret
4. Approval thresholds and recon confidence
5. Refund / retention policy wording
6. Custom domain and email sender

## Repo layout

```
backend/          FastAPI app
frontend/         CRA public + admin UI
design_guidelines.json
auth_testing.md
```

## License / ownership

Internal EOC One10 community tool. Not a public open-source product unless the committee decides otherwise.
