import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, ShieldCheck, Loader2 } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Label, Input, Select, Textarea } from "../../components/ui";
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

  const toggleInterest = (v) =>
    set("interests", form.interests.includes(v) ? form.interests.filter((x) => x !== v) : [...form.interests, v]);

  const validStep1 = form.primary_contact_name && /^[6-9]\d{9}$/.test(form.mobile) && form.tower_id && form.flat_id;

  const submit = async () => {
    if (!(form.accuracy_confirmed && form.privacy_consent && form.terms_consent)) {
      toast.error("Please confirm accuracy and both consents.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/subscribe", { ...form, family_members: Number(form.family_members), donation_rupees: Number(form.donation_rupees || 0) });
      setIntent(r.data);
      const o = await api.post("/payments/order", { intent_id: r.data.intent_id });
      setOrder(o.data);
      setStep(3);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : (d?.message || "Could not create subscription. Please check your details."));
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
    // Real Razorpay checkout (enabled when live keys are configured)
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

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-5xl text-ivory-100">Subscribe & Pay</h1>
        <p className="mt-2 text-ivory-100/70">
          {cfg?.subscription ? formatPaise(cfg.subscription.base_amount_paise) : "₹3,500.00"} per family
          {cfg?.campaign?.title ? ` for ${cfg.campaign.title}` : ""}. Your household is recorded once, with a verified receipt.
        </p>

        {/* stepper */}
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

          {step === 3 && order && (
            <div className="space-y-5 text-center">
              <div className="font-display text-3xl">Complete your payment</div>
              <div className="text-brown-800/70">Amount: <span className="font-semibold text-vermilion-600">{formatPaise(order.amount)}</span></div>
              {order.mode === "live" ? (
                <Button variant="primary" size="lg" data-testid="pay-now-btn" onClick={payReal} disabled={busy}>Pay securely with Razorpay</Button>
              ) : (
                <div>
                  <div className="mx-auto mb-3 max-w-md rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                    Razorpay is in <b>TEST</b> mode (placeholder keys). Use the button below to run the full verified payment state machine. Live checkout activates once EOC adds real keys.
                  </div>
                  <Button variant="primary" size="lg" data-testid="pay-test-btn" onClick={payTest} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pay (test simulation)"}
                  </Button>
                </div>
              )}
              <p className="flex items-center justify-center gap-2 text-xs text-brown-800/50">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Your receipt is issued only after the payment is verified.
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </PublicLayout>
  );
}
