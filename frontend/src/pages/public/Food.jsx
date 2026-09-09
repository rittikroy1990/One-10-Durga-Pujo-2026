import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  UtensilsCrossed, Check, Info, ClipboardList, Vote, NotebookPen,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Input, Label, Select, Spinner } from "../../components/ui";

const ACTIONS = [
  {
    id: "interest",
    href: "#interest",
    icon: ClipboardList,
    title: "Gauge interest",
    blurb: "Tell us which meals your family may join so the committee can plan quantities.",
    cta: "Share interest",
    testid: "food-goto-interest",
    primary: false,
  },
  {
    id: "poll",
    to: "/food-poll",
    icon: Vote,
    title: "Menu poll",
    blurb: "Vote on Breakfast, Lunch & Dinner dishes for each puja day.",
    cta: "Choose the menu",
    testid: "food-goto-poll",
    primary: true,
  },
  {
    id: "subscribe",
    href: "#subscribe",
    icon: NotebookPen,
    title: "Food subscription",
    blurb: "Register your flat for the meal plan. Payment opens later — amounts TBC.",
    cta: "Register for meals",
    testid: "food-goto-subscribe",
    primary: false,
  },
];

export default function Food() {
  const [menu, setMenu] = useState(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
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

  const days = menu?.menu?.days || [];
  const paymentEnabled = !!menu?.payment_enabled;

  const allKeys = useMemo(
    () => days.flatMap((d) => (d.meals || []).map((m) => `${d.code}|${m.code}`)),
    [days],
  );

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

  const submit = async (e) => {
    e.preventDefault();
    if (selected.size === 0) return toast.error("Select at least one meal");
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
      setDone(r.data);
      toast.success("Registered — payment not open yet");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not register");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <section className="border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 pt-20 pb-10 sm:pb-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-5">
          <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Community kitchen</p>
          <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl">
            Durgotsav Food
          </h1>
          <p className="mt-2 max-w-2xl text-brown-800/70">
            Plan meals with the committee — share interest, vote on the menu, then register for the subscription.
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-2.5 text-sm text-amber-900/90">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{menu?.payment_note || "Payment is not open yet. Amounts are TBC."}</span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              const inner = (
                <>
                  <div className="flex items-start gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                      a.primary ? "bg-vermilion-500 text-white" : "bg-sun-100 text-vermilion-600"
                    }`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-display text-xl text-brown-900">{a.title}</div>
                      <p className="mt-1 text-sm leading-relaxed text-brown-800/65">{a.blurb}</p>
                    </div>
                  </div>
                  <span className={`mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-sm font-semibold ${
                    a.primary
                      ? "bg-vermilion-500 text-white"
                      : "border border-sun-400/40 bg-white text-brown-900"
                  }`}>
                    {a.cta}
                  </span>
                </>
              );
              const className = "flex h-full flex-col justify-between rounded-2xl border border-sun-400/30 bg-white p-4 shadow-sm transition hover:border-vermilion-500/35 sm:p-5";
              if (a.to) {
                return (
                  <Link key={a.id} to={a.to} data-testid={a.testid} className={className}>
                    {inner}
                  </Link>
                );
              }
              return (
                <a key={a.id} href={a.href} data-testid={a.testid} className={className}>
                  {inner}
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section id="interest" className="scroll-mt-24 mx-auto max-w-5xl px-4 pt-8 sm:px-5">
        <div className="rounded-2xl border border-sky-300/40 bg-sky-50/70 px-4 py-3 text-sm text-brown-800/75 sm:px-5">
          <span className="font-semibold text-brown-900">Gauge interest</span>
          {" — "}select the meals your flat may join, then add your details under Food subscription below.
          Prefer to shape the dishes first?{" "}
          <Link to="/food-poll" className="font-semibold text-vermilion-600 underline-offset-2 hover:underline">
            Open the menu poll
          </Link>
          .
        </div>
      </section>

      <section id="subscribe" className="scroll-mt-24 mx-auto max-w-5xl px-4 py-8 sm:px-5 sm:py-10">
        {!menu ? (
          <Spinner className="text-vermilion-500" />
        ) : done ? (
          <div className="rounded-2xl border border-sun-400/30 bg-white p-6 shadow-card" data-testid="food-register-success">
            <h2 className="font-display text-3xl text-brown-900">Interest registered</h2>
            <p className="mt-2 text-brown-800/70">{done.message}</p>
            <p className="mt-1 text-sm text-brown-800/50">Reference: {done.id}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => { setDone(null); setSelected(new Set()); }}>Register another</Button>
              <Link to="/"><Button variant="subtle">Back home</Button></Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-8" data-testid="food-register-form">
            <div className="overflow-x-auto rounded-2xl border border-sun-400/30 bg-white shadow-card">
              <div className="flex items-center justify-between gap-3 border-b border-sun-400/20 px-4 py-3">
                <div className="flex items-center gap-2 font-display text-xl text-brown-900">
                  <UtensilsCrossed className="h-5 w-5 text-vermilion-500" /> Meal interest
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold uppercase tracking-wide text-vermilion-500"
                  onClick={() => setSelected(selected.size === allKeys.length ? new Set() : new Set(allKeys))}
                >
                  {selected.size === allKeys.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-sun-400/20 bg-sun-50/80 text-[11px] uppercase tracking-wide text-brown-800/55">
                    <th className="px-4 py-3">Day</th>
                    {(days[0]?.meals || []).map((m) => (
                      <th key={m.code} className="px-3 py-3 text-center">{m.label}</th>
                    ))}
                    <th className="px-3 py-3 text-center">Day</th>
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
                              className={`inline-flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-xs transition ${
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
                          All meals
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-3 text-xs text-brown-800/50">
                Selected: {selected.size} meal(s) · Amounts TBC · Payment {paymentEnabled ? "open" : "not activated"}
              </p>
            </div>

            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h2 className="font-display text-2xl text-brown-900">Food subscription details</h2>
              <p className="mt-1 text-sm text-brown-800/60">
                Same form for interest gauging and meal-plan registration — you will not be charged until payment opens.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label required>Name</Label>
                  <Input data-testid="food-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <Label required>Mobile</Label>
                  <Input
                    data-testid="food-mobile"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    required
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
                {busy ? "Saving…" : "Submit registration"}
              </Button>
              <p className="mt-3 text-xs text-brown-800/50">
                Food coupons are issued and printed by EOC admins only. You will not be charged until payment is activated.
              </p>
            </div>
          </form>
        )}
      </section>
    </PublicLayout>
  );
}
