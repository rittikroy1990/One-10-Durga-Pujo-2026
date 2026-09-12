import React from "react";
import { Link } from "react-router-dom";

/**
 * Minimal CRED-style invite poster page.
 * Share https://one10events.in/invite on WhatsApp — Subscribe & site link are tappable.
 */
export default function Invite() {
  return (
    <main className="min-h-screen bg-[#FFFAF5] text-[#7A1F2B]">
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-6 pb-10 pt-10 sm:px-10 sm:pt-14">
        {/* Poster artwork as soft backdrop on the right (desktop) */}
        <img
          src="/images/one10-durgotsav-whatsapp-share.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 hidden max-h-[72vh] w-auto opacity-95 sm:block"
        />

        <div className="relative z-10 max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7A1F2B]/70">
            3rd year
          </p>
          <h1 className="mt-4 font-sans text-5xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
            One 10
            <br />
            Durgotsav
            <br />
            2026
          </h1>

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
          <p className="mt-2 font-display text-2xl text-[#2A1215] sm:text-3xl">
            সবার পুজো
          </p>
        </div>

        {/* Mobile Durga image */}
        <div className="relative z-10 mt-10 flex justify-end sm:hidden">
          <img
            src="/images/one10-durgotsav-whatsapp-share.png"
            alt="Goddess Durga — One 10 Durgotsav 2026"
            className="h-56 w-56 rounded-2xl object-cover object-right-bottom shadow-sm"
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
          <p className="max-w-[14rem] text-right text-xs leading-relaxed text-[#5C3530]/55">
            Subscribe if you can.
            <br />
            Come either way.
          </p>
        </div>
      </div>
    </main>
  );
}
