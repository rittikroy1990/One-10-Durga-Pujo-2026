import React, { useEffect, useMemo, useState } from "react";
import { Mail, MapPin, Phone, Building2, PenLine } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import TechSupportBrand from "../../components/TechSupportBrand";

/** Authorised signatories under MoA — President, Joint Secretaries, Joint Treasurers. */
const SIGNATORY_ROLES = /^(president|joint secretary|joint treasurer)$/i;

function isSignatory(bearer) {
  const role = (bearer?.designation || "").trim();
  return SIGNATORY_ROLES.test(role);
}

export default function Legal({ type }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get("/config").then((r) => setCfg(r.data)); }, []);

  const org = cfg?.organisation || {};
  const organiser = org.organiser || "ONE 10 EVENT ORGANISING COMMITEE";
  const address = org.address || "One10 Residential Complex, Thakdari, Newtown, Action Area 1, Kolkata – 700102, West Bengal";
  const legalStatus = org.legal_status || "Unregistered voluntary non-profit community association.";
  const sub = cfg?.subscription;
  const camp = cfg?.campaign;

  const signatories = useMemo(
    () => (org.office_bearers || []).filter(isSignatory),
    [org.office_bearers],
  );

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
      title: "Contact",
      body: [
        `For subscriptions, receipts or participation, reach ${organiser}.`,
        "Please do not treat payment screenshots as proof — always use the verified receipt on this portal.",
      ],
    },
  };

  const c = CONTENT[type] || CONTENT.privacy;

  if (type === "contact") {
    return (
      <PublicLayout>
        <section className="border-b border-sun-400/25 bg-gradient-to-b from-sun-50 via-white to-sky-50 pt-20 pb-10">
          <div className="mx-auto max-w-3xl px-4 sm:px-5">
            <p className="text-[10px] uppercase tracking-[0.35em] text-vermilion-500">Committee</p>
            <h1 className="mt-2 font-display text-4xl text-brown-900 sm:text-5xl" data-testid="contact-title">
              Contact
            </h1>
            <p className="mt-2 max-w-xl text-brown-800/70">
              Authorised signatories for committee matters. Address and channels below.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-5">
          <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6" data-testid="contact-org-card">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-vermilion-500/10 text-vermilion-600">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.28em] text-vermilion-500">Organiser</p>
                <h2 className="mt-1 font-display text-2xl text-brown-900 sm:text-3xl">{organiser}</h2>
                {org.legal_status && (
                  <p className="mt-2 text-sm text-brown-800/55">{org.legal_status}</p>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 text-sm text-brown-800/80">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-500" />
                <span>{address}</span>
              </div>
              {org.contact_email && (
                <a href={`mailto:${org.contact_email}`} className="flex items-center gap-2.5 hover:text-vermilion-600">
                  <Mail className="h-4 w-4 shrink-0 text-vermilion-500" />
                  {org.contact_email}
                </a>
              )}
              {org.contact_phone && (
                <div className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-vermilion-500" />
                  <span>{org.contact_phone}</span>
                </div>
              )}
            </div>

            {org.bank_account?.account_number && (
              <div className="mt-5 rounded-xl border border-sun-400/30 bg-sun-50/60 p-4 text-sm">
                <div className="text-[10px] uppercase tracking-[0.2em] text-brown-800/45">Bank account</div>
                <div className="mt-1 font-semibold text-brown-900">{org.bank_account.account_name}</div>
                <div className="mt-1 text-brown-800/75">
                  A/c {org.bank_account.account_number} · IFSC {org.bank_account.ifsc}
                </div>
                <div className="text-brown-800/50">{org.bank_account.bank}</div>
              </div>
            )}

            {(org.bank_operating_mandate || org.authorised_signatories_note) && (
              <p className="mt-4 text-xs leading-relaxed text-brown-800/50">
                {org.authorised_signatories_note || `Bank mandate: ${org.bank_operating_mandate}`}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:p-6" data-testid="office-bearers">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-vermilion-500/10 text-vermilion-600">
                <PenLine className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-vermilion-500">Authorised signatories</p>
                <h2 className="mt-1 font-display text-2xl text-brown-900">Who can sign</h2>
                <p className="mt-1 text-sm text-brown-800/60">
                  President, Joint Secretaries and Joint Treasurers as authorised under the MoA.
                </p>
              </div>
            </div>

            {signatories.length === 0 ? (
              <p className="mt-5 text-sm text-brown-800/50">Signatory list will appear here once published.</p>
            ) : (
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {signatories.map((b) => (
                  <li
                    key={`${b.designation}-${b.name}`}
                    className="rounded-xl border border-sun-400/25 bg-sun-50/50 px-4 py-3"
                    data-testid={`signatory-${(b.designation || "").toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.18em] text-vermilion-500">{b.designation}</div>
                    <div className="mt-1 font-semibold text-brown-900">{b.name}</div>
                    {b.phone && (
                      <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="mt-1 inline-block text-sm text-brown-800/65 hover:text-vermilion-600">
                        {b.phone}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div data-testid="contact-tech-support">
            <TechSupportBrand />
          </div>
        </section>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-5">
        <h1 className="font-display text-4xl text-brown-900 sm:text-5xl">{c.title}</h1>
        <div className="mt-6 space-y-4 leading-relaxed text-brown-800/75">
          {c.body.map((p, i) => <p key={i}>{p}</p>)}
        </div>
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
