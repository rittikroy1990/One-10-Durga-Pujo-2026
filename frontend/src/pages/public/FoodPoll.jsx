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

function shortDay(day) {
  if (!day) return "";
  if (typeof day === "string") {
    return day.replace(/^Maha\s+/i, "").replace(/^Vijaya\s+/i, "");
  }
  return day.short_label || shortDay(day.label || "");
}

function dietLabel(code) {
  if (code === "nonveg") return "non-veg";
  if (code === "egg") return "egg";
  return "";
}

function VoteBar({ label, votes, max, accent = "bg-vermilion-500" }) {
  const width = max ? Math.max(8, Math.round((votes / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium text-brown-900">{label}</span>
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
  const [picks, setPicks] = useState({});
  const [addDish, setAddDish] = useState({});
  const [showResults, setShowResults] = useState(false);

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
    const key = `${dCode}|${mCode}`;
    const dishId = addDish[key];
    if (!dishId) return toast.error("Pick a dish from the list");
    toggleDish(dCode, mCode, dishId);
    setAddDish((p) => ({ ...p, [key]: "" }));
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
        <div className="grid min-h-[50vh] place-items-center px-4">
          <Loader2 className="h-8 w-8 animate-spin text-vermilion-500" />
        </div>
      </PublicLayout>
    );
  }

  const streamKey = diet === "pure_veg" ? "pure_veg" : "non_veg";

  const ResultsPanel = (
    <div className="rounded-2xl border border-sun-400/30 bg-gradient-to-b from-white to-amber-50/40 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 shrink-0 text-vermilion-500" />
        <h2 className="font-display text-xl text-brown-900 sm:text-2xl">Ultimate menu</h2>
      </div>
      <p className="mt-1 text-xs text-brown-800/55">Top voted dishes · updates live</p>
      <div className="mt-4 max-h-[55vh] space-y-4 overflow-y-auto overscroll-contain pr-1 sm:max-h-[70vh]">
        {(data.proposed_menu || []).map((d) => (
          <div key={d.day_code}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-vermilion-500">
              {shortDay(d.day_label)}
            </div>
            <div className="mt-1 space-y-2">
              {(d.meals || [])
                .filter((m) => ["breakfast", "lunch", "dinner"].includes(m.meal_code))
                .map((m) => (
                <div key={m.meal_code} className="rounded-lg bg-white/80 px-2.5 py-2">
                  <div className="text-sm font-semibold text-brown-900">{m.meal_label}</div>
                  <ul className="mt-1 space-y-0.5 text-xs text-brown-800/70">
                    {(m.top_dishes || []).slice(0, 4).map((dish) => (
                      <li key={dish.id} className="flex justify-between gap-2">
                        <span className="min-w-0">{dish.name}</span>
                        {dish.votes > 0 && <span className="shrink-0 tabular-nums text-brown-800/40">{dish.votes}</span>}
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
        <div className="mt-4 border-t border-sun-400/25 pt-3 text-xs leading-relaxed text-brown-800/60">
          Diet mix: Veg {pct(data.diet_counts.pure_veg, voterCount)}% · Egg{" "}
          {pct(data.diet_counts.eggetarian, voterCount)}% · Non-veg {pct(data.diet_counts.non_veg, voterCount)}%
        </div>
      )}
    </div>
  );

  return (
    <PublicLayout>
      <div className="overflow-x-hidden pb-28 sm:pb-10">
        <section className="relative border-b border-sun-400/25 bg-gradient-to-br from-amber-50 via-white to-sky-50 pt-[4.75rem] pb-6 sm:pt-20 sm:pb-10">
          <div className="mx-auto max-w-3xl px-4 sm:max-w-6xl sm:px-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-vermilion-500">Community vote</p>
            <h1 className="mt-1.5 font-display text-[1.85rem] leading-tight text-brown-900 sm:text-5xl">
              Food Menu Poll
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-brown-800/70 sm:max-w-2xl sm:text-base">
              {data.meta?.subtitle || "Vote for Breakfast, Lunch & Dinner each day. Top picks shape the ultimate menu."}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-brown-800/55 sm:max-w-2xl">
              Calendar note: Saptami tithi spans <span className="font-semibold text-brown-800/70">17 Oct</span> into early{" "}
              <span className="font-semibold text-brown-800/70">18 Oct</span> (Saptami / Ashtami bridge day) — that is why you see two Saptami-labelled days.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
              <a
                href={data.meta?.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-sun-400/40 bg-white px-4 py-2.5 text-sm font-semibold text-brown-900 shadow-sm"
              >
                <FileText className="h-4 w-4 text-vermilion-500" /> View draft menu
              </a>
              <Link
                to="/food"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-sun-400/40 bg-white/80 px-4 py-2.5 text-sm font-semibold text-brown-800/80"
              >
                <UtensilsCrossed className="h-4 w-4" /> Food subscription
              </Link>
              <div className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-vermilion-500/10 px-4 py-2.5 text-sm font-semibold text-vermilion-700">
                <Vote className="h-4 w-4" /> {voterCount} vote{voterCount === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-3xl gap-5 px-4 py-6 sm:max-w-6xl sm:gap-8 sm:px-5 sm:py-10 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            <div className="rounded-2xl border border-sun-400/30 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="font-display text-xl text-brown-900 sm:text-2xl">Your details</h2>
              <div className="mt-3 grid gap-3">
                <div>
                  <Label required htmlFor="fp-name">Name</Label>
                  <Input id="fp-name" data-testid="poll-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" autoComplete="name" />
                </div>
                <div>
                  <Label required htmlFor="fp-mobile">Mobile</Label>
                  <Input id="fp-mobile" data-testid="poll-mobile" inputMode="numeric" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile" autoComplete="tel" />
                </div>
              </div>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-brown-800/45">Diet preference</p>
              <div className="mt-2 grid gap-2">
                {(data.diets || []).map((d) => (
                  <button
                    key={d.code}
                    type="button"
                    data-testid={`poll-diet-${d.code}`}
                    onClick={() => setDiet(d.code)}
                    className={`min-h-[52px] rounded-xl border px-3 py-3 text-left transition ${
                      diet === d.code
                        ? "border-vermilion-500 bg-vermilion-500/10 shadow-sm"
                        : "border-sun-400/30 bg-sky-50/50"
                    }`}
                  >
                    <div className="font-semibold text-brown-900">{d.label}</div>
                    <div className="mt-0.5 text-xs text-brown-800/55">{d.blurb}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Day tabs — snap scroll on phone */}
            <div className="sticky top-[3.6rem] z-20 -mx-4 border-y border-sun-400/20 bg-sky-50/95 backdrop-blur sm:top-20 sm:mx-0 sm:rounded-2xl sm:border sm:border-sun-400/25">
              <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-3">
                {(data.days || []).map((d) => (
                  <button
                    key={d.code}
                    type="button"
                    data-testid={`poll-day-${d.code}`}
                    onClick={() => setDayCode(d.code)}
                    className={`snap-start shrink-0 rounded-full px-3.5 py-2.5 text-sm font-semibold transition ${
                      dayCode === d.code ? "bg-vermilion-500 text-white" : "bg-white text-brown-800/70"
                    }`}
                  >
                    {shortDay(d)}
                    <span className="ml-1 text-[10px] opacity-70">{d.date?.slice(8)}/{d.date?.slice(5, 7)}</span>
                  </button>
                ))}
              </div>
            </div>

            {day && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${day.code}-${diet}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="min-w-0 space-y-4"
                >
                  <div>
                    <h2 className="font-display text-2xl text-brown-900 sm:text-3xl">{day.label}</h2>
                    <p className="text-sm text-brown-800/60">{day.weekday} · {day.date}</p>
                    {day.note && (
                      <p className="mt-2 rounded-lg border border-sky-300/40 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-brown-800/75">
                        {day.note}
                      </p>
                    )}
                    {day.code === "ashtami" && data.meta?.ashtami_lunch_note && (
                      <p className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900/90">
                        {data.meta.ashtami_lunch_note}
                      </p>
                    )}
                  </div>

                  {(day.meals || [])
                    .filter((m) => ["breakfast", "lunch", "dinner"].includes(m.code))
                    .map((meal) => {
                    const selected = picks[day.code]?.[meal.code] || new Set();
                    const suggested = meal.streams?.[streamKey]?.suggested || [];
                    const dishKey = `${day.code}|${meal.code}`;
                    const dishOptions = (data.dishes || [])
                      .filter(allowedDish)
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name));
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
                        className="min-w-0 rounded-2xl border border-sun-400/30 bg-white p-3.5 sm:p-5"
                        data-testid={`poll-meal-${day.code}-${meal.code}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-display text-xl text-brown-900 sm:text-2xl">{meal.label}</h3>
                            <p className="text-xs text-brown-800/50">{meal.timing}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-brown-800/60">
                            {selected.size}/{maxPerMeal}
                          </span>
                        </div>

                        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-vermilion-500">
                          Suggested picks — tap to toggle
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {suggested.filter(allowedDish).map((d) => {
                            const on = selected.has(d.id);
                            return (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => toggleDish(day.code, meal.code, d.id)}
                                className={`inline-flex min-h-[40px] max-w-full items-center gap-1.5 rounded-full border px-3 py-2 text-left text-sm leading-snug transition ${
                                  on
                                    ? "border-vermilion-500 bg-vermilion-500 text-white"
                                    : "border-sun-400/40 bg-sun-50/80 text-brown-900"
                                }`}
                              >
                                {on ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0" />}
                                <span>{d.name}</span>
                              </button>
                            );
                          })}
                        </div>

                        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-brown-800/40">
                          Add more dishes
                        </p>
                        <div className="mt-2 grid gap-2">
                          <Select
                            value={addDish[dishKey] || ""}
                            onChange={(e) => setAddDish((p) => ({ ...p, [dishKey]: e.target.value }))}
                            data-testid={`poll-add-dish-${meal.code}`}
                          >
                            <option value="">Choose a dish…</option>
                            {dishOptions.map((d) => {
                              const extra = dietLabel(d.diet);
                              return (
                                <option key={d.id} value={d.id}>
                                  {d.name}{extra ? ` (${extra})` : ""}
                                </option>
                              );
                            })}
                          </Select>
                          <Button type="button" variant="outline" className="w-full min-h-[44px]" onClick={() => addFromDropdown(day.code, meal.code)}>
                            <Plus className="h-4 w-4" /> Add dish
                          </Button>
                        </div>

                        {selected.size > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {[...selected].map((id) => {
                              const d = dishMap[id];
                              if (!d) return null;
                              return (
                                <span
                                  key={id}
                                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900"
                                >
                                  <span className="min-w-0">{d.name}</span>
                                  <button type="button" className="shrink-0 p-0.5" aria-label={`Remove ${d.name}`} onClick={() => toggleDish(day.code, meal.code, id)}>
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {mealScores.length > 0 && (
                          <div className="mt-4 rounded-xl bg-sky-50/80 p-3">
                            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brown-800/50">
                              <BarChart3 className="h-3.5 w-3.5" /> Live leaders
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

            {/* Mobile ultimate menu accordion */}
            <div className="xl:hidden">
              <button
                type="button"
                className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-sun-400/30 bg-white px-4 py-3 text-left"
                onClick={() => setShowResults((v) => !v)}
              >
                <span className="font-display text-lg text-brown-900">Ultimate menu so far</span>
                <ChevronDown className={`h-4 w-4 transition ${showResults ? "rotate-180" : ""}`} />
              </button>
              {showResults && <div className="mt-3">{ResultsPanel}</div>}
            </div>
          </div>

          <aside className="hidden min-w-0 xl:sticky xl:top-24 xl:block xl:self-start">
            {ResultsPanel}
          </aside>
        </div>
      </div>

      {/* Fixed mobile submit bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-vermilion-500/20 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(44,24,16,0.08)] backdrop-blur sm:static sm:inset-auto sm:z-20 sm:mx-auto sm:mb-8 sm:max-w-3xl sm:rounded-2xl sm:border sm:border-vermilion-500/30 sm:p-4 sm:shadow-lg xl:max-w-6xl">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:max-w-none sm:flex-row sm:items-center sm:justify-between sm:gap-3 xl:px-5">
          <div className="min-w-0">
            <div className="font-display text-lg leading-none text-brown-900 sm:text-xl">{selectionCount} dish picks</div>
            <p className="mt-0.5 text-[11px] text-brown-800/55">Same mobile can update anytime</p>
          </div>
          <Button variant="primary" size="lg" className="w-full min-h-[48px] sm:w-auto" data-testid="poll-submit" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Vote className="h-4 w-4" />}
            {busy ? "Saving…" : "Submit my votes"}
          </Button>
        </div>
        {submitted && (
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-emerald-700 sm:text-left xl:px-5">
            {submitted.message}
          </p>
        )}
      </div>
    </PublicLayout>
  );
}
