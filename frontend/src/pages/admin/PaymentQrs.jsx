import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { QrCode, Upload, Lock } from "lucide-react";
import api from "../../lib/api";

function QrCard({
  title,
  hint,
  endpoint,
  testId,
  emptyLabel,
  defaultUrl,
}) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const load = useCallback(() => {
    api.get(endpoint).then((r) => setStatus(r.data)).catch(() => {});
  }, [endpoint]);
  useEffect(load, [load]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (status?.locked) {
      toast.error("QR upload is deactivated — already used once.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post(endpoint, fd);
      toast.success(r.data.message || "QR uploaded — upload deactivated");
      setPreview(r.data.url);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not upload QR");
    } finally {
      setBusy(false);
    }
  };

  const locked = !!status?.locked;
  const uploaded = locked || !!status?.uploaded || !!preview;
  const url = preview || status?.url || defaultUrl;

  return (
    <div className="rounded-xl border border-gold-500/30 bg-white p-4" data-testid={testId}>
      <div className="mb-2 flex items-center gap-2 font-display text-xl text-brown-900">
        <QrCode className="h-5 w-5 text-vermilion-500" /> {title}
      </div>
      <p className="mb-4 text-sm text-brown-800/60">{hint}</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {uploaded ? (
          <img
            src={url}
            alt={title}
            className="h-40 w-40 rounded-lg border border-brown-800/10 bg-ivory-100 object-contain p-1"
          />
        ) : (
          <div className="grid h-40 w-40 place-items-center rounded-lg border border-dashed border-brown-800/20 bg-ivory-100 text-center text-xs text-brown-800/45">
            {emptyLabel}
          </div>
        )}
        <div className="flex-1 space-y-3">
          {locked ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Upload deactivated</div>
                <p className="mt-0.5 text-emerald-900/80">
                  Already uploaded{status?.uploaded_at ? ` on ${status.uploaded_at}` : ""}.
                </p>
              </div>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-vermilion-500/40 bg-vermilion-500/10 px-4 py-2.5 text-sm font-semibold text-vermilion-700 hover:bg-vermilion-500/15">
              {busy ? "Uploading…" : <><Upload className="h-4 w-4" /> Upload QR image</>}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg"
                className="hidden"
                disabled={busy || locked}
                onChange={onFile}
              />
            </label>
          )}
          {status?.vpa && (
            <div className="text-xs text-brown-800/55">Configured UPI: {status.vpa}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentQrs() {
  return (
    <div data-testid="payment-qrs-page" className="space-y-5">
      <div>
        <h1 className="mb-1 font-display text-4xl">Payment QRs</h1>
        <p className="text-sm text-brown-800/50">
          Treasurer tools — upload the Subscribe &amp; Pay QR and a separate Food QR.
          Each upload locks after the first successful save.
        </p>
      </div>

      <QrCard
        title="Subscribe & Pay UPI QR"
        hint="Shown on household Subscribe & Pay checkout. Upload once, then this control deactivates."
        endpoint="/admin/payment-qr"
        testId="subscribe-qr-upload"
        emptyLabel="No subscribe QR yet"
        defaultUrl="/images/payment-qr.png"
      />

      <QrCard
        title="Food UPI QR"
        hint="Shown on Food checkout. Until uploaded, Food falls back to the Subscribe QR."
        endpoint="/admin/food-payment-qr"
        testId="food-qr-upload"
        emptyLabel="No Food QR yet"
        defaultUrl="/images/food-payment-qr.png"
      />
    </div>
  );
}
