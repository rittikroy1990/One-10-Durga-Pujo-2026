import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, HelpCircle, MapPin, CreditCard, Receipt, UtensilsCrossed,
  CalendarDays, Download, Handshake, Users, ShieldCheck, Building2, Phone,
} from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { formatPaise } from "../../lib/utils";

const DIRECTORY = [
  { to: "/", label: "Home", blurb: "Campaign overview, venue & how to join", icon: HelpCircle },
  { to: "/subscribe", label: "Subscribe & Pay", blurb: "Family subscription · UPI QR / bank transfer", icon: CreditCard },
  { to: "/events", label: "Programme", blurb: "Day-by-day ritual calendar & venue", icon: CalendarDays },
  { to: "/nirghanto", label: "Nirghonto", blurb: "Printable PDF / PNG puja timing cards", icon: Download },
  { to: "/food", label: "Food", blurb: "Community food / meal subscription", icon: UtensilsCrossed },
  { to: "/sponsors", label: "Sponsors", blurb: "Brand partnership packages", icon: Handshake },
  { to: "/participate", label: "Participate", blurb: "Volunteer, perform, family activities", icon: Users },
  { to: "/receipt/find", label: "Find Receipt", blurb: "Look up your verified digital receipt", icon: Receipt },
  { to: "/transparency", label: "Transparency", blurb: "Public finance summary (when published)", icon: ShieldCheck },
  { to: "/contact", label: "Contact", blurb: "Committee phone & address", icon: Phone },
  { to: "/privacy", label: "Privacy", blurb: "What data we collect", icon: ShieldCheck },
  { to: "/terms", label: "Terms", blurb: "Payment & contribution terms", icon: Building2 },
  { to: "/refund-policy", label: "Refunds", blurb: "Duplicate payment / refund process", icon: Receipt },
  { to: "/admin/login", label: "Committee login", blurb: "EOC portal for office bearers", icon: Building2 },
];

const SECTIONS = [
  { id: "find", label: "Where to find things" },
  { id: "subscription", label: "Subscription & amount" },
  { id: "payment", label: "How to pay" },
  { id: "receipts", label: "Receipts & proof" },
  { id: "programme", label: "Programme & Nirghonto" },
  { id: "food", label: "Food subscription" },
  { id: "participate", label: "Participate & sponsors" },
  { id: "committee", label: "Committee & help" },
];

function FaqItem({ q, children, id }) {
  return (
    <details
      id={id}
      className="group rounded-2xl border border-sun-400/35 bg-white p-4 shadow-sm open:border-vermilion-500/35 open:shadow-md"
    >
      <summary className="cursor-pointer list-none font-semibold text-brown-900 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-start justify-between gap-3">
          <span>{q}</span>
          <span className="mt-0.5 shrink-0 text-vermilion-500 transition group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-brown-800/80">{children}</div>
    </details>
  );
}

function PageLink({ to, children }) {
  return (
    <Link to={to} className="font-semibold text-vermilion-600 underline decoration-vermilion-500/30 underline-offset-2 hover:decoration-vermilion-600">
      {children}
    </Link>
  );
}

