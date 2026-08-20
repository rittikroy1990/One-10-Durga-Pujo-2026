"""Shared fixtures: base URL + per-role session tokens injected via Mongo."""
import os
import time
import subprocess
import json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
BASE_URL = BASE_URL.rstrip("/")

DB = "one10_durgotsav_2026"

ROLE_EMAIL = {
    "superadmin": "superadmin@one10.test",
    "convenor": "convenor@one10.test",
    "treasurer": "treasurer@one10.test",
    "collector": "collector@one10.test",
    "collector2": "collector@one10.test",   # placeholder; we'll create a second collector user
    "recon": "recon@one10.test",
    "auditor": "auditor@one10.test",
    "procure_maker": "procure.maker@one10.test",
    "procure_approver": "procure.approver@one10.test",
    "budget": "budget@one10.test",
    "pay_maker": "pay.maker@one10.test",
    "pay_approver": "pay.approver@one10.test",
}


def _mongo(script: str) -> str:
    r = subprocess.run(["mongosh", DB, "--quiet", "--eval", script],
                       capture_output=True, text=True, timeout=30)
    return (r.stdout or "").strip()


def _create_session_for(email: str) -> str:
    token = f"pytest_{email.split('@')[0].replace('.','_')}_{int(time.time()*1000)}"
    _mongo(
        f'var u=db.users.findOne({{email:"{email}"}});'
        f'if(u) db.user_sessions.insertOne({{user_id:u.user_id, session_token:"{token}", '
        f'expires_at:new Date(Date.now()+7*24*3600*1000), created_at:new Date()}});'
    )
    return token


def _ensure_second_collector():
    """Create a second collector user (for maker-checker where both must be collectors)."""
    out = _mongo(
        'var u=db.users.findOne({email:"collector2@one10.test"});'
        'if(!u){db.users.insertOne({user_id:"user_col2",email:"collector2@one10.test",'
        'name:"Second Collector",roles:["collector"],is_active:true,is_demo:true,'
        'created_at:new Date().toISOString()});}print("ok");'
    )
    return "ok" in out


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def tokens():
    _ensure_second_collector()
    m = {}
    m["superadmin"] = _create_session_for("superadmin@one10.test")
    m["convenor"] = _create_session_for("convenor@one10.test")
    m["treasurer"] = _create_session_for("treasurer@one10.test")
    m["collector"] = _create_session_for("collector@one10.test")
    m["collector2"] = _create_session_for("collector2@one10.test")
    m["recon"] = _create_session_for("recon@one10.test")
    m["auditor"] = _create_session_for("auditor@one10.test")
    m["procure_maker"] = _create_session_for("procure.maker@one10.test")
    m["procure_approver"] = _create_session_for("procure.approver@one10.test")
    m["budget"] = _create_session_for("budget@one10.test")
    m["pay_maker"] = _create_session_for("pay.maker@one10.test")
    m["pay_approver"] = _create_session_for("pay.approver@one10.test")
    return m


def auth(token, extra=None):
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h
