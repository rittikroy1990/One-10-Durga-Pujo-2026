import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ArrowLeft, Heart, Loader2, Upload, QrCode, Copy,
  ShieldCheck, Home, Users, Check, Sparkles, Flower2,
} from "lucide-react";
import api from "../../lib/api";
import { loadFlats, prefetchFlats } from "../../lib/flats";
import PublicLayout from "../../components/PublicLayout";
import { Button, Label, Input, Select } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import {
  REMAINDER_DONATION_HEADS, formatInr, findDonationItem,
} from "../../data/donationHeads";

const OCCUPANCY = [
  { v: "owner_resident", l: "Owner — Resident" },
  { v: "tenant_resident", l: "Tenant — Resident" },
  { v: "owner_non_resident", l: "Owner — Non-resident" },
  { v: "other", l: "Other" },
];

/** Fixed remainder-season package — Kali + Bijoya together (Durga ₹2,500 closed). */
const REMAINDER_SUB_HEADS = [
  { code: "SUB_KALI", label: "Kali Puja", amount_paise: 30000, blurb: "Deepavali Kali Puja" },
  { code: "SUB_BIJOYA", label: "Bijoya Sammilani", amount_paise: 70000, blurb: "Community Bijoya gathering" },
];
const REMAINDER_SUB_TOTAL_PAISE = REMAINDER_SUB_HEADS.reduce((s, h) => s + h.amount_paise, 0);
const REMAINDER_SUB_CODES = REMAINDER_SUB_HEADS.map((h) => h.code);

