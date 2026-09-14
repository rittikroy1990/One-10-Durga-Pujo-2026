import React from "react";
import { Link } from "react-router-dom";
import { Share2, X, Sparkles, Users, Gift } from "lucide-react";
import { useFootfall } from "../context/FootfallContext";

function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN");
}

function nextMilestoneLabel(stats) {
  return stats?.next_milestone_label || (stats?.next_milestone != null ? fmt(stats.next_milestone) : null);
}

/** WhatsApp share — 2000th-visit prize push (no named prizes). */
export function buildFootfallShareText(visitNumber, stats) {
  const entry = visitNumber ? fmt(visitNumber) : null;
  const total = stats?.total_label || (stats?.total != null ? fmt(stats.total) : null);
  const next = nextMilestoneLabel(stats);

  const lines = [
    "🪔 One 10 Digital Pandal Meter",
    "",
    entry
      ? `This is Digital Pandal visit #${entry} at One 10 Durgotsav 2026!`
      : "I just joined the One 10 Digital Pandal!",
    total ? `Live meter: ${total} visits and climbing.` : null,
    next
      ? `Whoever is the lucky ${next}th visitor — share your visit on WhatsApp and you'll receive a prize!`
      : "Share your Digital Pandal visit on WhatsApp and you'll receive a prize!",
    "",
    "Join the digital pandal → https://one10events.in",
  ].filter((x) => x != null);

  return lines.join("\n");
}

