import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  UtensilsCrossed, Info, QrCode, Copy, Upload, Loader2, ShieldCheck,
  Minus, Plus, ShoppingCart, Trash2, ArrowRight, ArrowLeft, Check, Coffee, Sun, Moon,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Input, Label, Select, Spinner } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

const ALLOWED_MEALS = new Set(["breakfast", "lunch", "dinner"]);
const MAX_QTY = 50;

const MEAL_ICON = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon};

const STEPS = [
  { id: "menu", label: "1. Choose meals" },
  { id: "checkout", label: "2. Your details" },
  { id: "pay", label: "3. Pay" },
];

function filterDays(days) {
  return (days || [])
    .map((day) => ({
      ...day,
      meals: (day.meals || []).filter((m) => ALLOWED_MEALS.has(m.code))}))
    .filter((day) => (day.meals || []).length > 0);
}

function lineKey(dayCode, mealCode) {
  return `${dayCode}|${mealCode}`;
}

function StepBar({ current, paymentEnabled }) {
  const visible = paymentEnabled ? STEPS : STEPS.filter((s) => s.id !== "pay");
  const idx = Math.max(0, visible.findIndex((s) => s.id === current));
  return (
    <ol className="mt-5 flex flex-wrap gap-2" data-testid="food-step-bar">
      {visible.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <li
            key={s.id}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
              active
                ? "bg-vermilion-500 text-white"
                : done
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-brown-800/5 text-brown-800/45"
            }`}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : null}
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function QtyControl({ value, onBump, onSet, label, testId }) {
  const qty = value || 0;
  if (qty <= 0) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 min-w-[7.5rem] rounded-xl"
        onClick={() => onBump(1)}
        data-testid={testId ? `${testId}-add` : undefined}
        aria-label={`Add ${label}`}
      >
        <Plus className="h-4 w-4" /> Add
      </Button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-vermilion-500/40 bg-vermilion-500/5 p-1">
      <button
        type="button"
        aria-label={`Remove one ${label}`}
        data-testid={testId ? `${testId}-dec` : undefined}
        className="grid h-10 w-10 place-items-center rounded-lg text-brown-900 hover:bg-white"
        onClick={() => onBump(-1)}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        min={0}
        max={MAX_QTY}
        value={qty}
        data-testid={testId}
        aria-label={`${label} quantity`}
        onChange={(e) => onSet(e.target.value)}
        className="h-10 w-12 border-0 bg-transparent text-center text-base font-semibold text-brown-900 outline-none"
      />
      <button
        type="button"
        aria-label={`Add one ${label}`}
        data-testid={testId ? `${testId}-inc` : undefined}
        className="grid h-10 w-10 place-items-center rounded-lg text-brown-900 hover:bg-white"
        onClick={() => onBump(1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Food() {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("menu");
  const [done, setDone] = useState(null);
  const [intent, setIntent] = useState(null);
  const [upiSession, setUpiSession] = useState(null);
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [cart, setCart] = useState({});
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    tower_id: "",
    tower_name: "",
    flat_id: "",
    flat_number: "",
    family_members: 1,
    notes: ""});

  useEffect(() => {
    api.get("/food/menu").then((r) => setMenu(r.data)).catch(() => toast.error("Could not load food menu"));
    api.get("/towers").then((r) => setTowers(r.data.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.tower_id) {
      setFlats([]);
      return;
    }
    api.get(`/towers/${form.tower_id}/flats`).then((r) => setFlats(r.data.items || [])).catch(() => setFlats([]));
  }, [form.tower_id]);

  const days = useMemo(() => filterDays(menu?.menu?.days || []), [menu]);
  const paymentEnabled = !!menu?.payment_enabled;

  const priceByMeal = useMemo(() => {
    const map = {};
    for (const p of menu?.meal_prices || []) {
      if (p?.code) map[p.code] = Number(p.amount_paise) || 0;
    }
    for (const day of days) {
      for (const meal of day.meals || []) {
        if (meal.code && map[meal.code] == null && meal.amount_paise != null) {
          map[meal.code] = Number(meal.amount_paise) || 0;
        }
      }
    }
    return map;
  }, [menu, days]);

  const cartLines = useMemo(() => {
    const lines = [];
    for (const day of days) {
      for (const meal of day.meals || []) {
        const key = lineKey(day.code, meal.code);
        const qty = Number(cart[key] || 0);
        if (qty <= 0) continue;
        const unit = priceByMeal[meal.code];
        lines.push({
          key,
          day_code: day.code,
          day_label: day.label || day.code,
          meal_code: meal.code,
          meal_label: meal.label || meal.code,
          quantity: qty,
          unit_paise: unit ?? null,
          line_total_paise: unit != null ? unit * qty : null,
          amount_label: meal.amount_label || (unit != null ? formatPaise(unit) : "TBC")});
      }
    }
    return lines;
  }, [cart, days, priceByMeal]);

  const cartCount = useMemo(() => cartLines.reduce((n, l) => n + l.quantity, 0), [cartLines]);
  const cartTotalPaise = useMemo(() => {
    if (!cartLines.length) return 0;
    let sum = 0;
    for (const line of cartLines) {
      if (line.line_total_paise == null) return null;
      sum += line.line_total_paise;
    }
    return sum;
  }, [cartLines]);

  const mealTypeSummary = useMemo(() => {
    const map = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const line of cartLines) {
      if (map[line.meal_code] != null) map[line.meal_code] += line.quantity;
    }
    return map;
  }, [cartLines]);

  const breakfastPrice = priceByMeal.breakfast ?? 6000;
  const lunchPrice = priceByMeal.lunch ?? 30000;
  const dinnerPrice = priceByMeal.dinner ?? 30000;

  const pay = upiSession?.payment;
  const bank = pay?.bank_account;
  const staticQr = pay?.static_qr_url || "/images/payment-qr.png";

  const setQty = (key, qty) => {
    const next = Math.max(0, Math.min(MAX_QTY, Number(qty) || 0));
    setCart((prev) => {
      const copy = { ...prev };
      if (next <= 0) delete copy[key];
      else copy[key] = next;
      return copy;
    });
  };

  const bump = (key, delta) => setQty(key, (cart[key] || 0) + delta);
  const clearCart = () => {
    if (Object.keys(cart).length === 0) return;
    setCart({});
    toast.message("Cart cleared");
  };

  const addOneOfMealAcrossDays = (mealCode) => {
    setCart((prev) => {
      const next = { ...prev };
      for (const day of days) {
        if (!(day.meals || []).some((m) => m.code === mealCode)) continue;
        const key = lineKey(day.code, mealCode);
        next[key] = Math.min(MAX_QTY, (next[key] || 0) + 1);
      }
      return next;
    });
    toast.success(`Added 1 ${mealCode} for each day`);
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const goCheckout = () => {
    if (cartCount === 0) return toast.error("Tap Add on a meal to start your cart");
    setStep("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitCheckout = async (e) => {
    e.preventDefault();
    if (cartCount === 0) return toast.error("Your cart is empty");
    if (!form.name.trim()) return toast.error("Please enter your name");
    if (form.mobile && !/^[6-9]\d{9}$/.test(form.mobile)) {
      return toast.error("Enter a valid 10-digit mobile, or leave it blank");
    }
    setBusy(true);
    try {
      const tower = towers.find((t) => t.id === form.tower_id);
      const flat = flats.find((f) => f.id === form.flat_id);
      const selections = cartLines.map((l) => ({
        day_code: l.day_code,
        meal_code: l.meal_code,
        quantity: l.quantity}));
      const r = await api.post("/food/register", {
        ...form,
        tower_name: tower?.name || form.tower_name,
        flat_number: flat?.number || form.flat_number,
        selections});
      if (r.data.payment_enabled && r.data.intent_id) {
        setIntent(r.data);
        const s = await api.get("/payments/upi/session", { params: { intent_id: r.data.intent_id } });
        setUpiSession(s.data);
        setStep("pay");
        toast.success("Almost done — pay the amount below");
      } else {
        setDone(r.data);
        setStep("done");
        toast.success("Order saved");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not place order");
    } finally {
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
    setDone(null);
    setIntent(null);
    setUpiSession(null);
    setReference("");
    setScreenshot(null);
    setCart({});
    setStep("menu");
  };

  const stepForBar = step === "done" ? (paymentEnabled ? "pay" : "checkout") : step;

  const cartPanel = (
    <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card" data-testid="food-cart">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-display text-xl text-brown-900">
          <ShoppingCart className="h-5 w-5 text-vermilion-500" />
          Your cart
          {cartCount > 0 && (
            <span className="rounded-full bg-vermilion-500 px-2 py-0.5 text-xs font-semibold text-white">{cartCount}</span>
          )}
        </div>
        {cartCount > 0 && (
          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-vermilion-500 hover:underline" onClick={clearCart} data-testid="food-cart-clear">
            <Trash2 className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      {cartCount === 0 ? (
        <div className="mt-4 rounded-xl bg-sun-50/80 px-3 py-4 text-sm text-brown-800/70">
          <p className="font-medium text-brown-900">Cart is empty</p>
          <p className="mt-1">Tap <span className="font-semibold">Add</span> next to any meal. Example: 3 breakfasts + 2 lunches.</p>
        </div>
      ) : (
        <>
          <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto">
            {cartLines.map((line) => (
              <li key={line.key} className="rounded-xl border border-sun-400/20 bg-sun-50/40 p-3" data-testid={`food-cart-line-${line.key}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-brown-900">{line.meal_label}</div>
                    <div className="text-xs text-brown-800/55">{line.day_label} · {line.amount_label} each</div>
                  </div>
                  <div className="text-right font-semibold text-vermilion-600">
                    {line.line_total_paise != null ? formatPaise(line.line_total_paise) : "TBC"}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <QtyControl
                    value={line.quantity}
                    label={`${line.day_label} ${line.meal_label}`}
                    testId={`food-cart-qty-${line.key}`}
                    onBump={(d) => bump(line.key, d)}
                    onSet={(v) => setQty(line.key, v)}
                  />
                  <button
                    type="button"
                    className="text-xs text-brown-800/45 hover:text-vermilion-600"
                    onClick={() => setQty(line.key, 0)}
                    aria-label={`Remove ${line.meal_label}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {(mealTypeSummary.breakfast > 0 || mealTypeSummary.lunch > 0 || mealTypeSummary.dinner > 0) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-brown-800/65">
              {mealTypeSummary.breakfast > 0 && <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-sun-400/30">Breakfast × {mealTypeSummary.breakfast}</span>}
              {mealTypeSummary.lunch > 0 && <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-sun-400/30">Lunch × {mealTypeSummary.lunch}</span>}
              {mealTypeSummary.dinner > 0 && <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-sun-400/30">Dinner × {mealTypeSummary.dinner}</span>}
            </div>
          )}

          <div className="mt-4 flex items-end justify-between border-t border-sun-400/20 pt-3">
            <div className="text-sm text-brown-800/60">{cartCount} meal{cartCount === 1 ? "" : "s"}</div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-brown-800/45">You pay</div>
              <div className="font-display text-3xl text-vermilion-600" data-testid="food-cart-total">
                {cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <PublicLayout>
      <section className="border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 pt-20 pb-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-5">
          <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Puja meals</p>
          <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl">Order meals</h1>
          <p className="mt-2 max-w-xl text-brown-800/70">
            Pick how many breakfasts, lunches and dinners you need. Your total updates as you add.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["Breakfast", breakfastPrice, Coffee],
              ["Lunch", lunchPrice, Sun],
              ["Dinner", dinnerPrice, Moon],
            ].map(([label, paise, Icon]) => (
              <div key={label} className="inline-flex items-center gap-2 rounded-full border border-sun-400/35 bg-white px-3 py-1.5 text-sm text-brown-900 shadow-sm">
                <Icon className="h-4 w-4 text-vermilion-500" />
                <span className="font-medium">{label}</span>
                <span className="text-vermilion-600">{formatPaise(paise)}</span>
              </div>
            ))}
          </div>

          {menu && <StepBar current={stepForBar} paymentEnabled={paymentEnabled} />}

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-2.5 text-sm text-amber-900/90">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {menu?.payment_note
                || (paymentEnabled
                  ? "After checkout, pay by scanning the UPI QR and upload your payment screenshot."
                  : "You can place your order now. Payment will open soon.")}
            </span>
          </div>
        </div>
      </section>

      <section className={`mx-auto max-w-5xl px-4 py-8 sm:px-5 ${step === "menu" && cartCount > 0 ? "pb-28 lg:pb-8" : ""}`}>
        {!menu ? (
          <Spinner className="text-vermilion-500" />
        ) : step === "pay" && upiSession && intent ? (
          <div className="mx-auto max-w-2xl space-y-5" data-testid="food-pay-step">
            <div className="rounded-2xl border border-sun-400/30 bg-white p-6 text-center shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-vermilion-500">Step 3 of 3</p>
              <h2 className="mt-1 font-display text-3xl text-brown-900">Pay this amount</h2>
              <p className="mt-2 font-display text-4xl text-vermilion-600">
                {formatPaise(upiSession.total_amount ?? intent.total_amount_paise)}
              </p>
              <p className="mt-1 text-sm text-brown-800/55">
                {intent.selection_count || cartCount} meal{(intent.selection_count || cartCount) === 1 ? "" : "s"} · Order {intent.id}
              </p>
            </div>

            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h3 className="flex items-center gap-2 font-display text-xl text-brown-900">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-vermilion-500 text-sm font-bold text-white">1</span>
                Scan &amp; pay with UPI
              </h3>
              <div className="mt-4 flex flex-col items-center">
                <img
                  src={staticQr}
                  alt="Food UPI QR"
                  className="pointer-events-none h-52 w-52 select-none rounded-xl border border-brown-800/10 bg-white object-contain p-2"
                  data-testid="food-qr-img"
                  draggable={false}
                />
                <ol className="mt-4 w-full max-w-sm space-y-1.5 text-left text-sm text-brown-800/75">
                  <li><span className="font-semibold text-brown-900">1.</span> Open GPay, PhonePe, Paytm, or any UPI app</li>
                  <li><span className="font-semibold text-brown-900">2.</span> Tap <span className="font-semibold">Scan QR</span> in the app</li>
                  <li><span className="font-semibold text-brown-900">3.</span> Scan this QR and pay the exact amount</li>
                  <li><span className="font-semibold text-brown-900">4.</span> Enter UTR / UPI reference and upload screenshot below</li>
                </ol>
              </div>

              <div className="mt-5 rounded-xl border border-sun-400/25 bg-sun-50/50 p-4 text-sm">
                <div className="font-semibold text-brown-900">Or pay by bank transfer</div>
                <div className="mt-2 space-y-2 text-brown-800/80">
                  <div>{bank?.account_name || "ONE 10 EVENT ORGANISING COMMITTEE"}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span>A/C {bank?.account_number || "572205000037"}</span>
                    <button type="button" className="text-vermilion-600" onClick={() => copyText(bank?.account_number || "572205000037", "Account number")} aria-label="Copy account"><Copy className="h-4 w-4" /></button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>IFSC {bank?.ifsc || "ICIC0005722"}</span>
                    <button type="button" className="text-vermilion-600" onClick={() => copyText(bank?.ifsc || "ICIC0005722", "IFSC")} aria-label="Copy IFSC"><Copy className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h3 className="flex items-center gap-2 font-display text-xl text-brown-900">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-vermilion-500 text-sm font-bold text-white">2</span>
                Confirm your payment
              </h3>
              <div>
                <Label required htmlFor="food-ref">UTR / UPI reference from your app</Label>
                <Input id="food-ref" data-testid="food-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Copy from your UPI app success screen" />
                <p className="mt-1 text-xs text-brown-800/45">Usually a 12-digit number on the payment success page.</p>
              </div>
              <div>
                <Label required htmlFor="food-shot">Payment screenshot</Label>
                <label htmlFor="food-shot" className="mt-1 flex min-h-[8rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brown-800/25 bg-sky-50/40 px-4 py-6 text-center hover:border-vermilion-500/50">
                  <Upload className="h-7 w-7 text-vermilion-500" />
                  <span className="mt-2 text-sm font-medium text-brown-900">{screenshot ? screenshot.name : "Tap to upload PNG or JPG"}</span>
                  <span className="mt-1 text-xs text-brown-800/45">Screenshot of the successful payment</span>
                  <input id="food-shot" data-testid="food-screenshot" type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setScreenshot(e.target.files?.[0] || null)} />
                </label>
              </div>
              <Button variant="primary" size="lg" className="w-full" data-testid="food-upload-btn" onClick={submitProof} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit & get receipt"}
              </Button>
              <p className="flex items-start justify-center gap-2 text-xs text-brown-800/55">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Keep this page open until you see confirmation.
              </p>
            </div>
          </div>
        ) : step === "done" && done ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-sun-400/30 bg-white p-6 text-center shadow-card" data-testid="food-register-success">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-3xl text-brown-900">Order saved</h2>
            <p className="mt-2 text-brown-800/70">{done.message || "Thank you — your meal order is with the committee."}</p>
            <p className="mt-3 text-sm text-brown-800/50">Reference: <span className="font-medium text-brown-900">{done.id}</span></p>
            {done.total_amount_paise != null && (
              <p className="mt-1 text-lg font-semibold text-vermilion-600">Total {formatPaise(done.total_amount_paise)}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={resetAll}>Order more meals</Button>
              <Link to="/"><Button variant="subtle">Back home</Button></Link>
            </div>
          </div>
        ) : step === "checkout" ? (
          <form onSubmit={submitCheckout} className="grid gap-6 lg:grid-cols-[1fr_340px]" data-testid="food-checkout-form">
            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-vermilion-500">Step 2 of {paymentEnabled ? 3 : 2}</p>
              <h2 className="mt-1 font-display text-2xl text-brown-900">Who is this order for?</h2>
              <p className="mt-1 text-sm text-brown-800/60">Only your name is required. Tower and flat help the committee find you.</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label required>Your name</Label>
                  <Input data-testid="food-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" required autoFocus />
                </div>
                <div>
                  <Label>Mobile <span className="font-normal text-brown-800/45">(optional)</span></Label>
                  <Input
                    data-testid="food-mobile"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    placeholder="10-digit mobile"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label>Family members</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.family_members}
                    onChange={(e) => setForm({ ...form, family_members: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Tower</Label>
                  <Select
                    data-testid="food-tower"
                    value={form.tower_id}
                    onChange={(e) => setForm({ ...form, tower_id: e.target.value, flat_id: "", flat_number: "" })}
                  >
                    <option value="">Select tower</option>
                    {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Flat</Label>
                  <Select
                    data-testid="food-flat"
                    value={form.flat_id}
                    onChange={(e) => setForm({ ...form, flat_id: e.target.value })}
                  >
                    <option value="">Select flat</option>
                    {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Notes <span className="font-normal text-brown-800/45">(optional)</span></Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Allergy or delivery note" />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button type="button" variant="subtle" onClick={() => setStep("menu")}>
                  <ArrowLeft className="h-4 w-4" /> Edit cart
                </Button>
                <Button type="submit" variant="primary" size="lg" disabled={busy} data-testid="food-checkout-btn">
                  {busy ? "Saving…" : (paymentEnabled ? `Continue to pay · ${cartTotalPaise != null ? formatPaise(cartTotalPaise) : ""}` : "Place order")}
                  {!busy && <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="lg:sticky lg:top-24 lg:self-start">{cartPanel}</div>
          </form>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]" data-testid="food-menu-cart">
            <div className="space-y-4">
              <div className="rounded-2xl border border-sun-400/30 bg-white p-4 shadow-card sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 font-display text-2xl text-brown-900">
                      <UtensilsCrossed className="h-5 w-5 text-vermilion-500" /> Choose meals
                    </h2>
                    <p className="mt-1 text-sm text-brown-800/60">Tap <span className="font-semibold">Add</span>, then use + / − if you need more than one.</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="self-center text-xs text-brown-800/45">Quick add 1 for every day:</span>
                  {[
                    ["breakfast", "Breakfast"],
                    ["lunch", "Lunch"],
                    ["dinner", "Dinner"],
                  ].map(([code, label]) => (
                    <Button key={code} type="button" variant="subtle" size="sm" onClick={() => addOneOfMealAcrossDays(code)} data-testid={`food-quick-${code}`}>
                      + {label}
                    </Button>
                  ))}
                  {cartCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearCart}
                      data-testid="food-reset-btn"
                      className="ml-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Reset cart
                    </Button>
                  )}
                </div>
              </div>

              {days.map((day) => (
                <div key={day.code} className="overflow-hidden rounded-2xl border border-sun-400/30 bg-white shadow-card">
                  <div className="border-b border-sun-400/20 bg-sun-50/70 px-4 py-3">
                    <h3 className="font-display text-xl text-brown-900">{day.label}</h3>
                    {day.date_label || day.date ? (
                      <p className="text-xs text-brown-800/50">{day.date_label || day.date}</p>
                    ) : null}
                  </div>
                  <ul className="divide-y divide-sun-400/15">
                    {(day.meals || []).map((meal) => {
                      const key = lineKey(day.code, meal.code);
                      const qty = cart[key] || 0;
                      const Icon = MEAL_ICON[meal.code] || UtensilsCrossed;
                      const unit = priceByMeal[meal.code];
                      return (
                        <li key={key} className={`flex items-center justify-between gap-3 px-4 py-3.5 ${qty > 0 ? "bg-vermilion-500/[0.04]" : ""}`}>
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${qty > 0 ? "bg-vermilion-500 text-white" : "bg-sun-50 text-vermilion-500"}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-brown-900">{meal.label}</div>
                              <div className="text-sm text-vermilion-600">
                                {meal.amount_label || (unit != null ? formatPaise(unit) : "Price TBC")}
                                {qty > 1 && unit != null ? (
                                  <span className="text-brown-800/45"> · line {formatPaise(unit * qty)}</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <QtyControl
                            value={qty}
                            label={`${day.label} ${meal.label}`}
                            testId={`food-qty-${key}`}
                            onBump={(d) => bump(key, d)}
                            onSet={(v) => setQty(key, v)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
              {cartPanel}
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="mt-3 w-full"
                disabled={cartCount === 0}
                onClick={goCheckout}
                data-testid="food-goto-checkout-side"
              >
                {cartCount === 0 ? "Add meals to continue" : `Checkout · ${cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}`}
                {cartCount > 0 && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Mobile sticky checkout bar */}
      {step === "menu" && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sun-400/30 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden" data-testid="food-mobile-checkout-bar">
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={clearCart}
              data-testid="food-mobile-reset"
              className="shrink-0 px-3"
              aria-label="Reset cart"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-brown-800/55">{cartCount} meal{cartCount === 1 ? "" : "s"} in cart</div>
              <div className="truncate font-display text-xl text-vermilion-600">
                {cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}
              </div>
            </div>
            <Button type="button" variant="primary" size="lg" onClick={goCheckout} data-testid="food-goto-checkout">
              Checkout <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
