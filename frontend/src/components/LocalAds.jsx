import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, MapPin, Sparkles, Store } from "lucide-react";
import api from "../lib/api";
import { adMedia, trackAdClick } from "../lib/adClicks";

export function AdCard({ ad, placement, compact = false, large = false }) {
  const card = adMedia(ad, "card");
  const logo = adMedia(ad, "logo");
  const hasPage = (ad.placements || []).includes("full_page");
  const external = ad.link_type === "external" && ad.link_url;
  const to = hasPage ? `/local-businesses/${ad.slug}` : null;
  const linked = to || external || (ad.link_type === "internal" && ad.link_url);
  const body = large ? (
    <>
      <div className="relative aspect-[1200/630] w-full overflow-hidden bg-sun-50">
        {card ? (
          <img src={card.url} alt={ad.business_name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-vermilion-500/40"><Store className="h-14 w-14" /></div>
        )}
        {ad.featured && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-vermilion-500 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow">
            <Sparkles className="h-3.5 w-3.5" /> Featured
          </span>
        )}
        <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brown-800/70 shadow-sm">Ad</span>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-center gap-3">
          {logo && <img src={logo.url} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-sun-400/30 bg-white object-contain p-1 shadow-sm" loading="lazy" />}
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-vermilion-600">{ad.category}</div>
            <div className="line-clamp-1 font-display text-2xl leading-tight text-brown-900 sm:text-3xl">{ad.business_name}</div>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-[15px] leading-snug text-brown-800/80">{ad.headline}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
          {ad.tower_or_area ? (
            <span className="inline-flex items-center gap-1 text-xs text-brown-800/55"><MapPin className="h-3.5 w-3.5" /> {ad.tower_or_area}</span>
          ) : <span />}
          {linked && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-vermilion-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition group-hover:bg-vermilion-600">
              {to ? "View page" : ad.link_label || "Visit"} <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </>
  ) : (
    <>
      <div className="relative aspect-[1200/630] w-full overflow-hidden bg-sun-50">
        {card ? (
          <img src={card.url} alt={ad.business_name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-vermilion-500/40"><Store className="h-10 w-10" /></div>
        )}
        {ad.featured && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-vermilion-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            <Sparkles className="h-3 w-3" /> Featured
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brown-800/70">Ad</span>
      </div>
      <div className="flex gap-3 p-3">
        {logo && <img src={logo.url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-sun-400/30 bg-white object-contain" loading="lazy" />}
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-vermilion-600">{ad.category}</div>
          <div className={`font-display text-brown-900 ${compact ? "text-lg" : "text-xl"} line-clamp-1`}>{ad.business_name}</div>
          <p className="line-clamp-2 text-xs text-brown-800/65">{ad.headline}</p>
          {!compact && ad.tower_or_area && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-brown-800/50"><MapPin className="h-3 w-3" /> {ad.tower_or_area}</p>
          )}
        </div>
      </div>
    </>
  );
  const cls = large
    ? "group flex h-full flex-col overflow-hidden rounded-3xl border border-sun-400/40 bg-white shadow-card transition hover:border-vermilion-400/60 hover:shadow-lg"
    : "block overflow-hidden rounded-2xl border border-sun-400/30 bg-white shadow-sm transition hover:border-vermilion-400/50 hover:shadow-md";
  const testid = `local-ad-${placement}-${ad.slug || ad.id}`;
  if (to) {
    return <Link to={to} onClick={() => trackAdClick(ad.id, placement)} className={cls} data-testid={testid}>{body}</Link>;
  }
  if (external) {
    return (
      <a href={ad.link_url} target="_blank" rel="noopener noreferrer sponsored" onClick={() => trackAdClick(ad.id, placement)}
        className={cls} data-testid={testid}>{body}</a>
    );
  }
  if (ad.link_type === "internal" && ad.link_url) {
    return <Link to={ad.link_url} onClick={() => trackAdClick(ad.id, placement)} className={cls} data-testid={testid}>{body}</Link>;
  }
  return <div className={cls} data-testid={testid}>{body}</div>;
}

/** Horizontal rail of live ads for Home ("home") or Sponsors ("sponsors"); renders nothing when empty or the flag is off. */
export function LocalAdsRail({ where, eyebrow, title, blurb }) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [edge, setEdge] = useState({ start: true, end: true });
  const track = useRef(null);
  useEffect(() => {
    api.get(`/ads/placements/${where}`).then((r) => setItems(r.data.items || [])).catch(() => setItems([]));
  }, [where]);

  const step = () => {
    const el = track.current;
    const first = el?.firstElementChild;
    return first ? first.getBoundingClientRect().width + 16 : el?.clientWidth || 1;
  };
  const sync = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
    setActive(Math.round(el.scrollLeft / step()));
  }, []);
  useEffect(() => {
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [items, sync]);

  if (!items.length) return null;
  const placement = where === "home" ? "home_strip" : "sponsors_rail";
  const shown = items.slice(0, 12);
  const go = (dir) => track.current?.scrollBy({ left: dir * step(), behavior: "smooth" });
  const arrow = "absolute top-[30%] z-10 grid h-11 w-11 place-items-center rounded-full border border-sun-400/40 bg-white/95 text-brown-900 shadow-card backdrop-blur transition hover:bg-vermilion-500 hover:text-white disabled:pointer-events-none disabled:opacity-35 sm:top-[34%] sm:h-12 sm:w-12";
  return (
    <section className="border-y border-sun-400/25 bg-gradient-to-b from-white to-sun-50 py-12" data-testid={`${where}-local-ads`}>
      <div className="mx-auto max-w-7xl px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-vermilion-500">{eyebrow}</p>
            <h2 className="mt-2 font-display text-3xl text-brown-900 sm:text-4xl">{title}</h2>
            {blurb && <p className="mt-1 max-w-xl text-sm text-brown-800/65">{blurb}</p>}
          </div>
          <div className="flex gap-4 text-sm font-semibold">
            <Link to="/local-businesses" className="inline-flex items-center gap-1 text-vermilion-600 hover:underline">
              See all <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/promote" className="text-brown-800/60 hover:text-vermilion-600">Promote yours</Link>
          </div>
        </div>
        <div className="relative mt-6 w-fit max-w-full">
          <button type="button" aria-label="Previous business" onClick={() => go(-1)} disabled={edge.start}
            className={`${arrow} -left-2 sm:-left-5`} data-testid={`${where}-local-ads-prev`}>
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div ref={track} onScroll={sync}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {shown.map((ad) => (
              <div key={ad.id} className={`shrink-0 snap-start ${shown.length === 1 ? "w-[calc(100vw-2.5rem)] sm:w-[460px]" : "w-[82vw] sm:w-[420px] lg:w-[460px]"}`}>
                <AdCard ad={ad} placement={placement} large />
              </div>
            ))}
          </div>
          <button type="button" aria-label="Next business" onClick={() => go(1)} disabled={edge.end}
            className={`${arrow} -right-2 sm:-right-5`} data-testid={`${where}-local-ads-next`}>
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
        {shown.length > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            {shown.map((ad, i) => (
              <button key={ad.id} type="button" aria-label={`Show ${ad.business_name}`}
                onClick={() => track.current?.scrollTo({ left: i * step(), behavior: "smooth" })}
                className={`h-2 rounded-full transition-all ${i === active ? "w-6 bg-vermilion-500" : "w-2 bg-brown-800/20"}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
