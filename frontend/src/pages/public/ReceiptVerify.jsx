import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { formatDateIST } from "../../lib/utils";

export default function ReceiptVerify() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get(`/receipt/verify/${token}`).then((r) => setData(r.data)).catch(() => setError(true));
  }, [token]);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl px-5 py-16">
        <div className="relative rounded-3xl border-2 border-gold-500/50 bg-ivory-100 p-1 card-glow">
          <div className="rounded-[20px] border border-gold-500/30 p-8 text-brown-900 alpona-bg">
            {!data && !error && <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold-500" />}
            {error && (
              <div className="text-center">
                <ShieldX className="mx-auto h-14 w-14 text-vermilion-500" />
                <h1 className="mt-3 font-display text-3xl">Verification failed</h1>
                <p className="text-brown-800/60">This verification link is invalid or the receipt was not found.</p>
              </div>
            )}
            {data && (
              <div data-testid="verify-result">
                <div className="text-center">
                  <div className="text-xs uppercase tracking-[0.3em] text-gold-600">One10 Durgotsav 2026</div>
                  <h1 className="mt-1 font-display text-4xl">Receipt Verification</h1>
                  <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${data.verified ? "bg-emerald-100 text-emerald-800" : "bg-red-50 text-vermilion-600"}`}>
                    {data.verified ? <ShieldCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />} {data.status}
                  </div>
                </div>
                <div className="my-6 divider-diya" />
                <dl className="grid grid-cols-2 gap-y-4 text-sm">
                  <dt className="text-brown-800/50">Receipt Number</dt>
                  <dd className="text-right font-semibold">{data.receipt_no}</dd>
                  <dt className="text-brown-800/50">Payer</dt>
                  <dd className="text-right font-semibold">{data.payer_name_masked}</dd>
                  <dt className="text-brown-800/50">Household</dt>
                  <dd className="text-right font-semibold">{data.tower_name}, Flat {data.flat_number}</dd>
                  <dt className="text-brown-800/50">Amount</dt>
                  <dd className="text-right font-semibold">{data.amount}</dd>
                  <dt className="text-brown-800/50">Issued</dt>
                  <dd className="text-right font-semibold">{formatDateIST(data.issued_at)}</dd>
                </dl>
                <p className="mt-6 text-center text-xs text-brown-800/40">
                  Only masked identity is shown to protect resident privacy. This is a computer-generated verification.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
