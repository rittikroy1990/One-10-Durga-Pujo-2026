import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ArrowLeft, Heart, Loader2, Upload, QrCode, ExternalLink, Copy,
  ShieldCheck, Home, Users, Check, Sparkles, Flower2,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Label, Input, Select } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import { DONATION_HEADS, formatInr, findDonationItem } from "../../data/donationHeads";

const OCCUPANCY = [
  { v: "owner_resident", l: "Owner — Resident" },
  { v: "tenant_resident", l: "Tenant — Resident" },
  { v: "owner_non_resident", l: "Owner — Non-resident" },
  { v: "other", l: "Other" },
];

const STEPS = ["Choose", "Who", "Details", "Confirm", "Pay"];

function SelectionSummary({ customMode, items, total, onEdit }) {
  return (
    <div className="rounded-2xl border border-[#D4AF37]/35 bg-gradient-to-r from-[#FFF8F0] to-[#F6E8E4] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#5C3530]/50">Your selection</div>
          <div className="font-display text-3xl text-[#7A1F2B]">{formatInr(total || 0)}</div>
          {customMode ? (
            <p className="mt-1 text-sm text-[#5C3530]/65">Custom voluntary donation</p>
          ) : (
            <ul className="mt-2 space-y-0.5 text-sm text-[#5C3530]/75">
              {items.map((i) => (
                <li key={i.id}>{i.label} — {formatInr(i.amount)}</li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={onEdit} className="text-sm font-semibold text-[#C0392B] underline underline-offset-2">
          Edit heads
        </button>
      </div>
    </div>
  );
}

export default function Donate() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState(null);
  const [upiSession, setUpiSession] = useState(null);
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [selected, setSelected] = useState([]);
  const [customMode, setCustomMode] = useState(false);

  const [form, setForm] = useState({
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
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get("/config").then((r) => setCfg(r.data)).catch(() => {});
    api.get("/towers").then((r) => setTowers(r.data.items || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (form.tower_id) {
      api.get(`/towers/${form.tower_id}/flats`).then((r) => setFlats(r.data.items || [])).catch(() => setFlats([]));
    } else setFlats([]);
  }, [form.tower_id]);

  const selectedItems = useMemo(() => selected.map(findDonationItem).filter(Boolean), [selected]);
  const headsTotal = useMemo(() => selectedItems.reduce((s, i) => s + i.amount, 0), [selectedItems]);
  const minPaise = cfg?.subscription?.donation_min_paise ?? 10000;
  const donationPaise = Math.max(0, Math.round(Number(form.donation_rupees || 0) * 100));
  const pay = upiSession?.payment;
  const bank = pay?.bank_account || cfg?.organisation?.bank_account;
  const appLinks = pay?.upi_app_links || {};
  const staticQr = pay?.static_qr_url || "/images/payment-qr.png";

  const toggleItem = (id) => {
    setCustomMode(false);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const continueFromHeads = () => {
    if (customMode) {
      if (!(Number(form.donation_rupees) > 0) || donationPaise < minPaise) {
        toast.error(`Enter an amount of at least ${formatPaise(minPaise)}.`);
        return;
      }
      set("notes", form.notes || "Custom voluntary donation");
      setStep(1);
      return;
    }
    if (!selectedItems.length) {
      toast.error("Pick one or more donation heads, or choose a custom amount.");
      return;
    }
    set("donation_rupees", String(headsTotal));
    set("notes", selectedItems.map((i) => `${i.label} (${formatInr(i.amount)})`).join("; "));
    setStep(1);
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const openUpiApp = (url) => {
    const target = (url || pay?.upi_intent_url || "").trim();
    if (!target) {
      toast.error("Open GPay / PhonePe and scan the QR on this page.");
      return;
    }
    window.location.href = target;
  };

  const validDetails = useMemo(() => {
    if (!form.donor_name.trim() || !/^[6-9]\d{9}$/.test(form.mobile)) return false;
    if (!(Number(form.donation_rupees) > 0) || donationPaise < minPaise) return false;
    if (form.donor_type === "resident") return !!(form.tower_id && form.flat_id && form.occupancy_type);
    if (form.donor_type === "other") return true;
    return false;
  }, [form, donationPaise, minPaise]);

  const submit = async () => {
    if (!(form.accuracy_confirmed && form.privacy_consent && form.terms_consent)) {
      toast.error("Please confirm accuracy and both consents.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/donate", { ...form, donation_rupees: Number(form.donation_rupees) });
      setIntent(r.data);
      const s = await api.get("/payments/upi/session", { params: { intent_id: r.data.intent_id } });
      setUpiSession(s.data);
      setStep(4);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not start donation. Please check your details.");
    } finally {
      setBusy(false);
    }
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
      else toast.message("Screenshot submitted for review");
      navigate(`/payment/status?token=${encodeURIComponent(token)}`);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not submit payment proof.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <section className="relative overflow-hidden border-b border-[#7A1F2B]/15">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 15% 20%, rgba(212,175,55,0.22), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 10%, rgba(192,57,43,0.16), transparent 50%), linear-gradient(165deg, #FFF8F0 0%, #F3E6D8 45%, #EDE0D0 100%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-28 sm:pt-32">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#7A1F2B]/20 bg-white/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7A1F2B] backdrop-blur">
              <Flower2 className="h-3.5 w-3.5" /> One 10 Durgotsav 2026
            </div>
            <h1 className="mt-4 max-w-3xl font-display text-5xl leading-[1.05] text-[#3A1518] sm:text-6xl md:text-7xl">
              Donation Heads
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-[#5C3530]/85 sm:text-xl">
              Small contributions make a grander celebration. Choose a puja head — or several — and pay via the committee UPI QR.
            </p>
            <p className="mt-3 text-sm text-[#5C3530]/60">
              Separate from the{" "}
              <Link to="/subscribe" className="font-semibold text-[#C0392B] underline decoration-[#C0392B]/30 underline-offset-2">
                family subscription
              </Link>
              . Looking for brand packages?{" "}
              <Link to="/sponsors" className="font-semibold text-[#C0392B] underline decoration-[#C0392B]/30 underline-offset-2">
                Sponsorship
              </Link>
              .
            </p>
          </motion.div>
        </div>
      </section>

      <div className={`mx-auto max-w-6xl px-5 pt-8 ${step === 0 ? "pb-32" : "pb-20"}`}>
        <div className="mb-8 flex flex-wrap items-center gap-2 text-xs">
          {STEPS.map((label, i) => (
            <div key={label} className={`flex items-center gap-2 ${step >= i ? "text-[#7A1F2B]" : "text-[#5C3530]/35"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold ${step >= i ? "border-[#7A1F2B] bg-[#7A1F2B]/10" : "border-[#5C3530]/20"}`}>
                {i + 1}
              </span>
              {label}
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-[#5C3530]/15" />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="heads" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} data-testid="donate-heads-step">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl text-[#3A1518]">Pick what you&apos;d like to support</h2>
                  <p className="mt-1 text-sm text-[#5C3530]/65">
                    Tap items to add them. Totals update instantly. Names cleaned for clarity (e.g. Immersion).
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="donate-custom-toggle"
                  onClick={() => {
                    setCustomMode((v) => {
                      if (!v) setSelected([]);
                      return !v;
                    });
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    customMode
                      ? "border-[#7A1F2B] bg-[#7A1F2B] text-white"
                      : "border-[#7A1F2B]/25 bg-white/70 text-[#7A1F2B] hover:border-[#7A1F2B]/50"
                  }`}
                >
                  {customMode ? "Using custom amount" : "Or enter a custom amount"}
                </button>
              </div>

              {customMode ? (
                <div className="mx-auto max-w-xl rounded-2xl border border-[#7A1F2B]/15 bg-white/80 p-6 shadow-sm backdrop-blur">
                  <Label required htmlFor="custom-amt">Custom donation (₹)</Label>
                  <Input
                    id="custom-amt"
                    data-testid="donate-custom-amount"
                    type="number"
                    min={minPaise / 100}
                    value={form.donation_rupees}
                    onChange={(e) => set("donation_rupees", e.target.value)}
                    placeholder={`Minimum ${formatPaise(minPaise)}`}
                    className="mt-1"
                  />
                  <div className="mt-4">
                    <Label htmlFor="custom-note">Note (optional)</Label>
                    <Input
                      id="custom-note"
                      data-testid="donate-custom-note"
                      value={form.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      placeholder="e.g. In memory of…"
                      className="mt-1"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  {DONATION_HEADS.map((cat, idx) => (
                    <motion.section
                      key={cat.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04, duration: 0.4 }}
                      className="overflow-hidden rounded-2xl border border-black/5 bg-white/75 shadow-[0_12px_40px_-24px_rgba(58,21,24,0.45)] backdrop-blur"
                      style={{ borderTop: `3px solid ${cat.accent}` }}
                      data-testid={`donate-cat-${cat.id}`}
                    >
                      <div
                        className="flex items-start justify-between gap-3 px-5 py-4"
                        style={{ background: `linear-gradient(120deg, ${cat.soft}, transparent 70%)` }}
                      >
                        <div>
                          <h3 className="font-display text-2xl tracking-tight" style={{ color: cat.accent }}>{cat.title}</h3>
                          <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-[#5C3530]/50">{cat.subtitle}</p>
                        </div>
                        <Sparkles className="mt-1 h-4 w-4 opacity-40" style={{ color: cat.accent }} />
                      </div>
                      <ul className="divide-y divide-[#5C3530]/10 px-2 pb-2">
                        {cat.items.map((item) => {
                          const on = selected.includes(item.id);
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                data-testid={`donate-item-${item.id}`}
                                onClick={() => toggleItem(item.id)}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${on ? "bg-[#7A1F2B]/06" : "hover:bg-black/[0.02]"}`}
                              >
                                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${on ? "border-[#7A1F2B] bg-[#7A1F2B] text-white" : "border-[#5C3530]/25 bg-white text-transparent"}`}>
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                </span>
                                <span className={`min-w-0 flex-1 text-[15px] font-semibold leading-snug ${on ? "text-[#3A1518]" : "text-[#2A1215]"}`}>
                                  {item.label}
                                </span>
                                <span
                                  className="shrink-0 font-display text-xl font-semibold tabular-nums"
                                  style={{ color: on ? cat.accent : "#3A1518" }}
                                >
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

              <details className="mt-10 group">
                <summary className="cursor-pointer list-none text-sm font-semibold text-[#7A1F2B]/80">
                  <span className="underline decoration-[#7A1F2B]/25 underline-offset-4 group-open:no-underline">
                    View original committee flyer
                  </span>
                </summary>
                <div className="mt-4 overflow-hidden rounded-2xl border border-[#7A1F2B]/15 bg-white/60 p-2">
                  <img
                    src="/images/donation-heads-flyer.jpg"
                    alt="One 10 Durgotsav 2026 donation heads flyer"
                    className="mx-auto max-h-[70vh] w-auto rounded-xl object-contain"
                  />
                </div>
              </details>

              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#7A1F2B]/15 bg-[#FFF8F0]/95 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5C3530]/70">Selected total</div>
                    <div className="font-display text-3xl font-semibold text-[#7A1F2B]" data-testid="donate-heads-total">
                      {customMode ? (form.donation_rupees ? formatInr(Number(form.donation_rupees)) : "—") : formatInr(headsTotal)}
                    </div>
                    {!customMode && selectedItems.length > 0 && (
                      <div className="mt-0.5 max-w-md truncate text-xs font-medium text-[#5C3530]/75">
                        {selectedItems.length} head{selectedItems.length > 1 ? "s" : ""} · {selectedItems.map((i) => i.label).join(", ")}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    data-testid="donate-heads-continue"
                    onClick={continueFromHeads}
                    disabled={customMode ? !(Number(form.donation_rupees) > 0) : selectedItems.length === 0}
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="who" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto max-w-3xl" data-testid="donate-type-step">
              <SelectionSummary customMode={customMode} items={selectedItems} total={Number(form.donation_rupees) || headsTotal} onEdit={() => setStep(0)} />
              <div className="mt-6 rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm">
                <h2 className="font-display text-2xl text-[#3A1518]">Are you a One 10 resident?</h2>
                <p className="mt-1 text-sm text-[#5C3530]/65">Residents share tower &amp; flat so we can link your gift to your household.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button type="button" data-testid="donate-type-resident" onClick={() => { set("donor_type", "resident"); setStep(2); }} className="rounded-2xl border border-[#7A1F2B]/15 bg-[#FFF8F0] p-5 text-left transition hover:border-[#C0392B]/40 hover:bg-[#FBF1E6]">
                    <Home className="h-6 w-6 text-[#C0392B]" />
                    <div className="mt-3 font-display text-xl text-[#3A1518]">Yes — One 10 resident</div>
                    <p className="mt-1 text-sm text-[#5C3530]/60">Tower / flat &amp; occupancy</p>
                  </button>
                  <button type="button" data-testid="donate-type-other" onClick={() => { set("donor_type", "other"); setStep(2); }} className="rounded-2xl border border-[#7A1F2B]/15 bg-[#FFF8F0] p-5 text-left transition hover:border-[#C0392B]/40 hover:bg-[#FBF1E6]">
                    <Users className="h-6 w-6 text-[#C0392B]" />
                    <div className="mt-3 font-display text-xl text-[#3A1518]">No — other donor</div>
                    <p className="mt-1 text-sm text-[#5C3530]/60">Friends, family &amp; well-wishers</p>
                  </button>
                </div>
                <button type="button" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#7A1F2B]" onClick={() => setStep(0)}>
                  <ArrowLeft className="h-4 w-4" /> Back to donation heads
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="details" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto max-w-3xl rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm" data-testid="donate-details-step">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl text-[#3A1518]">Donor details</h2>
                  <p className="text-sm text-[#5C3530]/60">
                    {form.donor_type === "resident" ? "One 10 resident" : "Other donor"} · {formatInr(Number(form.donation_rupees) || 0)}
                  </p>
                </div>
                <Button variant="subtle" size="sm" onClick={() => setStep(1)}>Change</Button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label required htmlFor="dname">Full name</Label>
                  <Input id="dname" data-testid="donate-name" value={form.donor_name} onChange={(e) => set("donor_name", e.target.value)} placeholder="Donor name" />
                </div>
                <div>
                  <Label required htmlFor="dmobile">Mobile</Label>
                  <Input id="dmobile" data-testid="donate-mobile" value={form.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10-digit Indian mobile" />
                </div>
                <div>
                  <Label htmlFor="demail">Email (optional)</Label>
                  <Input id="demail" data-testid="donate-email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
                </div>

                {form.donor_type === "resident" ? (
                  <>
                    <div>
                      <Label required htmlFor="dtower">Tower / Block</Label>
                      <Select id="dtower" data-testid="donate-tower" value={form.tower_id} onChange={(e) => { set("tower_id", e.target.value); set("flat_id", ""); }}>
                        <option value="">Select tower</option>
                        {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label required htmlFor="dflat">Flat number</Label>
                      <Select id="dflat" data-testid="donate-flat" value={form.flat_id} onChange={(e) => set("flat_id", e.target.value)} disabled={!form.tower_id}>
                        <option value="">Select flat</option>
                        {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label required htmlFor="docc">Occupancy type</Label>
                      <Select id="docc" data-testid="donate-occupancy" value={form.occupancy_type} onChange={(e) => set("occupancy_type", e.target.value)}>
                        {OCCUPANCY.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <Label htmlFor="dcity">City (optional)</Label>
                      <Input id="dcity" data-testid="donate-city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Kolkata" />
                    </div>
                    <div>
                      <Label htmlFor="dorg">Organisation (optional)</Label>
                      <Input id="dorg" data-testid="donate-org" value={form.organisation} onChange={(e) => set("organisation", e.target.value)} placeholder="Company / group" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="drel">Relation to One 10 (optional)</Label>
                      <Input id="drel" data-testid="donate-relation" value={form.relation_to_one10} onChange={(e) => set("relation_to_one10", e.target.value)} placeholder="e.g. Friend of Tower 5 resident" />
                    </div>
                  </>
                )}

                <div className="sm:col-span-2">
                  <Label required htmlFor="damt">Donation amount (₹)</Label>
                  <Input id="damt" data-testid="donate-amount" type="number" min={minPaise / 100} value={form.donation_rupees} onChange={(e) => set("donation_rupees", e.target.value)} />
                  <p className="mt-1 text-xs text-[#5C3530]/50">Pre-filled from your selected heads. You can adjust if needed. Minimum {formatPaise(minPaise)}.</p>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="dnotes">Note / heads covered</Label>
                  <Input id="dnotes" data-testid="donate-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <Button variant="subtle" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button variant="primary" data-testid="donate-next-btn" disabled={!validDetails} onClick={() => setStep(3)}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="confirm" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm" data-testid="donate-confirm-step">
              <div className="rounded-xl border border-[#D4AF37]/35 bg-[#FFF8F0] p-4">
                <div className="text-sm text-[#5C3530]/60">You are donating</div>
                <div className="font-display text-4xl text-[#C0392B]" data-testid="donate-total">{formatPaise(donationPaise)}</div>
                {selectedItems.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-[#5C3530]/80">
                    {selectedItems.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3">
                        <span>{i.label}</span>
                        <span className="tabular-nums">{formatInr(i.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 space-y-1 border-t border-[#7A1F2B]/10 pt-3 text-sm text-[#5C3530]/80">
                  <div><span className="text-[#5C3530]/50">Donor</span> · {form.donor_name}</div>
                  <div><span className="text-[#5C3530]/50">Mobile</span> · {form.mobile}</div>
                  {form.donor_type === "resident" ? (
                    <div>
                      <span className="text-[#5C3530]/50">Flat</span> · {towers.find((t) => t.id === form.tower_id)?.name || form.tower_id} / {flats.find((f) => f.id === form.flat_id)?.number || form.flat_id}
                    </div>
                  ) : (
                    <div><span className="text-[#5C3530]/50">Type</span> · Other / non-resident donor</div>
                  )}
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-sm text-[#3A1518]">
                <input type="checkbox" data-testid="donate-accuracy" checked={form.accuracy_confirmed} onChange={(e) => set("accuracy_confirmed", e.target.checked)} className="mt-1 h-4 w-4" />
                I confirm the information entered is accurate.
              </label>
              <label className="flex items-start gap-2.5 text-sm text-[#3A1518]">
                <input type="checkbox" data-testid="donate-privacy" checked={form.privacy_consent} onChange={(e) => set("privacy_consent", e.target.checked)} className="mt-1 h-4 w-4" />
                I consent to the <a href="/privacy" className="text-[#C0392B] underline">Privacy Policy</a>.
              </label>
              <label className="flex items-start gap-2.5 text-sm text-[#3A1518]">
                <input type="checkbox" data-testid="donate-terms" checked={form.terms_consent} onChange={(e) => set("terms_consent", e.target.checked)} className="mt-1 h-4 w-4" />
                I agree to the <a href="/terms" className="text-[#C0392B] underline">payment terms</a>.
              </label>

              <div className="flex justify-between">
                <Button variant="subtle" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button variant="primary" data-testid="donate-submit-btn" onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />} Proceed to pay
                </Button>
              </div>
            </motion.div>
          )}

          {step === 4 && upiSession && (
            <motion.div key="pay" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-[#7A1F2B]/12 bg-white/85 p-6 shadow-sm" data-testid="donate-pay-step">
              <div className="text-center">
                <div className="font-display text-3xl text-[#3A1518]">Pay via UPI QR</div>
                <div className="mt-1 text-[#5C3530]/70">
                  Amount: <span className="font-semibold text-[#C0392B]">{formatPaise(upiSession.total_amount)}</span>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col items-center rounded-xl border border-[#D4AF37]/35 bg-[#FFF8F0] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#3A1518]">
                    <QrCode className="h-4 w-4 text-[#C0392B]" /> Scan or open UPI app
                  </div>
                  {pay?.upi_intent_url ? (
                    <a href={pay.upi_intent_url} className="block" aria-label="Open UPI payment">
                      <img src={staticQr} alt="Donation UPI QR" className="h-48 w-48 rounded-lg border border-[#5C3530]/10 bg-white object-contain p-1" data-testid="donate-qr-img" />
                    </a>
                  ) : (
                    <img src={staticQr} alt="Donation UPI QR" className="h-48 w-48 rounded-lg border border-[#5C3530]/10 bg-white object-contain p-1" data-testid="donate-qr-img" />
                  )}
                  <div className="mt-3 grid w-full grid-cols-2 gap-2">
                    {[
                      ["GPay", appLinks.gpay || appLinks.tez || pay?.upi_intent_url],
                      ["PhonePe", appLinks.phonepe || pay?.upi_intent_url],
                      ["Paytm", appLinks.paytm || pay?.upi_intent_url],
                      ["BHIM / UPI", appLinks.upi || pay?.upi_intent_url],
                    ].filter(([, href]) => href).map(([label, href]) => (
                      <Button key={label} type="button" variant="admin" className="w-full text-xs" onClick={() => openUpiApp(href)}>
                        <ExternalLink className="h-3.5 w-3.5" /> {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[#D4AF37]/35 bg-white p-4 text-sm">
                  <div className="font-semibold text-[#3A1518]">Bank / net banking</div>
                  <div className="mt-3 space-y-2 text-[#5C3530]/80">
                    <div>{bank?.account_name || "ONE 10 EVENT ORGANISING COMMITTEE"}</div>
                    <div className="flex items-center justify-between gap-2">
                      <span>A/C {bank?.account_number || "572205000037"}</span>
                      <button type="button" className="text-[#C0392B]" onClick={() => copyText(bank?.account_number || "572205000037", "Account number")} aria-label="Copy account"><Copy className="h-4 w-4" /></button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>IFSC {bank?.ifsc || "ICIC0005722"}</span>
                      <button type="button" className="text-[#C0392B]" onClick={() => copyText(bank?.ifsc || "ICIC0005722", "IFSC")} aria-label="Copy IFSC"><Copy className="h-4 w-4" /></button>
                    </div>
                    <div>{bank?.bank || "ICICI Bank"}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-[#5C3530]/10 bg-[#FFF8F0]/80 p-4">
                <div>
                  <Label required htmlFor="dref">UTR / UPI reference number</Label>
                  <Input id="dref" data-testid="donate-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 312345678901" />
                </div>
                <div>
                  <Label required htmlFor="dshot">Payment screenshot</Label>
                  <label htmlFor="dshot" className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#5C3530]/25 bg-white px-4 py-6 text-center hover:border-[#C0392B]/50">
                    <Upload className="h-6 w-6 text-[#C0392B]" />
                    <span className="mt-2 text-sm font-medium">{screenshot ? screenshot.name : "Tap to upload PNG / JPG"}</span>
                    <input id="dshot" data-testid="donate-screenshot" type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setScreenshot(e.target.files?.[0] || null)} />
                  </label>
                </div>
                <Button variant="primary" size="lg" className="w-full" data-testid="donate-upload-btn" onClick={submitProof} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload & get receipt"}
                </Button>
                <p className="flex items-start justify-center gap-2 text-xs text-[#5C3530]/55">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Receipt is committee-recorded against your reference.
                </p>
              </div>
            </motion.div>
          )}

          {step === 4 && !upiSession && (
            <div className="mx-auto max-w-3xl space-y-3 text-center text-sm text-[#5C3530]/70">
              <p>Could not start donation payment. Please go back and try again.</p>
              <Button variant="subtle" onClick={() => setStep(3)}><ArrowLeft className="h-4 w-4" /> Back</Button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </PublicLayout>
  );
}
