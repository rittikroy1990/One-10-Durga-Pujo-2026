import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowLeft, ShieldCheck, Loader2, Upload, Copy, QrCode,
} from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Label, Input, Select } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

const OCCUPANCY = [
  { v: "owner_resident", l: "Owner — Resident" },
  { v: "tenant_resident", l: "Tenant — Resident" },
  { v: "owner_non_resident", l: "Owner — Non-resident" },
  { v: "other", l: "Other" },
];
const INTERESTS = [
  { v: "elder", l: "Elder activities" },
  { v: "family", l: "Family activities" },
  { v: "child", l: "Child activities" },
  { v: "performance", l: "Performance / creation" },
  { v: "volunteering", l: "Volunteering" },
];

export default function Subscribe() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState(null);
  const [order, setOrder] = useState(null);
  const [upiSession, setUpiSession] = useState(null);
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [qrBroken, setQrBroken] = useState(false);

  const [form, setForm] = useState({
    primary_contact_name: "", mobile: "", tower_id: "", flat_id: "",
    occupancy_type: "owner_resident", family_members: 4, email: "", family_display_name: "",
    donation_rupees: 0, interests: [], accessibility_request: "", comments: "",
    accuracy_confirmed: false, privacy_consent: false, terms_consent: false,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get("/config").then((r) => setCfg(r.data));
    api.get("/towers").then((r) => setTowers(r.data.items || []));
  }, []);
  useEffect(() => {
    if (form.tower_id) api.get(`/towers/${form.tower_id}/flats`).then((r) => setFlats(r.data.items || []));
    else setFlats([]);
  }, [form.tower_id]);

  const base = cfg?.subscription?.base_amount_paise || 350000;
  const donationPaise = Math.max(0, Math.round(Number(form.donation_rupees || 0) * 100));
  const total = base + donationPaise;
  const useUpi = (cfg?.feature_flags?.payment_provider || "upi_qr") === "upi_qr"
    && !cfg?.feature_flags?.razorpay_public_checkout;
  const bank = upiSession?.payment?.bank_account || cfg?.payment?.bank_account || cfg?.organisation?.bank_account;
  const pay = upiSession?.payment;

  const toggleInterest = (v) =>
    set("interests", form.interests.includes(v) ? form.interests.filter((x) => x !== v) : [...form.interests, v]);

  const validStep1 = form.primary_contact_name && /^[6-9]\d{9}$/.test(form.mobile) && form.tower_id && form.flat_id;

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const submit = async () => {
    if (!(form.accuracy_confirmed && form.privacy_consent && form.terms_consent)) {
      toast.error("Please confirm accuracy and both consents.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/subscribe", {
        ...form,
        family_members: Number(form.family_members),
        donation_rupees: Number(form.donation_rupees || 0),
      });
      setIntent(r.data);
      if (useUpi || r.data.payment_method === "upi_qr") {
        const s = await api.get(`/payments/upi/session`, { params: { intent_id: r.data.intent_id } });
        setUpiSession(s.data);
        setOrder(null);
      } else {
        const o = await api.post("/payments/order", { intent_id: r.data.intent_id });
        setOrder(o.data);
        setUpiSession(null);
      }
      setStep(3);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : (d?.message || "Could not create subscription. Please check your details."));
    } finally {
      setBusy(false);
    }
  };

  const submitUpiProof = async () => {
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
      if (r.data.status === "paid") {
        toast.success(`Receipt ${r.data.receipt?.receipt_no || ""} issued`);
      } else {
        toast.message("Screenshot submitted for review");
      }
      navigate(`/payment/status?token=${encodeURIComponent(token)}`);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not submit payment proof.");
    } finally {
      setBusy(false);
    }
  };

  const payTest = async () => {
    setBusy(true);
    try {
      const r = await api.post("/payments/simulate", { internal_order_id: order.internal_order_id });
      if (r.data.status === "paid") {
        toast.success(`Receipt ${r.data.receipt.receipt_no} issued`);
        navigate(`/payment/status?token=${encodeURIComponent(order.status_token)}`);
      } else if (r.data.status === "duplicate_payment") {
        toast.warning("Excess payment queued for refund review.");
      } else {
        toast.error("Payment needs reconciliation. The committee will review it.");
      }
    } catch (e) {
      toast.error("Payment could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const payReal = async () => {
    await new Promise((res) => {
      if (window.Razorpay) return res();
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = res;
      document.body.appendChild(s);
    });
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.provider_order_id,
      name: cfg?.campaign?.title || cfg?.platform?.name || "One 10 Events",
      description: "Household subscription",
      handler: async (resp) => {
        try {
          const v = await api.post("/payments/verify", {
            internal_order_id: order.internal_order_id,
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          if (v.data.status === "paid") navigate(`/payment/status?token=${encodeURIComponent(order.status_token)}`);
          else toast.warning("Payment is being verified. Please do not pay again.");
        } catch {
          toast.error("Verification failed.");
        }
      },
    });
    rzp.open();
  };

  const qrSrc = intent
    ? `${API}/payments/upi/qr.png?intent_id=${encodeURIComponent(intent.intent_id)}`
    : null;
  const staticQr = pay?.static_qr_url || "/images/payment-qr.png";

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-5xl text-ivory-100">Subscribe & Pay</h1>
        <p className="mt-2 text-ivory-100/70">
          {cfg?.subscription ? formatPaise(cfg.subscription.base_amount_paise) : "₹3,500.00"} per family
          {cfg?.campaign?.title ? ` for ${cfg.campaign.title}` : ""}. Pay via QR / bank transfer, then upload your screenshot.
        </p>

        <div className="mt-6 flex items-center gap-2 text-xs">
          {["Household", "Confirm", "Pay"].map((s, i) => (
            <div key={s} className={`flex items-center gap-2 ${step >= i + 1 ? "text-gold-400" : "text-ivory-100/40"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full border ${step >= i + 1 ? "border-gold-400 bg-gold-500/20" : "border-ivory-100/30"}`}>{i + 1}</span>
              {s}{i < 2 && <span className="mx-1 h-px w-8 bg-ivory-100/20" />}
            </div>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-8 rounded-2xl border border-gold-500/25 bg-ivory-200 p-6 text-brown-900">
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label required htmlFor="name">Primary contact full name</Label>
                <Input id="name" data-testid="sub-name" value={form.primary_contact_name} onChange={(e) => set("primary_contact_name", e.target.value)} placeholder="e.g. Rahul Sen" />
              </div>
              <div>
                <Label required htmlFor="mobile">Mobile number</Label>
                <Input id="mobile" data-testid="sub-mobile" value={form.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit Indian mobile" inputMode="numeric" />
              </div>
              <div>
                <Label htmlFor="email">Email (optional)</Label>
                <Input id="email" data-testid="sub-email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <Label required htmlFor="tower">Tower / Block</Label>
                <Select id="tower" data-testid="sub-tower" value={form.tower_id} onChange={(e) => { set("tower_id", e.target.value); set("flat_id", ""); }}>
                  <option value="">Select tower</option>
                  {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <div>
                <Label required htmlFor="flat">Flat number</Label>
                <Select id="flat" data-testid="sub-flat" value={form.flat_id} onChange={(e) => set("flat_id", e.target.value)} disabled={!form.tower_id}>
                  <option value="">Select flat</option>
                  {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
                </Select>
              </div>
              <div>
                <Label required htmlFor="occ">Occupancy type</Label>
                <Select id="occ" data-testid="sub-occupancy" value={form.occupancy_type} onChange={(e) => set("occupancy_type", e.target.value)}>
                  {OCCUPANCY.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </Select>
              </div>
              <div>
                <Label required htmlFor="fm">Family members (1–20)</Label>
                <Input id="fm" data-testid="sub-family" type="number" min={1} max={20} value={form.family_members} onChange={(e) => set("family_members", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Participation interests (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((it) => (
                    <button key={it.v} type="button" onClick={() => toggleInterest(it.v)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${form.interests.includes(it.v) ? "border-vermilion-500 bg-vermilion-500/10 text-vermilion-600" : "border-brown-800/20 text-brown-800/70"}`}>
                      {it.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button variant="admin" data-testid="sub-next-btn" disabled={!validStep1} onClick={() => setStep(2)}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-gold-500/30 bg-white p-4">
                <div className="text-sm text-brown-800/60">Base subscription</div>
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl">{formatPaise(base)}</span>
                  <span className="text-xs text-brown-800/50">Fixed for 2026 · ₹2,500 + ₹300 + ₹700</span>
                </div>
                <div className="mt-4">
                  <Label htmlFor="don">Additional voluntary donation (optional)</Label>
                  <Input id="don" data-testid="sub-donation" type="number" min={0} value={form.donation_rupees} onChange={(e) => set("donation_rupees", e.target.value)} placeholder="0" />
                  <p className="mt-1 text-xs text-brown-800/50">Recorded separately from the base subscription.</p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-brown-800/10 pt-3">
                  <span className="font-semibold">Total payable</span>
                  <span data-testid="sub-total" className="font-display text-3xl text-vermilion-600">{formatPaise(total)}</span>
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" data-testid="sub-accuracy" checked={form.accuracy_confirmed} onChange={(e) => set("accuracy_confirmed", e.target.checked)} className="mt-1 h-4 w-4" />
                I confirm the information entered is accurate.
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" data-testid="sub-privacy" checked={form.privacy_consent} onChange={(e) => set("privacy_consent", e.target.checked)} className="mt-1 h-4 w-4" />
                I consent to the <a href="/privacy" className="text-vermilion-600 underline">Privacy Policy</a>.
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" data-testid="sub-terms" checked={form.terms_consent} onChange={(e) => set("terms_consent", e.target.checked)} className="mt-1 h-4 w-4" />
                I agree to the <a href="/terms" className="text-vermilion-600 underline">payment & refund terms</a>.
              </label>

              <div className="flex justify-between">
                <Button variant="subtle" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button variant="primary" data-testid="sub-submit-btn" onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Proceed to payment"} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && upiSession && (
            <div className="space-y-5" data-testid="upi-pay-step">
              <div className="text-center">
                <div className="font-display text-3xl">Pay via QR / bank transfer</div>
                <div className="mt-1 text-brown-800/70">
                  Amount: <span className="font-semibold text-vermilion-600">{formatPaise(upiSession.total_amount)}</span>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col items-center rounded-xl border border-gold-500/30 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brown-800">
                    <QrCode className="h-4 w-4 text-vermilion-500" /> Scan & pay
                  </div>
                  <img
                    src={qrBroken ? staticQr : (pay?.qr_data ? qrSrc : staticQr)}
                    alt="Payment QR"
                    className="h-48 w-48 rounded-lg border border-brown-800/10 object-contain"
                    data-testid="payment-qr-img"
                    onError={() => setQrBroken(true)}
                  />
                  <p className="mt-2 text-center text-xs text-brown-800/55">
                    Pay the <b>exact</b> amount, then upload your screenshot below.
                  </p>
                </div>

                <div className="rounded-xl border border-gold-500/30 bg-white p-4 text-sm">
                  <div className="font-semibold text-brown-900">Bank details</div>
                  <div className="mt-3 space-y-2 text-brown-800/80">
                    <div className="flex items-start justify-between gap-2">
                      <span><span className="text-brown-800/50">Name</span><br />{bank?.account_name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span><span className="text-brown-800/50">A/C</span><br />{bank?.account_number}</span>
                      <button type="button" className="text-vermilion-600" onClick={() => copyText(bank?.account_number || "", "Account number")} aria-label="Copy account">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span><span className="text-brown-800/50">IFSC</span><br />{bank?.ifsc}</span>
                      <button type="button" className="text-vermilion-600" onClick={() => copyText(bank?.ifsc || "", "IFSC")} aria-label="Copy IFSC">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                    <div><span className="text-brown-800/50">Bank</span><br />{bank?.bank}</div>
                    {pay?.vpa && <div><span className="text-brown-800/50">UPI</span><br />{pay.vpa}</div>}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-brown-800/10 bg-white p-4 space-y-4">
                <div>
                  <Label required htmlFor="ref">UTR / UPI reference number</Label>
                  <Input
                    id="ref"
                    data-testid="upi-reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. 312345678901"
                  />
                </div>
                <div>
                  <Label required htmlFor="shot">Payment screenshot</Label>
                  <label
                    htmlFor="shot"
                    className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brown-800/25 bg-ivory-100 px-4 py-6 text-center hover:border-vermilion-500/50"
                  >
                    <Upload className="h-6 w-6 text-vermilion-500" />
                    <span className="mt-2 text-sm font-medium">
                      {screenshot ? screenshot.name : "Tap to upload PNG / JPG"}
                    </span>
                    <span className="mt-1 text-xs text-brown-800/50">We read the screenshot to match amount & reference</span>
                    <input
                      id="shot"
                      data-testid="upi-screenshot"
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  data-testid="upi-submit-btn"
                  onClick={submitUpiProof}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload & get receipt"}
                </Button>
                <p className="flex items-start justify-center gap-2 text-xs text-brown-800/55">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Receipt is committee-recorded against your reference — not a bank settlement confirmation.
                </p>
              </div>
            </div>
          )}

          {step === 3 && order && (
            <div className="space-y-5 text-center">
              <div className="font-display text-3xl">Complete your payment</div>
              <div className="text-brown-800/70">Amount: <span className="font-semibold text-vermilion-600">{formatPaise(order.amount)}</span></div>
              {order.mode === "live" ? (
                <Button variant="primary" size="lg" data-testid="pay-now-btn" onClick={payReal} disabled={busy}>Pay securely with Razorpay</Button>
              ) : (
                <div>
                  <div className="mx-auto mb-3 max-w-md rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                    Razorpay test mode is available for committee preview only.
                  </div>
                  <Button variant="primary" size="lg" data-testid="pay-test-btn" onClick={payTest} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pay (test simulation)"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </PublicLayout>
  );
}
