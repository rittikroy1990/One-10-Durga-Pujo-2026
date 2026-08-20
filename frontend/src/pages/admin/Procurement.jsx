import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, GitCompareArrows } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, Button, Tabs, StatusBadge, Spinner } from "../../components/ui";
import ResourceManager from "../../components/ResourceManager";
import { formatPaise } from "../../lib/utils";

const EVENTS = [
  { value: "Khuti Puja", label: "Khuti Puja" }, { value: "Durga Puja", label: "Durga Puja" },
  { value: "Lakshmi Puja", label: "Lakshmi Puja" }, { value: "Kali Puja", label: "Kali Puja" },
  { value: "Bijoya Sammilani", label: "Bijoya Sammilani" }, { value: "Common", label: "Common / shared" },
];
const EXPENSE_ACCOUNTS = [
  ["5010", "Idol/ritual"], ["5020", "Pandal/decor"], ["5030", "Lighting/electrical"], ["5040", "Sound/cultural"],
  ["5050", "Bhog/food"], ["5060", "Security/safety"], ["5070", "Permissions"], ["5080", "Cleaning/waste"],
  ["5090", "Printing/publicity"], ["5100", "Gifts/prizes"], ["5110", "Venue/logistics"], ["5900", "Miscellaneous"],
].map(([value, label]) => ({ value, label: `${value} · ${label}` }));

const toPaise = (r) => Math.round(Number(r || 0) * 100);

