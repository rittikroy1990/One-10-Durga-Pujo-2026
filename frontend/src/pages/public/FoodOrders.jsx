import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Search } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import FoodOrdersList from "../../components/FoodOrdersList";
import { Button, Input, Label, Select } from "../../components/ui";

export default function FoodOrders() {
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [form, setForm] = useState({ tower_id: "", flat_id: "", mobile: "" });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/towers").then((r) => setTowers(r.data.items || [])).catch(() => {});
  }, []);
  useEffect(() => {
    setFlats([]);
    if (!form.tower_id) return;
    api.get(`/towers/${form.tower_id}/flats`).then((r) => setFlats(r.data.items || [])).catch(() => {});
  }, [form.tower_id]);

  const lookup = async (e) => {
    e?.preventDefault();
    if (!form.flat_id || form.mobile.length !== 10) {
      toast.error("Select your tower and flat, and enter the 10-digit mobile used on the order.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/food/my-orders", { flat_id: form.flat_id, mobile: form.mobile });
      setResult(r.data);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not look up orders.");
    } finally {
      setBusy(false);
    }
  };


  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl px-5 py-10" data-testid="food-orders-page">
        <Link to="/food" className="inline-flex items-center gap-1.5 text-sm text-brown-800/60 hover:text-vermilion-600">
          <ArrowLeft className="h-4 w-4" /> Food
        </Link>
        <h1 className="mt-3 font-display text-3xl text-brown-900">My food orders</h1>
        <p className="mt-1 text-sm text-brown-800/60">
          Pay a balance or download your food vouchers.
        </p>

        <form onSubmit={lookup} className="mt-6 grid gap-3 rounded-2xl border border-sun-400/30 bg-white p-5 shadow-card sm:grid-cols-3">
          <div>
            <Label required>Tower</Label>
            <Select value={form.tower_id} onChange={(e) => setForm({ ...form, tower_id: e.target.value, flat_id: "" })} data-testid="orders-tower">
              <option value="">Select tower</option>
              {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div>
            <Label required>Flat</Label>
            <Select value={form.flat_id} onChange={(e) => setForm({ ...form, flat_id: e.target.value })} data-testid="orders-flat">
              <option value="">Select flat</option>
              {flats.map((f) => <option key={f.id} value={f.id}>{f.number}</option>)}
            </Select>
          </div>
          <div>
            <Label required>Mobile on the order</Label>
            <Input
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              placeholder="10-digit mobile"
              inputMode="numeric"
              data-testid="orders-mobile"
            />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" variant="primary" disabled={busy} data-testid="orders-lookup-btn">
              <Search className="h-4 w-4" /> {busy ? "Looking up…" : "Show my orders"}
            </Button>
          </div>
        </form>

        {result ? (
          <div className="mt-6">
            {result.orders.length ? (
              <FoodOrdersList orders={result.orders} />
            ) : (
              <p className="rounded-xl bg-ivory-200 px-4 py-3 text-sm text-brown-800/70">
                No food orders for this flat on this mobile.
              </p>
            )}
            {result.others_holding?.length ? (
              <p className="mt-3 text-xs text-brown-800/55">
                Other orders from this flat (mobile {result.others_holding.map((x) => x.mobile_masked).join(", ")}) are also using complimentary meals.
              </p>
            ) : null}
            <p className="mt-4 text-xs text-brown-800/55">
              Need more meals? <Link to="/food" className="font-semibold text-vermilion-600 underline">Place another order</Link> — each order gets its own food voucher.
            </p>
          </div>
        ) : null}
      </div>
    </PublicLayout>
  );
}
