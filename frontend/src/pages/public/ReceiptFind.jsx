import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Search, FileText, Loader2, Upload, Receipt } from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Label, Input, Select } from "../../components/ui";

export default function ReceiptFind() {
  const [mode, setMode] = useState("generate"); // generate | find
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);

  // Find existing
  const [receiptNo, setReceiptNo] = useState("");
  const [findMobile, setFindMobile] = useState("");
  const [findBusy, setFindBusy] = useState(false);
  const [findResult, setFindResult] = useState(null);

  // Generate from proof (single form — screenshot always visible)
  const [genName, setGenName] = useState("");
  const [towerId, setTowerId] = useState("");
  const [flatId, setFlatId] = useState("");
  const [genMobile, setGenMobile] = useState("");
  const [reference, setReference] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [genResult, setGenResult] = useState(null);

  useEffect(() => {
    api.get("/towers").then((r) => setTowers(r.data.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!towerId) {
      setFlats([]);
      setFlatId("");
      return;
    }
    api.get(`/towers/${towerId}/flats`).then((r) => setFlats(r.data.items || [])).catch(() => setFlats([]));
    setFlatId("");
  }, [towerId]);

  const find = async (e) => {
    e.preventDefault();
    if (!receiptNo.trim()) {
      toast.error("Enter your receipt number.");
      return;
    }
    setFindBusy(true);
    setFindResult(null);
    try {
      const r = await api.post("/receipt/find", {
        receipt_no: receiptNo.trim(),
        mobile: findMobile.trim(),
      });
      setFindResult(r.data);
    } catch (err) {
      const status = err?.response?.status;
      toast.error(
        status === 429
          ? "Too many attempts. Please wait a minute."
          : (err?.response?.data?.detail || "No receipt found with those details.")
      );
    } finally {
      setFindBusy(false);
    }
  };

  const generateReceipt = async (e) => {
    e.preventDefault();
    if (!genName.trim() || genName.trim().length < 2) {
      toast.error("Enter the name used at subscription.");
      return;
    }
    if (!towerId || !flatId) {
      toast.error("Select tower and flat.");
      return;
    }
    if (!reference.trim() || reference.trim().length < 6) {
      toast.error("Enter the UTR / UPI reference from your payment.");
      return;
    }
    if (!screenshot) {
      toast.error("Upload your payment screenshot.");
      return;
    }

    setSubmitBusy(true);
    setGenResult(null);
    try {
      const lookup = await api.post("/receipt/pending-payment", {
        name: genName.trim(),
        tower_id: towerId,
        flat_id: flatId,
        mobile: genMobile.trim(),
      });

      if (lookup.data.status === "already_paid") {
        setGenResult(lookup.data);
        toast.success("Receipt already issued for this flat.");
        return;
      }

      const pending = lookup.data;
      if (!pending?.intent_id || !pending?.status_token) {
        toast.error("No pending payment found for this flat.");
        return;
      }

      const fd = new FormData();
      fd.append("intent_id", pending.intent_id);
      fd.append("status_token", pending.status_token);
      fd.append("reference", reference.trim());
      fd.append("screenshot", screenshot);

      const r = await api.post("/payments/upi/submit", fd);
      if (r.data.status === "paid" && r.data.receipt) {
        const receipt = r.data.receipt;
        setGenResult({
          status: "paid",
          receipt_no: receipt.receipt_no,
          verify_token: receipt.verify_token,
          amount:
            receipt.total_amount != null
              ? `₹${(Number(receipt.total_amount) / 100).toLocaleString("en-IN")}`
              : pending.amount,
          message: r.data.message,
        });
        toast.success("Receipt generated.");
      } else {
        toast.message(r.data.message || "Submitted for committee review. Do not pay again.");
        setGenResult({
          status: "needs_review",
          message: r.data.message || "Submitted for committee review. Do not pay again.",
        });
      }
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      toast.error(
        status === 429
          ? "Too many attempts. Please wait a minute."
          : (detail || "Could not generate receipt. Check name, flat, UTR and screenshot.")
      );
    } finally {
      setSubmitBusy(false);
    }
  };

  const ResultCard = ({ data }) => {
    if (!data) return null;
    if (data.status === "needs_review") {
      return (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-brown-900" data-testid="generate-review">
          <div className="text-sm font-semibold text-amber-800">Submitted for review</div>
          <p className="mt-2 text-sm text-brown-800/80">{data.message}</p>
          <p className="mt-2 text-xs text-brown-800/55">Do not pay again. The committee will verify and issue your receipt.</p>
        </div>
      );
    }
    const token = data.verify_token;
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-brown-900" data-testid="generate-result">
        <div className="text-sm text-emerald-700">Receipt ready</div>
        <div className="font-display text-3xl">{data.receipt_no}</div>
        {data.amount && <div className="mt-1 text-brown-800/70">Amount {data.amount}</div>}
        {data.message && <p className="mt-2 text-sm text-brown-800/70">{data.message}</p>}
        {token && (
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={`${API}/receipt/pdf/${token}`} target="_blank" rel="noreferrer">
              <Button variant="primary"><FileText className="h-4 w-4" /> Download PDF</Button>
            </a>
            <Link to={`/receipt/verify/${token}`}><Button variant="subtle">Verify online</Button></Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <PublicLayout>
      <div className="mx-auto max-w-lg px-5 pb-16 pt-28">
        <h1 className="font-display text-5xl text-brown-900">Receipts</h1>
        <p className="mt-2 text-brown-800/70">
          Generate a receipt after UPI payment, or look up an existing one.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-full bg-ivory-200 p-1">
          <button
            type="button"
            data-testid="tab-generate"
            onClick={() => setMode("generate")}
            className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${mode === "generate" ? "bg-vermilion-500 text-white shadow-sm" : "text-brown-800/70 hover:text-brown-900"}`}
          >
            Generate receipt
          </button>
          <button
            type="button"
            data-testid="tab-find"
            onClick={() => setMode("find")}
            className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${mode === "find" ? "bg-vermilion-500 text-white shadow-sm" : "text-brown-800/70 hover:text-brown-900"}`}
          >
            Find receipt
          </button>
        </div>

        {mode === "generate" ? (
          <div className="mt-8 space-y-5">
            <form
              onSubmit={generateReceipt}
              className="space-y-4 rounded-2xl border border-sun-400/30 bg-ivory-200 p-6 text-brown-900"
              data-testid="gen-form"
            >
              <div>
                <h2 className="font-display text-2xl text-brown-900">Paid via UPI?</h2>
                <p className="mt-1 text-sm text-brown-800/65">
                  Enter your name and flat, then upload the payment screenshot and UTR / reference number to generate your receipt.
                </p>
              </div>

              <div>
                <Label required htmlFor="gname">Name</Label>
                <Input
                  id="gname"
                  data-testid="gen-name"
                  value={genName}
                  onChange={(e) => setGenName(e.target.value)}
                  placeholder="Name as on subscription"
                  autoComplete="name"
                />
              </div>
              <div>
                <Label required htmlFor="gtower">Tower / Block</Label>
                <Select id="gtower" data-testid="gen-tower" value={towerId} onChange={(e) => setTowerId(e.target.value)}>
                  <option value="">Select tower</option>
                  {towers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name || t.label || t.id}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label required htmlFor="gflat">Flat</Label>
                <Select id="gflat" data-testid="gen-flat" value={flatId} onChange={(e) => setFlatId(e.target.value)} disabled={!towerId}>
                  <option value="">Select flat</option>
                  {flats.map((f) => (
                    <option key={f.id} value={f.id}>{f.number || f.label || f.id}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="gmob">Mobile (optional)</Label>
                <Input
                  id="gmob"
                  data-testid="gen-mobile"
                  value={genMobile}
                  onChange={(e) => setGenMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                />
              </div>

              <div>
                <Label required htmlFor="gref">UTR / UPI reference number</Label>
                <Input
                  id="gref"
                  data-testid="gen-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. 312345678901"
                />
              </div>

              <div>
                <Label required htmlFor="gshot">Payment screenshot</Label>
                <label
                  htmlFor="gshot"
                  className="mt-1 flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brown-800/25 bg-ivory-50 px-4 py-5 text-center hover:border-vermilion-500/50"
                  data-testid="gen-screenshot-drop"
                >
                  <Upload className="h-6 w-6 text-vermilion-500" />
                  <span className="mt-2 text-sm font-medium">
                    {screenshot ? screenshot.name : "Tap to upload PNG / JPG"}
                  </span>
                  <span className="mt-1 text-xs text-brown-800/45">Screenshot of the successful payment</span>
                  <input
                    id="gshot"
                    data-testid="gen-screenshot"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <Button type="submit" variant="primary" className="w-full" data-testid="gen-submit-btn" disabled={submitBusy}>
                {submitBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Receipt className="h-4 w-4" /> Generate receipt</>}
              </Button>
              <p className="text-center text-xs text-brown-800/50">
                Not subscribed yet?{" "}
                <Link to="/subscribe" className="font-semibold text-vermilion-600 underline underline-offset-2">
                  Subscribe &amp; Pay
                </Link>
              </p>
            </form>

            <ResultCard data={genResult} />
          </div>
        ) : (
          <div className="mt-8">
            <form onSubmit={find} className="space-y-4 rounded-2xl border border-sun-400/30 bg-ivory-200 p-6 text-brown-900">
              <p className="text-sm text-brown-800/65">
                Already have a receipt number? Look it up here. Mobile is optional if you left it blank while subscribing.
              </p>
              <div>
                <Label required htmlFor="rn">Receipt number</Label>
                <Input
                  id="rn"
                  data-testid="find-receipt-no"
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  placeholder="ONE10-DP26-000001"
                />
              </div>
              <div>
                <Label htmlFor="mob">Registered mobile (optional)</Label>
                <Input
                  id="mob"
                  data-testid="find-mobile"
                  value={findMobile}
                  onChange={(e) => setFindMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                />
              </div>
              <Button type="submit" variant="primary" className="w-full" data-testid="find-submit-btn" disabled={findBusy}>
                {findBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4" /> Find receipt</>}
              </Button>
            </form>

            {findResult && (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-brown-900" data-testid="find-result">
                <div className="text-sm text-emerald-700">Receipt found</div>
                <div className="font-display text-3xl">{findResult.receipt_no}</div>
                <div className="mt-1 text-brown-800/70">Amount {findResult.amount}</div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a href={`${API}/receipt/pdf/${findResult.verify_token}`} target="_blank" rel="noreferrer">
                    <Button variant="primary"><FileText className="h-4 w-4" /> Download PDF</Button>
                  </a>
                  <Link to={`/receipt/verify/${findResult.verify_token}`}>
                    <Button variant="subtle">Verify online</Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
