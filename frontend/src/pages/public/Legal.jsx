import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import TechSupportBrand from "../../components/TechSupportBrand";

/** Policy pages required for Cashfree domain whitelisting (+ privacy). */
export default function Legal({ type }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get("/config").then((r) => setCfg(r.data)); }, []);

  const org = cfg?.organisation || {};
  const organiser = org.organiser || "Events Organizations Committee of One10";
  const address = org.address || "One10 Residential Complex, Thakdari, Newtown, Action Area 1, Kolkata – 700102, West Bengal";
  const legalStatus = org.legal_status || "Unregistered voluntary non-profit community association.";
  const sub = cfg?.subscription;
  const camp = cfg?.campaign;
  const campaignTitle = camp?.title || "One 10 Durgotsav 2026";

  const CONTENT = {
    privacy: {
      title: "Privacy Policy",
      eyebrow: "Data protection",
      body: [
        `${organiser} (“the Committee”) collects the minimum personal data needed to record your household subscription and issue a verified receipt: primary contact name, mobile number, tower/flat, occupancy type and family size.`,
        "We never require age, identity-document numbers, religion or occupation. For children, we collect only what is strictly required for an opted-in activity, with guardian consent.",
        "We never publish a resident-level defaulter list. Public receipt verification shows only masked identity, tower/flat, amount, issue date and validity.",
        "Consent is recorded with version and timestamp. You may request access or correction of your data; posted financial records cannot be altered, but corrections are made through documented reversals.",
        `The Committee operates as a ${legalStatus.toLowerCase()} Funds and data are used only for approved committee activities.`,
      ],
    },
    terms: {
      title: "Terms & Conditions",
      eyebrow: "Payment & participation",
      body: [
        `These Terms & Conditions govern payments and participation for community programmes organised by ${organiser} at One10, Newtown (Kolkata), including Durga Puja, Kali Puja, Bijoya Sammilani and related festival activities.`,
        "By paying a household subscription, making a donation, or registering interest for food / activities on this website (https://one10events.in), you agree to these terms.",
        "Subscriptions and donations are voluntary contributions toward community festivals. No surplus is distributed to members as profit.",
        "Online payments may be processed via Cashfree Payment Gateway, UPI QR, or bank transfer as shown on the Subscribe / Donate pages. A receipt is issued only after payment is verified — a browser success screen or screenshot alone is not proof of settlement.",
        "Significant expenditure requires advance approval by designated office bearers. Bank operations follow the Committee’s joint-signature mandate.",
        "Refunds and cancellations are governed by our Refunds & Cancellations policy.",
      ],
    },
    refunds: {
      title: "Refunds & Cancellations",
      eyebrow: "Payment policy",
      body: [
        `Payments to ${organiser} are voluntary contributions toward community festivals and related committee activities.`,
        "Household subscription and donation payments are generally non-refundable once a verified receipt has been issued, because funds are committed to festival procurement and operations.",
        "If a payment was duplicated, made in error, or not credited to the correct household, write to the Committee with your receipt number / UTR within 7 days of payment. Eligible cases may be corrected by transfer to the right account, credit note, or refund after convenor approval.",
        "Online gateway payments (including Cashfree) that fail or are cancelled before success are not charged; incomplete checkouts do not create a receipt.",
        "Approved refunds are processed to the original payment method or the committee bank channel used, typically within 7–14 working days after approval.",
        `For refund queries contact ${organiser} via the Contact Us page on this website, quoting your receipt number and mobile.`,
      ],
    },
    contact: {
      title: "Contact Us",
      eyebrow: "Get in touch",
      body: [
        `For queries about subscriptions, donations, receipts, food registration or participation, contact ${organiser}.`,
        `Principal address: ${address}.`,
        org.moa_reference ? `Governance reference: ${org.moa_reference}` : null,
        "Please do not share payment screenshots as proof — always use the verified receipt on this portal.",
      ].filter(Boolean),
    },
  };

  const c = CONTENT[type] || CONTENT.privacy;
  const bearers = org.office_bearers || [];
  const showPricing = type === "terms" || type === "contact";

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-vermilion-500">{c.eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl" data-testid={`legal-title-${type}`}>
          {c.title}
        </h1>

        <div className="mt-6 space-y-4 text-base leading-relaxed text-brown-800/75">
          {c.body.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        {showPricing && (
          <div className="mt-8 rounded-2xl border border-sun-400/35 bg-white p-5 shadow-sm" data-testid="legal-services-pricing">
            <h2 className="font-display text-2xl text-brown-900">Services & pricing (INR)</h2>
            <p className="mt-2 text-sm leading-relaxed text-brown-800/70">
              Products / services offered on this website for {campaignTitle}. All amounts are in Indian Rupees (₹ / INR).
            </p>
            <ul className="mt-4 space-y-3 text-sm text-brown-900">
              <li className="rounded-xl border border-sun-400/25 bg-sun-50/60 px-4 py-3">
                <div className="font-semibold">Household festival subscription</div>
                <div className="mt-1 text-brown-800/70">
                  Per-family contribution for {campaignTitle}
                  {sub?.base_amount_paise
                    ? <> — <span className="font-semibold text-vermilion-600">{formatPaise(sub.base_amount_paise)}</span></>
                    : " — as published on Subscribe"}
                </div>
                {(sub?.components || []).length > 0 && (
                  <ul className="mt-2 space-y-1 text-brown-800/65">
                    {sub.components.map((comp) => (
                      <li key={comp.code || comp.label} className="flex justify-between gap-3">
                        <span>{comp.label}</span>
                        <span className="shrink-0 tabular-nums font-medium">{formatPaise(comp.amount_paise)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/subscribe" className="mt-2 inline-block text-sm font-semibold text-vermilion-600 underline-offset-2 hover:underline">
                  Open Subscribe →
                </Link>
              </li>
              <li className="rounded-xl border border-sun-400/25 bg-sun-50/60 px-4 py-3">
                <div className="font-semibold">Voluntary donation / sponsorship</div>
                <div className="mt-1 text-brown-800/70">
                  Any amount in INR toward festival funds or brand sponsorship packages (amounts shown at checkout).
                </div>
                <Link to="/sponsors" className="mt-2 inline-block text-sm font-semibold text-vermilion-600 underline-offset-2 hover:underline">
                  Open Donate / Sponsorship →
                </Link>
              </li>
              <li className="rounded-xl border border-sun-400/25 bg-sun-50/60 px-4 py-3">
                <div className="font-semibold">Community food meal plan</div>
                <div className="mt-1 text-brown-800/70">
                  Interest registration and subscription for festival meals. Meal prices in INR are marked TBC until payment opens; register on the Food page.
                </div>
                <Link to="/food" className="mt-2 inline-block text-sm font-semibold text-vermilion-600 underline-offset-2 hover:underline">
                  Open Food →
                </Link>
              </li>
            </ul>
          </div>
        )}

        {type === "terms" && (
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link className="font-semibold text-vermilion-600 underline-offset-2 hover:underline" to="/refunds">Refunds & Cancellations</Link>
            <Link className="font-semibold text-vermilion-600 underline-offset-2 hover:underline" to="/contact">Contact Us</Link>
            <Link className="font-semibold text-vermilion-600 underline-offset-2 hover:underline" to="/privacy">Privacy Policy</Link>
          </div>
        )}

        {type === "refunds" && (
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link className="font-semibold text-vermilion-600 underline-offset-2 hover:underline" to="/terms">Terms & Conditions</Link>
            <Link className="font-semibold text-vermilion-600 underline-offset-2 hover:underline" to="/contact">Contact Us</Link>
          </div>
        )}

        {type === "contact" && (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm" data-testid="contact-org-card">
              <div className="text-[10px] uppercase tracking-[0.25em] text-vermilion-500">Organiser</div>
              <div className="mt-1 font-display text-2xl text-brown-900">{organiser}</div>
              {org.short_name && <div className="text-sm text-brown-800/60">{org.short_name}</div>}
              <div className="mt-3 text-sm text-brown-800/75">{address}</div>
              {org.legal_status && <div className="mt-2 text-xs text-brown-800/50">{org.legal_status}</div>}
              <div className="mt-4 grid gap-1 text-sm text-brown-900 sm:grid-cols-2">
                {(org.primary_contact_name || org.primary_contact_role) && (
                  <div className="sm:col-span-2">
                    {org.primary_contact_name}{org.primary_contact_role ? ` (${org.primary_contact_role})` : ""}
                    {org.primary_contact_phone ? ` · ${org.primary_contact_phone}` : ""}
                  </div>
                )}
                {(org.secondary_contact_name || org.secondary_contact_phone) && (
                  <div className="sm:col-span-2">
                    {org.secondary_contact_name}{org.secondary_contact_role ? ` (${org.secondary_contact_role})` : ""}
                    {org.secondary_contact_phone ? ` · ${org.secondary_contact_phone}` : ""}
                  </div>
                )}
                <div>Email: {org.contact_email || "one10eventgroup@gmail.com"}</div>
                <div>Phone: {org.contact_phone || "+91 9866136985 / +91 8017600378"}</div>
                <div className="sm:col-span-2">Website: https://one10events.in</div>
                {org.pan && <div>PAN: {org.pan}</div>}
                {org.date_of_formation && <div>Formed: {org.date_of_formation}</div>}
              </div>
              {org.bank_account?.account_number && (
                <div className="mt-4 rounded-lg border border-sun-400/25 bg-sky-50/80 p-3 text-sm">
                  <div className="text-[10px] uppercase tracking-wider text-vermilion-500">Bank</div>
                  <div className="mt-1 font-semibold text-brown-900">{org.bank_account.account_name}</div>
                  <div>A/c {org.bank_account.account_number} · IFSC {org.bank_account.ifsc}</div>
                  <div className="text-brown-800/50">{org.bank_account.bank}</div>
                </div>
              )}
              {org.bank_operating_mandate && (
                <p className="mt-4 text-xs text-brown-800/45">Bank mandate: {org.bank_operating_mandate}</p>
              )}
            </div>

            <div data-testid="contact-tech-support">
              <TechSupportBrand />
            </div>

            {bearers.length > 0 && (
              <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-sm" data-testid="office-bearers">
                <div className="text-[10px] uppercase tracking-[0.25em] text-vermilion-500">Governing committee</div>
                <p className="mt-1 text-sm text-brown-800/55">
                  {org.governing_body_size || 11} office bearers · term {org.committee_term_years || 1} year
                </p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {bearers.map((b) => (
                    <li key={`${b.designation}-${b.name}`} className="border-b border-sun-400/20 pb-2 text-sm">
                      <div className="font-semibold text-brown-900">{b.name}</div>
                      <div className="text-xs text-vermilion-600/90">{b.designation}</div>
                      {b.phone && <div className="text-xs text-brown-800/55">{b.phone}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

function formatPaise(paise) {
  const n = Number(paise || 0) / 100;
  return n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}
