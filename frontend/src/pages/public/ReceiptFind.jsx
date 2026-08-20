import React, { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Search, FileText, Loader2 } from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Label, Input } from "../../components/ui";

export default function ReceiptFind() {
  const [receiptNo, setReceiptNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const find = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post("/receipt/find", { receipt_no: receiptNo.trim(), mobile: mobile.trim() });
      setResult(r.data);
    } catch (err) {
      const status = err?.response?.status;
      toast.error(status === 429 ? "Too many attempts. Please wait a minute." : "No receipt found with those details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <div className="mx-auto max-w-lg px-5 py-16">
        <h1 className="font-display text-5xl text-ivory-100">Find your receipt</h1>
        <p className="mt-2 text-ivory-100/70">Enter your receipt number and the registered mobile number. Searches are rate-limited and logged for your safety.</p>
        <form onSubmit={find} className="mt-8 space-y-4 rounded-2xl border border-gold-500/25 bg-ivory-200 p-6 text-brown-900">
          <div>
            <Label required htmlFor="rn">Receipt number</Label>
            <Input id="rn" data-testid="find-receipt-no" value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="ONE10-DP26-000001" />
          </div>
          <div>
            <Label required htmlFor="mob">Registered mobile</Label>
            <Input id="mob" data-testid="find-mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" inputMode="numeric" />
          </div>
          <Button type="submit" variant="primary" className="w-full" data-testid="find-submit-btn" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4" /> Find receipt</>}
          </Button>
        </form>

        {result && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-brown-900" data-testid="find-result">
            <div className="text-sm text-emerald-700">Receipt found</div>
            <div className="font-display text-3xl">{result.receipt_no}</div>
            <div className="mt-1 text-brown-800/70">Amount {result.amount}</div>
            <div className="mt-4 flex gap-3">
              <a href={`${API}/receipt/pdf/${result.verify_token}`} target="_blank" rel="noreferrer">
                <Button variant="primary"><FileText className="h-4 w-4" /> Download PDF</Button>
              </a>
              <Link to={`/receipt/verify/${result.verify_token}`}><Button variant="subtle">Verify online</Button></Link>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
