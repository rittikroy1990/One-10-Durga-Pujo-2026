import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  UtensilsCrossed, ExternalLink, Copy, Upload, Loader2, ShieldCheck,
  Minus, Plus, ArrowRight, ArrowLeft, Check, ClipboardList, Leaf, Clock,
} from "lucide-react";
import api from "../../lib/api";
import { loadFlats, prefetchFlats } from "../../lib/flats";
import PublicLayout from "../../components/PublicLayout";
import WhatsAppOrderPanel from "../../components/WhatsAppOrderPanel";
import { Button, Input, Label, Select, Spinner } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import { VEG_PROMISE, normalizeMobile } from "../../lib/food";

const MAX_PLATES = 50;

function QtyControl({ value, onBump, onSet, label, testId }) {
  return (
    <div className="inline-flex items-center gap-1.5" data-testid={testId}>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full bg-sun-50 text-vermilion-600 ring-1 ring-sun-400/40 disabled:opacity-40"
        disabled={value <= 0}
        onClick={() => onBump(-1)}
        aria-label={`Fewer ${label}`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        min={0}
        max={MAX_PLATES}
        value={value}
        onChange={(e) => {
          const n = Math.max(0, Math.min(MAX_PLATES, parseInt(e.target.value || "0", 10) || 0));
          onSet(n);
        }}
        className="w-12 rounded-lg border border-sun-400/35 bg-white py-1.5 text-center text-sm font-semibold text-brown-900"
        aria-label={`${label} quantity`}
      />
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full bg-vermilion-500 text-white disabled:opacity-40"
        disabled={value >= MAX_PLATES}
        onClick={() => onBump(1)}
        aria-label={`More ${label}`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function StepBar({ current, paymentEnabled }) {
  const steps = [
    { id: "menu", label: "Menu & plates" },
    { id: "checkout", label: "Your details" },
    ...(paymentEnabled ? [{ id: "pay", label: "Pay QR" }] : []),
  ];
  const idx = Math.max(0, steps.findIndex((s) => s.id === current));
  return (
    <ol className="mt-5 flex flex-wrap gap-2" data-testid="bijaya-step-bar">
      {steps.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <li
            key={s.id}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
              active
                ? "bg-vermilion-500 text-white"
                : done
                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20"
                  : "bg-white text-brown-800/55 ring-1 ring-sun-400/30"
            }`}
          >
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${
              active ? "bg-white/20" : done ? "bg-emerald-600 text-white" : "bg-sun-50"
            }`}>
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

export default function BijayaFood() {
  const navigate = useNavigate();
  const placing = useRef(false);

  const [cfg, setCfg] = useState(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [flatsLoading, setFlatsLoading] = useState(false);
  const [plates, setPlates] = useState(1);
  const [step, setStep] = useState("menu");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    tower_id: "",
    tower_name: "",
    flat_id: "",
    flat_number: "",
  });
  const [intent, setIntent] = useState(null);
  const [upiSession, setUpiSession] = useState(null);
  const [done, setDone] = useState(null);
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [payMode, setPayMode] = useState("upload");

  useEffect(() => {
    api.get("/food/bijaya/menu")
      .then((r) => setCfg(r.data))
      .catch(() => toast.error("Could not load Bijaya food page"));
    api.get("/towers")
      .then((r) => {
        setTowers(r.data.items || []);
        prefetchFlats(r.data.items || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.tower_id) {
      setFlats([]);
      return;
    }
    let cancelled = false;
    setFlatsLoading(true);
    loadFlats(form.tower_id)
      .then((items) => { if (!cancelled) setFlats(items || []); })
      .catch(() => { if (!cancelled) setFlats([]); })
      .finally(() => { if (!cancelled) setFlatsLoading(false); });
    return () => { cancelled = true; };
  }, [form.tower_id]);

  const unitPaise = cfg?.amount_paise ?? 66000;
  const totalPaise = unitPaise * plates;
  const paymentEnabled = Boolean(cfg?.payment_enabled);
  const menuReady = Boolean(cfg?.menu_ready);
  const menuSections = cfg?.menu_sections || [];
  const pay = upiSession?.payment;
  const qrSrc = pay?.qr_data_url
    || upiSession?.qr_url
    || (upiSession?.intent_id
      ? `/api/payments/upi/qr.png?intent_id=${encodeURIComponent(upiSession.intent_id)}`
      : null);

  const flatReady = Boolean(form.tower_id && form.flat_id && /^[6-9]\d{9}$/.test(form.mobile));

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const goCheckout = () => {
    if (plates < 1) return toast.error("Add at least one plate");
    if (!form.tower_id || !form.flat_id) return toast.error("Select your tower and flat");
    if (!/^[6-9]\d{9}$/.test(form.mobile)) return toast.error("Enter a valid 10-digit mobile number");
    setStep("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitCheckout = async (e) => {
    e.preventDefault();
    if (plates < 1) return toast.error("Add at least one plate");
    const name = form.name.trim();
    if (!name) return toast.error("Please enter your name");
    if (!/^[6-9]\d{9}$/.test(form.mobile)) return toast.error("Enter a valid 10-digit mobile number");
    if (!form.tower_id || !form.flat_id) return toast.error("Select your tower and flat");
    if (placing.current) return;
    placing.current = true;
    setBusy(true);
    try {
      const tower = towers.find((t) => t.id === form.tower_id);
      const flat = flats.find((f) => f.id === form.flat_id);
      const r = await api.post("/food/bijaya/register", {
        name,
        mobile: form.mobile,
        tower_id: form.tower_id,
        tower_name: tower?.name || form.tower_name,
        flat_id: form.flat_id,
        flat_number: flat?.number || form.flat_number,
        quantity: plates,
      });
      let session = null;
      if (r.data.payment_enabled && r.data.intent_id) {
        for (let attempt = 0; attempt < 3 && !session; attempt += 1) {
          try {
            session = (await api.get("/payments/upi/session", { params: { intent_id: r.data.intent_id } })).data;
          } catch {
            await new Promise((ok) => setTimeout(ok, 800));
          }
        }
      }
      if (session) {
        setIntent(r.data);
        setUpiSession(session);
        setStep("pay");
        toast.success("Almost done — pay the amount below");
      } else if (r.data.payment_enabled && r.data.intent_id) {
        setDone({
          ...r.data,
          message: `Your order #${r.data.ref} is saved, but the payment QR didn't load. Don't order again — open My orders to pay for it.`,
        });
        setStep("done");
        toast.message(`Order #${r.data.ref} saved — open My orders to pay`);
      } else {
        setDone(r.data);
        setStep("done");
        toast.success("Order saved");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not place order");
    } finally {
      placing.current = false;
      setBusy(false);
    }
  };

  const submitProof = async () => {
    if (!intent?.intent_id) return;
    if (!reference.trim() || reference.trim().length < 6) {
      toast.error("Enter the UTR / UPI reference shown in your payment app");
      return;
    }
    if (!screenshot) {
      toast.error("Upload a screenshot of the successful payment");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("intent_id", intent.intent_id);
      fd.append("status_token", intent.status_token || "");
      fd.append("reference", reference.trim());
      fd.append("screenshot", screenshot);
      const r = await api.post("/payments/upi/submit", fd);
      const token = r.data.status_token || intent.status_token;
      if (r.data.status === "paid") toast.success(`Receipt ${r.data.receipt?.receipt_no || ""} issued`);
      else toast.message("Submitted — committee will confirm shortly");
      navigate(`/payment/status?token=${encodeURIComponent(token)}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not submit payment proof");
    } finally {
      setBusy(false);
    }
  };

  const resetAll = () => {
    setPayMode("upload");
    setDone(null);
    setIntent(null);
    setUpiSession(null);
    setReference("");
    setScreenshot(null);
    setPlates(1);
    setStep("menu");
  };

  const stepForBar = step === "done" ? (paymentEnabled ? "pay" : "checkout") : step;

  const menuList = useMemo(() => {
    if (!menuReady) return null;
    return menuSections.map((section) => (
      <div key={section.section} className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6" data-testid="bijaya-menu-section">
        <h2 className="font-display text-2xl text-brown-900">{section.section}</h2>
        {section.section_bn ? (
          <p className="mt-0.5 text-sm text-brown-800/55">{section.section_bn}</p>
        ) : null}
        <ul className="mt-4 divide-y divide-sun-400/20">
          {(section.items || []).map((item) => (
            <li key={item.name} className="flex items-start justify-between gap-3 py-2.5" data-testid="bijaya-menu-item">
              <div>
                <div className="font-medium text-brown-900">{item.name}</div>
                {item.name_bn ? <div className="text-xs text-brown-800/50">{item.name_bn}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    ));
  }, [menuReady, menuSections]);

  if (cfg && !cfg.page_enabled) {
    return (
      <PublicLayout>
        <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 px-4 pt-24 pb-16">
          <div className="relative mx-auto max-w-xl text-center">
            <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">বিজয়া সংমিলনী</p>
            <h1 className="mt-3 font-display text-4xl text-brown-900 sm:text-5xl">Coming soon</h1>
            <p className="mt-3 text-base text-brown-800/70">Bijaya Sammilani food subscriptions will open soon.</p>
            <div className="mt-8">
              <Link to="/food" className="inline-flex rounded-full bg-vermilion-500 px-6 py-3 text-sm font-semibold text-white hover:bg-vermilion-600">
                Durga Pujo food
              </Link>
            </div>
          </div>
        </section>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <section className="border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 pt-8 pb-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-5">
          <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">বিজয়া সংমিলনী · Food</p>
          <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl">
            {cfg?.title || "Bijaya Sammilani"}
          </h1>
          {cfg?.title_bn ? (
            <p className="mt-1 font-display text-2xl text-brown-800/70">{cfg.title_bn}</p>
          ) : null}
          <p className="mt-2 max-w-xl text-brown-800/70">
            Choose how many plates you need, then pay by UPI QR — same flow as Durga Pujo food.
          </p>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-sun-400/35 bg-white px-4 py-2 text-sm shadow-sm" data-testid="bijaya-price-badge">
            <UtensilsCrossed className="h-4 w-4 text-vermilion-500" />
            <span className="font-medium text-brown-900">Per plate</span>
            <span className="font-display text-xl text-vermilion-600">{formatPaise(unitPaise)}</span>
          </div>

          {cfg && <StepBar current={stepForBar} paymentEnabled={paymentEnabled} />}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <Link
              to="/food/orders"
              className="inline-flex items-center gap-1.5 rounded-full border border-sun-400/35 bg-white px-3 py-1.5 font-medium text-brown-900 hover:border-vermilion-500/40 hover:text-vermilion-600"
              data-testid="bijaya-my-orders-link"
            >
              <ClipboardList className="h-4 w-4 text-vermilion-500" /> My orders
            </Link>
            <Link
              to="/food"
              className="inline-flex items-center gap-1.5 rounded-full border border-sun-400/35 bg-white px-3 py-1.5 font-medium text-brown-900 hover:border-vermilion-500/40 hover:text-vermilion-600"
              data-testid="bijaya-durga-food-link"
            >
              Durga Pujo food
            </Link>
          </div>

          <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-xl border border-emerald-600/25 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
            <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{VEG_PROMISE}</span>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
        {!cfg ? (
          <Spinner className="text-vermilion-500" />
        ) : step === "pay" && upiSession && intent ? (
          <div className="mx-auto max-w-2xl space-y-5" data-testid="bijaya-pay-step">
            <div className="rounded-2xl border border-sun-400/30 bg-white p-6 text-center shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-vermilion-500">Step 3 of 3</p>
              <h2 className="mt-1 font-display text-3xl text-brown-900">Pay this amount</h2>
              <p className="mt-2 font-display text-4xl text-vermilion-600">
                {formatPaise(upiSession.total_amount ?? intent.total_amount_paise)}
              </p>
              <p className="mt-1 text-sm text-brown-800/55">
                {intent.selection_count || plates} plate{(intent.selection_count || plates) === 1 ? "" : "s"} · Order {String(intent.id || "").slice(-6).toUpperCase()}
              </p>
              <p className="mt-1 text-xs text-brown-800/50">
                Paying later? Open <Link to="/food/orders" className="font-semibold text-vermilion-600 underline">My orders</Link>.
              </p>
            </div>

            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h3 className="flex items-center gap-2 font-display text-xl text-brown-900">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-vermilion-500 text-sm font-bold text-white">1</span>
                Pay with UPI
              </h3>
              <p className="mt-1 text-sm text-brown-800/60">Open any UPI app and scan this QR. No card payment.</p>
              <div className="mt-4 flex flex-col items-center">
                {pay?.upi_intent_url ? (
                  <a href={pay.upi_intent_url} className="block" aria-label="Open UPI payment">
                    <img src={qrSrc} alt="Bijaya food UPI QR" className="h-52 w-52 rounded-xl border border-brown-800/10 bg-white object-contain p-2" data-testid="bijaya-qr-img" />
                  </a>
                ) : (
                  <img src={qrSrc} alt="Bijaya food UPI QR" className="h-52 w-52 rounded-xl border border-brown-800/10 bg-white object-contain p-2" data-testid="bijaya-qr-img" />
                )}
                {pay?.upi_intent_url ? (
                  <a
                    href={pay.upi_intent_url}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-vermilion-500 px-5 text-sm font-semibold text-white shadow-sm hover:bg-vermilion-600 sm:hidden"
                    data-testid="bijaya-open-upi"
                  >
                    <ExternalLink className="h-4 w-4" /> Open UPI app · {formatPaise(upiSession.total_amount ?? intent.total_amount_paise)}
                  </a>
                ) : null}
              </div>
              {pay?.vpa ? (
                <div className="mt-5 rounded-xl border border-sun-400/25 bg-sun-50/50 p-4 text-sm">
                  <div className="font-semibold text-brown-900">Food payments go to</div>
                  <div className="mt-2 space-y-2 text-brown-800/80">
                    {pay.payee_name ? <div>{pay.payee_name}</div> : null}
                    <div className="flex items-center justify-between gap-2">
                      <span className="break-all">UPI ID {pay.vpa}</span>
                      <button type="button" className="text-vermilion-600" onClick={() => copyText(pay.vpa, "UPI ID")} aria-label="Copy UPI ID"><Copy className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h3 className="flex items-center gap-2 font-display text-xl text-brown-900">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-vermilion-500 text-sm font-bold text-white">2</span>
                Confirm your payment
              </h3>
              {intent.whatsapp_text ? (
                <div className="grid grid-cols-2 gap-1 rounded-full bg-sun-50 p-1 text-sm font-semibold" role="tablist">
                  {[
                    ["upload", "Upload here"],
                    ["whatsapp", "Send on WhatsApp"],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={payMode === mode}
                      onClick={() => setPayMode(mode)}
                      className={`min-h-10 rounded-full px-3 ${payMode === mode ? "bg-vermilion-500 text-white shadow-sm" : "text-brown-800/70 hover:text-brown-900"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              {payMode === "whatsapp" && intent.whatsapp_text ? (
                <WhatsAppOrderPanel
                  text={intent.whatsapp_text}
                  amountPaise={upiSession.total_amount ?? intent.total_amount_paise}
                  statusToken={intent.status_token}
                  onPosted={() => navigate(`/payment/status?token=${encodeURIComponent(intent.status_token)}`)}
                />
              ) : (
                <>
                  <div>
                    <Label required htmlFor="bijaya-ref">UTR / UPI reference from your app</Label>
                    <Input id="bijaya-ref" data-testid="bijaya-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Copy from GPay / PhonePe success screen" />
                  </div>
                  <div>
                    <Label required htmlFor="bijaya-shot">Payment screenshot</Label>
                    <label htmlFor="bijaya-shot" className="mt-1 flex min-h-[8rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brown-800/25 bg-sky-50/40 px-4 py-6 text-center hover:border-vermilion-500/50">
                      <Upload className="h-7 w-7 text-vermilion-500" />
                      <span className="mt-2 text-sm font-medium text-brown-900">{screenshot ? screenshot.name : "Tap to upload PNG or JPG"}</span>
                      <input id="bijaya-shot" data-testid="bijaya-screenshot" type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setScreenshot(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                  <Button variant="primary" size="lg" className="w-full" data-testid="bijaya-upload-btn" onClick={submitProof} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit & get receipt"}
                  </Button>
                  <p className="flex items-start justify-center gap-2 text-xs text-brown-800/55">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    Keep this page open until you see confirmation.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : step === "done" && done ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-sun-400/30 bg-white p-6 text-center shadow-card" data-testid="bijaya-register-success">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-3xl text-brown-900">Order #{done.ref}</h2>
            <p className="mt-2 text-brown-800/70">{done.message}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link to="/food/orders"><Button variant="primary">My orders</Button></Link>
              <Button variant="subtle" onClick={resetAll}>Order again</Button>
            </div>
          </div>
        ) : step === "checkout" ? (
          <form className="mx-auto max-w-xl space-y-5" onSubmit={submitCheckout} data-testid="bijaya-checkout">
            <button type="button" className="inline-flex items-center gap-1.5 text-sm text-brown-800/60 hover:text-vermilion-600" onClick={() => setStep("menu")}>
              <ArrowLeft className="h-4 w-4" /> Back to menu
            </button>
            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h2 className="font-display text-2xl text-brown-900">Your details</h2>
              <p className="mt-1 text-sm text-brown-800/60">
                {plates} plate{plates === 1 ? "" : "s"} · {formatPaise(totalPaise)}
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <Label required htmlFor="bijaya-name">Name</Label>
                  <Input id="bijaya-name" data-testid="bijaya-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
                </div>
                <div>
                  <Label required>Mobile</Label>
                  <Input
                    data-testid="bijaya-checkout-mobile"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: normalizeMobile(e.target.value) })}
                    placeholder="10-digit mobile"
                    inputMode="numeric"
                  />
                </div>
                <div className="rounded-xl bg-ivory-200 px-3.5 py-2.5 text-sm text-brown-900">
                  {towers.find((t) => t.id === form.tower_id)?.name || "Tower"} · Flat {flats.find((f) => f.id === form.flat_id)?.number || ""}
                </div>
              </div>
              <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={busy || !flatReady} data-testid="bijaya-place-order">
                {busy
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Placing…</>
                  : paymentEnabled
                    ? <>Confirm &amp; pay {formatPaise(totalPaise)} <ArrowRight className="h-4 w-4" /></>
                    : <>Confirm order <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <p className="mt-3 text-center text-xs text-brown-800/50">Payment is by UPI QR only — no card checkout.</p>
            </div>
          </form>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]" data-testid="bijaya-menu-step">
            <div className="space-y-5">
              {!menuReady ? (
                <div className="rounded-2xl border border-dashed border-amber-400/50 bg-amber-50/70 p-6 text-center" data-testid="bijaya-menu-placeholder">
                  <Clock className="mx-auto h-8 w-8 text-amber-700/70" />
                  <h2 className="mt-3 font-display text-2xl text-brown-900">
                    {cfg.menu_placeholder?.title || "Menu coming soon"}
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-brown-800/70">
                    {cfg.menu_placeholder?.note}
                  </p>
                </div>
              ) : menuList}

              <div className="rounded-2xl border border-emerald-600/25 bg-white p-4 shadow-card sm:p-5" data-testid="bijaya-flat-card">
                <h2 className="font-display text-xl text-brown-900">Your flat</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label required>Tower</Label>
                    <Select
                      data-testid="bijaya-tower"
                      value={form.tower_id}
                      onChange={(e) => setForm({ ...form, tower_id: e.target.value, flat_id: "", flat_number: "" })}
                    >
                      <option value="">Select tower</option>
                      {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label required>Flat</Label>
                    <Select
                      data-testid="bijaya-flat"
                      value={form.flat_id}
                      disabled={flatsLoading}
                      onChange={(e) => setForm({ ...form, flat_id: e.target.value })}
                    >
                      <option value="">{flatsLoading ? "Loading flats…" : "Select flat"}</option>
                      {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label required>Mobile</Label>
                    <Input
                      data-testid="bijaya-mobile"
                      value={form.mobile}
                      onChange={(e) => setForm({ ...form, mobile: normalizeMobile(e.target.value) })}
                      placeholder="10-digit mobile"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card" data-testid="bijaya-cart">
                <h2 className="font-display text-xl text-brown-900">Your plates</h2>
                <p className="mt-1 text-sm text-brown-800/60">{formatPaise(unitPaise)} each</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-brown-900">Plates</span>
                  <QtyControl
                    value={plates}
                    label="plates"
                    testId="bijaya-qty"
                    onBump={(d) => setPlates((n) => Math.max(0, Math.min(MAX_PLATES, n + d)))}
                    onSet={setPlates}
                  />
                </div>
                <div className="mt-4 flex items-end justify-between border-t border-sun-400/20 pt-3">
                  <div className="text-sm text-brown-800/60">{plates} plate{plates === 1 ? "" : "s"}</div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-brown-800/45">You pay</div>
                    <div className="font-display text-3xl text-vermilion-600" data-testid="bijaya-total">
                      {formatPaise(totalPaise)}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="mt-4 w-full"
                  disabled={plates < 1 || busy}
                  onClick={goCheckout}
                  data-testid="bijaya-goto-checkout"
                >
                  {plates < 1 ? "Add plates to continue" : <>Checkout · {formatPaise(totalPaise)} <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </div>
            </aside>
          </div>
        )}
      </section>
    </PublicLayout>
  );
}