function SelectionSummary({ customMode, items, total, onEdit, title }) {
  return (
    <div className="rounded-2xl border border-[#D4AF37]/35 bg-gradient-to-r from-[#FFF8F0] to-[#F6E8E4] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#5C3530]/50">{title || "Your selection"}</div>
          <div className="font-display text-3xl text-[#7A1F2B]">{formatInr(total || 0)}</div>
          {customMode ? (
            <p className="mt-1 text-sm text-[#5C3530]/65">Custom voluntary donation</p>
          ) : (
            <ul className="mt-2 space-y-0.5 text-sm text-[#5C3530]/75">
              {items.map((i) => (
                <li key={i.id || i.code}>{i.label} — {formatInr(i.amount ?? i.amount_paise / 100)}</li>
              ))}
            </ul>
          )}
        </div>
        {onEdit && (
          <button type="button" onClick={onEdit} className="text-sm font-semibold text-[#C0392B] underline underline-offset-2">
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

function PayPanel({
  upiSession, reference, setReference, screenshot, setScreenshot,
  busy, onSubmit, onBack, amountLabel,
}) {
  const pay = upiSession?.payment;
  const staticQr = pay?.static_qr_url || "/images/food-payment-qr.png";
  const qrSrc =
    upiSession?.qr_url
    || (upiSession?.intent_id ? `/api/payments/upi/qr.png?intent_id=${encodeURIComponent(upiSession.intent_id)}` : null)
    || staticQr;

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="space-y-5" data-testid="contribute-pay">
      <div className="rounded-xl border border-emerald-700/20 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
        Pay to the <b>YES Bank</b> committee QR (same account as Food). Amount due:{" "}
        <b>{amountLabel}</b>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-2xl border border-[#7A1F2B]/15 bg-white p-3 shadow-sm">
          <img src={qrSrc} alt="YES Bank UPI QR" className="h-48 w-48 object-contain" />
          <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-[#5C3530]/55">
            <QrCode className="h-3 w-3" /> Scan with any UPI app
          </p>
        </div>
        <div className="min-w-0 flex-1 space-y-3 text-sm">
          {pay?.vpa && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#5C3530]/45">UPI ID</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <code className="rounded bg-[#FFF8F0] px-2 py-1 text-[13px] font-semibold text-[#3A1518]">{pay.vpa}</code>
                <button type="button" onClick={() => copyText(pay.vpa, "UPI ID")} className="inline-flex items-center gap-1 text-xs font-semibold text-[#C0392B]">
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
            </div>
          )}
          {pay?.payee_name && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#5C3530]/45">Payee</div>
              <div className="mt-0.5 font-medium text-[#3A1518]">{pay.payee_name}</div>
            </div>
          )}
          <p className="text-[#5C3530]/65">
            {pay?.instructions || "Pay the exact amount, then upload your screenshot and UTR."}
          </p>
        </div>
      </div>

      <div>
        <Label required htmlFor="utr">UTR / UPI reference</Label>
        <Input
          id="utr"
          data-testid="contribute-utr"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="From your payment confirmation"
          className="mt-1"
        />
      </div>
      <div>
        <Label required htmlFor="shot">Payment screenshot</Label>
        <label
          htmlFor="shot"
          className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#7A1F2B]/30 bg-white/70 px-4 py-4 text-sm hover:border-[#7A1F2B]/50"
        >
          <Upload className="h-5 w-5 text-[#C0392B]" />
          <span className="min-w-0 truncate text-[#5C3530]/80">
            {screenshot ? screenshot.name : "Tap to upload PNG / JPG"}
          </span>
        </label>
        <input
          id="shot"
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="contribute-screenshot"
          onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="subtle" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="primary" onClick={onSubmit} disabled={busy} data-testid="contribute-submit-proof">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit payment proof
        </Button>
      </div>
    </div>
  );
}

export default function Contribute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "donate" ? "donate" : searchParams.get("mode") === "subscribe" ? "subscribe" : "choose";

  const [mode, setMode] = useState(initialMode); // choose | subscribe | donate
  const [cfg, setCfg] = useState(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState(null);
  const [upiSession, setUpiSession] = useState(null);
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState(null);

  // Subscribe state — package is fixed (Kali + Bijoya); no head picker
  const [subStep, setSubStep] = useState(0); // 0 package, 1 household, 2 confirm, 3 pay
  const [subForm, setSubForm] = useState({
    primary_contact_name: "",
    mobile: "",
    email: "",
    tower_id: "",
    flat_id: "",
    occupancy_type: "owner_resident",
    family_members: 4,
    accuracy_confirmed: false,
    privacy_consent: false,
    terms_consent: false,
  });
  const setSub = (k, v) => setSubForm((f) => ({ ...f, [k]: v }));
  const selectedSubHeads = REMAINDER_SUB_HEADS;
  const subTotalPaise = REMAINDER_SUB_TOTAL_PAISE;

  // Donate state
  const [donStep, setDonStep] = useState(0); // 0 heads, 1 who, 2 details, 3 confirm, 4 pay
  const [selected, setSelected] = useState([]);
  const [customMode, setCustomMode] = useState(false);
  const [donForm, setDonForm] = useState({
    donor_type: "",
    donor_name: "",
    mobile: "",
    email: "",
    donation_rupees: "",
    tower_id: "",
    flat_id: "",
    occupancy_type: "owner_resident",
    city: "",
    organisation: "",
    relation_to_one10: "",
    notes: "",
    accuracy_confirmed: false,
    privacy_consent: false,
    terms_consent: false,
  });
  const setDon = (k, v) => setDonForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get("/config").then((r) => setCfg(r.data)).catch(() => {});
    api.get("/towers").then((r) => { setTowers(r.data.items || []); prefetchFlats(r.data.items); }).catch(() => {});
  }, []);

  const activeTowerId = mode === "subscribe" ? subForm.tower_id : donForm.tower_id;
  useEffect(() => {
    if (activeTowerId) loadFlats(activeTowerId).then(setFlats).catch(() => setFlats([]));
    else setFlats([]);
  }, [activeTowerId]);

  const selectedItems = useMemo(() => selected.map(findDonationItem).filter(Boolean), [selected]);
  const headsTotal = useMemo(() => selectedItems.reduce((s, i) => s + i.amount, 0), [selectedItems]);
  const minPaise = cfg?.subscription?.donation_min_paise ?? 10000;
  const donationPaise = Math.max(0, Math.round(Number(donForm.donation_rupees || 0) * 100));

  const toggleItem = (id) => {
    const item = findDonationItem(id);
    if (item?.closed) return;
    setCustomMode(false);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const resetPay = () => {
    setIntent(null);
    setUpiSession(null);
    setReference("");
    setScreenshot(null);
  };

  const pickMode = (m) => {
    resetPay();
    setMode(m);
    if (m === "subscribe") setSubStep(0);
    if (m === "donate") setDonStep(0);
  };

  const submitProof = async () => {
    if (!reference.trim() || reference.trim().length < 6) {
      toast.error("Enter the UTR / UPI reference from your payment.");
      return;
    }
    if (!screenshot) {
      toast.error("Upload your payment screenshot.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("intent_id", intent.intent_id);
      fd.append("status_token", intent.status_token);
      fd.append("reference", reference.trim());
      fd.append("screenshot", screenshot);
      const r = await api.post("/payments/upi/submit", fd);
      const token = r.data.status_token || intent.status_token;
      if (r.data.status === "paid") toast.success(`Receipt ${r.data.receipt?.receipt_no || ""} issued`);
      else if (r.data.status === "partially_paid") {
        toast.success(
          r.data.message
            || `Partial receipt ${r.data.receipt?.receipt_no || ""} — balance ${r.data.residual_amount_fmt || ""} due`,
        );
      } else if (r.data.status === "needs_review") {
        toast.message(r.data.message || "Screenshot submitted for review — please do not pay again");
      } else toast.message(r.data.message || "Screenshot submitted for review");
      navigate(`/payment/status?token=${encodeURIComponent(token)}`);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not submit payment proof.");
    } finally {
      setBusy(false);
    }
  };

  const submitSubscribe = async () => {
    if (!(subForm.accuracy_confirmed && subForm.privacy_consent && subForm.terms_consent)) {
      toast.error("Please confirm the declaration below to continue.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/subscribe", {
        ...subForm,
        family_members: Number(subForm.family_members) || 1,
        donation_rupees: 0,
        component_codes: REMAINDER_SUB_CODES,
        upi_channel: "yes",
      });
      setIntent(r.data);
      const s = await api.get("/payments/upi/session", { params: { intent_id: r.data.intent_id } });
      setUpiSession(s.data);
      setSubStep(3);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not create subscription.");
    } finally {
      setBusy(false);
    }
  };

  const continueDonateHeads = () => {
    if (customMode) {
      if (!(Number(donForm.donation_rupees) > 0) || donationPaise < minPaise) {
        toast.error(`Enter an amount of at least ${formatPaise(minPaise)}.`);
        return;
      }
      setDon("notes", donForm.notes || "Custom voluntary donation");
      setDonStep(1);
      return;
    }
    if (!selectedItems.length) {
      toast.error("Pick one or more donation heads, or choose a custom amount.");
      return;
    }
    setDon("donation_rupees", String(headsTotal));
    setDon("notes", selectedItems.map((i) => `${i.label} (${formatInr(i.amount)})`).join("; "));
    setDonStep(1);
  };

  const validDonDetails = useMemo(() => {
    if (!donForm.donor_name.trim() || !/^[6-9]\d{9}$/.test(donForm.mobile)) return false;
    if (!(Number(donForm.donation_rupees) > 0) || donationPaise < minPaise) return false;
    if (donForm.donor_type === "resident") return !!(donForm.tower_id && donForm.flat_id && donForm.occupancy_type);
    if (donForm.donor_type === "other") return true;
    return false;
  }, [donForm, donationPaise, minPaise]);

  const submitDonate = async () => {
    if (!(donForm.accuracy_confirmed && donForm.privacy_consent && donForm.terms_consent)) {
      toast.error("Please confirm the declaration below to continue.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/donate", {
        ...donForm,
        donation_rupees: Number(donForm.donation_rupees),
        upi_channel: "yes",
      });
      setIntent(r.data);
      const s = await api.get("/payments/upi/session", { params: { intent_id: r.data.intent_id } });
      setUpiSession(s.data);
      setDonStep(4);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not start donation.");
    } finally {
      setBusy(false);
    }
  };

  const validSubHousehold =
    subForm.primary_contact_name.trim()
    && /^[6-9]\d{9}$/.test(subForm.mobile)
    && subForm.tower_id
    && subForm.flat_id;

  const amountDue = upiSession?.amount_due_paise ?? upiSession?.total_amount ?? (mode === "subscribe" ? subTotalPaise : donationPaise);

  return (
    <PublicLayout>
      <section className="relative overflow-hidden border-b border-[#7A1F2B]/15">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 15% 20%, rgba(212,175,55,0.22), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 10%, rgba(16,120,90,0.12), transparent 50%), linear-gradient(165deg, #FFF8F0 0%, #F3E6D8 45%, #EDE0D0 100%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-28 sm:pt-32">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#7A1F2B]/20 bg-white/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7A1F2B] backdrop-blur">
              <Flower2 className="h-3.5 w-3.5" /> One 10 Durgotsav 2026
            </div>
            <h1 className="mt-4 max-w-3xl font-display text-5xl leading-[1.05] text-[#3A1518] sm:text-6xl">
              Subscribe &amp; Donate
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-[#5C3530]/85">
              Durga Pujo household subscription (₹2,500) is closed. Open now: Kali Puja & Bijoya Sammilani subscribe and donation heads — paid on the YES Bank QR.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-10 pb-28">
        <AnimatePresence mode="wait">
          {mode === "choose" && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid gap-5 md:grid-cols-2"
              data-testid="contribute-choose"
            >
              <button
                type="button"
                data-testid="contribute-pick-subscribe"
                onClick={() => pickMode("subscribe")}
                className="rounded-2xl border border-[#7A1F2B]/15 bg-white/85 p-6 text-left shadow-sm transition hover:border-[#C0392B]/40 hover:bg-[#FFF8F0]"
              >
                <ShieldCheck className="h-7 w-7 text-[#C0392B]" />
                <h2 className="mt-4 font-display text-3xl text-[#3A1518]">Subscribe for the rest</h2>
                <p className="mt-2 text-sm text-[#5C3530]/70">
                  Kali Puja ₹300 · Bijoya Sammilani ₹700 — ₹1,000 for both. Family subscription for the remaining season.
                </p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#C0392B]">
                  Continue <ArrowRight className="h-4 w-4" />
                </span>
              </button>
              <button
                type="button"
                data-testid="contribute-pick-donate"
                onClick={() => pickMode("donate")}
                className="rounded-2xl border border-[#7A1F2B]/15 bg-white/85 p-6 text-left shadow-sm transition hover:border-[#C0392B]/40 hover:bg-[#FFF8F0]"
              >
                <Heart className="h-7 w-7 text-[#C0392B]" />
                <h2 className="mt-4 font-display text-3xl text-[#3A1518]">Donate</h2>
                <p className="mt-2 text-sm text-[#5C3530]/70">
                  Kali Puja &amp; Bijoya Sammilani heads at ₹5,000 each — or enter a custom gift.
                </p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#C0392B]">
                  Continue <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            </motion.div>
          )}

          {mode === "subscribe" && (
            <motion.div key="sub" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <button type="button" onClick={() => { resetPay(); setMode("choose"); }} className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-[#7A1F2B]">
                <ArrowLeft className="h-4 w-4" /> All options
              </button>

              {subStep === 0 && (
                <div data-testid="contribute-sub-heads">
                  <h2 className="font-display text-3xl text-[#3A1518]">Remaining season subscription</h2>
                  <p className="mt-1 text-sm text-[#5C3530]/65">
                    Khuti + Durga + Lakshmi (₹2,500) is closed. Kali Puja and Bijoya Sammilani are one combined package.
                  </p>
                  <div className="mt-6 overflow-hidden rounded-2xl border border-[#7A1F2B]/15 bg-white/85 shadow-sm">
                    <div className="border-b border-[#7A1F2B]/10 bg-gradient-to-r from-[#FFF8F0] to-[#F6E8E4] px-5 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5C3530]/50">Package</div>
                      <div className="mt-1 font-display text-2xl text-[#3A1518]">Kali Puja + Bijoya Sammilani</div>
                    </div>
                    <ul className="divide-y divide-[#5C3530]/10 px-5">
                      {REMAINDER_SUB_HEADS.map((h) => (
                        <li key={h.code} className="flex items-center justify-between gap-3 py-3.5">
                          <span>
                            <span className="block font-medium text-[#3A1518]">{h.label}</span>
                            <span className="text-sm text-[#5C3530]/55">{h.blurb}</span>
                          </span>
                          <span className="shrink-0 font-display text-xl text-[#7A1F2B]">{formatPaise(h.amount_paise)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#D4AF37]/30 bg-[#FFF8F0] px-5 py-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-[#5C3530]/50">Total</div>
                        <div className="font-display text-3xl text-[#7A1F2B]" data-testid="contribute-sub-total">
                          {formatPaise(subTotalPaise)}
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={() => setSubStep(1)}
                        data-testid="contribute-sub-continue"
                      >
                        Continue <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {subStep === 1 && (
                <div className="mx-auto max-w-3xl rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm" data-testid="contribute-sub-household">
                  <SelectionSummary
                    items={selectedSubHeads.map((h) => ({ ...h, amount: h.amount_paise / 100 }))}
                    total={subTotalPaise / 100}
                    onEdit={() => setSubStep(0)}
                    title="Subscription"
                  />
                  <h2 className="mt-6 font-display text-2xl text-[#3A1518]">Household details</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label required htmlFor="sname">Primary contact full name</Label>
                      <Input id="sname" data-testid="contribute-sub-name" value={subForm.primary_contact_name} onChange={(e) => setSub("primary_contact_name", e.target.value)} />
                    </div>
                    <div>
                      <Label required htmlFor="smobile">Mobile</Label>
                      <Input id="smobile" data-testid="contribute-sub-mobile" value={subForm.mobile} onChange={(e) => setSub("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" />
                    </div>
                    <div>
                      <Label htmlFor="semail">Email (optional)</Label>
                      <Input id="semail" value={subForm.email} onChange={(e) => setSub("email", e.target.value)} />
                    </div>
                    <div>
                      <Label required htmlFor="stower">Tower / Block</Label>
                      <Select id="stower" data-testid="contribute-sub-tower" value={subForm.tower_id} onChange={(e) => { setSub("tower_id", e.target.value); setSub("flat_id", ""); }}>
                        <option value="">Select tower</option>
                        {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label required htmlFor="sflat">Flat</Label>
                      <Select id="sflat" data-testid="contribute-sub-flat" value={subForm.flat_id} onChange={(e) => setSub("flat_id", e.target.value)} disabled={!subForm.tower_id}>
                        <option value="">Select flat</option>
                        {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label required htmlFor="socc">Occupancy</Label>
                      <Select id="socc" value={subForm.occupancy_type} onChange={(e) => setSub("occupancy_type", e.target.value)}>
                        {OCCUPANCY.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="sfam">Family members</Label>
                      <Input id="sfam" type="number" min={1} max={20} value={subForm.family_members} onChange={(e) => setSub("family_members", e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-6 flex gap-3">
                    <Button variant="subtle" onClick={() => setSubStep(0)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                    <Button variant="primary" disabled={!validSubHousehold} onClick={() => setSubStep(2)} data-testid="contribute-sub-to-confirm">
                      Review <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {subStep === 2 && (
                <div className="mx-auto max-w-3xl rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm" data-testid="contribute-sub-confirm">
                  <SelectionSummary
                    items={selectedSubHeads.map((h) => ({ ...h, amount: h.amount_paise / 100 }))}
                    total={subTotalPaise / 100}
                    onEdit={() => setSubStep(0)}
                    title="Subscription"
                  />
                  <dl className="mt-5 grid gap-2 text-sm text-[#5C3530]/80 sm:grid-cols-2">
                    <div><dt className="text-[11px] uppercase tracking-wider text-[#5C3530]/45">Name</dt><dd className="font-medium text-[#3A1518]">{subForm.primary_contact_name}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wider text-[#5C3530]/45">Mobile</dt><dd className="font-medium text-[#3A1518]">{subForm.mobile}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wider text-[#5C3530]/45">Flat</dt><dd className="font-medium text-[#3A1518]">{towers.find((t) => t.id === subForm.tower_id)?.name} · {flats.find((f) => f.id === subForm.flat_id)?.number}</dd></div>
                  </dl>
                  <div className="mt-5 space-y-2 text-sm">
                    {[
                      ["accuracy_confirmed", "I confirm the household details are accurate."],
                      ["privacy_consent", "I agree to the privacy notice for contact & receipt records."],
                      ["terms_consent", "I accept the terms for this voluntary committee subscription."],
                    ].map(([k, label]) => (
                      <label key={k} className="flex items-start gap-2">
                        <input type="checkbox" checked={!!subForm[k]} onChange={(e) => setSub(k, e.target.checked)} className="mt-1" />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-6 flex gap-3">
                    <Button variant="subtle" onClick={() => setSubStep(1)} disabled={busy}><ArrowLeft className="h-4 w-4" /> Back</Button>
                    <Button variant="primary" onClick={submitSubscribe} disabled={busy || !(subForm.accuracy_confirmed && subForm.privacy_consent && subForm.terms_consent)} data-testid="contribute-sub-pay">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Pay {formatPaise(subTotalPaise)} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {subStep === 3 && (
                <div className="mx-auto max-w-3xl rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm">
                  <h2 className="font-display text-2xl text-[#3A1518]">Pay via YES Bank UPI</h2>
                  <p className="mt-1 text-sm text-[#5C3530]/65">Scan, pay exactly, then upload proof.</p>
                  <div className="mt-5">
                    <PayPanel
                      upiSession={upiSession}
                      reference={reference}
                      setReference={setReference}
                      screenshot={screenshot}
                      setScreenshot={setScreenshot}
                      busy={busy}
                      onSubmit={submitProof}
                      onBack={() => { resetPay(); setSubStep(2); }}
                      amountLabel={formatPaise(amountDue)}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {mode === "donate" && (
            <motion.div key="don" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <button type="button" onClick={() => { resetPay(); setMode("choose"); }} className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-[#7A1F2B]">
                <ArrowLeft className="h-4 w-4" /> All options
              </button>

              {donStep === 0 && (
                <div data-testid="contribute-donate-heads">
                  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="font-display text-3xl text-[#3A1518]">Donation heads</h2>
                      <p className="mt-1 text-sm text-[#5C3530]/65">
                        Kali Puja &amp; Bijoya Sammilani — each head ₹5,000. Or use a custom amount below.
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="contribute-donate-custom"
                      onClick={() => {
                        setCustomMode((v) => {
                          if (!v) setSelected([]);
                          return !v;
                        });
                      }}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        customMode
                          ? "border-[#7A1F2B] bg-[#7A1F2B] text-white"
                          : "border-[#7A1F2B]/25 bg-white/70 text-[#7A1F2B]"
                      }`}
                    >
                      {customMode ? "Using custom amount" : "Or enter a custom amount"}
                    </button>
                  </div>

                  {customMode ? (
                    <div className="mx-auto max-w-xl rounded-2xl border border-[#7A1F2B]/15 bg-white/80 p-6 shadow-sm">
                      <Label required htmlFor="custom-amt">Custom donation (₹)</Label>
                      <Input
                        id="custom-amt"
                        type="number"
                        min={minPaise / 100}
                        value={donForm.donation_rupees}
                        onChange={(e) => setDon("donation_rupees", e.target.value)}
                        placeholder={`Minimum ${formatPaise(minPaise)}`}
                        className="mt-1"
                      />
                      <div className="mt-4">
                        <Label htmlFor="custom-note">Note (optional)</Label>
                        <Input id="custom-note" value={donForm.notes} onChange={(e) => setDon("notes", e.target.value)} className="mt-1" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-6 lg:grid-cols-2">
                      {REMAINDER_DONATION_HEADS.map((cat, idx) => (
                        <motion.section
                          key={cat.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="overflow-hidden rounded-2xl border border-black/5 bg-white/75 shadow-sm"
                          style={{ borderTop: `3px solid ${cat.accent}` }}
                        >
                          <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ background: `linear-gradient(120deg, ${cat.soft}, transparent 70%)` }}>
                            <div>
                              <h3 className="font-display text-2xl" style={{ color: cat.accent }}>{cat.title}</h3>
                              <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-[#5C3530]/50">{cat.subtitle}</p>
                            </div>
                            <Sparkles className="mt-1 h-4 w-4 opacity-40" style={{ color: cat.accent }} />
                          </div>
                          <ul className="divide-y divide-[#5C3530]/10 px-2 pb-2">
                            {cat.items.map((item) => {
                              const closed = !!item.closed;
                              const on = !closed && selected.includes(item.id);
                              return (
                                <li key={item.id}>
                                  <button
                                    type="button"
                                    onClick={() => toggleItem(item.id)}
                                    disabled={closed}
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                                      closed ? "cursor-not-allowed opacity-70" : on ? "bg-[#7A1F2B]/06" : "hover:bg-black/[0.02]"
                                    }`}
                                  >
                                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? "border-[#7A1F2B] bg-[#7A1F2B] text-white" : "border-[#5C3530]/25 bg-white text-transparent"}`}>
                                      <Check className="h-3 w-3" strokeWidth={3} />
                                    </span>
                                    <span className="min-w-0 flex-1 text-[15px] font-semibold">{item.label}</span>
                                    <span className="font-display text-xl tabular-nums" style={{ color: on ? cat.accent : "#3A1518" }}>
                                      {formatInr(item.amount)}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </motion.section>
                      ))}
                    </div>
                  )}

                  <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D4AF37]/30 bg-[#FFF8F0] px-5 py-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-[#5C3530]/50">Selected total</div>
                      <div className="font-display text-3xl text-[#7A1F2B]">
                        {customMode
                          ? (donForm.donation_rupees ? formatInr(Number(donForm.donation_rupees)) : "—")
                          : formatInr(headsTotal)}
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={continueDonateHeads}
                      disabled={customMode ? !(Number(donForm.donation_rupees) > 0) : selectedItems.length === 0}
                      data-testid="contribute-donate-continue"
                    >
                      Continue <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {donStep === 1 && (
                <div className="mx-auto max-w-3xl" data-testid="contribute-donate-who">
                  <SelectionSummary
                    customMode={customMode}
                    items={selectedItems}
                    total={Number(donForm.donation_rupees) || headsTotal}
                    onEdit={() => setDonStep(0)}
                  />
                  <div className="mt-6 rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm">
                    <h2 className="font-display text-2xl text-[#3A1518]">Are you a One 10 resident?</h2>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <button type="button" onClick={() => { setDon("donor_type", "resident"); setDonStep(2); }} className="rounded-2xl border border-[#7A1F2B]/15 bg-[#FFF8F0] p-5 text-left hover:border-[#C0392B]/40">
                        <Home className="h-6 w-6 text-[#C0392B]" />
                        <div className="mt-3 font-display text-xl">Yes — resident</div>
                      </button>
                      <button type="button" onClick={() => { setDon("donor_type", "other"); setDonStep(2); }} className="rounded-2xl border border-[#7A1F2B]/15 bg-[#FFF8F0] p-5 text-left hover:border-[#C0392B]/40">
                        <Users className="h-6 w-6 text-[#C0392B]" />
                        <div className="mt-3 font-display text-xl">No — other donor</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {donStep === 2 && (
                <div className="mx-auto max-w-3xl rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm">
                  <h2 className="font-display text-2xl text-[#3A1518]">Donor details</h2>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label required htmlFor="dname">Full name</Label>
                      <Input id="dname" data-testid="contribute-donate-name" value={donForm.donor_name} onChange={(e) => setDon("donor_name", e.target.value)} />
                    </div>
                    <div>
                      <Label required htmlFor="dmobile">Mobile</Label>
                      <Input id="dmobile" data-testid="contribute-donate-mobile" value={donForm.mobile} onChange={(e) => setDon("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" />
                    </div>
                    <div>
                      <Label htmlFor="demail">Email (optional)</Label>
                      <Input id="demail" value={donForm.email} onChange={(e) => setDon("email", e.target.value)} />
                    </div>
                    {donForm.donor_type === "resident" ? (
                      <>
                        <div>
                          <Label required htmlFor="dtower">Tower</Label>
                          <Select id="dtower" value={donForm.tower_id} onChange={(e) => { setDon("tower_id", e.target.value); setDon("flat_id", ""); }}>
                            <option value="">Select tower</option>
                            {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </Select>
                        </div>
                        <div>
                          <Label required htmlFor="dflat">Flat</Label>
                          <Select id="dflat" value={donForm.flat_id} onChange={(e) => setDon("flat_id", e.target.value)} disabled={!donForm.tower_id}>
                            <option value="">Select flat</option>
                            {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
                          </Select>
                        </div>
                        <div className="sm:col-span-2">
                          <Label required htmlFor="docc">Occupancy</Label>
                          <Select id="docc" value={donForm.occupancy_type} onChange={(e) => setDon("occupancy_type", e.target.value)}>
                            {OCCUPANCY.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                          </Select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <Label htmlFor="dcity">City (optional)</Label>
                          <Input id="dcity" value={donForm.city} onChange={(e) => setDon("city", e.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor="dorg">Organisation (optional)</Label>
                          <Input id="dorg" value={donForm.organisation} onChange={(e) => setDon("organisation", e.target.value)} />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mt-6 flex gap-3">
                    <Button variant="subtle" onClick={() => setDonStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                    <Button variant="primary" disabled={!validDonDetails} onClick={() => setDonStep(3)}>
                      Review <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {donStep === 3 && (
                <div className="mx-auto max-w-3xl rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm">
                  <SelectionSummary
                    customMode={customMode}
                    items={selectedItems}
                    total={Number(donForm.donation_rupees) || headsTotal}
                    onEdit={() => setDonStep(0)}
                  />
                  <p className="mt-4 text-sm text-[#5C3530]/75">
                    {donForm.donor_name} · {donForm.mobile}
                    {donForm.donor_type === "resident"
                      ? ` · ${towers.find((t) => t.id === donForm.tower_id)?.name || ""} ${flats.find((f) => f.id === donForm.flat_id)?.number || ""}`
                      : ""}
                  </p>
                  <div className="mt-5 space-y-2 text-sm">
                    {[
                      ["accuracy_confirmed", "I confirm these details are accurate."],
                      ["privacy_consent", "I agree to the privacy notice for contact & receipt records."],
                      ["terms_consent", "I accept the terms for this voluntary gift."],
                    ].map(([k, label]) => (
                      <label key={k} className="flex items-start gap-2">
                        <input type="checkbox" checked={!!donForm[k]} onChange={(e) => setDon(k, e.target.checked)} className="mt-1" />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-6 flex gap-3">
                    <Button variant="subtle" onClick={() => setDonStep(2)} disabled={busy}><ArrowLeft className="h-4 w-4" /> Back</Button>
                    <Button
                      variant="primary"
                      onClick={submitDonate}
                      disabled={busy || !(donForm.accuracy_confirmed && donForm.privacy_consent && donForm.terms_consent)}
                      data-testid="contribute-donate-pay"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Pay {formatInr(Number(donForm.donation_rupees) || 0)} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {donStep === 4 && (
                <div className="mx-auto max-w-3xl rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm">
                  <h2 className="font-display text-2xl text-[#3A1518]">Pay via YES Bank UPI</h2>
                  <div className="mt-5">
                    <PayPanel
                      upiSession={upiSession}
                      reference={reference}
                      setReference={setReference}
                      screenshot={screenshot}
                      setScreenshot={setScreenshot}
                      busy={busy}
                      onSubmit={submitProof}
                      onBack={() => { resetPay(); setDonStep(3); }}
                      amountLabel={formatPaise(amountDue)}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {mode === "choose" && (
          <p className="mt-10 text-center text-sm text-[#5C3530]/55">
            Looking for brand packages?{" "}
            <Link to="/sponsors" className="font-semibold text-[#C0392B] underline underline-offset-2">Sponsorship</Link>
          </p>
        )}
      </div>
    </PublicLayout>
  );
}
