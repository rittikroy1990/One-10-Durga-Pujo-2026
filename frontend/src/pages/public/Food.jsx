import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { UtensilsCrossed, Check, Info } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Input, Label, Select, Spinner } from "../../components/ui";

const ALLOWED_MEALS = new Set(["breakfast", "lunch", "dinner"]);

function filterDays(days) {
  return (days || []).map((day) => ({
    ...day,
    meals: (day.meals || []).filter((m) => ALLOWED_MEALS.has(m.code)),
  })).filter((day) => (day.meals || []).length > 0);
}

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

  const days = useMemo(() => filterDays(menu?.menu?.days || []), [menu]);
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
      toast.success("Food subscription registered");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not register");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <section className="border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 pt-20 pb-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-5">
          <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Food subscription</p>
          <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl">Subscribe for meals</h1>
          <p className="mt-2 max-w-xl text-brown-800/70">
            Choose Breakfast, Lunch and Dinner for each puja day, then submit your flat details.
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-2.5 text-sm text-amber-900/90">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{menu?.payment_note || "Payment is not open yet. Amounts are TBC."}</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-5">
        {!menu ? (
          <Spinner className="text-vermilion-500" />
        ) : done ? (
          <div className="rounded-2xl border border-sun-400/30 bg-white p-6 shadow-card" data-testid="food-register-success">
            <h2 className="font-display text-3xl text-brown-900">Registered</h2>
            <p className="mt-2 text-brown-800/70">{done.message}</p>
            <p className="mt-1 text-sm text-brown-800/50">Reference: {done.id}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => { setDone(null); setSelected(new Set()); }}>Register another</Button>
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
              <p className="px-4 py-3 text-xs text-brown-800/50">
                Selected: {selected.size} · Breakfast / Lunch / Dinner only · Payment {paymentEnabled ? "open" : "not open"}
              </p>
            </div>

            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h2 className="font-display text-2xl text-brown-900">Your details</h2>
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
                {busy ? "Saving…" : "Subscribe"}
              </Button>
            </div>
          </form>
        )}
      </section>
    </PublicLayout>
  );
}
