import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  UtensilsCrossed, Vote, FileText, Check, Plus, X, Loader2,
  BarChart3, Sparkles, ChevronDown,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Input, Label, Select } from "../../components/ui";

function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function VoteBar({ label, votes, max, accent = "bg-vermilion-500" }) {
  const width = max ? Math.max(6, Math.round((votes / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-brown-900">{label}</span>
        <span className="shrink-0 tabular-nums text-brown-800/55">{votes}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sky-100">
        <div className={`h-full rounded-full ${accent} transition-all duration-500`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function FoodPoll() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [dayCode, setDayCode] = useState("sasthi");
  const [diet, setDiet] = useState("pure_veg");
  const [form, setForm] = useState({ name: "", mobile: "", notes: "" });
  // picks[day][meal] = Set of dish ids
  const [picks, setPicks] = useState({});
  const [addCat, setAddCat] = useState({});
  const [showResults, setShowResults] = useState(true);

  const load = async () => {
    try {
      const r = await api.get("/food/poll");
      setData(r.data);
      if (!dayCode && r.data.days?.[0]) setDayCode(r.data.days[0].code);
    } catch {
      toast.error("Could not load food poll");
    }
  };

  useEffect(() => { load(); }, []);

  // Prefill PDF suggestions when diet changes / catalog loads
  useEffect(() => {
    if (!data) return;
    setPicks(() => {
      const next = {};
      for (const day of data.days || []) {
        const mealMap = {};
        for (const meal of day.meals || []) {
          const stream = diet === "pure_veg" ? "pure_veg" : "non_veg";
          mealMap[meal.code] = new Set(meal.streams?.[stream]?.suggested_ids || []);
        }
        next[day.code] = mealMap;
      }
      return next;
    });
  }, [data, diet]);

  const dishMap = useMemo(() => {
    const m = {};
    (data?.dishes || []).forEach((d) => { m[d.id] = d; });
    return m;
  }, [data]);

  const day = (data?.days || []).find((d) => d.code === dayCode) || data?.days?.[0];
  const tallies = data?.tallies || {};
  const voterCount = data?.voter_count || 0;
  const maxPerMeal = data?.meta?.max_dishes_per_meal || 8;

  const allowedDish = (d) => {
    if (!d) return false;
    if (diet === "pure_veg") return d.diet === "veg";
    if (diet === "eggetarian") return d.diet !== "nonveg";
    return true;
  };

  const toggleDish = (dCode, mCode, dishId) => {
    setPicks((prev) => {
      const dayMap = { ...(prev[dCode] || {}) };
      const set = new Set(dayMap[mCode] || []);
      if (set.has(dishId)) set.delete(dishId);
      else {
        if (set.size >= maxPerMeal) {
          toast.message(`Max ${maxPerMeal} dishes per meal`);
          return prev;
        }
        set.add(dishId);
      }
      dayMap[mCode] = set;
      return { ...prev, [dCode]: dayMap };
    });
  };

  const addFromDropdown = (dCode, mCode) => {
    const cat = addCat[`${dCode}|${mCode}|cat`];
    const dishId = addCat[`${dCode}|${mCode}|dish`];
    if (!dishId) return toast.error("Pick a dish from the list");
    toggleDish(dCode, mCode, dishId);
    setAddCat((p) => ({ ...p, [`${dCode}|${mCode}|dish`]: "" }));
  };

  const selectionCount = useMemo(() => {
    let n = 0;
    Object.values(picks).forEach((meals) => {
      Object.values(meals || {}).forEach((set) => { n += set.size; });
    });
    return n;
  }, [picks]);

  const submit = async () => {
    if (!form.name.trim() || !/^[6-9]\d{9}$/.test(form.mobile)) {
      toast.error("Enter your name and a valid 10-digit mobile");
      return;
    }
    const payloadPicks = [];
    Object.entries(picks).forEach(([d, meals]) => {
      Object.entries(meals || {}).forEach(([m, set]) => {
        if (set.size) payloadPicks.push({ day_code: d, meal_code: m, dish_ids: [...set] });
      });
    });
    if (!payloadPicks.length) return toast.error("Select at least one dish");

    setBusy(true);
    try {
      const r = await api.post("/food/poll/vote", {
        name: form.name.trim(),
        mobile: form.mobile,
        diet,
        notes: form.notes,
        picks: payloadPicks,
      });
      setSubmitted(r.data);
      toast.success(r.data.message || "Vote recorded");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not submit vote");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <PublicLayout>
        <div className="grid min-h-[50vh] place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-vermilion-500" />
        </div>
      </PublicLayout>
    );
  }

  const streamKey = diet === "pure_veg" ? "pure_veg" : "non_veg";

  return (
    <PublicLayout>
      <section className="relative overflow-hidden border-b border-sun-400/25 bg-gradient-to-br from-amber-50 via-white to-sky-50 pt-20 pb-10">
        <div className="pointer-events-none absolute -right-20 top-10 h-64 w-64 rounded-full bg-vermilion-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Community vote</p>
          <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl md:text-6xl">
            {data.meta?.title || "Food Menu Poll"}
          </h1>
          <p className="mt-3 max-w-2xl text-brown-800/70">
            {data.meta?.subtitle} Pick favourites day-wise & meal-wise — live tallies build the ultimate menu.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={data.meta?.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-sun-400/40 bg-white px-4 py-2 text-sm font-semibold text-brown-900 shadow-sm"
            >
              <FileText className="h-4 w-4 text-vermilion-500" /> View draft menu PDF
            </a>
            <Link
              to="/food"
              className="inline-flex items-center gap-2 rounded-full border border-sun-400/40 bg-white/80 px-4 py-2 text-sm font-semibold text-brown-800/80"
            >
              <UtensilsCrossed className="h-4 w-4" /> Food subscription interest
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full bg-vermilion-500/10 px-4 py-2 text-sm font-semibold text-vermilion-700">
              <Vote className="h-4 w-4" /> {voterCount} vote{voterCount === 1 ? "" : "s"} so far
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Voter + diet */}
          <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm">
            <h2 className="font-display text-2xl text-brown-900">Your details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label required htmlFor="fp-name">Name</Label>
                <Input id="fp-name" data-testid="poll-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <Label required htmlFor="fp-mobile">Mobile</Label>
                <Input id="fp-mobile" data-testid="poll-mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile" />
              </div>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-brown-800/45">Diet preference</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(data.diets || []).map((d) => (
                <button
                  key={d.code}
                  type="button"
                  data-testid={`poll-diet-${d.code}`}
                  onClick={() => setDiet(d.code)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    diet === d.code
                      ? "border-vermilion-500 bg-vermilion-500/10 shadow-sm"
                      : "border-sun-400/30 bg-sky-50/50 hover:border-vermilion-400/40"
                  }`}
                >
                  <div className="font-semibold text-brown-900">{d.label}</div>
                  <div className="mt-0.5 text-xs text-brown-800/55">{d.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Day tabs */}
          <div className="sticky top-16 z-20 -mx-4 overflow-x-auto bg-sky-50/95 px-4 py-3 backdrop-blur sm:top-20 sm:mx-0 sm:rounded-2xl sm:border sm:border-sun-400/25 sm:px-3">
            <div className="flex min-w-max gap-2">
              {(data.days || []).map((d) => (
                <button
                  key={d.code}
                  type="button"
                  data-testid={`poll-day-${d.code}`}
                  onClick={() => setDayCode(d.code)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    dayCode === d.code ? "bg-vermilion-500 text-white" : "bg-white text-brown-800/70 hover:bg-sun-50"
                  }`}
                >
                  {d.label}
                  <span className="ml-1.5 text-[10px] opacity-70">{d.date?.slice(5)}</span>
                </button>
              ))}
            </div>
          </div>

          {day && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${day.code}-${diet}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="font-display text-3xl text-brown-900">{day.label}</h2>
                  <p className="text-sm text-brown-800/60">
                    {day.weekday} · {day.date}
                    {day.note ? ` · ${day.note}` : ""}
                  </p>
                  {day.code === "ashtami" && (
                    <p className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900/90">
                      {data.meta?.ashtami_lunch_note}
                    </p>
                  )}
                </div>

                {(day.meals || []).map((meal) => {
                  const selected = picks[day.code]?.[meal.code] || new Set();
                  const suggested = meal.streams?.[streamKey]?.suggested || [];
                  const catKey = `${day.code}|${meal.code}|cat`;
                  const dishKey = `${day.code}|${meal.code}|dish`;
                  const cat = addCat[catKey] || "";
                  const dishOptions = (data.dishes || []).filter(
                    (d) => allowedDish(d) && (!cat || d.category === cat),
                  );
                  // Live bars for this meal
                  const mealScores = (data.dishes || [])
                    .map((d) => ({
                      ...d,
                      votes: tallies[`${day.code}|${meal.code}|${d.id}`] || 0,
                    }))
                    .filter((d) => d.votes > 0)
                    .sort((a, b) => b.votes - a.votes)
                    .slice(0, 5);
                  const maxVotes = mealScores[0]?.votes || 1;

                  return (
                    <div
                      key={meal.code}
                      className="rounded-2xl border border-sun-400/30 bg-white p-4 sm:p-5"
                      data-testid={`poll-meal-${day.code}-${meal.code}`}
                    >
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <h3 className="font-display text-2xl text-brown-900">{meal.label}</h3>
                          <p className="text-xs text-brown-800/50">{meal.timing}</p>
                        </div>
                        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-brown-800/60">
                          {selected.size}/{maxPerMeal} selected
                        </span>
                      </div>

                      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-vermilion-500">
                        Draft menu (from PDF) — tap to toggle
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {suggested.filter(allowedDish).map((d) => {
                          const on = selected.has(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => toggleDish(day.code, meal.code, d.id)}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                                on
                                  ? "border-vermilion-500 bg-vermilion-500 text-white"
                                  : "border-sun-400/40 bg-sun-50/80 text-brown-900 hover:border-vermilion-400"
                              }`}
                            >
                              {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                              {d.name}
                            </button>
                          );
                        })}
                      </div>

                      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.25em] text-brown-800/40">
                        Add more from the full list
                      </p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <Select
                          value={cat}
                          onChange={(e) => setAddCat((p) => ({ ...p, [catKey]: e.target.value, [dishKey]: "" }))}
                          className="sm:w-48"
                        >
                          <option value="">All categories</option>
                          {(data.categories || []).map((c) => (
                            <option key={c.code} value={c.code}>{c.label}</option>
                          ))}
                        </Select>
                        <Select
                          value={addCat[dishKey] || ""}
                          onChange={(e) => setAddCat((p) => ({ ...p, [dishKey]: e.target.value }))}
                          className="flex-1"
                          data-testid={`poll-add-dish-${meal.code}`}
                        >
                          <option value="">Choose a dish…</option>
                          {dishOptions.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}{d.from_pdf ? " · PDF" : ""}{d.diet !== "veg" ? ` · ${d.diet}` : ""}
                            </option>
                          ))}
                        </Select>
                        <Button type="button" variant="outline" onClick={() => addFromDropdown(day.code, meal.code)}>
                          <Plus className="h-4 w-4" /> Add
                        </Button>
                      </div>

                      {selected.size > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {[...selected].map((id) => {
                            const d = dishMap[id];
                            if (!d) return null;
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-900"
                              >
                                {d.name}
                                <button type="button" aria-label={`Remove ${d.name}`} onClick={() => toggleDish(day.code, meal.code, id)}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {mealScores.length > 0 && (
                        <div className="mt-5 rounded-xl bg-sky-50/80 p-3">
                          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brown-800/50">
                            <BarChart3 className="h-3.5 w-3.5" /> Live leaders — {meal.label}
                          </div>
                          <div className="space-y-2">
                            {mealScores.map((d) => (
                              <VoteBar key={d.id} label={d.name} votes={d.votes} max={maxVotes} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          )}

          <div className="sticky bottom-4 z-20 rounded-2xl border border-vermilion-500/30 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-xl text-brown-900">{selectionCount} dish picks</div>
                <p className="text-xs text-brown-800/55">Same mobile can update vote anytime</p>
              </div>
              <Button variant="primary" size="lg" data-testid="poll-submit" onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Vote className="h-4 w-4" />}
                {busy ? "Saving…" : "Submit my votes"}
              </Button>
            </div>
            {submitted && (
              <p className="mt-2 text-sm text-emerald-700">{submitted.message} · {submitted.voter_count} total voters</p>
            )}
          </div>
        </div>

        {/* Ultimate menu sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-sun-400/30 bg-white px-4 py-3 text-left lg:hidden"
            onClick={() => setShowResults((v) => !v)}
          >
            <span className="font-display text-lg text-brown-900">Ultimate menu so far</span>
            <ChevronDown className={`h-4 w-4 transition ${showResults ? "rotate-180" : ""}`} />
          </button>
          <div className={`${showResults ? "block" : "hidden"} rounded-2xl border border-sun-400/30 bg-gradient-to-b from-white to-amber-50/40 p-4 lg:block`}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-vermilion-500" />
              <h2 className="font-display text-2xl text-brown-900">Ultimate menu</h2>
            </div>
            <p className="mt-1 text-xs text-brown-800/55">
              Top voted dishes per meal · updates as people vote
            </p>
            <div className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {(data.proposed_menu || []).map((d) => (
                <div key={d.day_code}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-vermilion-500">
                    {d.day_label}
                  </div>
                  <div className="mt-1 space-y-2">
                    {(d.meals || []).map((m) => (
                      <div key={m.meal_code} className="rounded-lg bg-white/80 px-2.5 py-2">
                        <div className="text-sm font-semibold text-brown-900">{m.meal_label}</div>
                        <ul className="mt-1 space-y-0.5 text-xs text-brown-800/70">
                          {(m.top_dishes || []).slice(0, 5).map((dish) => (
                            <li key={dish.id} className="flex justify-between gap-2">
                              <span>{dish.name}</span>
                              {dish.votes > 0 && <span className="tabular-nums text-brown-800/40">{dish.votes}</span>}
                            </li>
                          ))}
                          {!(m.top_dishes || []).length && <li className="text-brown-800/40">No votes yet</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {data.diet_counts && (
              <div className="mt-4 border-t border-sun-400/25 pt-3 text-xs text-brown-800/60">
                Diet mix: Veg {pct(data.diet_counts.pure_veg, voterCount)}% · Egg{" "}
                {pct(data.diet_counts.eggetarian, voterCount)}% · Non-veg {pct(data.diet_counts.non_veg, voterCount)}%
              </div>
            )}
          </div>
        </aside>
      </div>
    </PublicLayout>
  );
}
