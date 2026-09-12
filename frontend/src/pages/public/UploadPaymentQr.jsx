import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { QrCode, Upload, Lock, ArrowLeft, CheckCircle2 } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import PublicLayout from "../../components/PublicLayout";
import { Button, Spinner } from "../../components/ui";

export default function UploadPaymentQr() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const load = useCallback(() => {
    if (!user) return;
    api.get("/admin/payment-qr").then((r) => setStatus(r.data)).catch(() => {
      toast.error("Could not load QR status — need settings access.");
    });
  }, [user]);

  useEffect(load, [load]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (status?.locked) {
      toast.error("Upload already used once — deactivated.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/admin/payment-qr", fd);
      toast.success(r.data.message || "QR uploaded");
      setPreview(r.data.url);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <PublicLayout>
        <div className="grid min-h-[50vh] place-items-center"><Spinner className="h-8 w-8 text-vermilion-500" /></div>
      </PublicLayout>
    );
  }

  if (!user) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-lg px-5 py-16 text-center text-ivory-100">
          <QrCode className="mx-auto h-12 w-12 text-gold-400" />
          <h1 className="mt-4 font-display text-4xl">Upload payment QR</h1>
          <p className="mt-2 text-ivory-100/70">Committee login required. One-time upload only.</p>
          <Button variant="primary" className="mt-6" onClick={() => navigate("/admin/login")}>
            Login to upload QR
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const locked = !!status?.locked;
  const url = preview || status?.url || "/images/payment-qr.png";

  return (
    <PublicLayout>
      <div className="mx-auto max-w-xl px-5 py-12" data-testid="upload-qr-page">
        <Link to="/admin/settings" className="inline-flex items-center gap-1 text-sm text-ivory-100/60 hover:text-ivory-100">
          <ArrowLeft className="h-4 w-4" /> Admin settings
        </Link>
        <h1 className="mt-4 font-display text-5xl text-ivory-100">Upload UPI QR</h1>
        <p className="mt-2 text-ivory-100/70">
          Upload the committee payment QR once. It will show on Subscribe &amp; Pay, then this upload deactivates permanently.
        </p>

        <div className="mt-8 rounded-2xl border border-gold-500/25 bg-ivory-200 p-6 text-brown-900">
          <div className="flex flex-col items-center gap-5">
            <img
              src={url}
              alt="Payment QR preview"
              className="h-56 w-56 rounded-xl border border-brown-800/10 bg-white object-contain p-2"
              data-testid="upload-qr-preview"
            />

            {locked ? (
              <div className="w-full rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <Lock className="h-4 w-4" /> Upload deactivated
                </div>
                <p className="mt-1 text-emerald-900/80">
                  QR already uploaded{status?.uploaded_at ? ` (${status.uploaded_at})` : ""}. Residents see it on checkout.
                </p>
                <div className="mt-3 flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" /> Live on https://one10events.in/subscribe
                </div>
              </div>
            ) : (
              <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-vermilion-500/50 bg-vermilion-500/10 px-6 py-10 text-center hover:bg-vermilion-500/15">
                <Upload className="h-8 w-8 text-vermilion-600" />
                <span className="mt-3 text-lg font-semibold text-vermilion-700" data-testid="upload-qr-btn">
                  {busy ? "Uploading…" : "Upload QR image"}
                </span>
                <span className="mt-1 text-xs text-brown-800/55">PNG or JPG · one time only</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg"
                  className="hidden"
                  disabled={busy}
                  data-testid="upload-qr-file"
                  onChange={onFile}
                />
              </label>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