export default function Procurement() {
  const [tab, setTab] = useState("budget");
  const approve = (ep, extra) => async (row, reload) => {
    try { await api.post(ep(row), extra || {}); toast.success("Done"); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
  };

  return (
    <div data-testid="procurement-page">
      <h1 className="mb-1 font-display text-4xl">Budget & Procurement</h1>
      <p className="mb-4 text-sm text-brown-800/50">Procure-to-pay with budget checks, thresholds, three-way match and maker-checker.</p>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "budget", label: "Budget vs Actual" }, { value: "pr", label: "Purchase Requests" },
        { value: "po", label: "Purchase Orders" }, { value: "vendors", label: "Vendors" },
        { value: "invoices", label: "Invoices" }, { value: "advances", label: "Advances" },
        { value: "expenses", label: "Expense Claims" },
      ]} />

      {tab === "budget" && <BudgetVsActual />}

      {tab === "pr" && (
        <ResourceManager title="Purchase Request" testid="pr" listEndpoint="/purchase-requests" createEndpoint="/purchase-requests"
          transformCreate={(f) => ({ purpose: f.purpose, event: f.event, account_code: f.account_code, estimate_paise: toPaise(f.estimate_rupees), required_date: f.required_date })}
          createFields={[
            { name: "purpose", label: "Purpose", full: true },
            { name: "event", label: "Event", type: "select", options: EVENTS },
            { name: "account_code", label: "Category", type: "select", options: EXPENSE_ACCOUNTS },
            { name: "estimate_rupees", label: "Estimate (₹)", type: "number" },
            { name: "required_date", label: "Required date" },
          ]}
          columns={[
            { key: "purpose", label: "Purpose" },
            { key: "event", label: "Event" },
            { key: "estimate_paise", label: "Estimate", right: true, render: (r) => formatPaise(r.estimate_paise) },
            { key: "over_budget", label: "Budget", render: (r) => <StatusBadge status={r.over_budget ? "exception" : "approved"} /> },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          extraActions={(row, reload) => row.status === "submitted" && (
            <Button variant="admin" size="sm" data-testid={`pr-approve-${row.id}`} onClick={approve((r) => `/purchase-requests/${r.id}/approve`, { over_budget_exception_reason: row.over_budget ? "Approved with exception" : "" })(row, reload)}><Check className="h-3.5 w-3.5" /> Approve</Button>
          )} />
      )}

      {tab === "po" && (
        <ResourceManager title="Purchase Order" testid="po" listEndpoint="/purchase-orders" createEndpoint="/purchase-orders"
          transformCreate={(f) => ({ pr_id: f.pr_id, vendor_id: f.vendor_id, amount_paise: toPaise(f.amount_rupees) })}
          createFields={[{ name: "pr_id", label: "Approved PR ID" }, { name: "vendor_id", label: "Vendor ID" }, { name: "amount_rupees", label: "Amount (₹)", type: "number" }]}
          columns={[
            { key: "po_no", label: "PO No" }, { key: "vendor_id", label: "Vendor" }, { key: "event", label: "Event" },
            { key: "amount_paise", label: "Amount", right: true, render: (r) => formatPaise(r.amount_paise) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]} />
      )}

      {tab === "vendors" && (
        <ResourceManager title="Vendor" testid="vendor" listEndpoint="/vendors" createEndpoint="/vendors"
          createFields={[
            { name: "legal_name", label: "Legal name" }, { name: "display_name", label: "Display name" },
            { name: "contact", label: "Contact" }, { name: "service_category", label: "Service category" },
            { name: "bank_account_no_masked", label: "Bank a/c (masked)" }, { name: "conflict_declaration", label: "Conflict declaration", full: true },
          ]}
          columns={[
            { key: "display_name", label: "Vendor" }, { key: "service_category", label: "Category" },
            { key: "contact", label: "Contact" }, { key: "verification_status", label: "Verification", render: (r) => <StatusBadge status={r.verification_status === "unverified" ? "pending" : "verified"} /> },
          ]} />
      )}

      {tab === "invoices" && (
        <ResourceManager title="Vendor Invoice" testid="invoice" listEndpoint="/vendor-invoices" createEndpoint="/vendor-invoices"
          transformCreate={(f) => ({ vendor_id: f.vendor_id, invoice_number: f.invoice_number, amount_paise: toPaise(f.amount_rupees), date: f.date, po_id: f.po_id, doc_hash: f.doc_hash })}
          createFields={[
            { name: "vendor_id", label: "Vendor ID" }, { name: "invoice_number", label: "Invoice number" },
            { name: "amount_rupees", label: "Amount (₹)", type: "number" }, { name: "date", label: "Date" },
            { name: "po_id", label: "PO ID" }, { name: "doc_hash", label: "Document hash" },
          ]}
          columns={[
            { key: "invoice_number", label: "Invoice" }, { key: "vendor_id", label: "Vendor" },
            { key: "amount_paise", label: "Amount", right: true, render: (r) => formatPaise(r.amount_paise) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "match_status", label: "3-way", render: (r) => r.match_status ? <StatusBadge status={r.match_status} /> : "—" },
          ]}
          extraActions={(row, reload) => (
            <Button variant="subtle" size="sm" onClick={approve((r) => `/vendor-invoices/${r.id}/three-way-match`)(row, reload)}><GitCompareArrows className="h-3.5 w-3.5" /> Match</Button>
          )} />
      )}

      {tab === "advances" && (
        <ResourceManager title="Advance" testid="advance" listEndpoint="/advances" createEndpoint="/advances"
          transformCreate={(f) => ({ person: f.person, type: f.type, purpose: f.purpose, event: f.event, amount_paise: toPaise(f.amount_rupees), due_date: f.due_date })}
          createFields={[
            { name: "person", label: "Person" }, { name: "type", label: "Type", type: "select", options: [{ value: "member", label: "Member/Volunteer" }, { value: "vendor", label: "Vendor" }] },
            { name: "purpose", label: "Purpose" }, { name: "event", label: "Event", type: "select", options: EVENTS },
            { name: "amount_rupees", label: "Amount (₹)", type: "number" }, { name: "due_date", label: "Due date" },
          ]}
          columns={[
            { key: "person", label: "Person" }, { key: "purpose", label: "Purpose" },
            { key: "amount_paise", label: "Amount", right: true, render: (r) => formatPaise(r.amount_paise) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]} />
      )}

      {tab === "expenses" && (
        <ResourceManager title="Expense Claim" testid="expense" listEndpoint="/expense-claims" createEndpoint="/expense-claims"
          transformCreate={(f) => ({ account_code: f.account_code, purpose: f.purpose, date: f.date, amount_paise: toPaise(f.amount_rupees) })}
          createFields={[
            { name: "purpose", label: "Purpose", full: true }, { name: "account_code", label: "Category", type: "select", options: EXPENSE_ACCOUNTS },
            { name: "amount_rupees", label: "Amount (₹)", type: "number" }, { name: "date", label: "Date" },
          ]}
          columns={[
            { key: "claimant_name", label: "Claimant" }, { key: "purpose", label: "Purpose" },
            { key: "amount_paise", label: "Amount", right: true, render: (r) => formatPaise(r.amount_paise) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          extraActions={(row, reload) => row.status === "submitted" && (
            <Button variant="admin" size="sm" data-testid={`expense-approve-${row.id}`} onClick={approve((r) => `/expense-claims/${r.id}/approve`)(row, reload)}><Check className="h-3.5 w-3.5" /> Approve</Button>
          )} />
      )}
    </div>
  );
}

function BudgetVsActual() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get("/budgets/vs-actual").then((r) => setData(r.data)).finally(() => setLoading(false)); }, []);
  if (loading) return <Spinner className="text-vermilion-500" />;
  return (
    <Card><CardBody>
      {(!data || data.items.length === 0) ? (
        <div className="py-8 text-center text-sm text-brown-800/50">No approved budget yet. Create budget versions via the API/backlog.</div>
      ) : (
        <Table><THead><TR><TH>Event</TH><TH>Account</TH><TH right>Budget</TH><TH right>Committed</TH><TH right>Spent</TH><TH right>Available</TH></TR></THead>
          <tbody>{data.items.map((r, i) => (
            <TR key={i}><TD>{r.event}</TD><TD>{r.account_code}</TD><TD right>{formatPaise(r.budget)}</TD>
              <TD right>{formatPaise(r.committed)}</TD><TD right>{formatPaise(r.spent)}</TD>
              <TD right className={r.available < 0 ? "text-vermilion-600" : ""}>{formatPaise(r.available)}</TD></TR>
          ))}</tbody></Table>
      )}
    </CardBody></Card>
  );
}
