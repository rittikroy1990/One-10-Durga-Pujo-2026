import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  UtensilsCrossed, Info, Clock, ExternalLink, Copy, Upload, Loader2, ShieldCheck,
  Minus, Plus, ShoppingCart, Trash2, ArrowRight, ArrowLeft, Check, Coffee, Sun, Moon, Package, ClipboardList, X, Pencil, Baby, Leaf,
} from "lucide-react";
import api, { API } from "../../lib/api";
import { loadFlats, prefetchFlats } from "../../lib/flats";
import PublicLayout from "../../components/PublicLayout";
import WhatsAppOrderPanel from "../../components/WhatsAppOrderPanel";
import { Button, Input, Label, Select, Spinner, Dialog } from "../../components/ui";
import { formatPaise } from "../../lib/utils";
import { VEG_PROMISE, normalizeMobile } from "../../lib/food";

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

/** Plate photo that retries a dropped download (common on mobile data) before showing a quiet placeholder. */
function MenuPhoto({ src, alt }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [src]);
  if (failed) {
    return (
      <div className="grid h-full place-items-center bg-gradient-to-b from-amber-50 to-sun-50 px-4 text-center">
        <div>
          <UtensilsCrossed className="mx-auto h-7 w-7 text-amber-700/60" aria-hidden />
          <p className="mt-1 text-xs text-brown-800/50">Photo couldn't load</p>
        </div>
      </div>
    );
  }
  return (
    <img
      src={attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      width={800}
      height={600}
      onError={() => {
        if (attempt < 2) setTimeout(() => setAttempt((a) => a + 1), 800 * (attempt + 1));
        else setFailed(true);
      }}
    />
  );
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

function QtyControl({ value, onBump, onSet, label, testId, small = false }) {
  const qty = value || 0;
  const btn = small ? "h-8 w-8" : "h-10 w-10";
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
    <div className={`inline-flex items-center rounded-xl border border-vermilion-500/40 bg-vermilion-500/5 ${small ? "gap-0 p-0.5" : "gap-1 p-1"}`}>
      <button
        type="button"
        aria-label={`Remove one ${label}`}
        data-testid={testId ? `${testId}-dec` : undefined}
        className={`grid ${btn} place-items-center rounded-lg text-brown-900 hover:bg-white`}
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
        className={`${small ? "h-8 w-8 text-sm" : "h-10 w-12 text-base"} border-0 bg-transparent text-center font-semibold text-brown-900 outline-none`}
      />
      <button
        type="button"
        aria-label={`Add one ${label}`}
        data-testid={testId ? `${testId}-inc` : undefined}
        className={`grid ${btn} place-items-center rounded-lg text-brown-900 hover:bg-white`}
        onClick={() => onBump(1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Food() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editParam = searchParams.get("edit") || "";
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [flatsLoading, setFlatsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const placing = useRef(false);
  const [step, setStep] = useState("menu");
  const [done, setDone] = useState(null);
  const [intent, setIntent] = useState(null);
  const [upiSession, setUpiSession] = useState(null);
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [payMode, setPayMode] = useState("upload");
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [cart, setCart] = useState({});
  const [kids, setKids] = useState([]);
  const [kidQty, setKidQty] = useState({});
  const [kidsApplied, setKidsApplied] = useState({ older: 0, all: 0 });
  const [kidsAsked, setKidsAsked] = useState(false);
  const [kidsOpen, setKidsOpen] = useState(false);
  const [kidDraft, setKidDraft] = useState([]);
  const kidsPrompted = useRef(false);
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
    api.get("/towers").then((r) => {
      setTowers(r.data.items || []);
      prefetchFlats(r.data.items);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setFlats([]);
    if (!form.tower_id) return;
    let live = true;
    setFlatsLoading(true);
    loadFlats(form.tower_id)
      .then((items) => live && setFlats(items))
      .catch(() => live && toast.error("Could not load flats — check your connection and pick the tower again"))
      .finally(() => live && setFlatsLoading(false));
    return () => { live = false; };
  }, [form.tower_id]);

  const stopEditing = () => {
    setEditing(null);
    if (searchParams.get("edit")) setSearchParams({}, { replace: true });
  };

  useEffect(() => {
    if (!editParam || !menu) return;
    let live = true;
    api.get("/food/my-orders/edit", { params: { token: editParam } })
      .then((r) => {
        if (!live) return;
        const o = r.data;
        const byItem = (menu.items || []).length > 0 || menu.mode === "items";
        const nextCart = {};
        const nextKidQty = {};
        for (const sel of o.selections || []) {
          const key = byItem ? sel.item_id : lineKey(sel.day_code, sel.meal_code);
          if (!key) continue;
          nextCart[key] = (nextCart[key] || 0) + (Number(sel.quantity) || 0);
          if (sel.kid_qty != null) nextKidQty[key] = Number(sel.kid_qty) || 0;
        }
        const years = (o.kids || []).map((k) => String(k.birth_year));
        setForm((f) => ({
          ...f,
          tower_id: o.tower_id,
          tower_name: o.tower_name || "",
          flat_id: o.flat_id,
          flat_number: o.flat_number || "",
          mobile: o.mobile || f.mobile,
          name: o.name || f.name,
        }));
        setCart(nextCart);
        setKids(years);
        setKidQty(nextKidQty);
        const policy = menu.menu_meta?.kids_policy || { year: 2026, below_age: 7 };
        setKidsApplied({
          older: years.filter((y) => policy.year - Number(y) >= policy.below_age).length,
          all: years.length,
        });
        setKidsAsked(true);
        setStep("menu");
        setEditing({ ref: o.ref, token: o.edit_token });
      })
      .catch((err) => {
        if (!live) return;
        toast.error(err?.response?.data?.detail || "This order can no longer be edited");
        setSearchParams({}, { replace: true });
      });
    return () => { live = false; };
  }, [editParam, menu]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [flatKnown, setFlatKnown] = useState(false);
  const [knownName, setKnownName] = useState("");
  useEffect(() => {
    setFlatFree(null);
    setFlatSubscribed(null);
    setFlatKnown(false);
    setKnownName("");
    if (!form.flat_id) return;
    let live = true;
    api.get("/food/complimentary", { params: { flat_id: form.flat_id, editing: editing?.token || undefined } })
      .then((r) => {
        if (!live) return;
        setFlatFree(r.data.remaining || {});
        setFlatSubscribed(r.data.subscribed !== false);
        setFlatKnown(!!r.data.known);
        setKnownName(r.data.known_name || "");
      })
      .catch(() => {});
    return () => { live = false; };
  }, [form.flat_id, editing?.token]);
  const noFreeMeals = flatSubscribed === false;

  const freeRules = useMemo(
    () => (menu?.menu_meta?.complimentary_policy ? menu.menu_meta.complimentary_rules : null) || DEFAULT_FREE_RULES,
    [menu],
  );
  const freePolicy = menu?.menu_meta?.complimentary_policy || DEFAULT_FREE_POLICY;
  const fullQuota = useMemo(
    () => Object.fromEntries(freeRules.map((r) => [r.key, r.free])),
    [freeRules],
  );
  // Complimentary only once the flat is a verified subscriber; the server re-checks.
  const freeEligible = Boolean(flatFree && flatSubscribed);
  const freeQuota = useMemo(
    () => (freeEligible ? flatFree : Object.fromEntries(freeRules.map((r) => [r.key, 0]))),
    [freeEligible, flatFree, freeRules],
  );
  const flatReady = Boolean(form.tower_id && form.flat_id);

  const kidsPolicy = menu?.menu_meta?.kids_policy || { year: 2026, below_age: 7 };
  const kidAge = (year) => (year ? kidsPolicy.year - Number(year) : null);
  const kidYearOptions = Array.from({ length: 13 }, (_, i) => kidsPolicy.year - i);
  const freeKids = kids.filter((y) => y && kidAge(y) < kidsPolicy.below_age).length;
  const allKids = kids.filter(Boolean).length;
  const olderKids = allKids - freeKids;
  // Kids join every meal: at quota meals (breakfast, Ashtami lunch) all kids are heads; at paid meals only
  // kids at or above the age limit are, the younger ones get ₹0 plates on top.
  const kidHeads = (quota) => (quota ? allKids : olderKids);

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
        kid_qty: freeKey ? 0 : Math.min(kidQty[line.key] ?? freeKids, freeKids),
        line_total_paise: line.unit_paise != null ? line.unit_paise * (line.quantity - free) : null,
      };
    });
  }, [rawCartLines, freeQuota, freeRules, kidQty, freeKids]);

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
  const kidPlates = cartLines.reduce((n, l) => n + l.kid_qty, 0);
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
    setKidQty({});
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
      const heads = quick.people + (cart[item.id] ? 0 : kidHeads(!!freeKey));
      const free = freeKey ? Math.min(left[freeKey] || 0, heads) : 0;
      if (free) left[freeKey] -= free;
      return sum + (Number(item.amount_paise) || 0) * (heads - free);
    }, 0);
  }, [quickMatches, quick.people, freeInCart, freeQuota, freeRules, cart, allKids, olderKids]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const had = next[item.id] || 0;
        const extra = had ? 0 : kidHeads(!!freeKeyFor(freeRules, item.category, item.day_code));
        next[item.id] = Math.min(MAX_QTY, had + quick.people + extra);
      }
      return next;
    });
    const dietLabel = quick.diet === "veg" ? "Veg" : "Non-veg";
    const dayLabel = quick.days.length === catalogDayOptions.length
      ? "all days"
      : quick.days.map((d) => catalogDayOptions.find((o) => o.value === d)?.label || d).join(", ");
    toast.success(`Added ${dietLabel} · ${dayLabel} for ${quick.people} ${quick.people === 1 ? "person" : "people"}${allKids ? " + kids" : ""}`);
    setQuickOpen(false);
    askKidsOnce();
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
      Complimentary meals are for flats that have paid the Puja subscription.
    </p>
  ) : flatSubscribed === null ? (
    <p className="text-xs text-brown-800/55">Checking your flat…</p>
  ) : flatSubscribed === false ? (
    <p className="text-xs font-medium text-amber-900/90" data-testid="food-flat-not-subscribed">
      This flat has not paid the Puja subscription yet, so all meals are charged.{" "}
      <Link to="/subscribe" className="font-semibold text-vermilion-600 underline">Subscribe &amp; Pay</Link>
      {" "}to unlock complimentary {describePolicy(freePolicy)}.
    </p>
  ) : flatFree ? (
    <p className="text-xs font-medium text-emerald-800" data-testid="food-flat-free">
      <Check className="mr-1 inline h-3.5 w-3.5" />
      Subscribed flat — complimentary meals apply automatically in your cart.
      {freeRules.some((r) => (flatFree[r.key] ?? 0) < r.free)
        ? ` Already used on earlier orders: ${freeRules
          .filter((r) => (flatFree[r.key] ?? 0) < r.free)
          .map((r) => `${r.free - (flatFree[r.key] ?? 0)} of ${r.free} ${r.label}`)
          .join(", ")}.`
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
            disabled={!!editing}
            onChange={(e) => setForm({ ...form, tower_id: e.target.value, flat_id: "", flat_number: "" })}
          >
            <option value="">Select tower</option>
            {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        <div>
          <Label required>Flat</Label>
          <Select
            data-testid="food-flat"
            value={form.flat_id}
            disabled={!!editing || flatsLoading}
            onChange={(e) => setForm({ ...form, flat_id: e.target.value })}
          >
            <option value="">{flatsLoading ? "Loading flats…" : "Select flat"}</option>
            {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
          </Select>
        </div>
        <div>
          <Label required>Mobile</Label>
          <Input
            data-testid="food-mobile"
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: normalizeMobile(e.target.value) })}
            placeholder="10-digit mobile"
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
      <div className="mt-3 border-t border-emerald-600/15 pt-3" data-testid="food-flat-kids">
        {kidsAsked ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-brown-800/80">
              <Baby className="mr-1.5 inline h-4 w-4 text-emerald-700" />
              {allKids ? (
                <>
                  <b className="text-brown-900">{allKids} kid{allKids === 1 ? "" : "s"}</b>
                  {freeKids ? <> · {freeKids} below {kidsPolicy.below_age} {freeKids === 1 ? "gets" : "get"} a ₹0 plate at paid lunches &amp; dinners (not breakfast or Ashtami lunch)</> : " · all on paid plates"}
                </>
              ) : "No kids — plates are for adults only"}
            </p>
            <button type="button" className="text-sm font-semibold text-vermilion-600 hover:underline" onClick={() => openKids()} data-testid="food-flat-kids-edit">
              {allKids ? "Change" : "Add kids"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 text-sm text-brown-900">
              <Baby className="mr-1.5 inline h-4 w-4 text-emerald-700" />
              <b>Kids eating with you?</b>{" "}
              <span className="text-brown-800/70">
                Below {kidsPolicy.below_age}: ₹0 plate at paid lunches &amp; dinners. Not at the complimentary breakfasts
                or Ashtami lunch — kids count as regular heads there.
              </span>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => applyKids([])} data-testid="food-flat-kids-none">
                No kids
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={() => openKids()} data-testid="food-flat-kids-add">
                Add kids
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const resetKids = () => {
    setKids([]);
    setKidQty({});
    setKidsApplied({ older: 0, all: 0 });
    setKidsAsked(false);
  };

  // Kids join every meal already in the cart: below the age limit as ₹0 plates at paid meals; older kids,
  // and every kid at quota meals (breakfast, Ashtami lunch), as regular heads. Re-applying adds only the change.
  const applyKids = (years) => {
    const older = years.filter((y) => kidAge(y) >= kidsPolicy.below_age).length;
    const dOlder = older - kidsApplied.older;
    const dAll = years.length - kidsApplied.all;
    setCart((prev) => {
      const next = { ...prev };
      for (const line of rawCartLines) {
        const quota = freeKeyFor(freeRules, line.category || line.meal_code, line.item_day_code || line.day_code);
        const d = quota ? dAll : dOlder;
        if (d) next[line.key] = Math.max(1, Math.min(MAX_QTY, (next[line.key] || 0) + d));
      }
      return next;
    });
    setKidQty({});
    setKids(years);
    setKidsApplied({ older, all: years.length });
    setKidsAsked(true);
    setKidsOpen(false);
  };

  const openKids = () => {
    kidsPrompted.current = true;
    setKidDraft(kids.length ? kids : [""]);
    setKidsOpen(true);
  };

  const askKidsOnce = () => {
    if (!kidsAsked && !kidsPrompted.current) openKids();
  };

  // A meal's first Add brings the family's kids along; before kids are known, ask once instead.
  const bumpLine = (key, delta, quota) => {
    if (!(cart[key] > 0) && delta > 0) {
      setQty(key, 1 + kidHeads(quota));
      askKidsOnce();
      return;
    }
    bump(key, delta);
  };

  const goCheckout = () => {
    if (placing.current) return;
    if (!flatReady) {
      window.scrollTo({ top: document.getElementById("food-flat-card")?.offsetTop - 90 || 0, behavior: "smooth" });
      return toast.error("Start with your tower and flat at the top");
    }
    if (!/^[6-9]\d{9}$/.test(form.mobile)) {
      window.scrollTo({ top: document.getElementById("food-flat-card")?.offsetTop - 90 || 0, behavior: "smooth" });
      return toast.error("Enter your 10-digit mobile number at the top");
    }
    if (cartCount === 0) {
      return toast.error(catalogMode ? "Add at least one item to your cart" : "Tap Add on a meal to start your cart");
    }
    setReviewOpen(true);
  };

  const confirmReview = () => {
    setReviewOpen(false);
    if (flatKnown) {
      submitCheckout({ preventDefault() {} });
      return;
    }
    setStep("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitCheckout = async (e) => {
    e.preventDefault();
    if (cartCount === 0) return toast.error("Your cart is empty");
    const name = form.name.trim();
    if (!flatKnown && !name) return toast.error("Please enter your name");
    if (!/^[6-9]\d{9}$/.test(form.mobile)) {
      return toast.error("Enter a valid 10-digit mobile number");
    }
    if (!form.tower_id || !form.flat_id) return toast.error("Select your tower and flat");
    if (placing.current) return;
    placing.current = true;
    setBusy(true);
    try {
      const tower = towers.find((t) => t.id === form.tower_id);
      const flat = flats.find((f) => f.id === form.flat_id);
      const selections = catalogMode
        ? cartLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity, kid_qty: l.kid_qty }))
        : cartLines.map((l) => ({
            day_code: l.day_code,
            meal_code: l.meal_code,
            quantity: l.quantity,
            kid_qty: l.kid_qty,
          }));
      const r = await api.post("/food/register", {
        ...form,
        name: flatKnown ? "" : name,
        mobile: form.mobile,
        tower_name: tower?.name || form.tower_name,
        flat_number: flat?.number || form.flat_number,
        selections,
        kids: kids.filter(Boolean).map((y) => ({ birth_year: Number(y) })),
        replaces_token: editing?.token || undefined,
      });
      if (r.data.replaced_ref) toast.message(`Order #${r.data.replaced_ref} was replaced by this one`);
      stopEditing();
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
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 409 && /no longer available/.test(detail || "")) {
        api.get("/food/menu").then((m) => setMenu(m.data)).catch(() => {});
      }
      toast.error(detail || (err?.response ? "Could not place order" : "No connection — check My orders before trying again"));
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
    stopEditing();
    setPayMode("upload");
    setDone(null);
    setIntent(null);
    setUpiSession(null);
    setReference("");
    setScreenshot(null);
    setCart({});
    resetKids();
    setStep("menu");
  };

  const stepForBar = step === "done" ? (paymentEnabled ? "pay" : "checkout") : step;

  const kidStepper = (line) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700" data-testid={`food-cart-kids-${line.key}`}>
      <span>+ Kids below {kidsPolicy.below_age}: ₹0</span>
      <button
        type="button"
        className="grid h-5 w-5 place-items-center rounded-full ring-1 ring-emerald-600/30 disabled:opacity-40"
        disabled={line.kid_qty <= 0}
        onClick={() => setKidQty((m) => ({ ...m, [line.key]: line.kid_qty - 1 }))}
        aria-label="One kid fewer"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-4 text-center">{line.kid_qty}</span>
      <button
        type="button"
        className="grid h-5 w-5 place-items-center rounded-full ring-1 ring-emerald-600/30 disabled:opacity-40"
        disabled={line.kid_qty >= freeKids}
        onClick={() => setKidQty((m) => ({ ...m, [line.key]: line.kid_qty + 1 }))}
        aria-label="One kid more"
      >
        <Plus className="h-3 w-3" />
      </button>
    </span>
  );
  const kidCardNote = (line) => {
    if (!line || !allKids) return null;
    const text = line.free_key
      ? `Below-${kidsPolicy.below_age} ₹0 plate doesn't apply here — kids count as heads`
      : line.kid_qty
        ? `+ ${line.kid_qty} kid plate${line.kid_qty === 1 ? "" : "s"} below ${kidsPolicy.below_age} · ₹0`
        : null;
    return text ? <div className="mt-0.5 text-[11px] font-semibold text-emerald-700">{text}</div> : null;
  };

  const showKidStepper = (line) => line.kid_qty > 0 || (!line.free_key && freeKids > 0);
  const linePrice = (line) => (line.line_total_paise != null
    ? (line.line_total_paise === 0 && line.free_qty > 0 ? "Complimentary" : formatPaise(line.line_total_paise))
    : "TBC");

  const renderCart = (compact) => (
    <div className={`rounded-2xl border border-sun-400/30 bg-white shadow-card ${compact ? "p-3.5" : "p-5"}`} data-testid="food-cart">
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
          <p className="mt-1">
            {catalogMode
              ? <>Tap <span className="font-semibold">Add</span> on any menu item. Choose as many as you like.</>
              : <>Tap <span className="font-semibold">Add</span> next to any meal. Example: 3 breakfasts + 2 lunches.</>}
          </p>
        </div>
      ) : (
        <>
          {compact ? (
            <ul className="mt-2 divide-y divide-sun-400/20" data-testid="food-cart-compact">
              {cartLines.map((line) => (
                <li key={line.key} className="py-2" data-testid={`food-cart-line-${line.key}`}>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug text-brown-900">{line.meal_label}</div>
                      <div className="text-[11px] leading-snug text-brown-800/55">
                        {line.amount_label} each
                        {line.free_qty > 0 ? (
                          <span className="font-semibold text-emerald-700">
                            {" · "}{line.free_qty} complimentary{line.quantity > line.free_qty ? `, ${line.quantity - line.free_qty} charged` : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <QtyControl
                      small
                      value={line.quantity}
                      label={`${line.day_label} ${line.meal_label}`}
                      testId={`food-cart-qty-${line.key}`}
                      onBump={(d) => bump(line.key, d)}
                      onSet={(v) => setQty(line.key, v)}
                    />
                    <div className="w-[4.5rem] shrink-0 text-right text-sm font-semibold text-vermilion-600">
                      {line.line_total_paise === 0 && line.free_qty > 0 ? <span className="text-xs text-emerald-700">Complimentary</span> : linePrice(line)}
                    </div>
                  </div>
                  {showKidStepper(line) ? <div className="mt-1">{kidStepper(line)}</div> : null}
                </li>
              ))}
            </ul>
          ) : (
          <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto">
            {cartLines.map((line) => (
              <li key={line.key} className="rounded-xl border border-sun-400/20 bg-sun-50/40 p-3" data-testid={`food-cart-line-${line.key}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-brown-900">{line.meal_label}</div>
                    <div className="text-xs text-brown-800/55">{line.day_label} · {line.amount_label} each</div>
                    {showKidStepper(line) ? <div className="mt-1">{kidStepper(line)}</div> : null}
                    {line.free_qty > 0 ? (
                      <div className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                        {line.free_qty} complimentary
                        {line.quantity > line.free_qty ? ` · ${line.quantity - line.free_qty} charged` : ""}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right font-semibold text-vermilion-600">{linePrice(line)}</div>
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
          )}

          {!compact && !catalogMode && (mealTypeSummary.breakfast > 0 || mealTypeSummary.lunch > 0 || mealTypeSummary.dinner > 0) && (
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
                    ? "Select your tower and flat at the top to apply complimentary meals."
                    : flatSubscribed === false
                    ? "No complimentary meals — this flat hasn't paid the Puja subscription."
                    : "Complimentary for subscribers · No take-aways"}
                </span>
                <button type="button" onClick={() => setInfoOpen(true)} className="shrink-0 text-emerald-700 hover:text-emerald-900" aria-label="Complimentary meal rules">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-brown-800/70" data-testid="food-cart-kids">
            <span>
              {!kidsAsked
                ? `Kids below ${kidsPolicy.below_age}: ₹0 at paid lunches & dinners (not breakfast or Ashtami lunch)`
                : allKids
                  ? `Kids: ${allKids}${freeKids ? ` (${freeKids} below ${kidsPolicy.below_age} · ₹0 at paid lunches & dinners)` : ""}`
                  : "No kids"}
            </span>
            <button type="button" className="font-semibold text-vermilion-600 hover:underline" onClick={openKids}>
              {allKids ? "Edit kids" : "Add kids"}
            </button>
          </div>

          <div className={`flex items-end justify-between border-t border-sun-400/20 ${compact ? "mt-3 pt-2" : "mt-4 pt-3"}`}>
            <div className="text-sm text-brown-800/60">
              {cartCount} {unitLabel}{cartCount === 1 ? "" : "s"}
              {kidPlates ? ` + ${kidPlates} kid plate${kidPlates === 1 ? "" : "s"} (₹0)` : ""}
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-brown-800/45">You pay</div>
              <div className={`font-display text-vermilion-600 ${compact ? "text-2xl" : "text-3xl"}`} data-testid="food-cart-total">
                {cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
  const cartPanel = renderCart(false);

  if (menu && menu.closed) {
    return (
      <PublicLayout>
        <section
          className="relative flex min-h-[70vh] items-center justify-center overflow-hidden border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 px-4 pt-24 pb-16"
          data-testid="food-closed"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(245,166,35,0.18),_transparent_55%)]" />
          <div className="relative mx-auto max-w-xl text-center">
            <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Puja meals</p>
            <h1 className="mt-3 font-display text-4xl text-brown-900 sm:text-5xl">Food orders are closed</h1>
            <p className="mt-3 text-base text-brown-800/70 sm:text-lg">{menu.closed_message}</p>
            <p className="mx-auto mt-5 max-w-md text-sm text-brown-800/60">
              Already ordered? Your food voucher and any balance to pay are under My orders.
            </p>
            <div className="mt-6">
              <Link
                to="/food/orders"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-vermilion-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-vermilion-600"
                data-testid="food-closed-my-orders"
              >
                <ClipboardList className="h-4 w-4" /> My orders
              </Link>
            </div>
          </div>
        </section>
      </PublicLayout>
    );
  }

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
            <p className="mx-auto mt-5 flex max-w-md items-start gap-2 rounded-xl border border-emerald-600/25 bg-emerald-50 px-3 py-2.5 text-left text-sm text-emerald-900">
              <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{VEG_PROMISE}</span>
            </p>
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
          {menu?.committee_mode ? (
            <div className="mt-3 flex max-w-2xl items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" data-testid="food-committee-mode">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>Committee ordering.</b> Food orders are closed to the community. You can still order because you're logged in
                as a committee member{menu.committee_name ? ` (${menu.committee_name})` : ""}; each order is recorded under your name.
              </span>
            </div>
          ) : null}
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

          <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-xl border border-emerald-600/25 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900" data-testid="food-veg-promise">
            <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{VEG_PROMISE}</span>
          </p>
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
                      data-testid={`food-paymode-${mode}`}
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
              ) : (<>
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
              </>)}
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
              <p className="mt-1 text-sm text-brown-800/60">We don&apos;t have this flat&apos;s details yet — add your name.</p>

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
              {editing ? (
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                  data-testid="food-editing-banner"
                >
                  <Pencil className="h-4 w-4 shrink-0" />
                  <p className="min-w-0 flex-1">
                    Editing order <b>#{editing.ref}</b>. Change your items, then check out — the new order replaces
                    the old one.
                  </p>
                  <button
                    type="button"
                    className="text-sm font-semibold text-vermilion-600 underline"
                    data-testid="food-stop-editing"
                    onClick={() => {
                      stopEditing();
                      setCart({});
                      resetKids();
                      toast.message(`Order #${editing.ref} is unchanged`);
                    }}
                  >
                    Stop editing
                  </button>
                </div>
              ) : null}
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
                        <Button type="button" variant="outline" size="sm" onClick={clearCart} data-testid="food-reset-btn">
                          <Trash2 className="h-3.5 w-3.5" /> Reset cart
                        </Button>
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
                                        <MenuPhoto src={mediaUrl(item.image_url)} alt={item.name || "Menu"} />
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
                                          {kidCardNote(cartLineByKey[item.id])}
                                        </div>
                                        <QtyControl
                                          value={qty}
                                          label={item.name}
                                          testId={`food-qty-${item.id}`}
                                          onBump={(d) => bumpLine(item.id, d, !!freeKeyFor(freeRules, item.category, item.day_code))}
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
                                  {kidCardNote(cartLineByKey[key])}
                                </div>
                              </div>
                              <QtyControl
                                value={qty}
                                label={`${day.label} ${meal.label}`}
                                testId={`food-qty-${key}`}
                                onBump={(d) => bumpLine(key, d, !!freeKeyFor(freeRules, meal.code, day.code))}
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
                disabled={cartCount === 0 || busy}
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
            <button
              type="button"
              className="min-w-0 flex-1 rounded-xl px-1 text-left"
              onClick={() => setCartSheetOpen(true)}
              data-testid="food-mobile-view-cart"
            >
              <div className="flex items-center gap-1 text-xs font-semibold text-vermilion-600">
                <ShoppingCart className="h-3.5 w-3.5" /> View cart · {cartCount} {unitLabel}{cartCount === 1 ? "" : "s"}
              </div>
              <div className="truncate font-display text-xl text-vermilion-600">
                {cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}
              </div>
            </button>
            <Button type="button" variant="primary" size="lg" onClick={goCheckout} disabled={busy} data-testid="food-goto-checkout">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Placing…</> : <>Checkout <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      )}

      {step === "menu" && cartSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" data-testid="food-cart-sheet">
          <div className="absolute inset-0 bg-brown-900/60 backdrop-blur-sm" onClick={() => setCartSheetOpen(false)} />
          <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-ivory-100 p-3 pb-4 shadow-2xl animate-fade-up">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setCartSheetOpen(false)}
                className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-brown-800/70"
                data-testid="food-cart-sheet-close"
              >
                <X className="h-4 w-4" /> Close
              </button>
            </div>
            {renderCart(true)}
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="mt-3 w-full"
              disabled={cartCount === 0 || busy}
              onClick={() => { setCartSheetOpen(false); goCheckout(); }}
              data-testid="food-cart-sheet-checkout"
            >
              {cartCount === 0
                ? `Add ${unitLabel}s to continue`
                : `Checkout · ${cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}`}
              {cartCount > 0 && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={reviewOpen && step === "menu" && cartCount > 0}
        onClose={() => setReviewOpen(false)}
        title="Order summary"
        size="md"
        footer={(
          <>
            <Button type="button" variant="subtle" className="whitespace-nowrap" onClick={() => setReviewOpen(false)} data-testid="food-review-edit">
              <ArrowLeft className="h-4 w-4" /> Edit cart
            </Button>
            <Button type="button" variant="primary" onClick={confirmReview} disabled={busy} data-testid="food-review-confirm">
              {!flatKnown
                ? <>Continue <ArrowRight className="h-4 w-4" /></>
                : paymentEnabled && cartTotalPaise > 0
                  ? <>Confirm &amp; pay {formatPaise(cartTotalPaise)} <ArrowRight className="h-4 w-4" /></>
                  : <>Confirm order <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </>
        )}
      >
        <div className="space-y-4" data-testid="food-review">
          <div className="rounded-xl bg-ivory-200 px-3.5 py-2.5 text-sm">
            <div className="font-medium text-brown-900">
              {towers.find((t) => t.id === form.tower_id)?.name || "Tower"} · Flat {flats.find((f) => f.id === form.flat_id)?.number || ""} · {form.mobile}
            </div>
            {editing ? (
              <div className="mt-1 text-xs font-semibold text-amber-800">
                This replaces order #{editing.ref} — the list below is the complete updated order.
              </div>
            ) : null}
          </div>

          <ul className="divide-y divide-sun-400/25" data-testid="food-review-lines">
            {cartLines.map((line) => {
              const charged = line.quantity - (line.free_qty || 0);
              return (
                <li key={line.key} className="flex items-start justify-between gap-3 py-2.5" data-testid={`food-review-line-${line.key}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-brown-900">{line.meal_label}</div>
                    <div className="text-xs text-brown-800/55">{line.day_label}</div>
                    <div className="mt-0.5 text-xs text-brown-800/70">
                      {line.quantity} × {line.amount_label}
                      {line.free_qty > 0 ? (
                        <span className="font-semibold text-emerald-700">
                          {" · "}{line.free_qty} complimentary{charged > 0 ? `, ${charged} charged` : ""}
                        </span>
                      ) : null}
                    </div>
                    {line.kid_qty > 0 ? (
                      <div className="text-[11px] font-semibold text-emerald-700">
                        + {line.kid_qty} kid plate{line.kid_qty === 1 ? "" : "s"} below {kidsPolicy.below_age} · ₹0
                      </div>
                    ) : null}
                  </div>
                  <div className={`shrink-0 text-right font-semibold ${line.line_total_paise === 0 && line.free_qty > 0 ? "text-emerald-700" : "text-vermilion-600"}`}>
                    {linePrice(line)}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="space-y-1 border-t border-sun-400/30 pt-3 text-sm">
            {freeSavedPaise > 0 ? (
              <>
                <div className="flex justify-between text-brown-800/70">
                  <span>Subtotal</span>
                  <span>{formatPaise((cartTotalPaise || 0) + freeSavedPaise)}</span>
                </div>
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>Complimentary</span>
                  <span>−{formatPaise(freeSavedPaise)}</span>
                </div>
              </>
            ) : null}
            <div className="flex items-end justify-between pt-1">
              <span className="text-brown-800/70">
                {cartCount} {unitLabel}{cartCount === 1 ? "" : "s"}
                {kidPlates ? ` + ${kidPlates} kid plate${kidPlates === 1 ? "" : "s"} (₹0)` : ""}
              </span>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-brown-800/45">Total to pay</div>
                <div className="font-display text-3xl text-vermilion-600" data-testid="food-review-total">
                  {cartTotalPaise != null ? formatPaise(cartTotalPaise) : "TBC"}
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-brown-800/55">
            Check the meals, days and quantities. Tap <span className="font-semibold">Edit cart</span> to change anything.
          </p>
        </div>
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
            {menuDetail.diet === "veg" ? (
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="food-menu-info-veg-promise">
                <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>{VEG_PROMISE}</span>
              </p>
            ) : null}
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
                {menu?.kids_note ? (
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="font-medium text-brown-900">{menu.kids_note}</span>
                  </li>
                ) : null}
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
              {menu?.kids_note && !catalogMode ? <li>• {menu.kids_note}</li> : null}
              <li>• No take-aways for breakfast and Ashtami lunch.</li>
              <li>• Pure veg breakfast packet available every day.</li>
              <li>• {VEG_PROMISE}</li>
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
        open={kidsOpen}
        onClose={() => setKidsOpen(false)}
        title="Any kids eating with you?"
        size="md"
        footer={(
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="food-kids-none"
              onClick={() => applyKids([])}
            >
              No kids
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="food-kids-apply"
              disabled={!kidDraft.length || kidDraft.some((y) => !y)}
              onClick={() => {
                applyKids(kidDraft);
                toast.success(cartCount ? "Kids added to the meals in your cart" : "Saved — kids join each meal you add");
              }}
            >
              Save kids
            </Button>
          </div>
        )}
      >
        <div className="space-y-4 text-sm" data-testid="food-kids-dialog">
          <section className="flex items-center justify-between gap-3">
            <p className="font-semibold text-brown-900">Number of kids</p>
            <div className="inline-flex items-center rounded-full border border-brown-800/15">
              <button
                type="button"
                className="grid h-10 w-10 place-items-center text-brown-800/70 disabled:opacity-40"
                onClick={() => setKidDraft((d) => d.slice(0, -1))}
                disabled={kidDraft.length <= 0}
                aria-label="Fewer kids"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-semibold text-brown-900" data-testid="food-kids-count">{kidDraft.length}</span>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center text-brown-800/70 disabled:opacity-40"
                onClick={() => setKidDraft((d) => [...d, ""])}
                disabled={kidDraft.length >= 10}
                aria-label="More kids"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </section>
          {kidDraft.map((year, i) => {
            const age = kidAge(year);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-12 text-brown-800/70">Kid {i + 1}</span>
                <Select
                  className="max-w-[10.5rem]"
                  value={year}
                  onChange={(e) => setKidDraft((d) => d.map((y, j) => (j === i ? e.target.value : y)))}
                  data-testid={`food-kid-year-${i}`}
                >
                  <option value="">Year of birth</option>
                  {kidYearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
                {year ? (
                  age < kidsPolicy.below_age ? (
                    <span className="text-xs font-semibold text-emerald-700">Age {age} · ₹0 at paid lunch &amp; dinner</span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-800">Age {age} · paid plate</span>
                  )
                ) : null}
              </div>
            );
          })}
          <ul className="space-y-1 rounded-xl bg-sun-50/80 px-3 py-2.5 text-xs text-brown-800/75">
            <li>• Below {kidsPolicy.below_age}: ₹0 at paid lunches &amp; dinners · {kidsPolicy.below_age} and above: paid plate</li>
            <li>• Complimentary breakfasts &amp; Ashtami lunch: the below-{kidsPolicy.below_age} rule doesn&apos;t apply — every kid counts as a regular head (uses the flat&apos;s complimentary meals first)</li>
            <li>• Kids join every meal you pick — change any meal in the cart if a kid skips it</li>
          </ul>
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
                ["breakfast", "Breakfast (Seating)"],
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
            <div>
              <p className="text-sm font-semibold text-brown-900">4. How many people?</p>
              <p className="text-xs text-brown-800/55">
                {!kidsAsked
                  ? "Adults only — we'll ask about kids next."
                  : allKids
                    ? `Adults only — your ${allKids} kid${allKids === 1 ? " is" : "s are"} added automatically.`
                    : "Adults only."}
              </p>
            </div>
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
