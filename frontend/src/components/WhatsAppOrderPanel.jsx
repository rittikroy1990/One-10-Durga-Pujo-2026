import React, { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, MessageCircle, Check } from "lucide-react";
import api from "../lib/api";
import { Button } from "./ui";
import { formatPaise } from "../lib/utils";
import { WHATSAPP_GROUP_URL } from "./PublicLayout";

function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

// Some in-app / older browsers leave navigator.clipboard pending forever, so it gets a timeout.
async function copyToClipboard(text) {
  if (legacyCopy(text)) return true;
  if (!navigator.clipboard?.writeText) return false;
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Alternative to uploading a screenshot on the site: the resident posts the payment screenshot
 * plus a generated order message in the committee WhatsApp group; the committee records it later.
 */
export default function WhatsAppOrderPanel({ text, amountPaise, statusToken, posted = false, onPosted }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!text) return null;

  const copy = async () => {
    if (await copyToClipboard(text)) {
      setCopied(true);
      toast.success("Order message copied — paste it in the WhatsApp group");
    } else {
      toast.error("Could not copy — press and hold the message to copy it");
    }
  };

  const markPosted = async () => {
    if (!statusToken) return;
    if (!window.confirm("Have you paid and posted BOTH the payment screenshot and the order message in the committee WhatsApp group?")) return;
    setBusy(true);
    try {
      await api.post("/food/whatsapp-posted", { status_token: statusToken });
      toast.success("Thank you — the committee will verify your payment");
      onPosted?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update the order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-left" data-testid="food-whatsapp-panel">
      {!posted ? (
        <ol className="space-y-2 text-sm text-brown-800/80">
          <li><b className="text-brown-900">1.</b> Pay exactly <b className="text-vermilion-600">{formatPaise(amountPaise)}</b> with the UPI QR and take a screenshot of the success screen.</li>
          <li><b className="text-brown-900">2.</b> Tap <b>Copy order message</b>, then <b>Open committee group</b>.</li>
          <li><b className="text-brown-900">3.</b> In the group, paste the message and attach your payment screenshot.</li>
          <li><b className="text-brown-900">4.</b> Come back here and tap <b>I&apos;ve paid &amp; posted</b>.</li>
        </ol>
      ) : null}

      <pre
        className="whitespace-pre-wrap break-words rounded-xl border border-brown-800/10 bg-ivory-100 p-3 font-sans text-[13px] leading-relaxed text-brown-900 select-all"
        data-testid="food-whatsapp-text"
      >
        {text}
      </pre>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={copy} data-testid="food-whatsapp-copy">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy order message"}
        </Button>
        <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noreferrer" className="block">
          <Button type="button" variant="outline" className="w-full" data-testid="food-whatsapp-group">
            <ExternalLink className="h-4 w-4" /> Open committee group
          </Button>
        </a>
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700 underline"
        data-testid="food-whatsapp-share"
      >
        <MessageCircle className="h-3.5 w-3.5" /> Or share the message straight to WhatsApp and pick the committee group
      </a>

      {!posted ? (
        <>
          <Button type="button" variant="primary" size="lg" className="w-full" onClick={markPosted} disabled={busy || !statusToken} data-testid="food-whatsapp-posted">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "I've paid & posted on WhatsApp"}
          </Button>
          <p className="text-xs leading-relaxed text-brown-800/55">
            One UPI payment per order, for the exact amount — overpayments can&apos;t be accepted and cash isn&apos;t
            taken. The committee confirms WhatsApp payments later; your food voucher comes once it&apos;s confirmed.
          </p>
        </>
      ) : null}
    </div>
  );
}
