from vision_extract import org_name_match


def test_accepts_canonical_and_misspellings():
    for name in (
        "ONE 10 EVENT ORGANISING COMMITTEE",
        "One10 events organization committte",
        "Events Organizations Committee of One10",
        "ONE10 EVENTS ORGANISING COMITTEE",
        "One 10 Event Organising Commitee",
    ):
        assert org_name_match(name)["ok"] is True, name


def test_rejects_other_payees():
    for name in ("PhonePe", "Amazon Pay", "Random Person", None, ""):
        assert org_name_match(name)["ok"] is False, name
