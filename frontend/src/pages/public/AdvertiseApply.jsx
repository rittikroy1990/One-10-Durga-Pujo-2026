import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ExternalLink, ImagePlus, Loader2, MapPin, Share2, Upload, XCircle } from "lucide-react";
import api from "../../lib/api";
import { loadAdsCatalog } from "../../lib/adClicks";
import { loadFlats, prefetchFlats } from "../../lib/flats";
import PublicLayout from "../../components/PublicLayout";
import { AdCard } from "../../components/LocalAds";
import { Button, Input, Label, Select, Textarea } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

const EMPTY = {
  package_code: "",
  addons: [],
  business_name: "",
  contact_name: "",
  mobile: "",
  email: "",
  location_scope: "inside_one_ten",
  tower_id: "",
  flat_id: "",
  tower_or_area: "",
  category: "",
  headline: "",
  writeup: "",
  link_type: "none",
  link_url: "",
  link_label: "Visit",
  terms_accepted: false,
};

const PREVIEW_TABS = {
  home_strip: "Home strip",
  directory: "Directory",
  full_page: "Your page",
  takeover: "Top of Home",
  whatsapp: "WhatsApp",
};

function priceFor(catalog, form) {
  const pkg = (catalog?.packages || []).find((p) => p.code === form.package_code);
  if (!pkg) return { total: 0, lines: [] };
  const base = form.location_scope === "outside_one_ten" ? pkg.amount_paise_outside : pkg.amount_paise;
  const lines = [{ label: pkg.name + (form.location_scope === "outside_one_ten" ? " (outside One Ten)" : ""), amount: base }];
  for (const code of form.addons) {
    const a = (catalog.addons || []).find((x) => x.code === code);
    if (!a || !(a.eligible_packages || []).includes(pkg.code)) continue;
    lines.push({ label: a.name, amount: (a.amount_paise_by_package || {})[pkg.code] || a.amount_paise || 0 });
  }
  return { total: lines.reduce((s, l) => s + l.amount, 0), lines };
}

function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error("unreadable")); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

function readVideoSeconds(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(url); };
    v.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    v.src = url;
  });
}

async function checkCreative(spec, kind, file, tolerance) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!(spec.formats || []).includes(ext)) {
    return `${spec.label} must be ${(spec.formats || []).filter((f) => f !== "jpeg").join("/").toUpperCase()}.`;
  }
  if (file.size > spec.max_mb * 1024 * 1024) return `${spec.label} must be under ${spec.max_mb} MB.`;
  if (kind === "video") {
    const secs = await readVideoSeconds(file);
    if (secs && secs > (spec.max_seconds || 30) + 0.5) return `Video must be ${spec.max_seconds || 30} seconds or shorter (yours is ${Math.round(secs)}s).`;
    return "";
  }
  try {
    const { width, height } = await readImageSize(file);
    const okW = Math.abs(width - spec.width) <= spec.width * tolerance;
    const okH = Math.abs(height - spec.height) <= spec.height * tolerance;
    if (!okW || !okH) return `${spec.label} must be ${spec.width}×${spec.height} px (yours is ${width}×${height}).`;
  } catch {
    return `${spec.label} is not a readable image.`;
  }
  return "";
}

