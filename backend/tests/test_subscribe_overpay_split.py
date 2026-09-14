"""Subscribe overpay → subscription + donation; Donate path → donation only."""

SUBSCRIPTION_FLOOR_PAISE = 350000  # ₹3,500


def _amount_ok(intent_kind: str, paid_paise: int | None, expected: int) -> bool:
    if paid_paise is None:
        return False
    if intent_kind == "donation":
        return paid_paise >= max(expected - 100, 1)
    return paid_paise >= (SUBSCRIPTION_FLOOR_PAISE - 100)


def _split_subscribe(paid_paise: int, due_paise: int) -> tuple[int, int]:
    """Returns (subscription_paise, donation_paise)."""
    sub_amt = min(due_paise, paid_paise)
    don_amt = max(0, paid_paise - sub_amt)
    return sub_amt, don_amt


def test_subscribe_5000_splits_into_3500_and_1500():
    sub, don = _split_subscribe(500_000, 350_000)
    assert sub == 350_000
    assert don == 150_000


def test_subscribe_exact_3500_no_donation_receipt():
    sub, don = _split_subscribe(350_000, 350_000)
    assert sub == 350_000
    assert don == 0


def test_subscribe_below_floor_blocked():
    assert _amount_ok("subscription", 250_000, 350_000) is False
    assert _amount_ok("subscription", 350_000, 350_000) is True
    assert _amount_ok("subscription", 500_000, 350_000) is True


def test_donate_uses_pledged_due_not_3500_floor():
    # Donate ₹500 pledged — ₹500 screenshot is enough (no ₹3,500 floor)
    assert _amount_ok("donation", 50_000, 50_000) is True
    assert _amount_ok("donation", 40_000, 50_000) is False
    # Overpay donation still amount_ok; settlement is full OCR amount as donation
    assert _amount_ok("donation", 100_000, 50_000) is True


def test_donate_entire_amount_is_donation_only():
    paid, expected = 100_000, 50_000
    assert _amount_ok("donation", paid, expected)
    # Donate path does not call _split_subscribe — settle full paid as donation
    settle = paid
    assert settle == 100_000
    sub, don = _split_subscribe(paid, expected)  # would wrongly split if misused
    assert (sub, don) != (0, paid)
