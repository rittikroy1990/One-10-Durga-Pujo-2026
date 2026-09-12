import React from "react";
import { Link } from "react-router-dom";

/**
 * Minimal CRED-style invite poster page.
 * Share https://one10events.in/invite on WhatsApp — Subscribe & site link are tappable.
 */
export default function Invite() {
  return (
    <main className="min-h-screen bg-[#FFFAF5] text-[#7A1F2B]">
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col overflow-hidden px-6 pb-10 pt-10 sm:px-10 sm:pt-14">
        {/* Durga figure only (not the full text poster — avoids doubled copy) */}
        <img
          src="/images/one10-bengali-durga-figure.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-[-1rem] hidden max-h-[78vh] w-auto opacity-100 sm:block"
        />

        <div className="relative z-10 max-w-md">
          <h1 className="font-sans text-5xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
            One 10
            <br />
            Durgotsav
            <br />
            2026
          </h1>
          <p className="mt-4 text-sm font-semibold tracking-wide text-[#7A1F2B]/75 sm:text-base">
            organised by EOC
          </p>

          <Link
            to="/subscribe"
            data-testid="invite-subscribe-link"
            className="mt-10 inline-block font-sans text-2xl font-black uppercase tracking-tight text-[#7A1F2B] underline decoration-2 underline-offset-8 transition hover:text-[#C0392B] sm:text-3xl"
          >
            Subscribe &amp; Pay
          </Link>

          <p className="mt-8 text-lg leading-snug text-[#2A1215]/85 sm:text-xl">
            But participate and enjoy.
          </p>
        </div>

        {/* Mobile Durga figure */}
        <div className="relative z-10 mt-8 flex justify-end sm:hidden">
          <img
            src="/images/one10-bengali-durga-figure.jpg"
            alt="Goddess Durga — One 10 Durgotsav 2026"
            className="h-52 w-auto max-w-[70%] object-contain object-bottom"
          />
        </div>

        <div className="relative z-10 mt-auto flex flex-wrap items-end justify-between gap-4 pt-12">
          <a
            href="https://one10events.in"
            data-testid="invite-site-link"
            className="font-sans text-base font-semibold text-[#7A1F2B] underline decoration-2 underline-offset-4 transition hover:text-[#C0392B] sm:text-lg"
          >
            one10events.in
          </a>
        </div>
      </div>
    </main>
  );
}
