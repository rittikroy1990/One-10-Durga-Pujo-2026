import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Clock, AlertTriangle, FileText, Loader2, Share2, BadgeCheck } from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";

function absoluteUrl(path, origin = "") {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function shareFileOrWhatsApp({ file, title, text, fallbackUrl }) {
  if (!file) {
    throw new Error("Nothing to share");
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    const can = !navigator.canShare || navigator.canShare({ files: [file] });
    if (!can) throw new Error("This device cannot share files to WhatsApp");
    // File only — no caption text/links in the WhatsApp bubble
    await navigator.share({ files: [file], title: title || file.name });
    return "shared-file";
  }
  // Last resort: open the file so the user can share it manually from the viewer
  const objectUrl = URL.createObjectURL(file);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return "opened-file";
}

async function sharePaymentScreenshot({ screenshotUrl, receiptNo }) {
  const url = absoluteUrl(screenshotUrl);
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Could not load payment screenshot");
  const blob = await res.blob();
  const type = blob.type || "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("pdf") ? "pdf" : "jpg";
  const file = new File([blob], `payment-screenshot-${receiptNo || "one10"}.${ext}`, { type });
  return shareFileOrWhatsApp({
    file,
    title: file.name,
  });
}

async function shareReceiptOnWhatsApp({ receiptNo, verifyToken }) {
  if (!verifyToken) throw new Error("Receipt is not ready to share");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pdfUrl = absoluteUrl(`${API}/receipt/pdf/${verifyToken}`, origin);
  const res = await fetch(pdfUrl, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Could not load receipt PDF");
  const blob = await res.blob();
  const file = new File([blob], `${receiptNo || "one10-receipt"}.pdf`, {
    type: blob.type || "application/pdf",
  });
  return shareFileOrWhatsApp({
    file,
    title: file.name,
  });
}

export default function PaymentStatus() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [data, setData] = useState(null);
  const [tries, setTries] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [acking, setAcking] = useState(false);
  const timer = useRef();


  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      try {
        const r = await api.get(`/payments/status/${token}`);
        setData((prev) => {
          if (prev?.status === "paid" && r.data.status !== "paid") {
            return {
              ...prev,
              has_payment_screenshot: r.data.has_payment_screenshot ?? prev.has_payment_screenshot,
              screenshot_url: r.data.screenshot_url || prev.screenshot_url,
              acknowledge_available: false,
            };
          }
          return r.data;
        });
        const done = ["paid", "needs_review", "error", "reconciliation_required"].includes(r.data.status);
        if (!done && tries < 20) {
          timer.current = setTimeout(() => setTries((t) => t + 1), 3000);
        }
      } catch {
        setData((prev) => prev || { status: "error", message: "Could not fetch status." });
      }
    };
    poll();
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line
  }, [token, tries]);

  const paid = data?.status === "paid";
  const recon = data?.status === "reconciliation_required" || data?.status === "needs_review";
  const processing = data?.status === "processing";
  const hasScreenshot = Boolean(paid && (data?.screenshot_url || data?.has_payment_screenshot) && token);
  const canShareWhatsApp = Boolean(paid && (data?.verify_token || hasScreenshot));
  const canAcknowledge = Boolean(
    token && data && !paid && data.status !== "error" && (data.acknowledge_available),
  );

  const onAcknowledge = async () => {
    if (!token) return toast.error("Missing payment session.");
    setAcking(true);
    try {
      const r = await api.post("/payments/acknowledge", {
        status_token: token,
      });
      if (r.data?.status === "paid" && r.data?.receipt) {
        toast.success(`Receipt ${r.data.receipt.receipt_no || ""} issued`);
        setData({
          status: "paid",
          receipt_no: r.data.receipt.receipt_no,
          verify_token: r.data.receipt.verify_token,
          message: r.data.message || "Payment acknowledged and receipt issued.",
          bank_verified: false,
          do_not_pay_again: true,
          has_payment_screenshot: false,
          screenshot_url: null,
          acknowledge_available: false,
        });
      } else if (r.data?.status === "paid") {
        setTries((t) => t + 1);
        toast.success("Payment acknowledged.");
      } else {
        toast.error(r.data?.message || "Could not acknowledge payment.");
      }
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not acknowledge payment.");
    } finally {
      setAcking(false);
    }
  };

  const onShareWhatsApp = async () => {
    setSharing(true);
    try {
      let mode;
      if (hasScreenshot) {
        const shotPath = data.screenshot_url || `/api/payments/status/${encodeURIComponent(token)}/screenshot`;
        mode = await sharePaymentScreenshot({
          screenshotUrl: shotPath,
          receiptNo: data.receipt_no,
        });
      } else {
        mode = await shareReceiptOnWhatsApp({
          receiptNo: data.receipt_no,
          verifyToken: data.verify_token,
        });
      }
      if (mode === "opened-file") {
        toast.message("File opened — use Share from there to send on WhatsApp.");
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        toast.error(e?.message || "Could not open WhatsApp share.");
      }
    } finally {
      setSharing(false);
    }
  };

  const acknowledgeButton = canAcknowledge ? (
    <div className="mt-6 space-y-2">
      <Button
        variant="primary"
        className="w-full sm:w-auto"
        data-testid="acknowledge-payment-btn"
        onClick={onAcknowledge}
        disabled={acking}
      >
        {acking ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
        {acking ? "Issuing receipt…" : "Acknowledge payment"}
      </Button>
      <p className="text-xs text-brown-800/55">
        Temporary: confirms you completed payment and generates your receipt now.
      </p>
    </div>
  ) : null;

  return (
    <PublicLayout>
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <div className="rounded-2xl border border-gold-500/25 bg-ivory-200 p-8 text-brown-900" data-testid="payment-status-card">
          {!data && <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold-500" />}
          {paid && (
            <>
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
              <h1 className="mt-3 font-display text-4xl">Receipt issued</h1>
              <p className="mt-1 text-brown-800/70">Your receipt <b>{data.receipt_no}</b> has been recorded.</p>
              {data.bank_verified === false && (
                <p className="mt-3 text-xs text-brown-800/55">
                  Committee-recorded against your payment reference — not a bank settlement confirmation.
                </p>
              )}
              {data.bank_verified === true && (
                <p className="mt-3 text-xs text-emerald-700/80">
                  Payment recorded via UPI QR.
                </p>
              )}
              <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <a href={`${API}/receipt/pdf/${data.verify_token}`} target="_blank" rel="noreferrer" className="sm:inline-flex">
                  <Button variant="primary" className="w-full sm:w-auto" data-testid="download-receipt-btn">
                    <FileText className="h-4 w-4" /> Download receipt
                  </Button>
                </a>
                {canShareWhatsApp && (
                  <Button
                    variant="subtle"
                    className="w-full sm:w-auto"
                    data-testid="share-whatsapp-btn"
                    onClick={onShareWhatsApp}
                    disabled={sharing}
                  >
                    {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                    {sharing ? "Opening share…" : "Share on WhatsApp"}
                  </Button>
                )}
              </div>
              {canShareWhatsApp && (
                <p className="mt-3 text-xs leading-relaxed text-brown-800/55">
                  {hasScreenshot
                    ? <>Shares only your <b>payment screenshot</b> file. Pick any WhatsApp chat or group.</>
                    : <>Shares only the receipt <b>PDF</b> file — no extra text or links. Pick any WhatsApp chat or group.</>}
                </p>
              )}
            </>
          )}
          {processing && (
            <>
              <Loader2 className="mx-auto h-14 w-14 animate-spin text-gold-500" />
              <h1 className="mt-3 font-display text-4xl">
                Checking screenshot
              </h1>
              <p className="mt-1 text-brown-800/70">{data.message}</p>
              <p className="mt-2 text-sm font-semibold text-vermilion-600">Please do not pay again.</p>
              {acknowledgeButton}
            </>
          )}
          {data && !paid && !recon && !processing && data.status !== "error" && (
            <>
              <Clock className="mx-auto h-14 w-14 text-gold-500" />
              <h1 className="mt-3 font-display text-4xl">{data.do_not_pay_again ? "Verification in progress" : "Awaiting payment"}</h1>
              <p className="mt-1 text-brown-800/70">{data.message}</p>
              {data.do_not_pay_again && <p className="mt-2 text-sm font-semibold text-vermilion-600">Please do not pay again.</p>}
              {acknowledgeButton}
            </>
          )}
          {recon && (
            <>
              <AlertTriangle className="mx-auto h-14 w-14 text-amber-500" />
              <h1 className="mt-3 font-display text-4xl">Under review</h1>
              <p className="mt-1 text-brown-800/70">
                {data.message || "This payment needs committee review. Please do not pay again."}
              </p>
              {acknowledgeButton}
            </>
          )}
          {data?.status === "error" && <p className="text-vermilion-600">{data.message}</p>}
        </div>
      </div>
    </PublicLayout>
  );
}
