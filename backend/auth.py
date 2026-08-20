"""Emergent Google Auth session handling + backend-enforced RBAC and segregation-of-duties."""
import os

import requests
from fastapi import HTTPException, Request

from db import db, NO_ID
from util import iso, now_utc
from datetime import datetime, timezone, timedelta

SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
BOOTSTRAP_ADMIN_EMAILS = [e.strip().lower() for e in
                          (os.environ.get("BOOTSTRAP_ADMIN_EMAILS") or "").split(",") if e.strip()]

# --------------------------------------------------------------- Roles & permissions
ROLES = {
    "system_admin": "System administrator — technical configuration; no automatic financial approval.",
    "convenor": "EOC convenor / authorised approver.",
    "treasurer": "Treasurer — treasury, reconciliation, period preparation.",
    "collector": "Collection maker / collector.",
    "reconciliation_officer": "Reconciliation officer.",
    "budget_owner": "Budget owner / event lead.",
    "procurement_maker": "Procurement maker.",
    "procurement_approver": "Procurement approver.",
    "payment_maker": "Payment maker.",
    "payment_approver": "Payment approver.",
    "coordinator": "Volunteer / cultural coordinator.",
    "inventory_custodian": "Inventory custodian.",
    "auditor": "Read-only auditor.",
    "resident": "Resident / public user.",
}

P = {
    "settings:read", "settings:manage",
    "households:read", "households:write",
    "payments:read", "payments:manage",
    "manual:create", "manual:approve",
    "receipts:read", "receipts:manage",
    "refunds:create", "refunds:approve",
    "accounting:read", "accounting:post",
    "recon:read", "recon:manage",
    "budget:read", "budget:manage", "budget:approve",
    "procurement:create", "procurement:approve",
    "vendor:manage",
    "payment_run:create", "payment_run:approve",
    "advance:manage", "expense:create", "expense:approve",
    "ops:read", "ops:manage",
    "reports:read", "audit:read",
    "period:close", "public_report:publish",
    "users:manage", "documents:read", "documents:write",
}

ROLE_PERMISSIONS = {
    "system_admin": {"settings:read", "settings:manage", "users:manage", "audit:read",
                     "reports:read", "households:read", "payments:read", "receipts:read",
                     "accounting:read", "recon:read", "budget:read", "ops:read", "documents:read"},
    "convenor": {"settings:read", "reports:read", "audit:read", "households:read", "payments:read",
                 "receipts:read", "receipts:manage", "manual:approve", "refunds:approve",
                 "accounting:read", "recon:read", "budget:read", "budget:approve",
                 "procurement:approve", "payment_run:approve", "expense:approve",
                 "ops:read", "ops:manage", "period:close", "public_report:publish",
                 "advance:manage", "documents:read", "documents:write"},
    "treasurer": {"reports:read", "households:read", "payments:read", "payments:manage",
                  "receipts:read", "receipts:manage", "manual:approve", "refunds:create",
                  "accounting:read", "accounting:post", "recon:read", "recon:manage",
                  "budget:read", "payment_run:approve", "period:close",
                  "advance:manage", "documents:read", "documents:write", "audit:read"},
    "collector": {"households:read", "households:write", "payments:read", "manual:create",
                  "receipts:read", "documents:read", "documents:write"},
    "reconciliation_officer": {"payments:read", "recon:read", "recon:manage", "accounting:read",
                               "reports:read", "documents:read", "documents:write"},
    "budget_owner": {"budget:read", "budget:manage", "procurement:create", "reports:read",
                     "expense:create", "documents:read", "documents:write", "ops:read"},
    "procurement_maker": {"budget:read", "procurement:create", "vendor:manage", "documents:read",
                          "documents:write", "reports:read"},
    "procurement_approver": {"budget:read", "procurement:approve", "reports:read", "documents:read"},
    "payment_maker": {"payment_run:create", "accounting:read", "reports:read", "documents:read",
                      "documents:write"},
    "payment_approver": {"payment_run:approve", "accounting:read", "reports:read", "documents:read"},
    "coordinator": {"ops:read", "ops:manage", "documents:read", "documents:write"},
    "inventory_custodian": {"ops:read", "ops:manage", "documents:read"},
    "auditor": {"reports:read", "audit:read", "households:read", "payments:read", "receipts:read",
                "accounting:read", "recon:read", "budget:read", "ops:read", "documents:read",
                "settings:read"},
    "resident": set(),
}

