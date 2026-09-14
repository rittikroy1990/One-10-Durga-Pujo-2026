from vision_extract import org_name_match


def test_accepts_canonical_and_misspellings():
    for name in (
        "ONE 10 EVENT ORGANISING COMMITTEE",
        "One10 events organization committte",
        "Events Organizations Committee of One10",
        "ONE10 EVENTS ORGANISING COMITTEE",
        "One 10 Event Organising Commitee",
        "M/S.ONE 10 EVENT ORGANISING COMMITEE",
        "Events Organising Committee of One10",
    ):
        assert org_name_match(name)["ok"] is True, name


def test_rejects_other_payees():
    for name in ("PhonePe", "Amazon Pay", "Random Person", None, ""):
        assert org_name_match(name)["ok"] is False, name


def test_rejects_swiggy_instamart_receipt_payee():
    """Exact payee from a Google Pay Swiggy Instamart screenshot that previously slipped through."""
    result = org_name_match("SWIGGY INSTAMART PRIVATE LIMITED")
    assert result["ok"] is False
    assert result["blocked"] == "swiggy" or result["blocked"] == "instamart"
    assert "merchant" in result["reason"].lower() or "swiggy" in result["reason"].lower()


def test_rejects_common_consumer_merchants():
    for name in (
        "Zomato",
        "Amazon Pay India",
        "Flipkart Internet Private Limited",
        "Blinkit",
        "Uber India",
        "BookMyShow",
    ):
        result = org_name_match(name)
        assert result["ok"] is False, name
        assert result.get("blocked"), name
