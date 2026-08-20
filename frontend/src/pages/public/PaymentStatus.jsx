import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, Clock, AlertTriangle, FileText, Loader2 } from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";

export default function PaymentStatus() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [data, setData] = useState(null);
  const [tries, setTries] = useState(0);
  const timer = useRef();

  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      try {
        const r = await api.get(`/payments/status/${token}`);
        setData(r.data);
        if (r.data.status !== "paid" && tries < 20) {
          timer.current = setTimeout(() => setTries((t) => t + 1), 3000);
        }
      } catch {
        setData({ status: "error", message: "Could not fetch status." });
      }
    };
    poll();
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line
  }, [token, tries]);

  const paid = data?.status === "paid";
  const recon = data?.status === "reconciliation_required";

  return (
    <PublicLayout>
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <div className="rounded-2xl border border-gold-500/25 bg-ivory-200 p-8 text-brown-900" data-testid="payment-status-card">
          {!data && <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold-500" />}
          {paid && (
            <>
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
              <h1 className="mt-3 font-display text-4xl">Payment verified</h1>
              <p className="mt-1 text-brown-800/70">Your receipt <b>{data.receipt_no}</b> has been issued.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a href={`${API}/receipt/pdf/${data.verify_token}`} target="_blank" rel="noreferrer">
                  <Button variant="primary" data-testid="download-receipt-btn"><FileText className="h-4 w-4" /> Download receipt</Button>
                </a>
                <Link to={`/receipt/verify/${data.verify_token}`}>
                  <Button variant="subtle">Verify online</Button>
                </Link>
              </div>
            </>
          )}
          {data && !paid && !recon && data.status !== "error" && (
            <>
              <Clock className="mx-auto h-14 w-14 text-gold-500" />
              <h1 className="mt-3 font-display text-4xl">{data.do_not_pay_again ? "Verification in progress" : "Awaiting payment"}</h1>
              <p className="mt-1 text-brown-800/70">{data.message}</p>
              {data.do_not_pay_again && <p className="mt-2 text-sm font-semibold text-vermilion-600">Please do not pay again.</p>}
            </>
          )}
          {recon && (
            <>
              <AlertTriangle className="mx-auto h-14 w-14 text-amber-500" />
              <h1 className="mt-3 font-display text-4xl">Under review</h1>
              <p className="mt-1 text-brown-800/70">This payment needs reconciliation. The committee will resolve it — please do not pay again.</p>
            </>
          )}
          {data?.status === "error" && <p className="text-vermilion-600">{data.message}</p>}
        </div>
      </div>
    </PublicLayout>
  );
}
