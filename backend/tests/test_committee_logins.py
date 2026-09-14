"""Committee portal login allow-list."""
from auth import COMMITTEE_LOGINS, COMMITTEE_PASSWORD, hash_password, verify_password


def test_rittik_is_seeded_committee_login():
    ids = {row["login_id"] for row in COMMITTEE_LOGINS}
    assert ids == {"apc", "arka", "suman", "rittik"}
    assert COMMITTEE_PASSWORD == "EOC@2026"


def test_password_hash_roundtrip():
    h = hash_password(COMMITTEE_PASSWORD)
    assert verify_password(COMMITTEE_PASSWORD, h)
    assert not verify_password("wrong-password", h)
