import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Clock, AlertTriangle, FileText, Loader2, Share2 } from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";

async function sharePaymentScreenshot({ screenshotUrl, receiptNo, absoluteApiBase }) {
  const url = screenshotUrl.startsWith("http")
    ? screenshotUrl
    : `${(absoluteApiBase || "").replace(/\/$/, "")}${screenshotUrl.startsWith("/") ? "" : "/"}${screenshotUrl}`;

  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Could not load payment screenshot");
  const blob = await res.blob();
  const type = blob.type || "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("pdf") ? "pdf" : "jpg";
  const file = new File([blob], `payment-screenshot-${receiptNo || "one10"}.${ext}`, { type });

  const shareData = {
    files: [file],
    title: "Payment screenshot",
    text: receiptNo
      ? `One 10 payment screenshot (receipt ${receiptNo}). Sharing the UPI/bank payment screenshot — not the PDF receipt.`
      : "One 10 payment screenshot (UPI/bank proof — not the PDF receipt).",
  };

  if (typeof navigator !== "undefined" && navigator.share) {
    const canFiles = !navigator.canShare || navigator.canShare({ files: [file] });
    if (canFiles) {
      await navigator.share(shareData);
      return "shared";
    }
    await navigator.share({ title: shareData.title, text: `${shareData.text}\n${url}` });
    return "shared-text";
  }

  const wa = `https://wa.me/?text=${encodeURIComponent(`${shareData.text}\n${url}`)}`;
  window.open(wa, "_blank", "noopener,noreferrer");
  return "whatsapp-link";
}

export default function PaymentStatus() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const cashfreeOrderId = params.get("cashfree_order_id");
  const [data, setData] = useState(null);
  const [tries, setTries] = useState(0);
  const [sharing, setSharing] = useState(false);
  const timer = useRef();
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (!cashfreeOrderId || verifiedRef.current) return;
    verifiedRef.current = true;
    (async () => {
      try {
        const r = await api.post("/payments/cashfree/verify", {
          cashfree_order_id: cashfreeOrderId,
        });
        if (r.data?.status === "paid") {
          setData({
            status: "paid",
            receipt_no: r.data.receipt?.receipt_no,
            verify_token: r.data.receipt?.verify_token,
            message: "Cashfree payment recorded and receipt issued.",
            bank_verified: true,
            do_not_pay_again: true,
            has_payment_screenshot: false,
            screenshot_url: null,
          });
          return;
        }
        if (r.data?.status === "pending") {
          setData({
            status: "processing",
            message: r.data.message || "Confirming Cashfree payment…",
            do_not_pay_again: true,
          });
        }
      } catch {
        // Fall through to status polling with token.
      }
    })();
  }, [cashfreeOrderId]);

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
  const canShareShot = Boolean(paid && (data?.screenshot_url || data?.has_payment_screenshot) && token);

  const onShareWhatsApp = async () => {
    if (!token) return toast.error("Missing payment session.");
    setSharing(true);
    try {
      const shotPath = data.screenshot_url || `/api/payments/status/${encodeURIComponent(token)}/screenshot`;
      const mode = await sharePaymentScreenshot({
        screenshotUrl: shotPath,
        receiptNo: data.receipt_no,
        absoluteApiBase: typeof window !== "undefined" ? window.location.origin : "",
      });
      if (mode === "whatsapp-link") {
        toast.message("Opened WhatsApp — the screenshot link is in the message. Attach the image if needed.");
      }
    } catch (e) {
      if (e?.name === "AbortError") {
        // user cancelled share sheet
      } else {
        toast.error(e?.message || "Could not share payment screenshot.");
      }
    } finally {
      setSharing(false);
    }
  };

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
                  Verified via Cashfree payment gateway.
                </p>
              )}
              <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <a href={`${API}/receipt/pdf/${data.verify_token}`} target="_blank" rel="noreferrer" className="sm:inline-flex">
                  <Button variant="primary" className="w-full sm:w-auto" data-testid="download-receipt-btn">
                    <FileText className="h-4 w-4" /> Download receipt
                  </Button>
                </a>
                {canShareShot && (
                  <Button
                    variant="subtle"
                    className="w-full sm:w-auto"
                    data-testid="share-screenshot-whatsapp-btn"
                    onClick={onShareWhatsApp}
                    disabled={sharing}
                  >
                    {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                    {sharing ? "Opening share…" : "Share screenshot on WhatsApp"}
                  </Button>
                )}
              </div>
              {canShareShot && (
                <p className="mt-3 text-xs leading-relaxed text-brown-800/55">
                  Shares your <b>payment screenshot</b> (not the PDF receipt). Pick any WhatsApp chat or group in the share sheet.
                </p>
              )}
            </>
          )}
          {processing && (
            <>
              <Loader2 className="mx-auto h-14 w-14 animate-spin text-gold-500" />
              <h1 className="mt-3 font-display text-4xl">
                {cashfreeOrderId ? "Confirming Cashfree payment" : "Checking screenshot"}
              </h1>
              <p className="mt-1 text-brown-800/70">{data.message}</p>
              <p className="mt-2 text-sm font-semibold text-vermilion-600">Please do not pay again.</p>
            </>
          )}
          {data && !paid && !recon && !processing && data.status !== "error" && (
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
              <p className="mt-1 text-brown-800/70">
                {data.message || "This payment needs committee review. Please do not pay again."}
              </p>
            </>
          )}
          {data?.status === "error" && <p className="text-vermilion-600">{data.message}</p>}
        </div>
      </div>
    </PublicLayout>
  );
}