function Section({ n, title, hint, children, testid }) {
  return (
    <section className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm sm:p-6" data-testid={testid}>
      <h2 className="font-display text-2xl text-brown-900">
        <span className="mr-2 text-vermilion-500">{n}.</span>{title}
      </h2>
      {hint && <p className="mt-1 text-sm text-brown-800/60">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function CreativeSlot({ kind, spec, required, state, onPick }) {
  const accept = kind === "video" ? "video/mp4,video/webm,video/quicktime" : (spec.formats || []).map((f) => `.${f}`).join(",");
  const ok = state && (state.status === "ready" || state.status === "done");
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition hover:border-vermilion-400/60 ${
        state?.status === "error" ? "border-vermilion-500/50 bg-vermilion-500/5" : "border-sun-400/30 bg-sun-50/40"
      }`}
      data-testid={`ad-media-${kind}`}
    >
      <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-sun-400/30 bg-white">
        {ok && state.url ? (
          kind === "video"
            ? <video src={state.url} muted playsInline className="h-full w-full object-cover" />
            : <img src={state.url} alt="" className="h-full w-full object-contain" />
        ) : (
          <ImagePlus className="h-6 w-6 text-vermilion-500/50" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-brown-900">
            {spec.label} {required ? <span className="text-vermilion-500">*</span> : <span className="text-xs font-normal text-brown-800/50">(optional)</span>}
          </div>
          {ok && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {state.status === "done" ? "Uploaded" : "Size OK"}</span>}
          {state?.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-vermilion-500" />}
          {state?.status === "error" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-vermilion-600"><XCircle className="h-4 w-4" /> Not accepted</span>}
        </div>
        <div className="text-xs text-brown-800/55">
          {spec.width ? `${spec.width}×${spec.height} px` : `${spec.resolution}, up to ${spec.max_seconds}s`} · {(spec.formats || []).filter((f) => f !== "jpeg").join("/").toUpperCase()} · max {spec.max_mb} MB
        </div>
        <div className="mt-1 truncate text-xs text-brown-800/60">{state?.name || "Tap to choose a file"}</div>
        {state?.error && <p className="mt-1 text-xs font-medium text-vermilion-600">{state.error}</p>}
        <input
          type="file"
          className="sr-only"
          accept={accept}
          data-testid={kind === "card" ? "ad-media" : `ad-media-input-${kind}`}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(kind, f); e.target.value = ""; }}
        />
      </div>
    </label>
  );
}

function Placeholder({ label, className = "" }) {
  return (
    <div className={`grid place-items-center bg-gradient-to-br from-sun-100 to-sun-200 text-center text-xs font-semibold text-brown-800/50 ${className}`}>
      {label}
    </div>
  );
}

function PhoneFrame({ children }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.2rem] border-[10px] border-brown-950 bg-sky-50 shadow-xl">
      <div className="mx-auto h-5 w-24 rounded-b-2xl bg-brown-950" />
      <div className="max-h-[560px] overflow-y-auto px-3 pb-4 pt-2">{children}</div>
    </div>
  );
}

function PagePreview({ ad, urls, story }) {
  const cta = ad.link_type !== "none" && ad.link_url;
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-brown-800/50">← Local businesses</div>
      {urls.hero || urls.card
        ? <img src={urls.hero || urls.card} alt="" className="aspect-video w-full rounded-xl object-cover" />
        : <Placeholder label="Hero banner 1920×1080" className="aspect-video w-full rounded-xl" />}
      <div className="flex items-start gap-3">
        {urls.logo
          ? <img src={urls.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-sun-400/30 bg-white object-contain p-0.5" />
          : <Placeholder label="Logo" className="h-12 w-12 shrink-0 rounded-xl" />}
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-vermilion-600">{ad.category || "Category"} · Paid ad</div>
          <div className="font-display text-2xl leading-tight text-brown-900">{ad.business_name || "Your business"}</div>
          <p className="text-xs text-brown-800/75">{ad.headline || "Your headline"}</p>
          {ad.tower_or_area && <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-brown-800/55"><MapPin className="h-3 w-3" />{ad.tower_or_area}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        {cta && (
          <span className="inline-flex items-center gap-1 rounded-full bg-vermilion-500 px-3 py-1.5 text-xs font-semibold text-white">
            {ad.link_label || "Visit"} {ad.link_type === "external" && <ExternalLink className="h-3 w-3" />}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full border border-vermilion-400/50 bg-white px-3 py-1.5 text-xs font-semibold text-brown-900"><Share2 className="h-3 w-3" /> Share</span>
      </div>
      <div className={story && (urls.story_vertical || urls.video) ? "grid grid-cols-[1fr_96px] gap-2" : ""}>
        <div className="whitespace-pre-wrap rounded-xl border border-sun-400/30 bg-white p-3 text-xs text-brown-800/85">{ad.writeup || "Your write-up appears here."}</div>
        {story && (urls.story_vertical || urls.video) && (
          <div className="space-y-2">
            {urls.story_vertical && <img src={urls.story_vertical} alt="" className="w-full rounded-lg object-cover" />}
            {urls.video && <video src={urls.video} muted playsInline controls className="w-full rounded-lg bg-black" />}
          </div>
        )}
      </div>
    </div>
  );
}

function WhatsAppPreview({ ad, urls }) {
  return (
    <div className="-mx-3 -mt-2 min-h-[420px] bg-[#ece5dd]">
      <div className="bg-[#075e54] px-3 py-3 text-white">
        <div className="text-sm font-semibold">One10 Residents</div>
        <div className="text-[10px] text-white/70">Durgotsav committee</div>
      </div>
      <div className="p-3">
        <div className="rounded-xl bg-white p-2 shadow-sm">
          {urls.card
            ? <img src={urls.card} alt="" className="aspect-[1200/630] w-full rounded-lg object-cover" />
            : <Placeholder label="Card image 1200×630" className="aspect-[1200/630] w-full rounded-lg" />}
          <p className="mt-2 text-xs text-brown-900">
            Pujo partners this year: <b>{ad.business_name || "Your business"}</b> — {ad.headline || "your headline"}.
          </p>
          <p className="mt-1 text-xs text-[#1e6ec8]">one10events.in/local-businesses</p>
          <p className="mt-1 text-right text-[10px] text-brown-800/40">10:30</p>
        </div>
      </div>
    </div>
  );
}

function LivePreview({ pkg, ad, urls }) {
  const tabs = useMemo(() => {
    if (!pkg) return [];
    const p = pkg.placements || [];
    const out = [];
    if (p.includes("takeover")) out.push("takeover");
    else if (p.includes("home_strip")) out.push("home_strip");
    if (p.includes("full_page")) out.push("full_page");
    else if (p.includes("directory")) out.push("directory");
    if (p.includes("takeover")) out.push("whatsapp");
    return out;
  }, [pkg]);
  const [tab, setTab] = useState("");
  useEffect(() => { setTab(tabs[0] || ""); }, [tabs]);

  if (!pkg) {
    return (
      <div className="rounded-2xl border border-dashed border-sun-400/50 bg-white/70 p-6 text-center text-sm text-brown-800/60">
        Pick a package to see how your promotion will look.
      </div>
    );
  }

  const cardAd = { ...ad, id: "preview", featured: !!pkg.featured, link_type: "none", placements: [] };
  const card = <AdCard ad={cardAd} placement="preview" compact />;

  return (
    <div data-testid="ad-live-preview">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${t === tab ? "bg-vermilion-500 text-white" : "bg-white text-brown-900 ring-1 ring-sun-400/40 hover:ring-vermilion-400/60"}`}
            data-testid={`ad-preview-tab-${t}`}
          >
            {PREVIEW_TABS[t]}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <PhoneFrame>
          {(tab === "home_strip" || tab === "takeover") && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-vermilion-600">Neighbourhood</div>
              <div className="font-display text-xl text-brown-900">Local businesses</div>
              <div className={tab === "takeover" ? "rounded-2xl ring-4 ring-sun-400" : ""}>{card}</div>
              {tab === "takeover"
                ? <span className="inline-block rounded-full bg-sun-400 px-2 py-0.5 text-[10px] font-bold uppercase text-brown-900">First spot till 30 Nov</span>
                : <p className="text-[11px] text-brown-800/55">Shares the Home strip rotation with other businesses.</p>}
            </div>
          )}
          {tab === "directory" && (
            <div className="space-y-2">
              <div className="font-display text-xl text-brown-900">Local businesses</div>
              <div className="rounded-lg border border-sun-400/30 bg-white px-2 py-1.5 text-[11px] text-brown-800/40">Search name or offer</div>
              {card}
            </div>
          )}
          {tab === "full_page" && <PagePreview ad={ad} urls={urls} story={(pkg.placements || []).includes("story_layout")} />}
          {tab === "whatsapp" && <WhatsAppPreview ad={ad} urls={urls} />}
        </PhoneFrame>
      </div>
    </div>
  );
}

