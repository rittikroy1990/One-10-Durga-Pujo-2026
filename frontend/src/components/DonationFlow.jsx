import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowLeft, Heart, Loader2, Upload, QrCode, ExternalLink, Copy, ShieldCheck, Home, Users,
} from "lucide-react";
import api from "../lib/api";
import { Button, Label, Input, Select } from "./ui";
import CashfreePayPanel from "./CashfreePayPanel";
import { formatPaise } from "../lib/utils";

const OCCUPANCY = [
  { v: "owner_resident", l: "Owner — Resident" },
  { v: "tenant_resident", l: "Tenant — Resident" },
  { v: "owner_non_resident", l: "Owner — Non-resident" },
  { v: "other", l: "Other" },
];

const SUGGESTED = [501, 1100, 2100, 5100, 11000];

/** Embedded donation wizard (resident vs other). */
export default function DonationFlow({ className = "" }) {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [step, setStep] = useState(0); // 0=type, 1=details, 2=confirm, 3=pay
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState(null);
  const [upiSession, setUpiSession] = useState(null);
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState(null);

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
    if (form.tower_id) api.get(`/towers/${form.tower_id}/flats`).then((r) => setFlats(r.data.items || [])).catch(() => setFlats([]));
    else setFlats([]);
  }, [form.tower_id]);

  const minPaise = cfg?.subscription?.donation_min_paise ?? 10000;
  const donationPaise = Math.max(0, Math.round(Number(form.donation_rupees || 0) * 100));
  const pay = upiSession?.payment;
  const bank = pay?.bank_account || cfg?.organisation?.bank_account;
  const appLinks = pay?.upi_app_links || {};
  const staticQr = pay?.static_qr_url || "/images/payment-qr.png";

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
      const r = await api.post("/donate", {
        ...form,
        donation_rupees: Number(form.donation_rupees),
      });
      setIntent(r.data);
      const s = await api.get("/payments/upi/session", { params: { intent_id: r.data.intent_id } });
      setUpiSession(s.data);
      setStep(3);
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

  const stepLabels = form.donor_type === "resident"
    ? ["Who", "Details", "Confirm", "Pay"]
    : ["Who", "Details", "Confirm", "Pay"];

  return (
    <div className={`mx-auto max-w-3xl ${className}`} data-testid="donation-flow">
        {step > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
            {stepLabels.map((s, i) => (
              <div key={s} className={`flex items-center gap-2 ${step >= i ? "text-vermilion-600" : "text-brown-800/35"}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full border ${step >= i ? "border-vermilion-500 bg-vermilion-500/10" : "border-brown-800/20"}`}>{i + 1}</span>
                {s}{i < stepLabels.length - 1 && <span className="mx-1 h-px w-6 bg-brown-800/15" />}
              </div>
            ))}
          </div>
        )}

        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 rounded-2xl border border-sun-400/35 bg-white p-6 text-brown-900 shadow-sm"
        >
          {step === 0 && (
            <div className="space-y-4" data-testid="donate-type-step">
              <h2 className="font-display text-2xl">Are you a One 10 resident?</h2>
              <p className="text-sm text-brown-800/65">
                Residents get tower &amp; flat details so we can link your gift to your household. Others follow a simpler donor form.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid="donate-type-resident"
                  onClick={() => { set("donor_type", "resident"); setStep(1); }}
                  className="rounded-2xl border border-sun-400/40 bg-sky-50/80 p-5 text-left transition hover:border-vermilion-500/50 hover:bg-sun-50"
                >
                  <Home className="h-6 w-6 text-vermilion-500" />
                  <div className="mt-3 font-display text-xl">Yes — One 10 resident</div>
                  <p className="mt-1 text-sm text-brown-800/60">Tower / flat dropdowns &amp; occupancy</p>
                </button>
                <button
                  type="button"
                  data-testid="donate-type-other"
                  onClick={() => { set("donor_type", "other"); setStep(1); }}
                  className="rounded-2xl border border-sun-400/40 bg-sky-50/80 p-5 text-left transition hover:border-vermilion-500/50 hover:bg-sun-50"
                >
                  <Users className="h-6 w-6 text-vermilion-500" />
                  <div className="mt-3 font-display text-xl">No — other donor</div>
                  <p className="mt-1 text-sm text-brown-800/60">Friends, family, brands &amp; well-wishers</p>
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2" data-testid="donate-details-step">
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl">Donor details</h2>
                  <p className="text-sm text-brown-800/60">
                    {form.donor_type === "resident" ? "One 10 resident flow" : "Non-resident / other donor flow"}
                  </p>
                </div>
                <Button variant="subtle" size="sm" onClick={() => setStep(0)}>Change</Button>
              </div>

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
                    <Input id="dorg" data-testid="donate-org" value={form.organisation} onChange={(e) => set("organisation", e.target.value)} placeholder="Company / group name" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="drel">Relation to One10 (optional)</Label>
                    <Input id="drel" data-testid="donate-relation" value={form.relation_to_one10} onChange={(e) => set("relation_to_one10", e.target.value)} placeholder="e.g. Friend of Tower 5 resident" />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <Label required htmlFor="damt">Donation amount (₹)</Label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {SUGGESTED.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set("donation_rupees", String(n))}
                      className={`rounded-full border px-3 py-1.5 text-sm ${Number(form.donation_rupees) === n ? "border-vermilion-500 bg-vermilion-500/10 text-vermilion-600" : "border-brown-800/15 text-brown-800/70"}`}
                    >
                      ₹{n.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
                <Input id="damt" data-testid="donate-amount" type="number" min={minPaise / 100} step="1" value={form.donation_rupees} onChange={(e) => set("donation_rupees", e.target.value)} placeholder={`Minimum ${formatPaise(minPaise)}`} />
                <p className="mt-1 text-xs text-brown-800/50">Minimum {formatPaise(minPaise)}. This is a voluntary gift — not the family subscription.</p>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="dnotes">Note (optional)</Label>
                <Input id="dnotes" data-testid="donate-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Message for the committee" />
              </div>

              <div className="sm:col-span-2 flex justify-between">
                <Button variant="subtle" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button variant="primary" data-testid="donate-next-btn" disabled={!validDetails} onClick={() => setStep(2)}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5" data-testid="donate-confirm-step">
              <div className="rounded-xl border border-sun-400/35 bg-sky-50/80 p-4">
                <div className="text-sm text-brown-800/60">You are donating</div>
                <div className="font-display text-4xl text-vermilion-600" data-testid="donate-total">{formatPaise(donationPaise)}</div>
                <div className="mt-3 space-y-1 text-sm text-brown-800/80">
                  <div><span className="text-brown-800/50">Donor</span> · {form.donor_name}</div>
                  <div><span className="text-brown-800/50">Mobile</span> · {form.mobile}</div>
                  {form.donor_type === "resident" ? (
                    <div>
                      <span className="text-brown-800/50">Flat</span> ·{" "}
                      {towers.find((t) => t.id === form.tower_id)?.name || form.tower_id} /{" "}
                      {flats.find((f) => f.id === form.flat_id)?.number || form.flat_id}
                    </div>
                  ) : (
                    <div><span className="text-brown-800/50">Type</span> · Other / non-resident donor</div>
                  )}
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" data-testid="donate-accuracy" checked={form.accuracy_confirmed} onChange={(e) => set("accuracy_confirmed", e.target.checked)} className="mt-1 h-4 w-4" />
                I confirm the information entered is accurate.
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" data-testid="donate-privacy" checked={form.privacy_consent} onChange={(e) => set("privacy_consent", e.target.checked)} className="mt-1 h-4 w-4" />
                I consent to the <a href="/privacy" className="text-vermilion-600 underline">Privacy Policy</a>.
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" data-testid="donate-terms" checked={form.terms_consent} onChange={(e) => set("terms_consent", e.target.checked)} className="mt-1 h-4 w-4" />
                I agree to the <a href="/terms" className="text-vermilion-600 underline">payment terms</a>.
              </label>

              <div className="flex justify-between">
                <Button variant="subtle" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button variant="primary" data-testid="donate-submit-btn" onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />} Proceed to pay
                </Button>
              </div>
            </div>
          )}

          {step === 3 && upiSession && (
            <div className="space-y-5" data-testid="donate-pay-step">
              <div className="text-center">
                <div className="font-display text-3xl">Pay your donation</div>
                <div className="mt-1 text-brown-800/70">
                  Amount: <span className="font-semibold text-vermilion-600">{formatPaise(upiSession.total_amount)}</span>
                </div>
              </div>

              <CashfreePayPanel
                intentId={intent?.intent_id}
                cfg={cfg}
                amountLabel={formatPaise(upiSession.total_amount)}
              />

              <div className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-brown-800/45">
                Or pay via UPI / bank
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col items-center rounded-xl border border-sun-400/35 bg-sky-50/50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brown-800">
                    <QrCode className="h-4 w-4 text-vermilion-500" /> Scan or open UPI app
                  </div>
                  {pay?.upi_intent_url ? (
                    <a href={pay.upi_intent_url} className="block" aria-label="Open UPI payment">
                      <img src={staticQr} alt="Donation UPI QR" className="h-48 w-48 rounded-lg border border-brown-800/10 bg-white object-contain p-1" data-testid="donate-qr-img" />
                    </a>
                  ) : (
                    <img src={staticQr} alt="Donation UPI QR" className="h-48 w-48 rounded-lg border border-brown-800/10 bg-white object-contain p-1" data-testid="donate-qr-img" />
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

                <div className="rounded-xl border border-sun-400/35 bg-white p-4 text-sm">
                  <div className="font-semibold text-brown-900">Bank / net banking</div>
                  <div className="mt-3 space-y-2 text-brown-800/80">
                    <div>{bank?.account_name || "ONE 10 EVENT ORGANISING COMMITTEE"}</div>
                    <div className="flex items-center justify-between gap-2">
                      <span>A/C {bank?.account_number || "572205000037"}</span>
                      <button type="button" className="text-vermilion-600" onClick={() => copyText(bank?.account_number || "572205000037", "Account number")} aria-label="Copy account"><Copy className="h-4 w-4" /></button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>IFSC {bank?.ifsc || "ICIC0005722"}</span>
                      <button type="button" className="text-vermilion-600" onClick={() => copyText(bank?.ifsc || "ICIC0005722", "IFSC")} aria-label="Copy IFSC"><Copy className="h-4 w-4" /></button>
                    </div>
                    <div>{bank?.bank || "ICICI Bank"}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-brown-800/10 bg-sky-50/40 p-4">
                <div>
                  <Label required htmlFor="dref">UTR / UPI reference number</Label>
                  <Input id="dref" data-testid="donate-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 312345678901" />
                </div>
                <div>
                  <Label required htmlFor="dshot">Payment screenshot</Label>
                  <label htmlFor="dshot" className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brown-800/25 bg-white px-4 py-6 text-center hover:border-vermilion-500/50">
                    <Upload className="h-6 w-6 text-vermilion-500" />
                    <span className="mt-2 text-sm font-medium">{screenshot ? screenshot.name : "Tap to upload PNG / JPG"}</span>
                    <input id="dshot" data-testid="donate-screenshot" type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setScreenshot(e.target.files?.[0] || null)} />
                  </label>
                </div>
                <Button variant="primary" size="lg" className="w-full" data-testid="donate-upload-btn" onClick={submitProof} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload & get receipt"}
                </Button>
                <p className="flex items-start justify-center gap-2 text-xs text-brown-800/55">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Receipt is committee-recorded against your reference.
                </p>
              </div>
            </div>
          )}

          {step === 3 && !upiSession && (
            <div className="space-y-3 text-center text-sm text-brown-800/70">
              <p>Could not start donation payment. Please go back and try again.</p>
              <Button variant="subtle" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Back</Button>
            </div>
          )}
        </motion.div>
    </div>
  );
}