export function FootfallTopBar({ className = "" }) {
  const { stats, visitNumber } = useFootfall();
  const today = stats?.today_label || fmt(stats?.today);
  const total = stats?.total_label || fmt(stats?.total);
  const next = nextMilestoneLabel(stats);

  return (
    <Link
      to="/transparency"
      data-testid="footfall-top-bar"
      className={`block bg-gradient-to-r from-vermilion-600 via-vermilion-500 to-amber-500 text-white shadow-md transition hover:brightness-105 ${className}`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-2 sm:justify-between sm:px-5 sm:py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative grid h-8 w-8 place-items-center rounded-full bg-white/20">
            <Users className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300 ring-2 ring-vermilion-500" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/85">
              Digital pandal meter
            </p>
            <p className="font-display text-sm text-white sm:text-base">
              {next
                ? `Achieve next milestone ${next} · Share on WhatsApp to get a prize`
                : "Share on WhatsApp to get a prize"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <span className="inline-flex items-baseline gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80">Today</span>
            <span className="font-body text-xl font-bold tabular-nums leading-none tracking-tight sm:text-2xl" data-testid="footfall-today">
              {stats ? today : "…"}
            </span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 rounded-full bg-white px-3 py-1 text-vermilion-600 shadow-sm">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-vermilion-500/80">All-time</span>
            <span className="font-body text-xl font-bold tabular-nums leading-none tracking-tight sm:text-2xl" data-testid="footfall-total">
              {stats ? total : "…"}
            </span>
          </span>
          {visitNumber ? (
            <span className="hidden text-xs font-medium tabular-nums text-white/90 sm:inline">
              Visit #{fmt(visitNumber)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function FootfallHeroStrip({ className = "" }) {
  const { stats, visitNumber } = useFootfall();
  if (!stats?.total) return null;
  const next = nextMilestoneLabel(stats);
  return (
    <p
      className={`mt-3 text-center text-xs text-brown-800/55 sm:mt-4 sm:text-left sm:text-sm ${className}`}
      data-testid="footfall-hero-strip"
    >
      <span className="font-semibold text-brown-900">{stats.total_label || fmt(stats.total)} visits</span>
      {next ? (
        <>
          {" · Achieve next milestone "}
          <span className="font-semibold text-vermilion-600">{next}</span>
          {" · Share on WhatsApp to get a prize"}
        </>
      ) : (
        " · Share on WhatsApp to get a prize"
      )}
      {visitNumber ? (
        <span className="text-brown-800/40"> · Digital Pandal visit #{fmt(visitNumber)}</span>
      ) : null}
    </p>
  );
}

export function FootfallMeter({ variant = "footer", className = "" }) {
  const { stats } = useFootfall();
  if (!stats) return null;

  const inner = (
    <>
      <Users className="h-3.5 w-3.5 shrink-0 text-vermilion-500" />
      <span className="font-medium text-brown-900">Digital pandal meter</span>
      <span className="text-brown-800/35" aria-hidden>·</span>
      <span>
        Today <span className="font-semibold tabular-nums text-brown-900">{stats.today_label || fmt(stats.today)}</span>
      </span>
      <span className="text-brown-800/35" aria-hidden>·</span>
      <span>
        All-time <span className="font-semibold tabular-nums text-vermilion-600">{stats.total_label || fmt(stats.total)}</span>
      </span>
    </>
  );

  if (variant === "floating") {
    return (
      <Link
        to="/transparency"
        data-testid="footfall-meter-floating"
        className={`fixed bottom-4 left-4 z-40 hidden max-w-[min(100%-2rem,20rem)] items-center gap-1.5 rounded-full border border-sun-400/40 bg-white/95 px-3 py-2 text-[11px] text-brown-800/70 shadow-md backdrop-blur transition hover:border-vermilion-500/40 hover:text-brown-900 sm:inline-flex ${className}`}
      >
        {inner}
      </Link>
    );
  }

  return (
    <Link
      to="/transparency"
      data-testid="footfall-meter-footer"
      className={`mt-4 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-sun-400/35 bg-white/80 px-3 py-2 text-xs text-brown-800/70 transition hover:border-vermilion-500/35 hover:text-brown-900 ${className}`}
    >
      {inner}
    </Link>
  );
}

export function FootfallWelcomeCard() {
  const { showWelcome, visitNumber, dismissWelcome, stats } = useFootfall();
  if (!showWelcome || !visitNumber) return null;

  const shareText = encodeURIComponent(buildFootfallShareText(visitNumber, stats));
  const next = nextMilestoneLabel(stats);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 sm:bottom-6 sm:p-0"
      data-testid="footfall-welcome-card"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-sun-400/40 bg-white p-4 shadow-xl sm:p-5">
        <button
          type="button"
          onClick={dismissWelcome}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-brown-800/40 hover:bg-sun-50 hover:text-brown-900"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="pr-8 text-[10px] font-semibold uppercase tracking-[0.22em] text-vermilion-500">
          Welcome
        </p>
        <p className="mt-1 font-display text-2xl leading-tight text-brown-900">
          Digital Pandal visit #{fmt(visitNumber)}
        </p>
        <p className="mt-2 text-sm text-brown-800/70">
          Welcome to One 10 Durgotsav — you are Digital Pandal visit #{fmt(visitNumber)}.
          {next ? (
            <>
              {" "}
              Help us reach the{" "}
              <span className="font-semibold tabular-nums text-vermilion-600">{next}</span>
              {" "}milestone — share on WhatsApp and you'll receive a prize.
            </>
          ) : (
            <> Share on WhatsApp and you'll receive a prize.</>
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${shareText}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            data-testid="footfall-whatsapp-share"
          >
            <Share2 className="h-3.5 w-3.5" /> Share on WhatsApp
          </a>
          <button
            type="button"
            onClick={dismissWelcome}
            className="rounded-full border border-brown-800/15 px-3.5 py-2 text-sm font-medium text-brown-800/70 hover:bg-sun-50"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

export function FootfallMilestoneBanner() {
  const { milestoneBanner, dismissMilestone, stats } = useFootfall();
  if (!milestoneBanner) return null;
  const at = typeof milestoneBanner === "object" ? milestoneBanner.at : milestoneBanner;
  const label = fmt(at);
  return (
    <div
      className="fixed inset-x-0 top-[6.5rem] z-[55] flex justify-center px-3 sm:top-28"
      data-testid="footfall-milestone-banner"
    >
      <div className="flex max-w-xl items-start gap-3 rounded-xl border border-gold-500/40 bg-gradient-to-r from-sun-50 via-white to-sky-50 px-4 py-3 shadow-lg">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-gold-500" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-snug text-brown-900 sm:text-xl">
            We’ve crossed {label} visits — thank you, One 10.
          </p>
          <p className="mt-0.5 text-xs text-brown-800/55">
            Share on WhatsApp and you will get a prize. All-time: {stats?.total_label || fmt(stats?.total)}
          </p>
        </div>
        <button
          type="button"
          onClick={dismissMilestone}
          className="rounded-lg p-1 text-brown-800/40 hover:bg-white hover:text-brown-900"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function FootfallPrizeLadder({ prizeNote, className = "" }) {
  const { stats } = useFootfall();
  const next = nextMilestoneLabel(stats);
  return (
    <div className={className} data-testid="footfall-prize-ladder">
      <div className="mb-2 flex items-center gap-2">
        <Gift className="h-4 w-4 text-vermilion-500" />
        <h3 className="font-display text-lg text-brown-900">Share &amp; win</h3>
      </div>
      <p className="text-sm text-brown-800/70">
        {next ? (
          <>
            Achieve next milestone{" "}
            <span className="font-semibold tabular-nums text-vermilion-600">{next}</span>
            {" · "}
          </>
        ) : null}
        {prizeNote || "Share on WhatsApp to get a prize."}
      </p>
      <div className="mt-3">
        <FootfallShareButton />
      </div>
    </div>
  );
}

export function FootfallShareButton({ className = "" }) {
  const { visitNumber, stats } = useFootfall();
  const shareText = encodeURIComponent(buildFootfallShareText(visitNumber, stats));
  return (
    <a
      href={`https://wa.me/?text=${shareText}`}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 ${className}`}
      data-testid="footfall-share-meter"
    >
      <Share2 className="h-3.5 w-3.5" /> Share meter on WhatsApp
    </a>
  );
}

export function FootfallDayChart({ series, className = "" }) {
  const rows = series || [];
  const max = Math.max(1, ...rows.map((r) => Number(r.count) || 0));
  if (!rows.length) {
    return <p className="text-sm text-brown-800/50">Visit data will appear as the meter climbs.</p>;
  }
  return (
    <div className={`space-y-2 ${className}`} data-testid="footfall-day-chart">
      {rows.map((r) => {
        const c = Number(r.count) || 0;
        const pct = Math.round((c / max) * 100);
        const label = (() => {
          try {
            const [y, m, d] = String(r.date).split("-").map(Number);
            return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            });
          } catch {
            return r.date;
          }
        })();
        return (
          <div key={r.date} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-sm">
            <span className="text-xs text-brown-800/55">{label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-sun-100">
              <div
                className="h-full rounded-full bg-vermilion-500/85 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-right text-xs font-semibold tabular-nums text-brown-900">{fmt(c)}</span>
          </div>
        );
      })}
    </div>
  );
}
