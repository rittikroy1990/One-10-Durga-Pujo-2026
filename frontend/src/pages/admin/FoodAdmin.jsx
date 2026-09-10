import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, Button, StatusBadge, Spinner } from "../../components/ui";
import ExportCsvButton from "../../components/ExportCsvButton";
import { formatDateIST } from "../../lib/utils";

function selectionSummary(row) {
  const sels = row.selections || [];
  if (!sels.length) return "—";
  return sels
    .map((s) => `${s.day_label || s.day_code} ${s.meal_label || s.meal_code}`)
    .join("; ");
}

function paymentLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "paid" || s === "captured" || s === "settled") return "paid";
  if (s === "not_open") return "unpaid";
  return status || "unpaid";
}

const COLS = [
  { key: "name", label: "Name" },
  { key: "mobile", label: "Mobile" },
  { key: "household", label: "Household", exportValue: (r) => `${r.tower_name || ""}, ${r.flat_number || ""}` },
  { key: "family_members", label: "People" },
  { key: "selection_count", label: "Meals" },
  { key: "meals_detail", label: "Meal details", exportValue: selectionSummary },
  { key: "payment_status", label: "Payment" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Subscribed at", exportValue: (r) => formatDateIST(r.created_at) },
];

export default function FoodAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/food-subscriptions")
      .then((r) => setItems(r.data.items || []))
      .catch(() => toast.error("Could not load food subscriptions"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const stats = useMemo(() => {
    const total = items.length;
    const people = items.reduce((n, r) => n + (Number(r.family_members) || 1), 0);
    const paid = items.filter((r) => ["paid", "captured", "settled"].includes((r.payment_status || "").toLowerCase())).length;
    const unpaid = total - paid;
    const meals = items.reduce((n, r) => n + (Number(r.selection_count) || 0), 0);
    return { total, people, paid, unpaid, meals };
  }, [items]);

  return (
    <div data-testid="food-admin-page">
      <h1 className="mb-1 font-display text-4xl">Food subscriptions</h1>
      <p className="mb-4 text-sm text-brown-800/50">
        How many people subscribed, who paid, meal choices, and when they registered.
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardBody className="py-4">
          <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Subscriptions</div>
          <div className="mt-1 font-display text-3xl text-brown-900" data-testid="food-stat-total">{stats.total}</div>
        </CardBody></Card>
        <Card><CardBody className="py-4">
          <div className="text-[10px] uppercase tracking-wider text-brown-800/45">People subscribed</div>
          <div className="mt-1 font-display text-3xl text-brown-900" data-testid="food-stat-people">{stats.people}</div>
        </CardBody></Card>
        <Card><CardBody className="py-4">
          <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Paid</div>
          <div className="mt-1 font-display text-3xl text-emerald-700" data-testid="food-stat-paid">{stats.paid}</div>
        </CardBody></Card>
        <Card><CardBody className="py-4">
          <div className="text-[10px] uppercase tracking-wider text-brown-800/45">Not paid yet</div>
          <div className="mt-1 font-display text-3xl text-amber-700" data-testid="food-stat-unpaid">{stats.unpaid}</div>
        </CardBody></Card>
      </div>

      <Card>
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-brown-800/55">{stats.meals} meal slots selected across all flats</div>
            <div className="flex gap-2">
              <ExportCsvButton filename="food_subscriptions.csv" columns={COLS} items={items} data-testid="food-export-btn" />
              <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>
          {loading ? <Spinner className="text-vermilion-500" /> : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-brown-800/45">No food subscriptions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Mobile</TH>
                    <TH>Household</TH>
                    <TH right>People</TH>
                    <TH>Meals</TH>
                    <TH>Payment</TH>
                    <TH>Subscribed at</TH>
                  </TR>
                </THead>
                <tbody>
                  {items.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-medium">{r.name}</TD>
                      <TD>{r.mobile}</TD>
                      <TD>{r.tower_name}{r.flat_number ? `, ${r.flat_number}` : ""}</TD>
                      <TD right>{r.family_members || 1}</TD>
                      <TD className="max-w-xs text-xs text-brown-800/75">
                        <div className="font-semibold text-brown-900">{r.selection_count || 0} selected</div>
                        <div className="mt-0.5 leading-snug">{selectionSummary(r)}</div>
                      </TD>
                      <TD><StatusBadge status={paymentLabel(r.payment_status)} /></TD>
                      <TD className="whitespace-nowrap text-xs tabular-nums">{formatDateIST(r.created_at)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
