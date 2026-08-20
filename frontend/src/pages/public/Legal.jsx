import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";

const CONTENT = {
  privacy: {
    title: "Privacy Policy",
    body: [
      "The Events Organising Committee (EOC), One10 collects the minimum personal data needed to record your household subscription and issue a verified receipt: primary contact name, mobile number, tower/flat, occupancy type and family size.",
      "We never require age, identity-document numbers, religion or occupation. For children, we collect only what is strictly required for an opted-in activity, with guardian consent.",
      "We never publish a resident-level defaulter list. Public receipt verification shows only masked identity, tower/flat, amount, issue date and validity.",
      "Consent is recorded with version and timestamp. You may request access or correction of your data; posted financial records cannot be altered, but corrections are made through documented reversals.",
      "This is a configurable policy template and requires final EOC/legal confirmation before production use.",
    ],
  },
  terms: {
    title: "Payment & Terms",
    body: [
      "The 2026 per-family subscription is fixed at ₹3,500, comprising ₹2,500 (Khuti/Durga/Lakshmi), ₹300 (Kali Puja) and ₹700 (Bijoya Sammilani).",
      "Additional voluntary donations are recorded separately from the base subscription.",
      "Online payments are processed via Razorpay. A receipt is issued only after the payment is verified server-side — a browser success screen or screenshot is not proof of settlement.",
      "Committee-authorised waivers/concessions, where enabled, follow a separate maker-checker workflow and never masquerade as a paid receipt.",
      "These terms are a configurable template pending EOC confirmation.",
    ],
  },
  refund: {
    title: "Refund Policy",
    body: [
      "Refunds are considered only in genuine cases (e.g., duplicate payment) and require a request, reason and committee approval.",
      "Every approved refund generates a linked credit note and reversal ledger entries. Money is tracked as owed until the payment provider confirms the refund is complete.",
      "Partial refunds preserve the original receipt history; the original receipt is never deleted.",
      "The specific refund window and eligibility rules REQUIRE EOC CONFIRMATION before go-live.",
    ],
  },
  contact: {
    title: "Contact the EOC",
    body: [
      "For any query about your subscription, receipt or participation, please contact the Events Organising Committee.",
      "Committee contact details (email, phone and helpdesk timings) will be confirmed by the EOC and shown here.",
      "Please do not share payment screenshots as proof — always use the verified receipt on this portal.",
    ],
  },
};

export default function Legal({ type }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get("/config").then((r) => setCfg(r.data)); }, []);
  const c = CONTENT[type] || CONTENT.privacy;
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="font-display text-5xl text-ivory-100">{c.title}</h1>
        <div className="mt-6 space-y-4 text-ivory-100/75 leading-relaxed">
          {c.body.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        {type === "contact" && cfg && (
          <div className="mt-8 rounded-xl border border-gold-500/25 bg-brown-700/50 p-5">
            <div className="text-sm text-ivory-100/60">Organiser</div>
            <div className="font-semibold text-ivory-100">{cfg.organisation?.organiser}</div>
            <div className="mt-2 text-sm text-ivory-100/70">Email: {cfg.organisation?.contact_email}</div>
            <div className="text-sm text-ivory-100/70">Phone: {cfg.organisation?.contact_phone}</div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
