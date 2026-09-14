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
