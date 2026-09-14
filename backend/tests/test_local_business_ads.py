from config import LOCAL_BUSINESS_AD_PACKAGES


def test_local_business_ad_packages_are_paid():
    packages = LOCAL_BUSINESS_AD_PACKAGES["packages"]
    assert len(packages) >= 4
    assert all(int(p["amount_paise"]) > 0 for p in packages)
    codes = {p["code"] for p in packages}
    assert "neighbourhood_card" in codes
    assert "festival_takeover" in codes
    assert any(p.get("includes_full_page") for p in packages)
    assert "home_strip" in packages[0]["placements"]
    assert "directory" in packages[0]["placements"]


def test_local_business_ads_support_inside_and_outside():
    assert LOCAL_BUSINESS_AD_PACKAGES["rules"]["inside_and_outside_one_ten"] is True
    assert LOCAL_BUSINESS_AD_PACKAGES["rules"]["resubmits_allowed"] == 1


def test_spotlight_and_above_include_sponsors_rail():
    packages = {p["code"]: p for p in LOCAL_BUSINESS_AD_PACKAGES["packages"]}
    assert "sponsors_rail" not in packages["neighbourhood_card"]["placements"]
    for code in ("spotlight_feature", "story_page", "festival_takeover"):
        assert "sponsors_rail" in packages[code]["placements"]
        assert "full_page" in packages[code]["placements"]


def test_ad_validate_link_rules():
    from routes_ads import _validate_link
    from fastapi import HTTPException

    assert _validate_link("none", "") == ("none", "")
    assert _validate_link("internal", "/donate") == ("internal", "/donate")
    assert _validate_link("external", "https://example.com/x")[0] == "external"
    try:
        _validate_link("external", "http://insecure.example")
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 400
    try:
        _validate_link("internal", "https://evil.example")
        assert False, "expected HTTPException"
    except HTTPException as e:
        assert e.status_code == 400


def test_status_view_exposes_resubmit_and_contact_fields():
    from routes_ads import _status_view

    view = _status_view({
        "id": "ad_1",
        "status": "changes_requested",
        "status_token": "tok",
        "business_name": "Cafe",
        "contact_name": "Riya",
        "mobile": "9876543210",
        "email": "a@b.com",
        "package_code": "spotlight_feature",
        "package_name": "Spotlight Feature",
        "amount_paise": 350000,
        "headline": "Hi",
        "writeup": "Writeup",
        "category": "Food & cloud kitchen",
        "location_scope": "inside_one_ten",
        "tower_or_area": "T1",
        "link_type": "none",
        "link_url": "",
        "link_label": "Visit",
        "media": [{"doc_id": "d1"}],
        "payment_utr": "UTR123456",
        "payment_proof_doc_id": "p1",
        "review_notes": "Fix logo",
        "resubmit_used": 0,
        "slug": "cafe",
        "click_count": 3,
    })
    assert view["can_resubmit"] is True
    assert view["contact_name"] == "Riya"
    assert view["mobile"] == "9876543210"
    assert view["email"] == "a@b.com"
    assert view["click_count"] == 3

    used_up = _status_view({
        "id": "ad_1",
        "status": "rejected",
        "status_token": "tok",
        "resubmit_used": 1,
        "business_name": "Cafe",
    })
    assert used_up["can_resubmit"] is False
