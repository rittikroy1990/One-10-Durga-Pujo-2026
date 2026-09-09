import React, { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";
import api from "../lib/api";
import { Button } from "./ui";
import {
  cashfreeOnlinePaymentsAvailable,
  getCashfreeMode,
  startCashfreeCheckout,
} from "../lib/cashfree";

/**
 * Cashfree online checkout CTA.
 * Renders nothing when Cashfree is not enabled in /api/config.
 */
export default function CashfreePayPanel({
  intentId,
  cfg,
  amountLabel,
  className = "",
}) {
  const [busy, setBusy] = useState(false);
  const enabled = cashfreeOnlinePaymentsAvailable(cfg?.payment);
  const mode = getCashfreeMode(cfg?.payment?.cashfree?.mode);

  if (!enabled || !intentId) return null;

  const payOnline = async () => {
    setBusy(true);
    try {
      const r = await api.post("/payments/cashfree/session", { intent_id: intentId });
      const sessionId = r.data.payment_session_id;
      if (!sessionId) throw new Error("Missing payment session");
      const result = await startCashfreeCheckout({
        paymentSessionId: sessionId,
        mode: r.data.mode || mode,
        redirectTarget: "_self",
      });
      if (result?.error) {
        const msg = result.error.message || "Cashfree checkout was cancelled.";
        if (/not enabled or approved|whitelist/i.test(msg)) {
          toast.error("Cashfree domain not approved yet. Whitelist https://one10events.in in the Cashfree merchant dashboard (Developers → Whitelisting).");
        } else {
          toast.error(msg);
        }
      }
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : e?.message || "Could not start Cashfree payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-xl border border-vermilion-500/35 bg-gradient-to-br from-vermilion-500/10 to-sun-400/10 p-4 ${className}`}
      data-testid="cashfree-pay-panel"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-vermilion-500 text-white">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl text-brown-900">Pay online with Cashfree</div>
          <p className="mt-1 text-sm text-brown-800/70">
            UPI, cards, netbanking and wallets
            {amountLabel ? <> · {amountLabel}</> : null}.
            {mode === "sandbox" ? (
              <span className="ml-1 text-amber-700">Sandbox mode (test).</span>
            ) : null}
          </p>
          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full sm:w-auto"
            data-testid="cashfree-pay-btn"
            onClick={payOnline}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {busy ? "Opening Cashfree…" : "Pay with Cashfree"}
          </Button>
          {mode === "production" ? (
            <p className="mt-2 text-xs leading-relaxed text-amber-800/90">
              Live checkout needs <strong>https://one10events.in</strong> whitelisted in Cashfree
              (Merchant Dashboard → Developers → Whitelisting). Until approved you may see a “Broken Link” error — use UPI QR below as backup.{" "}
              <Link to="/refunds" className="font-semibold underline-offset-2 hover:underline">Refunds policy</Link>
              {" · "}
              <Link to="/terms" className="font-semibold underline-offset-2 hover:underline">Terms</Link>
              {" · "}
              <Link to="/contact" className="font-semibold underline-offset-2 hover:underline">Contact</Link>
            </p>
          ) : (
            <p className="mt-2 text-xs text-brown-800/55">
              Receipt issues after payment succeeds.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
