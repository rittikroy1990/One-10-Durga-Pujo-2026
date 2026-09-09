import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";

export default function Legal({ type }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get("/config").then((r) => setCfg(r.data)); }, []);

  const org = cfg?.organisation || {};
  const organiser = org.organiser || "Events Organizations Committee of One10";
  const address = org.address || "One10 Residential Complex, Thakdari, Newtown, Action Area 1, Kolkata – 700102, West Bengal";
  const legalStatus = org.legal_status || "Unregistered voluntary non-profit community association.";
  const sub = cfg?.subscription;
  const camp = cfg?.campaign;

  const CONTENT = {
    privacy: {
      title: "Privacy Policy",
      body: [
        `${organiser} (“the Committee”) collects the minimum personal data needed to record your household subscription and issue a verified receipt: primary contact name, mobile number, tower/flat, occupancy type and family size.`,
        "We never require age, identity-document numbers, religion or occupation. For children, we collect only what is strictly required for an opted-in activity, with guardian consent.",
        "We never publish a resident-level defaulter list. Public receipt verification shows only masked identity, tower/flat, amount, issue date and validity.",
        "Consent is recorded with version and timestamp. You may request access or correction of your data; posted financial records cannot be altered, but corrections are made through documented reversals.",
        `The Committee operates as a ${legalStatus.toLowerCase()} Funds and data are used only for approved committee activities.`,
      ],
    },
    terms: {
      title: "Payment & Terms",
      body: [
        `Subscriptions and donations are accepted by ${organiser} as voluntary contributions for community events (including cultural and religious programmes such as Durga Puja, Kali Puja, Saraswati Puja and Diwali Milan, as organised from time to time).`,
        camp?.title && sub
          ? `The current ${camp.title} per-family subscription is ${formatBreakup(sub)}.`
          : "Campaign subscription amounts are shown on the Subscribe page for the active campaign.",
        "Additional voluntary donations are recorded separately from the base subscription. No surplus is distributed to members as profit.",
        "Online payments are processed via UPI QR / bank transfer as shown on the Subscribe page. A receipt is issued only after the payment is verified — a browser success screen or screenshot is not proof of settlement.",
        "Significant expenditure requires advance approval by designated office bearers. Bank operations follow the Committee’s joint-signature mandate.",
      ].filter(Boolean),
    },
    contact: {
      title: "Contact the Committee",
      body: [
        `For queries about subscriptions, receipts or participation, contact ${organiser}.`,
        `Principal address: ${address}.`,
        org.moa_reference ? `Governance reference: ${org.moa_reference}` : null,
        "Please do not share payment screenshots as proof — always use the verified receipt on this portal.",
      ].filter(Boolean),
    },
  };

  const c = CONTENT[type] || CONTENT.privacy;
  const bearers = org.office_bearers || [];

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="font-display text-5xl text-ivory-100">{c.title}</h1>
        <div className="mt-6 space-y-4 text-ivory-100/75 leading-relaxed">
          {c.body.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        {type === "contact" && (
          <div className="mt-8 space-y-6">
            <div className="rounded-xl border border-gold-500/25 bg-brown-700/50 p-5" data-testid="contact-org-card">
              <div className="text-xs uppercase tracking-widest text-gold-400">Organiser</div>
              <div className="mt-1 font-display text-2xl text-ivory-100">{organiser}</div>
              {org.short_name && <div className="text-sm text-ivory-100/60">{org.short_name}</div>}
              <div className="mt-3 text-sm text-ivory-100/70">{address}</div>
              {org.legal_status && <div className="mt-2 text-xs text-ivory-100/50">{org.legal_status}</div>}
              <div className="mt-4 grid gap-1 text-sm text-ivory-100/80 sm:grid-cols-2">
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
                <div>Email: {org.contact_email || "—"}</div>
                <div>Phone: {org.contact_phone || "—"}</div>
                {org.pan && <div>PAN: {org.pan}</div>}
                {org.date_of_formation && <div>Formed: {org.date_of_formation}</div>}
              </div>
              {org.bank_account?.account_number && (
                <div className="mt-4 rounded-lg border border-gold-500/20 bg-brown-900/40 p-3 text-sm">
                  <div className="text-xs uppercase tracking-wider text-gold-400">Bank</div>
                  <div className="mt-1 font-semibold text-ivory-100">{org.bank_account.account_name}</div>
                  <div>A/c {org.bank_account.account_number} · IFSC {org.bank_account.ifsc}</div>
                  <div className="text-ivory-100/50">{org.bank_account.bank}</div>
                </div>
              )}
              {org.bank_operating_mandate && (
                <p className="mt-4 text-xs text-ivory-100/45">Bank mandate: {org.bank_operating_mandate}</p>
              )}
            </div>

            {bearers.length > 0 && (
              <div className="rounded-xl border border-gold-500/20 bg-brown-800/40 p-5" data-testid="office-bearers">
                <div className="text-xs uppercase tracking-widest text-gold-400">Governing committee</div>
                <p className="mt-1 text-sm text-ivory-100/55">
                  {org.governing_body_size || 11} office bearers · term {org.committee_term_years || 1} year
                </p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {bearers.map((b) => (
                    <li key={`${b.designation}-${b.name}`} className="border-b border-gold-500/10 pb-2 text-sm">
                      <div className="font-semibold text-ivory-100">{b.name}</div>
                      <div className="text-xs text-gold-400/90">{b.designation}</div>
                      {b.phone && <div className="text-xs text-ivory-100/55">{b.phone}</div>}
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

function formatBreakup(sub) {
  if (!sub?.base_amount_paise) return "as published on this portal";
  const total = (sub.base_amount_paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const parts = (sub.components || []).map((c) => {
    const a = (c.amount_paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
    return `${a} (${c.label})`;
  });
  return parts.length ? `${total}, comprising ${parts.join("; ")}` : total;
}