export default function AdvertiseApply() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resumeToken = (params.get("token") || params.get("resubmit") || "").trim();
  const [catalog, setCatalog] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [loadingResume, setLoadingResume] = useState(!!resumeToken);
  const [adId, setAdId] = useState("");
  const [token, setToken] = useState("");
  const [isResubmit, setIsResubmit] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [media, setMedia] = useState({});
  const [quote, setQuote] = useState(null);
  const [hasProof, setHasProof] = useState(false);
  const [amountPaid, setAmountPaid] = useState(null);
  const [utr, setUtr] = useState("");
  const [proof, setProof] = useState(null);
  const [canWaive, setCanWaive] = useState(false);
  const [waive, setWaive] = useState(false);
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);

  const presetPackage = (params.get("package") || "").trim();
  useEffect(() => {
    loadAdsCatalog().then((c) => {
      setCatalog(c);
      if (!resumeToken && (c?.packages || []).some((p) => p.code === presetPackage)) {
        setForm((prev) => (prev.package_code ? prev : { ...prev, package_code: presetPackage }));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get("/towers").then((r) => { setTowers(r.data.items || []); prefetchFlats(r.data.items); }).catch(() => setTowers([]));
    api.get("/ads/payment-waiver").then((r) => setCanWaive(!!r.data.allowed)).catch(() => setCanWaive(false));
  }, []);
  useEffect(() => {
    if (form.tower_id) loadFlats(form.tower_id).then(setFlats).catch(() => setFlats([]));
    else setFlats([]);
  }, [form.tower_id]);

  useEffect(() => {
    if (!resumeToken) return undefined;
    let cancelled = false;
    api.get(`/ads/status/${resumeToken}`)
      .then(({ data: d }) => {
        if (cancelled) return;
        if (!d.can_edit) {
          navigate(`/promote/status/${resumeToken}`, { replace: true });
          return;
        }
        setForm({
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, d[k] ?? EMPTY[k]])),
          addons: d.addons || [],
          terms_accepted: true,
        });
        setAdId(d.id);
        setToken(d.status_token);
        setIsResubmit(d.status !== "draft");
        setReviewNotes(d.review_notes || "");
        setMedia(Object.fromEntries((d.media || []).map((m) => [m.kind, { status: "done", name: m.original_name, url: m.url }])));
        setHasProof(!!(d.payment_utr && d.payment_proof_doc_id));
        setAmountPaid(d.payment_utr ? d.amount_paise : null);
        setUtr(d.payment_utr || "");
        setWaive(!!d.payment_waived);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Could not load that application.");
          navigate("/promote", { replace: true });
        }
      })
      .finally(() => { if (!cancelled) setLoadingResume(false); });
    return () => { cancelled = true; };
  }, [resumeToken, navigate]);

  const packages = catalog?.packages || [];
  const selected = useMemo(() => packages.find((p) => p.code === form.package_code), [packages, form.package_code]);
  const price = useMemo(() => priceFor(catalog, form), [catalog, form]);
  const eligibleAddons = (catalog?.addons || []).filter((a) => selected && (a.eligible_packages || []).includes(selected.code));
  const specs = catalog?.creative_specs || {};
  const limits = catalog?.copy_limits || {};
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const toggleAddon = (code) => set("addons", form.addons.includes(code) ? form.addons.filter((c) => c !== code) : [...form.addons, code]);
  const inside = form.location_scope === "inside_one_ten";

  useEffect(() => {
    if (!selected) return;
    const ok = new Set(eligibleAddons.map((a) => a.code));
    if (form.addons.some((c) => !ok.has(c))) set("addons", form.addons.filter((c) => ok.has(c)));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form.package_code) { setQuote(null); return; }
    const q = {
      package_code: form.package_code, location_scope: form.location_scope, addons: form.addons.join(","),
      flat_id: form.location_scope === "inside_one_ten" ? form.flat_id : "",
    };
    api.get("/ads/quote", { params: q }).then((r) => setQuote(r.data)).catch(() => setQuote(null));
  }, [form.package_code, form.location_scope, form.addons, form.flat_id]);

  const towerName = towers.find((t) => t.id === form.tower_id)?.name || "";
  const flatNo = flats.find((f) => f.id === form.flat_id)?.number || "";
  const location = inside
    ? [towerName, flatNo && `Flat ${flatNo}`].filter(Boolean).join(", ")
    : form.tower_or_area.trim();

  const urls = Object.fromEntries(Object.entries(media).filter(([, m]) => m.url && m.status !== "error").map(([k, m]) => [k, m.url]));
  const previewAd = {
    business_name: form.business_name.trim(),
    category: form.category,
    headline: form.headline.trim(),
    writeup: form.writeup.trim(),
    tower_or_area: location,
    link_type: form.link_type,
    link_url: form.link_url,
    link_label: form.link_label,
    media: Object.entries(urls).map(([kind, url]) => ({ kind, url })),
  };

  const required = selected?.required_media || [];
  const optional = selected?.optional_media || [];
  const haveMedia = (k) => media[k]?.status === "ready" || media[k]?.status === "done";
  const missingMedia = required.filter((k) => !haveMedia(k));
  const total = quote?.amount_paise ?? price.total;
  const free = quote?.amount_paise === 0;
  const waived = !free && canWaive && waive;
  const needProof = !free && !waived && (!hasProof || (amountPaid != null && amountPaid < total));

  const problems = [];
  if (!form.package_code) problems.push("package");
  if (!form.business_name.trim()) problems.push("business name");
  if (!form.category) problems.push("category");
  if (!form.contact_name.trim()) problems.push("contact name");
  if (!/^[6-9]\d{9}$/.test(form.mobile)) problems.push("10-digit mobile");
  if (inside && (!form.tower_id || !form.flat_id)) problems.push("tower and flat");
  if (!form.headline.trim()) problems.push("headline");
  if (!form.writeup.trim()) problems.push("write-up");
  if (form.link_type !== "none" && !form.link_url.trim()) problems.push("button link");
  if (missingMedia.length) problems.push(...missingMedia.map((k) => (specs[k]?.label || k).toLowerCase()));
  if (needProof && utr.trim().length < 6) problems.push("UTR");
  if (needProof && !proof) problems.push("payment screenshot");
  if (!form.terms_accepted && !isResubmit) problems.push("confirmation tick");

  const pickCreative = async (kind, file) => {
    const error = await checkCreative(specs[kind], kind, file, catalog?.dimension_tolerance || 0.02);
    setMedia((m) => {
      if (m[kind]?.file && m[kind]?.url) URL.revokeObjectURL(m[kind].url);
      return {
        ...m,
        [kind]: error ? { status: "error", name: file.name, error } : { status: "ready", name: file.name, file, url: URL.createObjectURL(file) },
      };
    });
    if (error) toast.error(error);
  };

  const submit = async () => {
    if (problems.length) { toast.error(`Still needed: ${problems.join(", ")}`); return; }
    setBusy(true);
    let id = adId;
    let tok = token;
    try {
      setProgress("Saving details…");
      const body = { ...form, tower_or_area: location };
      if (id && tok) {
        const { data } = await api.put(`/ads/applications/${id}`, { ...body, status_token: tok });
        const kept = new Set((data.media || []).map((m) => m.kind));
        setMedia((prev) => Object.fromEntries(Object.entries(prev).filter(([k, m]) => m.status === "ready" || kept.has(k))));
      } else {
        const { data } = await api.post("/ads/applications", body);
        id = data.id;
        tok = data.status_token;
        setAdId(id);
        setToken(tok);
        try { localStorage.setItem("one10_ad_status_token", tok); } catch { /* storage blocked */ }
      }

      for (const kind of [...required, ...optional]) {
        const m = media[kind];
        if (m?.status !== "ready") continue;
        setProgress(`Uploading ${(specs[kind]?.label || kind).toLowerCase()}…`);
        setMedia((prev) => ({ ...prev, [kind]: { ...prev[kind], status: "uploading" } }));
        const fd = new FormData();
        fd.append("status_token", tok);
        fd.append("kind", kind);
        fd.append("file", m.file);
        try {
          await api.post(`/ads/applications/${id}/media`, fd);
          setMedia((prev) => ({ ...prev, [kind]: { ...prev[kind], status: "done" } }));
        } catch (err) {
          const msg = err?.response?.status === 413 ? "File too large to upload." : (err?.response?.data?.detail || "Upload failed.");
          setMedia((prev) => ({ ...prev, [kind]: { ...prev[kind], status: "error", error: msg } }));
          throw new Error(msg);
        }
      }

      if (proof && needProof) {
        setProgress("Uploading payment proof…");
        const fd = new FormData();
        fd.append("status_token", tok);
        fd.append("utr", utr.trim());
        fd.append("screenshot", proof);
        await api.post(`/ads/applications/${id}/payment-proof`, fd);
      }
      setProgress("Submitting…");
      await api.post(`/ads/applications/${id}/submit`, { status_token: tok, waive_payment: waived });
      toast.success(isResubmit ? "Resubmitted for committee review." : "Submitted for committee review. Bookmark the next page to track it.");
      navigate(`/promote/status/${tok}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || "Submit failed.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const qrSrc = quote?.qr_url || quote?.payment?.static_qr_url || "/images/payment-qr.png";

  if (loadingResume || !catalog) {
    return (
      <PublicLayout>
        <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-vermilion-500" /></div>
      </PublicLayout>
    );
  }

  if (!catalog.apply_open && !adId) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-2xl px-5 py-20 text-center" data-testid="advertise-apply-closed">
          <h1 className="font-display text-4xl text-brown-900">Promote your business at One10</h1>
          <p className="mt-4 text-brown-800/75">{catalog.flag_off_message}</p>
          <Link to="/promote" className="mt-6 inline-block text-vermilion-600 hover:underline">See packages</Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-7xl px-5 py-10">
        <Link to="/promote" className="inline-flex items-center gap-2 text-sm text-brown-800/70 hover:text-vermilion-600">
          <ArrowLeft className="h-4 w-4" /> Packages & sizes
        </Link>
        <h1 className="mt-4 font-display text-4xl text-brown-900">{isResubmit ? "Update & resubmit" : "Promote your business"}</h1>
        <p className="mt-2 text-brown-800/70">
          {isResubmit ? "One resubmit is allowed. Fix the points below, then submit again — no need to pay again unless the amount changes."
            : "One page: pick a package, add your details and creative, pay, and submit. The preview updates as you type."}
        </p>
        {isResubmit && reviewNotes && (
          <div className="mt-4 rounded-xl border border-gold-500/40 bg-sun-100 px-4 py-3 text-sm text-brown-900" data-testid="ad-resubmit-notes">
            <span className="font-semibold">Committee notes: </span>{reviewNotes}
          </div>
        )}
        {catalog.preview && (
          <p className="mt-3 inline-block rounded-lg bg-sun-200 px-3 py-2 text-xs text-brown-900">Committee preview — promotions are switched off for the public.</p>
        )}

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Section n={1} title="Package" testid="ad-section-package">
              <div className="inline-flex rounded-full bg-sun-50 p-1 ring-1 ring-sun-400/30" role="radiogroup" aria-label="Where is the business?">
                {[["inside_one_ten", "Inside One Ten"], ["outside_one_ten", "Outside One Ten (+50%)"]].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={form.location_scope === v}
                    onClick={() => set("location_scope", v)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${form.location_scope === v ? "bg-white text-brown-900 shadow-sm" : "text-brown-800/60"}`}
                    data-testid={`ad-scope-${v}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Package">
                {packages.map((p) => {
                  const on = p.code === form.package_code;
                  return (
                    <button
                      key={p.code}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set("package_code", p.code)}
                      className={`flex flex-col rounded-xl border p-4 text-left transition ${on ? "border-vermilion-500 bg-vermilion-500/5 ring-2 ring-vermilion-500/30" : "border-sun-400/30 hover:border-vermilion-400/50"}`}
                      data-testid={`ad-package-${p.code}`}
                    >
                      <span className="font-display text-xl text-brown-900">{p.name}</span>
                      <span className="mt-1 font-display text-2xl text-vermilion-600">{formatPaise(inside ? p.amount_paise : p.amount_paise_outside)}</span>
                      <span className="mt-2 text-xs text-brown-800/65">{p.description}</span>
                      {p.free_for_subscribers && (
                        <span className="mt-2 inline-block w-fit rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">Free for One Ten subscribers</span>
                      )}
                      {p.max_concurrent ? <span className="mt-2 text-[11px] text-brown-800/45">Only {p.max_concurrent} at a time</span> : null}
                    </button>
                  );
                })}
              </div>
              {!!eligibleAddons.length && (
                <div className="rounded-xl bg-sun-50/70 p-3" data-testid="ad-addons">
                  <div className="text-sm font-semibold text-brown-900">Add-ons</div>
                  {eligibleAddons.map((a) => (
                    <label key={a.code} className="mt-2 flex items-start gap-2 text-sm text-brown-800/80">
                      <input type="checkbox" checked={form.addons.includes(a.code)} onChange={() => toggleAddon(a.code)} data-testid={`ad-addon-${a.code}`} />
                      <span>{a.name} — {formatPaise((a.amount_paise_by_package || {})[selected.code] || a.amount_paise)}<span className="block text-xs text-brown-800/55">{a.description}</span></span>
                    </label>
                  ))}
                </div>
              )}
            </Section>

            <Section n={2} title="Your business" testid="ad-section-business">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label required>Business name</Label>
                  <Input data-testid="ad-business-name" maxLength={limits.business_name || 80} value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
                </div>
                <div>
                  <Label required>Category</Label>
                  <Select data-testid="ad-category" value={form.category} onChange={(e) => set("category", e.target.value)}>
                    <option value="">Select category</option>
                    {(catalog.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div>
                  <Label required>Contact name</Label>
                  <Input data-testid="ad-contact-name" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
                </div>
                <div>
                  <Label required>Mobile</Label>
                  <Input data-testid="ad-mobile" inputMode="numeric" value={form.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                {inside ? (
                  <>
                    <div>
                      <Label required>Tower</Label>
                      <Select data-testid="ad-tower" value={form.tower_id} onChange={(e) => setForm((prev) => ({ ...prev, tower_id: e.target.value, flat_id: "" }))}>
                        <option value="">Select tower</option>
                        {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label required>Flat</Label>
                      <Select data-testid="ad-flat" value={form.flat_id} onChange={(e) => set("flat_id", e.target.value)} disabled={!form.tower_id}>
                        <option value="">Select flat</option>
                        {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
                      </Select>
                    </div>
                  </>
                ) : (
                  <div className="sm:col-span-2">
                    <Label>Area / address</Label>
                    <Input value={form.tower_or_area} onChange={(e) => set("tower_or_area", e.target.value)} placeholder="e.g. Newtown Action Area 1" />
                  </div>
                )}
              </div>
              {inside && <p className="text-xs text-brown-800/55">Tower and flat show on your card and page so neighbours can find you.</p>}
            </Section>

            <Section n={3} title="What your promotion says" testid="ad-section-copy">
              <div>
                <Label required>Headline</Label>
                <Input data-testid="ad-headline" maxLength={limits.headline || 120} value={form.headline} onChange={(e) => set("headline", e.target.value)} />
                <p className={`mt-1 text-xs ${form.headline.length > (limits.headline_recommended || 40) ? "text-gold-600" : "text-brown-800/50"}`}>
                  {form.headline.length} characters · {limits.headline_recommended || 40} or fewer reads best on cards
                </p>
              </div>
              <div>
                <Label required>Write-up</Label>
                <Textarea data-testid="ad-writeup" rows={4} maxLength={limits.writeup || 2000} value={form.writeup} onChange={(e) => set("writeup", e.target.value)} />
                <p className="mt-1 text-xs text-brown-800/50">{form.writeup.length} characters · shown on your page{selected && !(selected.placements || []).includes("full_page") ? " (Spotlight and above)" : ""}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Button links to</Label>
                  <Select value={form.link_type} onChange={(e) => set("link_type", e.target.value)} data-testid="ad-link-type">
                    <option value="none">No button</option>
                    <option value="external">WhatsApp / website</option>
                    <option value="internal">A page on this site</option>
                  </Select>
                </div>
                {form.link_type !== "none" && (
                  <>
                    <div>
                      <Label required>Link</Label>
                      <Input value={form.link_url} onChange={(e) => set("link_url", e.target.value.trim())} placeholder={form.link_type === "external" ? "https://wa.me/919XXXXXXXXX" : "/food"} data-testid="ad-link-url" />
                    </div>
                    <div>
                      <Label>Button text</Label>
                      <Input maxLength={limits.link_label || 24} value={form.link_label} onChange={(e) => set("link_label", e.target.value)} placeholder="WhatsApp" />
                    </div>
                  </>
                )}
              </div>
            </Section>

            <Section n={4} title="Creative" hint={selected ? "Sizes are checked as you pick each file. Files upload when you submit." : "Pick a package first — it decides which files we need."} testid="ad-section-creative">
              {selected && [...required, ...optional].map((k) => specs[k] && (
                <CreativeSlot key={k} kind={k} spec={specs[k]} required={required.includes(k)} state={media[k]} onPick={pickCreative} />
              ))}
            </Section>

            <Section n={5} title={free ? "Free for subscribers" : `Pay ${formatPaise(total)}`} testid="ad-section-pay">
              {!selected ? (
                <p className="text-sm text-brown-800/60">Pick a package to see the amount and UPI QR.</p>
              ) : (
                <>
                  <div className="rounded-xl bg-sun-50/70 p-4 text-sm">
                    {(quote?.price_lines || price.lines.map((l) => ({ label: l.label, amount_paise: l.amount }))).map((l) => (
                      <div key={l.label} className="flex justify-between"><span>{l.label}</span><span>{formatPaise(l.amount_paise ?? l.amount)}</span></div>
                    ))}
                    <div className="mt-2 flex justify-between border-t border-sun-400/30 pt-2 font-semibold text-brown-900"><span>Total</span><span data-testid="ad-total">{formatPaise(total)}</span></div>
                  </div>
                  {free ? (
                    <p className="rounded-xl border border-emerald-600/25 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="ad-subscriber-free">
                      <span className="font-semibold">{location || "This flat"} has a paid 2026 Pujo subscription</span>, so the {selected.name} is free.
                      No payment needed — just submit.
                    </p>
                  ) : selected.free_for_subscribers && (
                    <p className="text-sm text-brown-800/70" data-testid="ad-subscriber-hint">
                      {!inside ? "Free only for One Ten flats with a paid Pujo subscription."
                        : !form.flat_id ? "Free for One Ten subscribers — pick your tower and flat above to check."
                          : <>This flat doesn't show a paid 2026 subscription yet. <Link to="/subscribe" className="font-semibold text-vermilion-600 hover:underline">Subscribe</Link> and it becomes free, or pay below.</>}
                    </p>
                  )}
                  {!free && canWaive && (
                    <label className="flex items-start gap-2 rounded-xl border border-gold-500/40 bg-sun-100 px-4 py-3 text-sm text-brown-900" data-testid="ad-waive">
                      <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} data-testid="ad-waive-payment" />
                      <span>
                        <span className="font-semibold">Skip payment (committee waiver)</span>
                        <span className="block text-xs text-brown-800/60">Only your account sees this. No UTR or screenshot needed, and publishing posts no income entry.</span>
                      </span>
                    </label>
                  )}
                  {free || waived ? null : !needProof ? (
                    <p className="text-sm text-brown-800/70">Payment proof already on file (UTR {utr}). Upload a new one only if asked.</p>
                  ) : (
                    <p className="text-sm text-brown-800/70">{catalog.rules?.payment_note}</p>
                  )}
                  {!free && !waived && (<>
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <img src={qrSrc} alt="Committee UPI QR" className="h-44 w-44 rounded-lg border border-sun-400/30 bg-white object-contain p-1" data-testid="ad-pay-qr" />
                    <div className="space-y-1 text-sm text-brown-800/80">
                      <div>Amount: <span className="font-semibold text-brown-900">{formatPaise(total)}</span></div>
                      {quote?.payment?.vpa && <div>UPI ID: <span className="font-semibold text-brown-900">{quote.payment.vpa}</span></div>}
                      {quote?.payment?.payee_name && <div>Payee: {quote.payment.payee_name}</div>}
                      {!quote?.qr_url && <div className="text-xs text-brown-800/55">Enter the amount yourself after scanning.</div>}
                      {quote?.payment?.upi_intent_url && (
                        <a href={quote.payment.upi_intent_url} className="mt-2 inline-block rounded-full bg-vermilion-500 px-4 py-2 text-xs font-semibold text-white sm:hidden">Open UPI app</a>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label required={needProof}>UTR / UPI reference</Label>
                      <Input data-testid="ad-utr" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="12-digit UTR" />
                    </div>
                    <div>
                      <Label required={needProof}>Payment screenshot</Label>
                      <Input data-testid="ad-payment-proof" type="file" accept="image/*,application/pdf" onChange={(e) => setProof(e.target.files?.[0] || null)} />
                    </div>
                  </div>
                  </>)}
                </>
              )}
            </Section>

            <div className="space-y-4 rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm sm:p-6">
              {!isResubmit && (
                <label className="flex items-start gap-2 text-sm text-brown-800/80">
                  <input type="checkbox" checked={form.terms_accepted} onChange={(e) => set("terms_accepted", e.target.checked)} data-testid="ad-terms" />
                  I confirm this is a {free ? "subscriber" : "paid"} promotion, the content is accurate and follows the content policy, and the One Ten committee may approve, ask for changes, or reject it.
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" size="lg" data-testid="ad-submit-btn" disabled={busy} onClick={submit}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {busy ? progress || "Working…" : isResubmit ? "Resubmit for review" : "Submit for review"}
                </Button>
                {!!problems.length && !busy && (
                  <span className="text-xs text-brown-800/55" data-testid="ad-still-needed">Still needed: {problems.join(", ")}</span>
                )}
              </div>
            </div>
          </div>

          <aside className="lg:sticky lg:top-36">
            <div className="rounded-2xl border border-sun-400/30 bg-sun-50/60 p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl text-brown-900">Live preview</h2>
                {selected && <span className="text-xs font-semibold text-vermilion-600">{selected.name}</span>}
              </div>
              <LivePreview pkg={selected} ad={previewAd} urls={urls} />
            </div>
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
}
