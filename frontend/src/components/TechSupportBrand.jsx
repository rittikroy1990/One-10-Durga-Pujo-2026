import React from "react";
import { Headset, Phone } from "lucide-react";

/**
 * Prominent website & tech-support credit shown site-wide.
 */
export default function TechSupportBrand({ className = "", compact = false }) {
  if (compact) {
    return (
      <a
        href="tel:7356182543"
        data-testid="tech-support-compact"
        className={`inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm text-brown-800/80 hover:text-vermilion-600 ${className}`}
      >
        <Headset className="h-4 w-4 text-vermilion-500" />
        <span>
          Website &amp; tech support · <span className="font-semibold text-brown-900">Rittik Roy</span>
        </span>
        <span className="font-semibold tracking-wide text-vermilion-600">7356182543</span>
      </a>
    );
  }

  return (
    <aside
      data-testid="tech-support-brand"
      className={`rounded-2xl border border-vermilion-500/30 bg-gradient-to-r from-white via-sun-50 to-sky-100 p-5 shadow-sm sm:p-6 ${className}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-vermilion-500 text-white shadow-sm">
            <Headset className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-vermilion-500">
              Website &amp; tech support
            </p>
            <p className="mt-1 font-display text-3xl leading-none text-brown-900 sm:text-4xl">
              Rittik Roy
            </p>
            <p className="mt-2 text-sm text-brown-800/70">
              For portal, payment page, or login issues on one10events.in
            </p>
          </div>
        </div>
        <a
          href="tel:7356182543"
          data-testid="tech-support-phone"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-vermilion-500 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-vermilion-600"
        >
          <Phone className="h-5 w-5" />
          7356182543
        </a>
      </div>
    </aside>
  );
}
