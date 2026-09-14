import React from "react";
import { Headset, Phone } from "lucide-react";

const DIGITAL_TEAM = [
  { name: "Rittik Roy", phone: "7356182543" },
  { name: "Suman Saha", phone: "9775112503" },
];

/**
 * Website & tech-support credit — Digital Team (site-wide).
 */
export default function TechSupportBrand({ className = "", compact = false }) {
  if (compact) {
    return (
      <div
        data-testid="tech-support-compact"
        className={`inline-flex flex-col items-center gap-0.5 text-xs text-brown-800/75 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-2 ${className}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <Headset className="h-3.5 w-3.5 text-vermilion-500" />
          <span>
            Digital team ·{" "}
            <span className="font-semibold text-brown-900">Website &amp; tech support</span>
          </span>
        </span>
        <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
          {DIGITAL_TEAM.map((m, i) => (
            <React.Fragment key={m.phone}>
              {i > 0 && <span className="text-brown-800/30" aria-hidden>·</span>}
              <a href={`tel:${m.phone}`} className="hover:text-vermilion-600">
                <span className="font-semibold text-brown-900">{m.name}</span>{" "}
                <span className="font-semibold tracking-wide text-vermilion-600">{m.phone}</span>
              </a>
            </React.Fragment>
          ))}
        </span>
      </div>
    );
  }

  return (
    <aside
      data-testid="tech-support-brand"
      className={`rounded-xl border border-vermilion-500/25 bg-gradient-to-r from-white via-sun-50 to-sky-100 p-4 shadow-sm sm:p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-vermilion-500 text-white shadow-sm">
          <Headset className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-vermilion-500">
            Website &amp; tech support
          </p>
          <p className="mt-0.5 font-display text-xl leading-tight text-brown-900 sm:text-2xl">
            Digital team
          </p>
          <p className="mt-1 text-xs text-brown-800/65">
            For portal, payment page, or login issues on one10events.in
          </p>

          <ul className="mt-3 space-y-2" data-testid="digital-team-list">
            {DIGITAL_TEAM.map((m) => (
              <li
                key={m.phone}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-sun-400/25 pt-2 first:border-t-0 first:pt-0"
              >
                <span className="font-display text-lg leading-none text-brown-900 sm:text-xl">
                  {m.name}
                </span>
                <a
                  href={`tel:${m.phone}`}
                  data-testid={`tech-support-phone-${m.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-vermilion-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-vermilion-600"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {m.phone}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
