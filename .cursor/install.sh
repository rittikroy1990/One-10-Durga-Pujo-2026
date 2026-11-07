#!/usr/bin/env bash
# Cloud Agent install — idempotent dependency bootstrap for One 10 Events.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# System packages needed at runtime (safe to re-run).
if ! command -v mongod >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gnupg curl libzbar0
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mongodb-org
fi
if ! dpkg -s python3.12-venv >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3.12-venv
fi
if ! dpkg -s libzbar0t64 >/dev/null 2>&1 && ! dpkg -s libzbar0 >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libzbar0 || true
fi

# Backend venv + Python deps
python3 -m venv backend/.venv
backend/.venv/bin/pip install -q -U pip
backend/.venv/bin/pip install -q -r backend/requirements.txt

# Local env for Cloud Agent (no production secrets).
if [ ! -f backend/.env ]; then
  cat > backend/.env <<'EOF'
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=one10_events_cloud
RECEIPT_TOKEN_SECRET=cloud-agent-local-dev-secret-not-for-prod
APP_URL=http://127.0.0.1:3000
BOOTSTRAP_ADMIN_EMAILS=convenor@one10.test
RAZORPAY_MODE=test
EOF
fi

# Frontend deps
cd frontend
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
