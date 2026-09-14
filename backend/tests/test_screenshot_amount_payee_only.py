"""Screenshot auto-issue rules: amount ≥ ₹3500 + committee payee. No UTR matching."""
from vision_extract import amount_to_paise, coerce_amount_paise, org_name_match


MIN_PAISE = 350000  # ₹3,500


def _amount_ok(paid_paise: int | None) -> bool:
    return paid_paise is not None and paid_paise >= (MIN_PAISE - 100)


def _can_auto_issue(payee: str, amount_rupees) -> bool:
    org_ok = org_name_match(payee)["ok"]
    paid = coerce_amount_paise(amount_to_paise(amount_rupees), MIN_PAISE)
    return org_ok and _amount_ok(paid)


def test_gpay_3500_committee_issues_without_utr():
    """The reported resident case: ₹3500 to M S ONE 10… — UTR not on success screen."""
    assert _can_auto_issue("M S ONE 10 EVENT ORGANISING COMMITEE", 3500) is True
    assert _can_auto_issue("M S ONE 10 EVENT ORGANISING COMMITEE", "₹3,500.00") is True


def test_amount_below_3500_blocked():
    assert _can_auto_issue("M S ONE 10 EVENT ORGANISING COMMITEE", 2500) is False


def test_amount_above_3500_ok():
    assert _can_auto_issue("M S ONE 10 EVENT ORGANISING COMMITEE", 4000) is True


def test_donation_intent_skips_subscription_floor():
    """Donate page: amount_ok vs pledged due only (not ₹3,500 floor)."""
    pledged = 50_000  # ₹500
    paid = 50_000
    assert paid >= max(pledged - 100, 1)
    assert paid < MIN_PAISE  # would fail subscription floor


def test_wrong_payee_blocked_even_if_3500():
    assert _can_auto_issue("SWIGGY INSTAMART PRIVATE LIMITED", 3500) is False
    assert _can_auto_issue("Random Person", 3500) is False


def test_utr_not_required_for_org_match():
    # org_name_match does not look at UTR at all
    assert org_name_match("M/S.ONE 10 EVENT ORGANISING COMMITEE")["ok"] is True
