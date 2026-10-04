import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  UtensilsCrossed, Info, Clock, ExternalLink, Copy, Upload, Loader2, ShieldCheck,
  Minus, Plus, ShoppingCart, Trash2, ArrowRight, ArrowLeft, Check, Coffee, Sun, Moon, Package, ClipboardList,
} from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import FoodOrdersList from "../../components/FoodOrdersList";
import { Button, Input, Label, Select, Spinner, Dialog } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

const ALLOWED_MEALS = new Set(["breakfast", "lunch", "dinner"]);
const MAX_QTY = 50;

/** Split comma / semicolon menu write-ups into clean dish lines. */
function parseMenuDishes(text) {
  return String(text || "")
    .split(/[,;•|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Fallbacks for the server's COMPLIMENTARY_POLICY / COMPLIMENTARY_RULES (menu_meta).
const DEFAULT_FREE_POLICY = [
  { key: "ashtami_lunch", label: "Ashtami lunch", category: "lunch", day_code: "ashtami", free: 4 },
  { key: "breakfast", label: "breakfast", category: "breakfast", categories: ["breakfast", "breakfast_packet"], free: 3, per_day: true },
];
const DEFAULT_FREE_RULES = [
  { key: "ashtami_lunch", label: "Ashtami lunch", category: "lunch", day_code: "ashtami", free: 4, group: "ashtami_lunch", group_label: "Ashtami lunch" },
  ...["sasthi", "saptami", "saptami_ashtami", "ashtami", "nabami", "dashami"].map((d) => ({
    key: `breakfast_${d}`, label: "breakfast", category: "breakfast", categories: ["breakfast", "breakfast_packet"], day_code: d, free: 3, group: "breakfast", group_label: "breakfast",
  })),
];

/** "3 breakfast coupons every day + 4 Ashtami community lunch coupons" */
function describePolicy(policy) {
  return [...policy].reverse()
    .map((p) => {
      const label = /^ashtami lunch$/i.test(p.label) ? "Ashtami community lunch" : p.label;
      return `${p.free} ${label} coupon${p.free === 1 ? "" : "s"}${p.per_day ? " every day" : ""}`;
    })
    .join(" + ");
}

function freeKeyFor(rules, category, dayCode) {
  const rule = rules.find((r) => (r.categories || [r.category]).includes(category) && (!r.day_code || r.day_code === dayCode));
  return rule ? rule.key : "";
}

function pluralMeal(label, n) {
  if (n === 1) return label;
  return /(ch|sh)$/.test(label) ? `${label}es` : `${label}s`;
}

/** "5 breakfasts + 4 Ashtami lunches" from per-rule counts, summed per group (e.g. all days' breakfasts). */
function describeFree(rules, counts) {
  const groups = [];
  rules.forEach((r) => {
    const n = counts?.[r.key] || 0;
    if (!n) return;
    const label = r.group_label || r.label;
    const g = groups.find((x) => x.label === label);
    if (g) g.n += n;
    else groups.push({ label, n });
  });
  return groups.map((g) => `${g.n} ${pluralMeal(g.label, g.n)}`).join(" + ");
}

/** "For everyone" plates (same for veg and non-veg) show under both diet filters. */
function dietMatches(item, diet) {
  return !diet || item.diet === diet || !!item.for_all_diets || item.category === "breakfast_packet";
}

function dietTag(item) {
  if (!item.diet_label) return "";
  return item.for_all_diets ? `${item.diet_label} · For everyone` : item.diet_label;
}

const MEAL_ICON = {
  breakfast: Coffee,
  breakfast_packet: Package,
  lunch: Sun,
  dinner: Moon,
};

const STEPS = [
  { id: "menu", label: "1. Choose items" },
  { id: "checkout", label: "2. Your details" },
  { id: "pay", label: "3. Pay" },
];

function filterDays(days) {
  return (days || [])
    .map((day) => ({
      ...day,
      meals: (day.meals || []).filter((m) => ALLOWED_MEALS.has(m.code)),
    }))
    .filter((day) => (day.meals || []).length > 0);
}

function lineKey(dayCode, mealCode) {
  return `${dayCode}|${mealCode}`;
}

function mediaUrl(path) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/${path}`;
}

function formatMenuDate(isoDate) {
  if (!isoDate) return "";
  try {
    const [y, m, d] = String(isoDate).split("-").map(Number);
    if (!y || !m || !d) return isoDate;
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function shortDate(isoDate) {
  const [y, m, d] = String(isoDate || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const DIET_OPTIONS = [
  { value: "", label: "All" },
  { value: "veg", label: "Veg", dot: "bg-emerald-600" },
  { value: "non_veg", label: "Non-veg", dot: "bg-vermilion-600" },
];

function DietToggle({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Veg or non-veg" className="inline-flex w-full rounded-full border border-sun-400/40 bg-sun-50/60 p-1 sm:w-auto" data-testid="food-diet-toggle">
      {DIET_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value || "all"}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition sm:flex-none ${
              active ? "bg-white text-brown-900 shadow-sm ring-1 ring-sun-400/40" : "text-brown-800/60 hover:text-brown-900"
            }`}
            data-testid={`food-diet-${opt.value || "all"}`}
          >
            {opt.dot ? <span className={`h-2.5 w-2.5 rounded-sm ${opt.dot}`} /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Chip({ active, onClick, children, testId }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${
        active
          ? "border-vermilion-500 bg-vermilion-500 text-white"
          : "border-brown-800/15 bg-white text-brown-800/75 hover:border-vermilion-500/50"
      }`}
      data-testid={testId}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
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
  const [cartOpen, setCartOpen] = useState(false);
  const [menuDetail, setMenuDetail] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [dayFilter, setDayFilter] = useState("");
  const [dietFilter, setDietFilter] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState({
    diet: "veg",
    days: [],
    meals: ["breakfast", "lunch", "dinner"],
    people: 1,
  });
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

  const catalogItems = useMemo(() => menu?.items || [], [menu]);
  const catalogMode = catalogItems.length > 0 || menu?.mode === "items";
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

  const [flatFree, setFlatFree] = useState(null);
  const [flatSubscribed, setFlatSubscribed] = useState(null);
  const [mobileOk, setMobileOk] = useState(null);
  const [knownName, setKnownName] = useState("");
  const checkMobile = form.mobile.length === 10 ? form.mobile : "";
  const [ordersTick, setOrdersTick] = useState(0);
  const [myOrders, setMyOrders] = useState(null);
  useEffect(() => {
    setMyOrders(null);
    if (!form.flat_id || !checkMobile || (step !== "checkout" && step !== "menu")) return;
    let live = true;
    api.post("/food/my-orders", { flat_id: form.flat_id, mobile: checkMobile })
      .then((r) => { if (live) setMyOrders(r.data); })
      .catch(() => {});
    return () => { live = false; };
  }, [form.flat_id, checkMobile, step, ordersTick]);
  const openOrders = (myOrders?.orders || []).filter((o) => o.state !== "cancelled" && o.state !== "expired");
  useEffect(() => {
    setFlatFree(null);
    setFlatSubscribed(null);
    setMobileOk(null);
    setKnownName("");
    if (!form.flat_id) return;
    let live = true;
    api.get("/food/complimentary", { params: { flat_id: form.flat_id, mobile: checkMobile } })
      .then((r) => {
        if (!live) return;
        setFlatFree(r.data.remaining || {});
        setFlatSubscribed(r.data.subscribed !== false);
        setMobileOk(r.data.mobile_ok ?? null);
        setKnownName(r.data.known_name || "");
      })
      .catch(() => {});
    return () => { live = false; };
  }, [form.flat_id, checkMobile, ordersTick]);
  const noFreeMeals = flatSubscribed === false || (flatSubscribed && mobileOk === false);

  const freeRules = useMemo(
    () => (menu?.menu_meta?.complimentary_policy ? menu.menu_meta.complimentary_rules : null) || DEFAULT_FREE_RULES,
    [menu],
  );
  const freePolicy = menu?.menu_meta?.complimentary_policy || DEFAULT_FREE_POLICY;
  const fullQuota = useMemo(
    () => Object.fromEntries(freeRules.map((r) => [r.key, r.free])),
    [freeRules],
  );
  // Complimentary only once the flat is a verified subscriber with its registered mobile; the server re-checks.
  const freeEligible = Boolean(flatFree && flatSubscribed && mobileOk === true);
  const freeQuota = useMemo(
    () => (freeEligible ? flatFree : Object.fromEntries(freeRules.map((r) => [r.key, 0]))),
    [freeEligible, flatFree, freeRules],
  );
  const flatReady = Boolean(form.tower_id && form.flat_id && form.mobile.length === 10);

  const rawCartLines = useMemo(() => {
    const lines = [];
    if (catalogMode) {
      for (const item of catalogItems) {
        const key = item.id;
        const qty = Number(cart[key] || 0);
        if (qty <= 0) continue;
        const unit = Number(item.amount_paise) || 0;
        lines.push({
          key,
          item_id: item.id,
          category: item.category || "",
          item_day_code: item.day_code || "",
          meal_label: item.name || "Item",
          day_label: [item.menu_date, item.category_label || item.category, dietTag(item)]
            .filter(Boolean)
            .join(" · ") || "Menu",
          description: item.description || "",
          image_url: item.image_url || "",
          quantity: qty,
          unit_paise: unit,
          line_total_paise: unit * qty,
          amount_label: item.amount_label || formatPaise(unit),
        });
      }
      return lines;
    }
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
          amount_label: meal.amount_label || (unit != null ? formatPaise(unit) : "TBC"),
        });
      }
    }
    return lines;
  }, [cart, catalogItems, catalogMode, days, priceByMeal]);

  // Mirrors the server: first N units of quota meals (breakfast, Ashtami lunch) are ₹0, in cart order.
  const cartLines = useMemo(() => {
    const remaining = { ...freeQuota };
    return rawCartLines.map((line) => {
      const freeKey = freeKeyFor(freeRules, line.category || line.meal_code, line.item_day_code || line.day_code);
      const free = freeKey ? Math.min(remaining[freeKey] || 0, line.quantity) : 0;
      if (free) remaining[freeKey] -= free;
      return {
        ...line,
        free_key: freeKey,
        free_qty: free,
        line_total_paise: line.unit_paise != null ? line.unit_paise * (line.quantity - free) : null,
      };
    });
  }, [rawCartLines, freeQuota, freeRules]);

  const cartLineByKey = useMemo(
    () => Object.fromEntries(cartLines.map((l) => [l.key, l])),
    [cartLines],
  );
  const freeSavedPaise = useMemo(
    () => cartLines.reduce((sum, l) => sum + (l.free_qty || 0) * (Number(l.unit_paise) || 0), 0),
    [cartLines],
  );
  const freeInCart = useMemo(() => {
    const counts = {};
    for (const l of cartLines) {
      if (l.free_key && l.free_qty) counts[l.free_key] = (counts[l.free_key] || 0) + l.free_qty;
    }
    return counts;
  }, [cartLines]);
  const freeRulesInCart = freeRules.filter((r) => cartLines.some((l) => l.free_key === r.key));

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

  const breakfastPrice = priceByMeal.breakfast ?? 7000;
  const lunchPrice = priceByMeal.lunch ?? 30000;
  const dinnerPrice = priceByMeal.dinner ?? 30000;
  const unitLabel = catalogMode ? "item" : "meal";

  const pay = upiSession?.payment;
  const staticQr = pay?.static_qr_url || "/images/payment-qr.png";
  const qrSrc = staticQr
    || upiSession?.qr_url
    || (upiSession?.intent_id ? `/api/payments/upi/qr.png?intent_id=${encodeURIComponent(upiSession.intent_id)}` : null);

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
    setCartOpen(false);
    toast.message("Cart cleared");
  };

  useEffect(() => {
    if (cartCount === 0) setCartOpen(false);
  }, [cartCount]);


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

  const catalogDayOptions = useMemo(() => {
    const seen = new Map();
    for (const item of catalogItems) {
      const key = item.menu_date || item.day_code || "";
      if (!key || seen.has(key)) continue;
      seen.set(key, item.day_label || formatMenuDate(item.menu_date) || key);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [catalogItems]);

  const filteredCatalogItems = useMemo(() => catalogItems.filter((item) => {
    if (dayFilter && (item.menu_date || item.day_code || "") !== dayFilter) return false;
    if (!dietMatches(item, dietFilter)) return false;
    return true;
  }), [catalogItems, dayFilter, dietFilter]);

  const quickMatches = useMemo(() => {
    const days = new Set(quick.days);
    const meals = new Set(quick.meals);
    return catalogItems.filter((item) => {
      const dayKey = item.menu_date || item.day_code || "";
      if (!days.has(dayKey)) return false;
      if (!meals.has(item.category)) return false;
      return dietMatches(item, quick.diet);
    });
  }, [catalogItems, quick]);

  // Same quota rule as the cart: free units the cart hasn't used yet come off first.
  const quickTotalPaise = useMemo(() => {
    const left = Object.fromEntries(
      Object.entries(freeQuota).map(([k, n]) => [k, Math.max(0, n - (freeInCart[k] || 0))]),
    );
    return quickMatches.reduce((sum, item) => {
      const freeKey = freeKeyFor(freeRules, item.category, item.day_code);
      const free = freeKey ? Math.min(left[freeKey] || 0, quick.people) : 0;
      if (free) left[freeKey] -= free;
      return sum + (Number(item.amount_paise) || 0) * (quick.people - free);
    }, 0);
  }, [quickMatches, quick.people, freeInCart, freeQuota, freeRules]);

  const openQuickAdd = () => {
    const allDays = catalogDayOptions.map((d) => d.value);
    setQuick((q) => ({
      ...q,
      diet: dietFilter || q.diet,
      days: dayFilter ? [dayFilter] : (q.days.length ? q.days : allDays),
    }));
    setQuickOpen(true);
  };

  const toggleQuickList = (field, value) => setQuick((q) => {
    const list = q[field].includes(value) ? q[field].filter((v) => v !== value) : [...q[field], value];
    return { ...q, [field]: list };
  });

  const applyQuickAdd = () => {
    if (!quickMatches.length) {
      toast.message("Pick at least one day and meal");
      return;
    }
    setCart((prev) => {
      const next = { ...prev };
      for (const item of quickMatches) {
        next[item.id] = Math.min(MAX_QTY, (next[item.id] || 0) + quick.people);
      }
      return next;
    });
    const dietLabel = quick.diet === "veg" ? "Veg" : "Non-veg";
    const dayLabel = quick.days.length === catalogDayOptions.length
      ? "all days"
      : quick.days.map((d) => catalogDayOptions.find((o) => o.value === d)?.label || d).join(", ");
    toast.success(`Added ${dietLabel} · ${dayLabel} for ${quick.people} ${quick.people === 1 ? "person" : "people"}`);
    setQuickOpen(false);
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const flatStatus = !flatReady ? (
    <p className="text-xs text-brown-800/60">
      Complimentary meals are for subscribed flats. Enter the mobile number used for your Puja subscription.
    </p>
  ) : flatSubscribed === null ? (
    <p className="text-xs text-brown-800/55">Checking your flat…</p>
  ) : flatSubscribed === false ? (
    <p className="text-xs font-medium text-amber-900/90" data-testid="food-flat-not-subscribed">
      This flat has not paid the Puja subscription yet, so all meals are charged.{" "}
      <Link to="/subscribe" className="font-semibold text-vermilion-600 underline">Subscribe &amp; Pay</Link>
      {" "}to unlock complimentary {describePolicy(freePolicy)}.
    </p>
  ) : mobileOk === false ? (
    <p className="text-xs font-medium text-amber-900/90" data-testid="food-mobile-not-registered">
      This mobile is not the one registered with this flat&apos;s Puja subscription, so all meals are charged.
      Use the registered number to get complimentary meals.
    </p>
  ) : flatFree ? (
    <p className="text-xs font-medium text-emerald-800" data-testid="food-flat-free">
      <Check className="mr-1 inline h-3.5 w-3.5" />
      Subscribed flat — complimentary meals apply automatically in your cart.
      {freeRules.some((r) => (flatFree[r.key] ?? 0) < r.free)
        ? ` Already used on earlier orders: ${freeRules
          .filter((r) => (flatFree[r.key] ?? 0) < r.free)
          .map((r) => `${r.free - (flatFree[r.key] ?? 0)} of ${r.free} ${r.label}`)
          .join(", ")}.${
          myOrders?.others_holding?.length
            ? ` Also used by another order from this flat (mobile ${myOrders.others_holding.map((x) => x.mobile_masked).join(", ")}).`
            : ""}`
        : ""}
    </p>
  ) : null;

  const flatCard = (
    <div id="food-flat-card" className="rounded-2xl border border-emerald-600/25 bg-white p-4 shadow-card sm:p-5" data-testid="food-flat-card">
      <h2 className="font-display text-xl text-brown-900">Start here: your flat</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <Label required>Tower</Label>
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
          <Label required>Flat</Label>
          <Select data-testid="food-flat" value={form.flat_id} onChange={(e) => setForm({ ...form, flat_id: e.target.value })}>
            <option value="">Select flat</option>
            {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
          </Select>
        </div>
        <div>
          <Label required>Mobile</Label>
          <Input
            data-testid="food-mobile"
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
            placeholder="Subscription mobile"
            inputMode="numeric"
          />
        </div>
      </div>
      <div className="mt-2.5">{flatStatus}</div>
      {flatReady && knownName ? (
        <p className="mt-1 text-xs text-brown-800/70" data-testid="food-known-name">
          Ordering as <b className="text-brown-900">{knownName}</b>
        </p>
      ) : null}
      {openOrders.length ? (
        <details className="mt-3 rounded-xl bg-ivory-200 p-3" data-testid="food-flat-orders">
          <summary className="cursor-pointer text-sm font-semibold text-brown-900">
            You have {openOrders.length} earlier order{openOrders.length === 1 ? "" : "s"} — pay balance / download voucher
          </summary>
          <div className="mt-2">
            <FoodOrdersList orders={openOrders} compact />
          </div>
        </details>
      ) : null}
    </div>
  );

  const goCheckout = () => {
    if (!flatReady) {
      window.scrollTo({ top: document.getElementById("food-flat-card")?.offsetTop - 90 || 0, behavior: "smooth" });
      return toast.error("Start with your tower, flat and mobile at the top");
    }
    if (cartCount === 0) {
      return toast.error(catalogMode ? "Add at least one item to your cart" : "Tap Add on a meal to start your cart");
    }
    if (knownName) {
      submitCheckout({ preventDefault() {} });
      return;
    }
    setStep("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitCheckout = async (e) => {
    e.preventDefault();
    if (cartCount === 0) return toast.error("Your cart is empty");
    const name = form.name.trim() || knownName;
    if (!name) return toast.error("Please enter your name");
    if (!/^[6-9]\d{9}$/.test(form.mobile)) {
      return toast.error("Enter a valid 10-digit mobile number");
    }
    if (!form.tower_id || !form.flat_id) return toast.error("Select your tower and flat");
    setBusy(true);
    try {
      const tower = towers.find((t) => t.id === form.tower_id);
      const flat = flats.find((f) => f.id === form.flat_id);
      const selections = catalogMode
        ? cartLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity }))
        : cartLines.map((l) => ({
            day_code: l.day_code,
            meal_code: l.meal_code,
            quantity: l.quantity,
          }));
      const r = await api.post("/food/register", {
        ...form,
        name,
        tower_name: tower?.name || form.tower_name,
        flat_number: flat?.number || form.flat_number,
        selections,
      });
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

  const cartBody = cartCount === 0 ? (
    <div className="rounded-xl bg-sun-50/80 px-3 py-4 text-sm text-brown-800/70">
      <p className="font-medium text-brown-900">Cart is empty</p>
      <p className="mt-1">
        {catalogMode
          ? <>Tap <span className="font-semibold">Add</span> on any menu item. Choose as many as you like.</>
          : <>Tap <span className="font-semibold">Add</span> next to any meal. Example: 3 breakfasts + 2 lunches.</>}
      </p>
    </div>
  ) : (
    <>
      <ul className="max-h-[50vh] space-y-3 overflow-y-auto sm:max-h-72">
        {cartLines.map((line) => (
          <li key={line.key} className="rounded-xl border border-sun-400/20 bg-sun-50/40 p-3" data-testid={`food-cart-line-${line.key}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-brown-900">{line.meal_label}</div>
                <div className="text-xs text-brown-800/55">{line.day_label} · {line.amount_label} each</div>
                {line.free_qty > 0 ? (
                  <div className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                    {line.free_qty} complimentary
                    {line.quantity > line.free_qty ? ` · ${line.quantity - line.free_qty} charged` : ""}
                  </div>
                ) : null}
              </div>
              <div className="text-right font-semibold text-vermilion-600">
                {line.line_total_paise != null
                  ? (line.line_total_paise === 0 && line.free_qty > 0 ? "Complimentary" : formatPaise(line.line_total_paise))
                  : "TBC"}
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

      {!catalogMode && (mealTypeSummary.breakfast > 0 || mealTypeSummary.lunch > 0 || mealTypeSummary.dinner > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-brown-800/65">
          {mealTypeSummary.breakfast > 0 && <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-sun-400/30">Breakfast × {mealTypeSummary.breakfast}</span>}
          {mealTypeSummary.lunch > 0 && <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-sun-400/30">Lunch × {mealTypeSummary.lunch}</span>}
          {mealTypeSummary.dinner > 0 && <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-sun-400/30">Dinner × {mealTypeSummary.dinner}</span>}
        </div>
      )}

      {freeRulesInCart.length ? (
        <div className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900/85 ring-1 ring-emerald-600/15" data-testid="food-cart-complimentary">
          {freeSavedPaise > 0 ? (
            <div className="flex items-center justify-between gap-2 font-semibold">
              <span>Complimentary: {describeFree(freeRules, freeInCart)}</span>
              <span>−{formatPaise(freeSavedPaise)}</span>
            </div>
          ) : null}
          <p className={`mt-0.5 flex items-center justify-between gap-2 ${noFreeMeals ? "font-medium text-amber-900" : ""}`}>
            <span>
              {!flatReady || flatSubscribed === null
                ? "Enter your tower, flat & mobile at the top to apply complimentary meals."
                : flatSubscribed === false
                ? "No complimentary meals — this flat hasn't paid the Puja subscription."
                : mobileOk === false
                  ? "No complimentary meals — use the mobile registered with this flat's subscription."
                  : "Complimentary for subscribers · No take-aways"}
            </span>
            <button type="button" onClick={() => setInfoOpen(true)} className="shrink-0 text-emerald-700 hover:text-emerald-900" aria-label="Complimentary meal rules">
              <Info className="h-3.5 w-3.5" />
            </button>
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex items-end justify-between border-t border-sun-400/20 pt-3">
        <div className="text-sm text-brown-800/60">{cartCount} {unitLabel}{cartCount === 1 ? "" : "s"}</div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-brown-800/45">You pay</div>
          <div className="font-display text-3xl text-vermilion-600" data-testid="food-cart-total">
            {cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}
          </div>
        </div>
      </div>
    </>
  );

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
      <div className="mt-3">{cartBody}</div>
    </div>
  );

  if (menu && !menu.page_enabled) {
    return (
      <PublicLayout>
        <section
          className="relative flex min-h-[70vh] items-center justify-center overflow-hidden border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 px-4 pt-24 pb-16"
          data-testid="food-coming-soon"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(245,166,35,0.18),_transparent_55%)]" />
          <div className="relative mx-auto max-w-xl text-center">
            <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Puja meals</p>
            <h1 className="mt-3 font-display text-4xl text-brown-900 sm:text-5xl">Coming soon</h1>
            <p className="mt-3 text-base text-brown-800/70 sm:text-lg">
              {menu.coming_soon_message
                || "Food subscriptions will open soon. Please check back."}
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-sun-400/40 bg-white/80 px-4 py-2 text-sm text-brown-800/70 shadow-sm backdrop-blur">
              <Clock className="h-4 w-4 text-vermilion-500" />
              Ordering is temporarily paused
            </div>
            <div className="mt-8">
              <Link
                to="/subscribe"
                className="inline-flex items-center justify-center rounded-full bg-vermilion-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-vermilion-600"
              >
                Subscribe &amp; Pay
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
          <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Puja meals</p>
          <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl">
            {catalogMode ? "Order food" : "Order meals"}
          </h1>
          <p className="mt-2 max-w-xl text-brown-800/70">
            {catalogMode
              ? "Add items, set quantities, then check out."
              : "Pick how many breakfasts, lunches and dinners you need. Your total updates as you add."}
          </p>

          {!catalogMode && (
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
          )}

          {menu && <StepBar current={stepForBar} paymentEnabled={paymentEnabled} />}

          {menu ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-sun-400/35 bg-white px-3 py-1.5 font-medium text-brown-900 hover:border-vermilion-500/40 hover:text-vermilion-600"
                data-testid="food-info-btn"
              >
                <Info className="h-4 w-4 text-vermilion-500" /> Timings &amp; rules
              </button>
              <Link
                to="/food/orders"
                className="inline-flex items-center gap-1.5 rounded-full border border-sun-400/35 bg-white px-3 py-1.5 font-medium text-brown-900 hover:border-vermilion-500/40 hover:text-vermilion-600"
                data-testid="food-my-orders-link"
              >
                <ClipboardList className="h-4 w-4 text-vermilion-500" /> My orders
              </Link>
              {menu.overall_menu_url ? (
                <a
                  href={mediaUrl(menu.overall_menu_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-sun-400/35 bg-white px-3 py-1.5 font-medium text-brown-900 hover:border-vermilion-500/40 hover:text-vermilion-600"
                  data-testid="food-overall-menu-link"
                >
                  <ExternalLink className="h-4 w-4 text-vermilion-500" /> Full menu
                </a>
              ) : null}
            </div>
          ) : null}
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
              {describeFree(freeRules, intent.complimentary) ? (
                <p className="mt-1 text-sm font-medium text-emerald-700">
                  Includes complimentary {describeFree(freeRules, intent.complimentary)}
                </p>
              ) : null}
              {intent.flat_subscribed === false ? (
                <p className="mt-1 text-xs text-amber-800/80">
                  No complimentary meals applied — this flat has not paid the Puja subscription.
                </p>
              ) : intent.free_mobile_ok === false ? (
                <p className="mt-1 text-xs text-amber-800/80">
                  No complimentary meals applied — this mobile is not the one registered with the flat&apos;s subscription.
                </p>
              ) : null}
              {freeRules
                .filter((r) => (intent.complimentary_used_before?.[r.key] || 0) > 0)
                .map((r) => (
                  <p key={r.key} className="mt-1 text-xs text-amber-800/80">
                    Your flat already used {Math.min(r.free, intent.complimentary_used_before[r.key])} of its {r.free} complimentary {pluralMeal(r.label, r.free)} on an earlier order.
                  </p>
                ))}
              <p className="mt-1 text-sm text-brown-800/55">
                {intent.selection_count || cartCount} {unitLabel}{(intent.selection_count || cartCount) === 1 ? "" : "s"} · Order {String(intent.id || "").slice(-6).toUpperCase()}
              </p>
              <p className="mt-1 text-xs text-brown-800/50">
                Paying later or in parts? Come back via <Link to="/food/orders" className="font-semibold text-vermilion-600 underline">My orders</Link> to pay the balance.
              </p>
            </div>

            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h3 className="flex items-center gap-2 font-display text-xl text-brown-900">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-vermilion-500 text-sm font-bold text-white">1</span>
                Pay with UPI
              </h3>
              <p className="mt-1 text-sm text-brown-800/60">Open any UPI app and scan this QR.</p>
              <div className="mt-4 flex flex-col items-center">
                {pay?.upi_intent_url ? (
                  <a href={pay.upi_intent_url} className="block" aria-label="Open UPI payment">
                    <img src={qrSrc} alt="Food UPI QR" className="h-52 w-52 rounded-xl border border-brown-800/10 bg-white object-contain p-2" data-testid="food-qr-img" />
                  </a>
                ) : (
                  <img src={qrSrc} alt="Food UPI QR" className="h-52 w-52 rounded-xl border border-brown-800/10 bg-white object-contain p-2" data-testid="food-qr-img" />
                )}
                {pay?.upi_intent_url ? (
                  <a
                    href={pay.upi_intent_url}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-vermilion-500 px-5 text-sm font-semibold text-white shadow-sm hover:bg-vermilion-600 sm:hidden"
                    data-testid="food-open-upi"
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
                    <p className="text-xs text-brown-800/50">Pay the exact amount shown above. Please use only this food QR / UPI ID for meal orders.</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <h3 className="flex items-center gap-2 font-display text-xl text-brown-900">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-vermilion-500 text-sm font-bold text-white">2</span>
                Confirm your payment
              </h3>
              <div>
                <Label required htmlFor="food-ref">UTR / UPI reference from your app</Label>
                <Input id="food-ref" data-testid="food-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Copy from GPay / PhonePe success screen" />
                <p className="mt-1 text-xs text-brown-800/45">Usually a 12-digit number on the payment success page.</p>
              </div>
              <div>
                <Label required htmlFor="food-shot">Payment screenshot</Label>
                <label htmlFor="food-shot" className="mt-1 flex min-h-[8rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brown-800/25 bg-sky-50/40 px-4 py-6 text-center hover:border-vermilion-500/50">
                  <Upload className="h-7 w-7 text-vermilion-500" />
                  <span className="mt-2 text-sm font-medium text-brown-900">{screenshot ? screenshot.name : "Tap to upload PNG or JPG"}</span>
                  <span className="mt-1 text-xs text-brown-800/45">
                    We read the screenshot with AI to match amount, UTR, and whether it was paid to the committee
                  </span>
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
            <h2 className="mt-4 font-display text-3xl text-brown-900">
              {done.payment_status === "complimentary" ? "Meals confirmed" : "Order saved"}
            </h2>
            <p className="mt-2 text-brown-800/70">{done.message || "Thank you — your meal order is with the committee."}</p>
            <p className="mt-3 text-sm text-brown-800/50">
              Order <span className="font-medium text-brown-900">{String(done.id || "").slice(-6).toUpperCase()}</span>
              {" · "}find it any time under <Link to="/food/orders" className="font-semibold text-vermilion-600 underline">My orders</Link>
            </p>
            {done.payment_status === "complimentary" ? (
              <p className="mt-1 text-lg font-semibold text-emerald-700">
                Complimentary {describeFree(freeRules, done.complimentary)} · Nothing to pay
              </p>
            ) : done.total_amount_paise != null && (
              <p className="mt-1 text-lg font-semibold text-vermilion-600">Total {formatPaise(done.total_amount_paise)}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {done.voucher_token ? (
                <a href={`${API}/food/voucher/${done.voucher_token}/pdf`} target="_blank" rel="noreferrer">
                  <Button variant="primary" data-testid="food-done-voucher-btn">Download food voucher</Button>
                </a>
              ) : null}
              <Button variant="outline" onClick={resetAll}>{catalogMode ? "Order more" : "Order more meals"}</Button>
              <Link to="/"><Button variant="subtle">Back home</Button></Link>
            </div>
          </div>
        ) : step === "checkout" ? (
          <form onSubmit={submitCheckout} className="grid gap-6 lg:grid-cols-[1fr_340px]" data-testid="food-checkout-form">
            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-vermilion-500">Step 2 of {paymentEnabled ? 3 : 2}</p>
              <h2 className="mt-1 font-display text-2xl text-brown-900">Who is this order for?</h2>
              <p className="mt-1 text-sm text-brown-800/60">Add your name so the committee can find your order.</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label required>Your name</Label>
                  <Input data-testid="food-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" required autoFocus />
                </div>
                <div className="sm:col-span-2 rounded-xl bg-ivory-200 px-3.5 py-2.5 text-sm" data-testid="food-flat-summary">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-brown-900">
                      {towers.find((t) => t.id === form.tower_id)?.name || "Tower"} · Flat {flats.find((f) => f.id === form.flat_id)?.number || ""} · {form.mobile}
                    </span>
                    <button type="button" onClick={() => setStep("menu")} className="text-xs font-semibold text-vermilion-600 underline">Change</button>
                  </div>
                  <div className="mt-1">{flatStatus}</div>
                </div>
              </div>

              {openOrders.length ? (
                <div className="mt-5 rounded-xl bg-ivory-200 p-3.5" data-testid="food-earlier-orders">
                  <p className="mb-2 text-sm font-semibold text-brown-900">Your earlier orders on this mobile</p>
                  <FoodOrdersList orders={openOrders} compact />
                  <p className="mt-2 text-[11px] text-brown-800/55">
                    This new order is separate and gets its own food voucher.
                  </p>
                </div>
              ) : null}

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
              {flatCard}
              {catalogMode ? (
                <>
                  <div className="rounded-2xl border border-sun-400/30 bg-white p-4 shadow-card sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="flex items-center gap-2 font-display text-2xl text-brown-900">
                          <UtensilsCrossed className="h-5 w-5 text-vermilion-500" /> Menu
                        </h2>
                      </div>
                      {cartCount > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            className="lg:hidden"
                            onClick={() => setCartOpen(true)}
                            data-testid="food-view-cart-header"
                          >
                            <ShoppingCart className="h-3.5 w-3.5" /> View cart ({cartCount})
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={clearCart} data-testid="food-reset-btn">
                            <Trash2 className="h-3.5 w-3.5" /> Reset cart
                          </Button>
                        </div>
                      )}
                    </div>
                    {catalogItems.length > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <DietToggle value={dietFilter} onChange={setDietFilter} />
                        <Select
                          id="food-day-filter"
                          aria-label="Day"
                          value={dayFilter}
                          onChange={(e) => setDayFilter(e.target.value)}
                          className="min-h-11 w-full sm:w-48"
                          data-testid="food-day-filter"
                        >
                          <option value="">All days</option>
                          {catalogDayOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label} · {shortDate(opt.value)}</option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          className="min-h-11 w-full sm:ml-auto sm:w-auto"
                          onClick={openQuickAdd}
                          data-testid="food-quick-add"
                        >
                          <Plus className="h-4 w-4" /> Quick add
                        </Button>
                      </div>
                    )}
                  </div>

                  {catalogItems.length === 0 ? (
                    <div className="rounded-2xl border border-sun-400/30 bg-white p-8 text-center text-sm text-brown-800/55">
                      No menu items published yet. Check back soon.
                    </div>
                  ) : filteredCatalogItems.length === 0 ? (
                    <div className="rounded-2xl border border-sun-400/30 bg-white p-8 text-center text-sm text-brown-800/55">
                      No items match. Try another day or switch Veg / Non-veg.
                    </div>
                  ) : (
                    <div className="space-y-6" data-testid="food-catalog-grid">
                      {Object.entries(
                        filteredCatalogItems.reduce((acc, item) => {
                          const key = item.menu_date || item.day_code || "menu";
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(item);
                          return acc;
                        }, {})
                      ).map(([dayKey, items]) => {
                        const mealOrder = { breakfast: 1, breakfast_packet: 2, lunch: 3, dinner: 4 };
                        const dietOrder = { veg: 1, non_veg: 2 };
                        const sorted = [...items].sort((a, b) => {
                          const ma = mealOrder[a.category] || 9;
                          const mb = mealOrder[b.category] || 9;
                          if (ma !== mb) return ma - mb;
                          return (dietOrder[a.diet] || 9) - (dietOrder[b.diet] || 9);
                        });
                        const head = sorted[0];
                        return (
                          <div key={dayKey}>
                            <div className="mb-3">
                              <h3 className="font-display text-2xl text-brown-900">
                                {head.day_label || formatMenuDate(head.menu_date) || "Menu"}
                              </h3>
                              {head.menu_date && (
                                <p className="text-sm text-brown-800/55">{formatMenuDate(head.menu_date)} · {head.menu_date}</p>
                              )}
                            </div>
                            <div className="grid gap-5 sm:grid-cols-2">
                              {sorted.map((item) => {
                                const qty = cart[item.id] || 0;
                                const unit = Number(item.amount_paise) || 0;
                                return (
                                  <article
                                    key={item.id}
                                    className={`overflow-hidden rounded-2xl border bg-white shadow-card ${
                                      qty > 0 ? "border-vermilion-500/40" : "border-sun-400/30"
                                    }`}
                                    data-testid={`food-catalog-item-${item.id}`}
                                  >
                                    {/* Image first — subscriber sees the plate before Add */}
                                    <div className="relative aspect-[16/9] bg-sun-50">
                                      {item.image_url ? (
                                        <img
                                          src={mediaUrl(item.image_url)}
                                          alt={item.name || "Menu"}
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <div className="grid h-full place-items-center bg-gradient-to-b from-amber-50 to-sun-50 px-4 text-center">
                                          <div>
                                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800/90">
                                              Image not uploaded
                                            </p>
                                            <p className="mt-1 text-xs text-brown-800/50">Menu photo coming soon</p>
                                          </div>
                                        </div>
                                      )}
                                      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                                        {(item.category_label || item.category) ? (
                                          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-brown-900 shadow-sm">
                                            {item.category_label || item.category}
                                          </span>
                                        ) : null}
                                        {item.diet_label ? (
                                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm ${
                                            item.diet === "veg"
                                              ? "bg-emerald-600 text-white"
                                              : "bg-vermilion-600 text-white"
                                          }`}>
                                            {dietTag(item)}
                                          </span>
                                        ) : null}
                                        {item.badge || item.is_complimentary ? (
                                          <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                                            {item.badge || "Complimentary"}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="p-4 sm:p-5">
                                      <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-display text-2xl text-brown-900">{item.name}</h3>
                                        {item.description ? (
                                          <button
                                            type="button"
                                            onClick={() => setMenuDetail(item)}
                                            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-vermilion-500/40 bg-vermilion-500/10 px-2.5 py-1 text-xs font-semibold text-vermilion-700 transition hover:bg-vermilion-500/15"
                                            aria-label={`View full menu for ${item.name}`}
                                            data-testid={`food-menu-info-label-${item.id}`}
                                          >
                                            <Info className="h-3.5 w-3.5" />
                                            Menu
                                          </button>
                                        ) : null}
                                      </div>
                                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-sun-400/20 pt-3">
                                        <div>
                                          <div className="text-[10px] uppercase tracking-wide text-brown-800/45">
                                            {freeKeyFor(freeRules, item.category, item.day_code)
                                              ? `First ${fullQuota[freeKeyFor(freeRules, item.category, item.day_code)]} complimentary · then`
                                              : item.is_complimentary ? "Extra head" : "Price"}
                                          </div>
                                          <div className="font-display text-2xl text-vermilion-600">
                                            {item.amount_label || formatPaise(unit)}
                                            {qty > 1 || cartLineByKey[item.id]?.free_qty ? (
                                              <span className="ml-1 text-sm font-normal text-brown-800/45">
                                                · {cartLineByKey[item.id]?.line_total_paise === 0
                                                  ? "complimentary"
                                                  : formatPaise(cartLineByKey[item.id]?.line_total_paise ?? unit * qty)}
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>
                                        <QtyControl
                                          value={qty}
                                          label={item.name}
                                          testId={`food-qty-${item.id}`}
                                          onBump={(d) => bump(item.id, d)}
                                          onSet={(v) => setQty(item.id, v)}
                                        />
                                      </div>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-sun-400/30 bg-white p-4 shadow-card sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="flex items-center gap-2 font-display text-2xl text-brown-900">
                          <UtensilsCrossed className="h-5 w-5 text-vermilion-500" /> Choose meals
                        </h2>
                        <p className="mt-1 text-sm text-brown-800/60">Tap <span className="font-semibold">Add</span> on each meal. Use the shortcuts to add one of a meal for every day.</p>
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
                </>
              )}
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
                {cartCount === 0
                  ? `Add ${unitLabel}s to continue`
                  : `Checkout · ${cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}`}
                {cartCount > 0 && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Mobile sticky checkout bar — cart sidebar is desktop-only, so buyers need View cart here */}
      {step === "menu" && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sun-400/30 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden" data-testid="food-mobile-checkout-bar">
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setCartOpen(true)}
              data-testid="food-view-cart"
              className="shrink-0 px-3"
              aria-label={`View cart, ${cartCount} items`}
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="rounded-full bg-vermilion-500 px-1.5 py-0.5 text-xs font-semibold text-white">{cartCount}</span>
            </Button>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="min-w-0 flex-1 rounded-xl px-1 py-0.5 text-left hover:bg-sun-50/80"
              data-testid="food-view-cart-summary"
            >
              <div className="text-xs font-semibold text-vermilion-600">View cart</div>
              <div className="truncate font-display text-xl text-brown-900">
                {cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}
                <span className="ml-1 text-sm font-normal text-brown-800/45">
                  · {cartCount} {unitLabel}{cartCount === 1 ? "" : "s"}
                </span>
              </div>
            </button>
            <Button type="button" variant="primary" size="lg" onClick={goCheckout} data-testid="food-goto-checkout">
              Checkout <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Your cart"
        size="md"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={clearCart} data-testid="food-cart-dialog-reset">
              <Trash2 className="h-3.5 w-3.5" /> Reset
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="subtle" onClick={() => setCartOpen(false)} data-testid="food-cart-keep-shopping">
                Keep shopping
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setCartOpen(false);
                  goCheckout();
                }}
                data-testid="food-cart-dialog-checkout"
              >
                Checkout <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        }
      >
        <div data-testid="food-cart-dialog">{cartBody}</div>
      </Dialog>

      <Dialog
        open={!!menuDetail}
        onClose={() => setMenuDetail(null)}
        title={menuDetail?.name || "Full menu"}
        size="md"
        footer={
          <Button type="button" variant="primary" onClick={() => setMenuDetail(null)} data-testid="food-menu-info-close">
            Close
          </Button>
        }
      >
        {menuDetail ? (
          <div className="space-y-4" data-testid="food-menu-info-dialog">
            <div className="flex flex-wrap gap-2 text-xs">
              {(menuDetail.category_label || menuDetail.category) ? (
                <span className="rounded-full bg-sun-50 px-2.5 py-1 font-semibold uppercase tracking-wide text-brown-800/70">
                  {menuDetail.category_label || menuDetail.category}
                </span>
              ) : null}
              {menuDetail.diet_label ? (
                <span className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide ${
                  menuDetail.diet === "veg" ? "bg-emerald-100 text-emerald-800" : "bg-vermilion-100 text-vermilion-700"
                }`}>
                  {dietTag(menuDetail)}
                </span>
              ) : null}
              {menuDetail.day_label || menuDetail.menu_date ? (
                <span className="rounded-full bg-brown-800/5 px-2.5 py-1 font-medium text-brown-800/60">
                  {menuDetail.day_label || menuDetail.menu_date}
                </span>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brown-800/45">What’s included</p>
              <ul className="mt-2 space-y-2">
                {parseMenuDishes(menuDetail.description).map((dish) => (
                  <li key={dish} className="flex items-start gap-2.5 text-sm text-brown-900">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-500" />
                    <span>{dish}</span>
                  </li>
                ))}
              </ul>
            </div>
            {(menuDetail.complimentary_note || menuDetail.price_note) ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900/85">
                {menuDetail.complimentary_note || menuDetail.price_note}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Timings & rules"
        size="md"
        footer={
          <Button type="button" variant="primary" onClick={() => setInfoOpen(false)} data-testid="food-info-close">
            Got it
          </Button>
        }
      >
        <div className="space-y-5 text-sm text-brown-800/80" data-testid="food-info-dialog">
          {menu?.timings && Object.keys(menu.timings).length ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brown-800/45">Meal timings</p>
              <dl className="mt-2 divide-y divide-sun-400/20 rounded-xl border border-sun-400/25">
                {[["Breakfast", menu.timings.breakfast, Coffee], ["Lunch", menu.timings.lunch, Sun], ["Dinner", menu.timings.dinner, Moon]]
                  .filter(([, t]) => t)
                  .map(([label, t, Icon]) => (
                    <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
                      <dt className="flex items-center gap-2 font-medium text-brown-900"><Icon className="h-4 w-4 text-vermilion-500" />{label}</dt>
                      <dd>{t}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ) : null}
          {catalogMode ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brown-800/45">Complimentary meals</p>
              <ul className="mt-2 space-y-1.5">
                {freePolicy.slice().reverse().map((r) => (
                  <li key={r.key} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>First {r.free} {pluralMeal(r.label, r.free)}{r.per_day ? " each day" : ""} per flat are complimentary — applied automatically in your cart.</span>
                  </li>
                ))}
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Only for flats that have paid the Puja subscription.</span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Complimentary meals must also be booked here — they show as ₹0 in your cart.</span>
                </li>
              </ul>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brown-800/45">Good to know</p>
            <ul className="mt-2 space-y-1.5">
              {menu?.kids_note ? <li>• {menu.kids_note}</li> : null}
              <li>• No take-aways for breakfast and Ashtami lunch.</li>
              <li>• Pure veg breakfast packet available every day.</li>
              <li>
                • {menu?.payment_note
                  || (paymentEnabled
                    ? "After checkout, pay by scanning the UPI QR and upload your payment screenshot."
                    : "You can place your order now. Payment will open soon.")}
              </li>
            </ul>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="Quick add"
        footer={(
          <div className="flex w-full items-center justify-between gap-3">
            <div className="text-xs text-brown-800/55">
              {quickMatches.length * quick.people} plate{quickMatches.length * quick.people === 1 ? "" : "s"}
            </div>
            <Button
              type="button"
              variant="primary"
              disabled={!quickMatches.length}
              onClick={applyQuickAdd}
              data-testid="food-quick-apply"
            >
              <Plus className="h-4 w-4" /> Add to cart · {formatPaise(quickTotalPaise)}
            </Button>
          </div>
        )}
      >
        <div className="space-y-5" data-testid="food-quick-dialog">
          <section>
            <p className="text-sm font-semibold text-brown-900">1. Veg or non-veg?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                ["veg", "Veg", "bg-emerald-600", "border-emerald-600 bg-emerald-50"],
                ["non_veg", "Non-veg", "bg-vermilion-600", "border-vermilion-500 bg-vermilion-500/10"],
              ].map(([value, label, dot, activeCls]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={quick.diet === value}
                  onClick={() => setQuick((q) => ({ ...q, diet: value }))}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold text-brown-900 transition ${
                    quick.diet === value ? activeCls : "border-brown-800/10 bg-white hover:border-brown-800/25"
                  }`}
                  data-testid={`food-quick-diet-${value}`}
                >
                  <span className={`h-3 w-3 rounded-sm ${dot}`} /> {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="text-sm font-semibold text-brown-900">2. Which days?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip
                active={quick.days.length === catalogDayOptions.length}
                onClick={() => setQuick((q) => ({
                  ...q,
                  days: q.days.length === catalogDayOptions.length ? [] : catalogDayOptions.map((d) => d.value),
                }))}
                testId="food-quick-all-days"
              >
                All days
              </Chip>
              {catalogDayOptions.map((d) => (
                <Chip
                  key={d.value}
                  active={quick.days.includes(d.value)}
                  onClick={() => toggleQuickList("days", d.value)}
                  testId={`food-quick-day-${d.value}`}
                >
                  {d.label} <span className="text-xs opacity-70">{shortDate(d.value)}</span>
                </Chip>
              ))}
            </div>
          </section>

          <section>
            <p className="text-sm font-semibold text-brown-900">3. Which meals?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                ["breakfast", "Breakfast"],
                ["lunch", "Lunch"],
                ["dinner", "Dinner"],
                ["breakfast_packet", "Veg breakfast packet"],
              ].map(([code, label]) => (
                <Chip
                  key={code}
                  active={quick.meals.includes(code)}
                  onClick={() => toggleQuickList("meals", code)}
                  testId={`food-quick-meal-${code}`}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </section>

          <section className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-brown-900">4. How many people?</p>
            <div className="inline-flex items-center rounded-full border border-brown-800/15">
              <button
                type="button"
                className="grid h-10 w-10 place-items-center text-brown-800/70 disabled:opacity-40"
                onClick={() => setQuick((q) => ({ ...q, people: Math.max(1, q.people - 1) }))}
                disabled={quick.people <= 1}
                aria-label="Fewer people"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-semibold text-brown-900" data-testid="food-quick-people">{quick.people}</span>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center text-brown-800/70 disabled:opacity-40"
                onClick={() => setQuick((q) => ({ ...q, people: Math.min(20, q.people + 1) }))}
                disabled={quick.people >= 20}
                aria-label="More people"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      </Dialog>

    </PublicLayout>
  );
}