export default function Faq() {
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    api.get("/config").then((r) => setCfg(r.data)).catch(() => {});
  }, []);

  const org = cfg?.organisation || {};
  const camp = cfg?.campaign || {};
  const sub = cfg?.subscription || {};
  const bank = org.bank_account || {};
  const upi = org.upi || {};
  const amount = formatPaise(sub.base_amount_paise || 350000);
  const components = sub.components || [];
  const venue = camp.venue || "Badminton Court near the Tennis Court, in front of Tower-11";
  const dates = camp.dates_label || "16–21 October 2026";

  const toc = useMemo(() => SECTIONS, []);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-24 sm:pt-28">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-vermilion-500">Help centre</p>
        <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl">FAQ & site guide</h1>
        <p className="mt-3 max-w-2xl text-brown-800/75">
          Everything residents ask — and where to find it on one10events.in for One 10 Durgotsav 2026.
        </p>

        {/* Jump nav */}
        <nav
          className="mt-6 flex flex-wrap gap-2"
          aria-label="FAQ sections"
          data-testid="faq-section-nav"
        >
          {toc.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-sun-400/40 bg-white px-3 py-1.5 text-xs font-semibold text-brown-800/80 hover:border-vermilion-500/40 hover:text-vermilion-600"
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Directory */}
        <section id="find" className="mt-12 scroll-mt-28">
          <h2 className="font-display text-3xl text-brown-900">Where can people find…</h2>
          <p className="mt-1 text-sm text-brown-800/60">Full map of public pages on this portal.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="faq-directory">
            {DIRECTORY.map(({ to, label, blurb, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="group flex gap-3 rounded-2xl border border-sun-400/35 bg-white p-4 shadow-sm transition hover:border-vermilion-500/40 hover:shadow-md"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-vermilion-500/10 text-vermilion-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-semibold text-brown-900 group-hover:text-vermilion-600">
                    {label} <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                  </span>
                  <span className="mt-0.5 block text-xs text-brown-800/60">{blurb}</span>
                  <span className="mt-1 block truncate text-[11px] text-brown-800/40">{to === "/" ? "one10events.in" : `one10events.in${to}`}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Subscription */}
        <section id="subscription" className="mt-14 scroll-mt-28 space-y-3">
          <h2 className="font-display text-3xl text-brown-900">Subscription & amount</h2>

          <FaqItem q={`How much is the family subscription?`} id="faq-amount">
            <p>
              The current per-family subscription for {camp.title || "One 10 Durgotsav 2026"} is{" "}
              <b>{amount}</b>.
            </p>
            {components.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {components.map((c) => (
                  <li key={c.code}>
                    {c.label}: {formatPaise(c.amount_paise)}
                  </li>
                ))}
              </ul>
            )}
            <p>
              Pay and register on <PageLink to="/subscribe">Subscribe & Pay</PageLink>.
            </p>
          </FaqItem>

          <FaqItem q="Who should subscribe?" id="faq-who">
            <p>
              One subscription per household / flat for One10 residents (owner or tenant). Enter the primary
              contact name, mobile, tower and flat on the subscribe form.
            </p>
          </FaqItem>

          <FaqItem q="Can we add a donation?" id="faq-donation">
            <p>
              Yes. On <PageLink to="/subscribe">Subscribe & Pay</PageLink> you can add an optional voluntary
              donation on top of the base {amount}. Donations are recorded separately.
            </p>
          </FaqItem>

          <FaqItem q="Can the same flat pay again?" id="faq-repeat">
            <p>
              Yes — the portal does not block a flat from submitting another payment (for example if you need
              to pay again or correct a failed attempt). Always upload the new UTR / screenshot so the committee
              can verify.
            </p>
          </FaqItem>
        </section>

        {/* Payment */}
        <section id="payment" className="mt-14 scroll-mt-28 space-y-3">
          <h2 className="font-display text-3xl text-brown-900">How to pay</h2>

          <FaqItem q="Where do I pay online?" id="faq-pay-where">
            <p>
              Go to <PageLink to="/subscribe">Subscribe & Pay</PageLink>, fill household details, then on the
              payment step scan the committee UPI QR (or tap Open in UPI app / GPay / PhonePe / Paytm).
            </p>
            <p>Prefer scanning with the UPI app camera if a deep link fails on your phone.</p>
          </FaqItem>

          <FaqItem q="What are the bank account details for NEFT / IMPS / net banking?" id="faq-bank">
            <div className="rounded-xl border border-sun-400/30 bg-sky-50/80 p-3 text-brown-900">
              <div><span className="text-brown-800/50">Account name</span><br /><b>{bank.account_name || "ONE 10 EVENT ORGANISING COMMITTEE"}</b></div>
              <div className="mt-2"><span className="text-brown-800/50">A/C number</span><br /><b>{bank.account_number || "572205000037"}</b></div>
              <div className="mt-2"><span className="text-brown-800/50">IFSC</span><br /><b>{bank.ifsc || "ICIC0005722"}</b></div>
              <div className="mt-2"><span className="text-brown-800/50">Bank</span><br /><b>{bank.bank || "ICICI Bank"}</b></div>
              {(upi.vpa || "8217011245.eazypay@icici") && (
                <div className="mt-2"><span className="text-brown-800/50">UPI ID</span><br /><b>{upi.vpa || "8217011245.eazypay@icici"}</b></div>
              )}
            </div>
            <p className="mt-2">
              Transfer the <b>exact</b> amount, then upload screenshot + UTR on the same Subscribe payment step.
              Bank details are also shown on that page.
            </p>
          </FaqItem>

          <FaqItem q="GPay camera works but tapping the QR fails — what should I do?" id="faq-tap">
            <p>
              Use <b>Scan QR</b> inside GPay / PhonePe / Paytm. The flyer QR is an ICICI EazyPay merchant QR —
              camera scan is the most reliable path. You can also use the app buttons on the payment step.
            </p>
          </FaqItem>

          <FaqItem q="What do I upload after paying?" id="faq-upload">
            <p>
              On the Subscribe payment step, enter the <b>UTR / UPI reference</b> and upload a clear{" "}
              <b>payment screenshot</b>, then tap Upload & get receipt.
            </p>
          </FaqItem>
        </section>

        {/* Receipts */}
        <section id="receipts" className="mt-14 scroll-mt-28 space-y-3">
          <h2 className="font-display text-3xl text-brown-900">Receipts & proof</h2>

          <FaqItem q="Where do I find my receipt?" id="faq-receipt-find">
            <p>
              Use <PageLink to="/receipt/find">Find Receipt</PageLink>. A verified digital receipt is issued
              after the committee (or automatic check) confirms your payment — a screenshot alone is not the
              final receipt.
            </p>
          </FaqItem>

          <FaqItem q="Payment status page?" id="faq-status">
            <p>
              After you submit proof you are taken to a payment status page (linked from your session). You can
              always return via <PageLink to="/receipt/find">Find Receipt</PageLink> once a receipt number is issued.
            </p>
          </FaqItem>

          <FaqItem q="Refunds?" id="faq-refund">
            <p>
              See the <PageLink to="/refund-policy">Refund Policy</PageLink>. Duplicate payments are the usual
              case; contact the committee with your UTR.
            </p>
          </FaqItem>
        </section>

        {/* Programme */}
        <section id="programme" className="mt-14 scroll-mt-28 space-y-3">
          <h2 className="font-display text-3xl text-brown-900">Programme & Nirghonto</h2>

          <FaqItem q="Where is the puja programme / ritual calendar?" id="faq-programme">
            <p>
              <PageLink to="/events">Programme</PageLink> — Sasthi through Dashami timings, venue and dates
              ({dates}).
            </p>
            <p className="inline-flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-500" />
              <span>{venue}</span>
            </p>
          </FaqItem>

          <FaqItem q="Where is the Nirghonto (printable cards)?" id="faq-nirghonto">
            <p>
              <PageLink to="/nirghonto">Nirghonto</PageLink> — download all 4 A5 PDFs (or individual PNG for
              WhatsApp) for door-to-door campaign and home printing.
            </p>
          </FaqItem>
        </section>

        {/* Food */}
        <section id="food" className="mt-14 scroll-mt-28 space-y-3">
          <h2 className="font-display text-3xl text-brown-900">Food subscription</h2>

          <FaqItem q="Where do I register for food / meals?" id="faq-food">
            <p>
              Open <PageLink to="/food">Food</PageLink>, select meals for the published days, and submit with
              your tower / flat details. Follow any payment instructions shown on that page.
            </p>
          </FaqItem>
        </section>

        {/* Participate & sponsors */}
        <section id="participate" className="mt-14 scroll-mt-28 space-y-3">
          <h2 className="font-display text-3xl text-brown-900">Participate & sponsors</h2>

          <FaqItem q="How do I volunteer or perform?" id="faq-participate">
            <p>
              Go to <PageLink to="/participate">Participate</PageLink> and register interest (volunteering,
              performance, family / child / elder activities).
            </p>
          </FaqItem>

          <FaqItem q="Where are sponsorship packages?" id="faq-sponsors">
            <p>
              See <PageLink to="/sponsors">Sponsors</PageLink> for partnership options and committee contact for
              brands.
            </p>
          </FaqItem>
        </section>

        {/* Committee */}
        <section id="committee" className="mt-14 scroll-mt-28 space-y-3">
          <h2 className="font-display text-3xl text-brown-900">Committee & help</h2>

          <FaqItem q="How do committee members log in?" id="faq-committee-login">
            <p>
              Use <PageLink to="/admin/login">Committee login</PageLink> with your short User ID (for example{" "}
              <code className="rounded bg-sky-50 px-1">apc</code>) and the shared committee password. This area
              is for EOC office bearers only.
            </p>
          </FaqItem>

          <FaqItem q="Who do I contact?" id="faq-contact">
            <p>
              Full details on <PageLink to="/contact">Contact</PageLink>.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {(org.primary_contact_name || org.primary_contact_phone) && (
                <li>
                  {org.primary_contact_role || "President"}: {org.primary_contact_name || "Abhijit Chakrabarti"}{" "}
                  {org.primary_contact_phone || "+91 9866136985"}
                </li>
              )}
              {(org.secondary_contact_name || org.secondary_contact_phone) && (
                <li>
                  {org.secondary_contact_role || "Joint Treasurer"}: {org.secondary_contact_name || "APC"}{" "}
                  {org.secondary_contact_phone || "+91 8017600378"}
                </li>
              )}
              <li>Email: {org.contact_email || "one10eventgroup@gmail.com"}</li>
              <li>Address: {org.address || "One10 Residential Complex, Thakdari, Newtown, Action Area 1, Kolkata – 700102"}</li>
            </ul>
          </FaqItem>

          <FaqItem q="Privacy, terms, transparency?" id="faq-legal">
            <p>
              <PageLink to="/privacy">Privacy Policy</PageLink> · <PageLink to="/terms">Payment & Terms</PageLink> ·{" "}
              <PageLink to="/refund-policy">Refund Policy</PageLink> ·{" "}
              <PageLink to="/transparency">Transparency</PageLink>
            </p>
          </FaqItem>
        </section>

        <div className="mt-14 rounded-2xl border border-sun-400/40 bg-gradient-to-r from-sun-50 to-sky-100 p-6 text-center">
          <p className="font-display text-2xl text-brown-900">Ready to subscribe?</p>
          <p className="mt-1 text-sm text-brown-800/70">Pay {amount}, upload proof, get a verified receipt.</p>
          <Link
            to="/subscribe"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-vermilion-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-vermilion-600"
            data-testid="faq-cta-subscribe"
          >
            Subscribe & Pay <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
