import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  UtensilsCrossed, Check, Info, QrCode, ExternalLink, Copy, Upload, Loader2, ShieldCheck,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Input, Label, Select, Spinner } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

const ALLOWED_MEALS = new Set(["breakfast", "lunch", "dinner"]);

function filterDays(days) {
  return (days || []).map((day) => ({
    ...day,
    meals: (day.meals || []).filter((m) => ALLOWED_MEALS.has(m.code)),
  })).filter((day) => (day.meals || []).length > 0);
}

export default function Food() {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [intent, setIntent] = useState(null);
  const [upiSession, setUpiSession] = useState(null);
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    tower_id: "",
    tower_name: "",
    flat_id: "",
    flat_number: "",
    family_members: 1,
    notes: "",
  });
  const [selected, setSelected] = useState(() => new Set());

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

  const totalPaise = useMemo(() => {
    let sum = 0;
    for (const key of selected) {
      const mealCode = key.split("|")[1];
      const paise = priceByMeal[mealCode];
      if (paise == null) return null;
      sum += paise;
    }
    return sum;
  }, [selected, priceByMeal]);

  const allKeys = useMemo(
    () => days.flatMap((d) => (d.meals || []).map((m) => `${d.code}|${m.code}`)),
    [days],
  );

  const pay = upiSession?.payment;
  const bank = pay?.bank_account;
  const appLinks = pay?.upi_app_links || {};
  const staticQr = pay?.static_qr_url || "/images/payment-qr.png";

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectDay = (day) => {
    const keys = (day.meals || []).map((m) => `${day.code}|${m.code}`);
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
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

  const submit = async (e) => {
    e.preventDefault();
    if (selected.size === 0) return toast.error("Select at least one meal");
    if (form.mobile && !/^[6-9]\d{9}$/.test(form.mobile)) {
      return toast.error("Enter a valid 10-digit mobile, or leave it blank");
    }
    setBusy(true);
    try {
      const tower = towers.find((t) => t.id === form.tower_id);
      const flat = flats.find((f) => f.id === form.flat_id);
      const r = await api.post("/food/register", {
        ...form,
        tower_name: tower?.name || form.tower_name,
        flat_number: flat?.number || form.flat_number,
        selections: [...selected],
      });
      if (r.data.payment_enabled && r.data.intent_id) {
        setIntent(r.data);
        const s = await api.get("/payments/upi/session", { params: { intent_id: r.data.intent_id } });
        setUpiSession(s.data);
        toast.success("Registered — pay via UPI QR");
      } else {
        setDone(r.data);
        toast.success("Food subscription registered");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not register");
    } finally {
      setBusy(false);
    }
  };

  const submitProof = async () => {
    if (!intent?.intent_id) return;
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
      fd.append("status_token", intent.status_token || "");
      fd.append("reference", reference.trim());
      fd.append("screenshot", screenshot);
      const r = await api.post("/payments/upi/submit", fd);
      const token = r.data.status_token || intent.status_token;
      if (r.data.status === "paid") toast.success(`Receipt ${r.data.receipt?.receipt_no || ""} issued`);
      else toast.message("Screenshot submitted for review");
      navigate(`/payment/status?token=${encodeURIComponent(token)}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not submit payment proof.");
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setDone(null);
    setIntent(null);
    setUpiSession(null);
    setReference("");
    setScreenshot(null);
    setSelected(new Set());
  };

  return (
    <PublicLayout>
      <section className="border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 pt-20 pb-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-5">
          <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Food subscription</p>
          <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl">Subscribe for meals</h1>
          <p className="mt-2 max-w-xl text-brown-800/70">
            Choose Breakfast, Lunch and Dinner for each puja day, then pay via the committee UPI QR.
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-2.5 text-sm text-amber-900/90">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {menu?.payment_note
                || (paymentEnabled
                  ? "Pay via UPI QR after selecting meals, then upload your payment screenshot."
                  : "Payment is not open yet.")}
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-5">
        {!menu ? (
          <Spinner className="text-vermilion-500" />
        ) : upiSession && intent ? (
          <div className="space-y-5 rounded-2xl border border-sun-400/30 bg-white p-6 shadow-card" data-testid="food-pay-step">
            <div className="text-center">
              <div className="font-display text-3xl text-brown-900">Pay for meals</div>
              <p className="mt-1 text-brown-800/70">
                Amount:{" "}
                <span className="font-semibold text-vermilion-600">
                  {formatPaise(upiSession.total_amount ?? intent.total_amount_paise)}
                </span>
              </p>
              <p className="mt-1 text-xs text-brown-800/45">Reference: {intent.id}</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col items-center rounded-xl border border-sun-400/35 bg-sky-50/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brown-800">
                  <QrCode className="h-4 w-4 text-vermilion-500" /> Scan or open UPI app
                </div>
                {pay?.upi_intent_url ? (
                  <a href={pay.upi_intent_url} className="block" aria-label="Open UPI payment">
                    <img src={staticQr} alt="Food UPI QR" className="h-48 w-48 rounded-lg border border-brown-800/10 bg-white object-contain p-1" data-testid="food-qr-img" />
                  </a>
                ) : (
                  <img src={staticQr} alt="Food UPI QR" className="h-48 w-48 rounded-lg border border-brown-800/10 bg-white object-contain p-1" data-testid="food-qr-img" />
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
                <Label required htmlFor="food-ref">UTR / UPI reference number</Label>
                <Input id="food-ref" data-testid="food-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 312345678901" />
              </div>
              <div>
                <Label required htmlFor="food-shot">Payment screenshot</Label>
                <label htmlFor="food-shot" className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brown-800/25 bg-white px-4 py-6 text-center hover:border-vermilion-500/50">
                  <Upload className="h-6 w-6 text-vermilion-500" />
                  <span className="mt-2 text-sm font-medium">{screenshot ? screenshot.name : "Tap to upload PNG / JPG"}</span>
                  <input id="food-shot" data-testid="food-screenshot" type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setScreenshot(e.target.files?.[0] || null)} />
                </label>
              </div>
              <Button variant="primary" size="lg" className="w-full" data-testid="food-upload-btn" onClick={submitProof} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload & get receipt"}
              </Button>
              <p className="flex items-start justify-center gap-2 text-xs text-brown-800/55">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Receipt is committee-recorded against your reference.
              </p>
            </div>
          </div>
        ) : done ? (
          <div className="rounded-2xl border border-sun-400/30 bg-white p-6 shadow-card" data-testid="food-register-success">
            <h2 className="font-display text-3xl text-brown-900">Registered</h2>
            <p className="mt-2 text-brown-800/70">{done.message}</p>
            <p className="mt-1 text-sm text-brown-800/50">Reference: {done.id}</p>
            {done.total_amount_paise != null && (
              <p className="mt-1 text-sm text-brown-800/70">Total: {formatPaise(done.total_amount_paise)}</p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="outline" onClick={resetForm}>Register another</Button>
              <Link to="/"><Button variant="subtle">Back home</Button></Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6" data-testid="food-register-form">
            <div className="overflow-x-auto rounded-2xl border border-sun-400/30 bg-white shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-sun-400/20 px-4 py-3">
                <div className="flex items-center gap-2 font-display text-xl text-brown-900">
                  <UtensilsCrossed className="h-5 w-5 text-vermilion-500" /> Select meals
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold uppercase tracking-wide text-vermilion-500"
                  onClick={() => setSelected(selected.size === allKeys.length ? new Set() : new Set(allKeys))}
                >
                  {selected.size === allKeys.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-sun-400/20 bg-sun-50/80 text-[11px] uppercase tracking-wide text-brown-800/55">
                    <th className="px-4 py-3">Day</th>
                    {(days[0]?.meals || []).map((m) => (
                      <th key={m.code} className="px-3 py-3 text-center">{m.label}</th>
                    ))}
                    <th className="px-3 py-3 text-center">All</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day.code} className="border-b border-sun-400/15">
                      <td className="px-4 py-3 font-semibold text-brown-900">{day.label}</td>
                      {(day.meals || []).map((meal) => {
                        const key = `${day.code}|${meal.code}`;
                        const on = selected.has(key);
                        return (
                          <td key={key} className="px-3 py-3 text-center">
                            <button
                              type="button"
                              data-testid={`food-meal-${key}`}
                              onClick={() => toggle(key)}
                              className={`inline-flex min-h-[44px] min-w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 text-xs transition ${
                                on
                                  ? "border-vermilion-500 bg-vermilion-500 text-white"
                                  : "border-sun-400/35 bg-sun-50/50 text-brown-800/70 hover:border-vermilion-500/40"
                              }`}
                            >
                              {on && <Check className="h-3.5 w-3.5" />}
                              <span>{meal.amount_label || "TBC"}</span>
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <button type="button" className="text-xs text-vermilion-500 hover:underline" onClick={() => selectDay(day)}>
                          Day
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-brown-800/50">
                <span>
                  Selected: {selected.size} · Breakfast / Lunch / Dinner · Payment {paymentEnabled ? "open" : "not open"}
                </span>
                {selected.size > 0 && totalPaise != null && (
                  <span className="font-semibold text-vermilion-600" data-testid="food-total">
                    Total {formatPaise(totalPaise)}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h2 className="font-display text-2xl text-brown-900">Your details</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label required>Name</Label>
                  <Input data-testid="food-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <Label>Mobile <span className="font-normal text-brown-800/45">(optional)</span></Label>
                  <Input
                    data-testid="food-mobile"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    placeholder="10-digit mobile"
                  />
                </div>
                <div>
                  <Label>Tower</Label>
                  <Select
                    data-testid="food-tower"
                    value={form.tower_id}
                    onChange={(e) => setForm({ ...form, tower_id: e.target.value, flat_id: "", flat_number: "" })}
                  >
                    <option value="">Select</option>
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
                    <option value="">Select</option>
                    {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
                  </Select>
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
                <div className="sm:col-span-2">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="mt-5 w-full sm:w-auto"
                disabled={busy}
                data-testid="food-register-btn"
              >
                {busy ? "Saving…" : (paymentEnabled ? "Subscribe & pay" : "Subscribe")}
              </Button>
            </div>
          </form>
        )}
      </section>
    </PublicLayout>
  );
}
