#!/usr/bin/env bash
# Cloud Agent start — MongoDB + FastAPI + CRA for One 10 Events.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p /tmp/one10-mongo /tmp/one10-logs
if ! pgrep -x mongod >/dev/null 2>&1; then
  # Prefer dedicated data dir owned by the agent user (no systemd in Cloud Agent VMs).
  mongod --dbpath /tmp/one10-mongo --bind_ip 127.0.0.1 --port 27017 \
    --fork --logpath /tmp/one10-logs/mongod.log
fi
for _ in $(seq 1 40); do
  mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1 && break
  sleep 0.5
done

# Backend
if ! tmux has-session -t one10_api 2>/dev/null; then
  tmux new-session -d -s one10_api -c "$ROOT/backend" -- \
    bash -lc 'set -a; [ -f .env ] && . ./.env; set +a; exec .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000'
fi

# Frontend (CRA)
if ! tmux has-session -t one10_web 2>/dev/null; then
  tmux new-session -d -s one10_web -c "$ROOT/frontend" -- \
    bash -lc 'export BROWSER=none HOST=0.0.0.0 PORT=3000 REACT_APP_BACKEND_URL=http://127.0.0.1:8000; exec npm start'
fi

# Wait until both answer (best-effort; agent may begin earlier).
for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:8000/openapi.json >/dev/null 2>&1 && \
    curl -sf http://127.0.0.1:3000 >/dev/null 2>&1 && exit 0
  sleep 1
done
exit 0
