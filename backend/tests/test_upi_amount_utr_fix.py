from vision_extract import amount_to_paise, coerce_amount_paise, org_name_match, refs_match


def test_amount_strips_currency():
    assert amount_to_paise("₹3,500.00") == 350000
    assert amount_to_paise(3500) == 350000


def test_coerce_llm_paise_as_rupees_scale_slip():
    expected = 350000  # ₹3500
    assert coerce_amount_paise(35_000_000, expected) == expected
    assert coerce_amount_paise(350000, expected) == 350000


def test_committee_payee_from_gpay_screenshot():
    assert org_name_match("M S ONE 10 EVENT ORGANISING COMMITEE")["ok"] is True


def test_utr_matches_any_candidate_or_empty_ok_for_caller():
    assert refs_match("662307471094", "CICAgXXX", "662307471094")
    assert not refs_match("662307471094", "CICAgOnlyGoogleId")