# Toxic (segregation-of-duty) combinations to detect & report.
TOXIC_COMBINATIONS = [
    ("vendor:manage", "payment_run:approve", "Vendor creator should not approve payments"),
    ("expense:create", "expense:approve", "Expense claimant should not approve claims"),
    ("manual:create", "manual:approve", "Manual receipt maker should not approve"),
    ("procurement:create", "procurement:approve", "Procurement maker should not approve"),
    ("payment_run:create", "payment_run:approve", "Payment maker should not approve"),
]

REAUTH_PERMS = {"refunds:approve", "period:close", "vendor:manage", "payment_run:approve"}


def user_permissions(user: dict) -> set:
    perms = set()
    for r in user.get("roles", []):
        perms |= ROLE_PERMISSIONS.get(r, set())
    return perms


def has_perm(user: dict, perm: str) -> bool:
    return perm in user_permissions(user)


def sod_conflicts(roles: list[str]) -> list[dict]:
    perms = set()
    for r in roles:
        perms |= ROLE_PERMISSIONS.get(r, set())
    out = []
    for a, b, desc in TOXIC_COMBINATIONS:
        if a in perms and b in perms:
            out.append({"permission_a": a, "permission_b": b, "description": desc})
    return out


# --------------------------------------------------------------- Session handling
async def _get_session_token(request: Request) -> str | None:
    token = request.cookies.get("session_token")
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user(request: Request) -> dict:
    token = await _get_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, NO_ID)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    request.state.session_token = token
    return user


async def get_optional_user(request: Request):
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


def require(*perms: str):
    async def dep(request: Request) -> dict:
        user = await get_current_user(request)
        uperms = user_permissions(user)
        if not any(p in uperms for p in perms):
            raise HTTPException(status_code=403, detail=f"Requires one of permissions: {perms}")
        return user
    return dep


def require_reauth(request: Request):
    """High-risk actions must present X-Reauth: true (front-end re-auth confirmation)."""
    if request.headers.get("X-Reauth", "").lower() != "true":
        raise HTTPException(status_code=401, detail="Re-authentication required for this action")
    return True


async def exchange_session(session_id: str) -> dict:
    resp = requests.get(SESSION_DATA_URL, headers={"X-Session-ID": session_id}, timeout=20)
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session id")
    data = resp.json()
    email = (data.get("email") or "").lower()
    user = await db.users.find_one({"email": email})
    is_first = await db.users.count_documents({}) == 0
    if not user:
        roles = ["resident"]
        if is_first or email in BOOTSTRAP_ADMIN_EMAILS:
            roles = ["system_admin", "convenor"]
        from db import new_id
        user = {
            "user_id": new_id("user"),
            "email": email,
            "name": data.get("name", ""),
            "picture": data.get("picture", ""),
            "roles": roles,
            "is_active": True,
            "created_at": iso(),
        }
        await db.users.insert_one(dict(user))
    else:
        await db.users.update_one({"email": email},
                                  {"$set": {"name": data.get("name", user.get("name")),
                                            "picture": data.get("picture", user.get("picture"))}})
    session_token = data["session_token"]
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user["user_id"], "session_token": session_token,
        "expires_at": expires, "created_at": now_utc(),
    })
    return {"user": {k: v for k, v in user.items() if k != "_id"}, "session_token": session_token}


DEMO_USERS = [
    ("superadmin@one10.test", "Demo Super Admin", ["system_admin"]),
    ("convenor@one10.test", "Demo Convenor", ["convenor"]),
    ("treasurer@one10.test", "Demo Treasurer", ["treasurer"]),
    ("collector@one10.test", "Demo Collector", ["collector"]),
    ("recon@one10.test", "Demo Reconciliation Officer", ["reconciliation_officer"]),
    ("auditor@one10.test", "Demo Auditor", ["auditor"]),
    ("budget@one10.test", "Demo Budget Owner", ["budget_owner"]),
    ("procure.maker@one10.test", "Demo Procurement Maker", ["procurement_maker"]),
    ("procure.approver@one10.test", "Demo Procurement Approver", ["procurement_approver"]),
    ("pay.maker@one10.test", "Demo Payment Maker", ["payment_maker"]),
    ("pay.approver@one10.test", "Demo Payment Approver", ["payment_approver"]),
    ("coordinator@one10.test", "Demo Coordinator", ["coordinator"]),
    ("custodian@one10.test", "Demo Inventory Custodian", ["inventory_custodian"]),
]


async def seed_demo_users():
    from db import new_id
    created = []
    for email, name, roles in DEMO_USERS:
        if not await db.users.find_one({"email": email}):
            uid = new_id("user")
            await db.users.insert_one({
                "user_id": uid, "email": email, "name": name, "picture": "",
                "roles": roles, "is_active": True, "is_demo": True, "created_at": iso(),
            })
            created.append(email)
    return created
