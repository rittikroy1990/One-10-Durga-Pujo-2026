import React, { useState } from "react";
import { Tabs, StatusBadge } from "../../components/ui";
import ResourceManager from "../../components/ResourceManager";

export default function Operations() {
  const [tab, setTab] = useState("volunteers");
  return (
    <div data-testid="operations-page">
      <h1 className="mb-1 font-display text-4xl">Participation & Operations</h1>
      <p className="mb-4 text-sm text-brown-800/50">Volunteers, performers, sponsors, inventory, incidents and announcements.</p>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "volunteers", label: "Volunteers" }, { value: "performers", label: "Performers" },
        { value: "sponsors", label: "Sponsors" }, { value: "inventory", label: "Inventory" },
        { value: "incidents", label: "Incidents" }, { value: "announcements", label: "Announcements" },
      ]} />

      {tab === "volunteers" && (
        <ResourceManager title="Volunteer" testid="vol" listEndpoint="/volunteers" createEndpoint="/volunteers"
          createFields={[{ name: "name", label: "Name" }, { name: "mobile", label: "Mobile" }, { name: "skills", label: "Skills" }, { name: "availability", label: "Availability" }]}
          columns={[{ key: "name", label: "Name" }, { key: "skills", label: "Skills" }, { key: "source", label: "Source" }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />
      )}
      {tab === "performers" && (
        <ResourceManager title="Performance" testid="perf" listEndpoint="/performances" createEndpoint="/performances"
          createFields={[{ name: "act_title", label: "Act title" }, { name: "category", label: "Category" }, { name: "participants", label: "Participants" }, { name: "duration", label: "Duration" }]}
          columns={[{ key: "act_title", label: "Act" }, { key: "category", label: "Category" }, { key: "review_status", label: "Review", render: (r) => <StatusBadge status={r.review_status || "pending"} /> }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />
      )}
      {tab === "sponsors" && (
        <ResourceManager title="Sponsor" testid="spon" listEndpoint="/sponsors" createEndpoint="/sponsors"
          transformCreate={(f) => ({ ...f, cash_amount_paise: Math.round(Number(f.cash_rupees || 0) * 100) })}
          createFields={[{ name: "name", label: "Sponsor name" }, { name: "package", label: "Package" }, { name: "cash_rupees", label: "Cash amount (₹)", type: "number" }, { name: "contact_owner", label: "Contact owner" }]}
          columns={[{ key: "name", label: "Sponsor" }, { key: "package", label: "Package" }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />
      )}
      {tab === "inventory" && (
        <ResourceManager title="Inventory Item" testid="inv" listEndpoint="/inventory_items" createEndpoint="/inventory_items"
          transformCreate={(f) => ({ ...f, quantity: Number(f.quantity || 0) })}
          createFields={[{ name: "name", label: "Item" }, { name: "quantity", label: "Quantity", type: "number" }, { name: "custodian", label: "Custodian" }, { name: "storage_location", label: "Location" }]}
          columns={[{ key: "name", label: "Item" }, { key: "quantity", label: "Qty", right: true }, { key: "custodian", label: "Custodian" }, { key: "storage_location", label: "Location" }]} />
      )}
      {tab === "incidents" && (
        <ResourceManager title="Incident" testid="inc" listEndpoint="/incidents" createEndpoint="/incidents"
          createFields={[{ name: "type", label: "Type" }, { name: "location", label: "Location" }, { name: "reporter", label: "Reporter" }, { name: "response", label: "Response", type: "textarea", full: true }]}
          columns={[{ key: "type", label: "Type" }, { key: "location", label: "Location" }, { key: "reporter", label: "Reporter" }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />
      )}
      {tab === "announcements" && (
        <ResourceManager title="Announcement" testid="ann" listEndpoint="/announcements" createEndpoint="/announcements"
          transformCreate={(f) => ({ title: f.title, body: f.body, published: f.published === "true" })}
          createFields={[{ name: "title", label: "Title", full: true }, { name: "body", label: "Body", type: "textarea", full: true }, { name: "published", label: "Publish?", type: "select", options: [{ value: "true", label: "Publish now" }, { value: "false", label: "Draft" }] }]}
          columns={[{ key: "title", label: "Title" }, { key: "published", label: "Published", render: (r) => <StatusBadge status={r.published ? "active" : "pending"} /> }]} />
      )}
    </div>
  );
}
