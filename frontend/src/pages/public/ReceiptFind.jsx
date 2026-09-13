import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { FileText, Loader2, Upload, Receipt, Search, RotateCcw } from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Label, Input, Select } from "../../components/ui";

function pdfHref(token) {
  return token ? `${API}/receipt/pdf/${token}` : null;
}

function formatAmount(receipt) {
  if (receipt?.amount) return receipt.amount;
  if (typeof receipt?.total_amount === "number") {
    return `₹${(receipt.total_amount / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return "";
}

function ReceiptCards({ receipts, household }) {
  if (!receipts?.length) return null;
  return (
    <div className="space-y-4" data-testid="receipt-results">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-brown-900">
        <div className="text-sm font-semibold text-emerald-800">Receipt ready</div>
        {household && (
          <p className="mt-1 text-sm text-brown-800/70">
            {[household.tower_name, household.flat_number ? `Flat ${household.flat_number}` : ""]
              .filter(Boolean)
              .join(" · ")}
            {household.primary_name ? ` · ${household.primary_name}` : ""}
          </p>
        )}
        <p className="mt-2 text-sm text-brown-800/75">Download your receipt below.</p>
      </div>
      {receipts.map((r) => {
        const token = r.verify_token;
        const href = pdfHref(token);
        const amount = formatAmount(r);
        return (
          <div
            key={r.receipt_no || token}
            className="rounded-2xl border border-sun-400/30 bg-white p-5 text-brown-900 shadow-sm"
            data-testid="receipt-card"
          >
            <div className="text-xs uppercase tracking-wide text-brown-800/50">Receipt</div>
            <div className="font-display text-2xl">{r.receipt_no}</div>
            {(amount || r.issued_at) && (
              <div className="mt-1 text-sm text-brown-800/70">
                {amount}
                {r.issued_at ? ` · ${new Date(r.issued_at).toLocaleString("en-IN")}` : ""}
              </div>
            )}
            {r.bank_verified ? (
              <p className="mt-2 text-sm font-semibold text-emerald-700">Bank verified</p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-[#A85A2A]">Not bank verified</p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              {href && (
                <a href={href} target="_blank" rel="noreferrer">
                  <Button variant="primary" data-testid="download-receipt-btn">
                    <FileText className="h-4 w-4" /> Download PDF
                  </Button>
                </a>
              )}
              {token && (
                <Link to={`/receipt/verify/${token}`}>
                  <Button variant="subtle">Verify online</Button>
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ReceiptFind() {
  const [towers, setTowers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [towerId, setTowerId] = useState("");
  const [flatId, setFlatId] = useState("");

  // lookup | generate | done
  const [step, setStep] = useState("lookup");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookup, setLookup] = useState(null);

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
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
    api
      .get(`/towers/${towerId}/flats`)
      .then((r) => setFlats(r.data.items || []))
      .catch(() => setFlats([]));
    setFlatId("");
  }, [towerId]);

  const resetAll = () => {
    setStep("lookup");
    setLookup(null);
    setGenResult(null);
    setName("");
    setMobile("");
    setReference("");
    setScreenshot(null);
  };

  const onLookup = async (e) => {
    e.preventDefault();
    if (!towerId || !flatId) {
      toast.error("Select tower and flat.");
      return;
    }
    setLookupBusy(true);
    setLookup(null);
    setGenResult(null);
    try {
      const r = await api.post("/receipt/by-flat", {
        tower_id: towerId,
        flat_id: flatId,
      });
      setLookup(r.data);
      if (r.data.status === "found" && (r.data.receipts || []).length) {
        setStep("done");
        toast.success("Receipt found — you can download it.");
      } else {
        setStep("generate");
        toast.message("No receipt yet — upload payment details to generate one.");
      }
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      toast.error(
        status === 429
          ? "Too many attempts. Please wait a minute."
          : typeof detail === "string"
            ? detail
            : "Could not look up this flat."
      );
    } finally {
      setLookupBusy(false);
    }
  };

  const onGenerate = async (e) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      toast.error("Enter your name.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      toast.error("Enter a valid 10-digit Indian mobile number.");
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
      const start = await api.post("/receipt/start-from-proof", {
        tower_id: towerId,
        flat_id: flatId,
        name: name.trim(),
        mobile: mobile.trim(),
      });

      if (start.data.status === "already_paid") {
        setLookup({
          status: "found",
          household: start.data.household || lookup?.household,
          receipts: start.data.receipts || [],
          message: start.data.message,
        });
        setStep("done");
        toast.success("Receipt already issued for this flat.");
        return;
      }

      const fd = new FormData();
      fd.append("intent_id", start.data.intent_id);
      fd.append("status_token", start.data.status_token);
      fd.append("reference", reference.trim());
      fd.append("screenshot", screenshot);
      const r = await api.post("/payments/upi/submit", fd);

      if ((r.data.status === "paid" || r.data.status === "partially_paid") && r.data.receipt) {
        const receipt = r.data.receipt;
        setGenResult({
          status: r.data.status,
          message: r.data.message,
          receipts: [
            {
              receipt_no: receipt.receipt_no,
              verify_token: receipt.verify_token,
              total_amount: receipt.total_amount,
              amount: r.data.paid_amount_fmt,
              issued_at: receipt.issued_at,
              bank_verified: false,
            },
          ],
        });
        setStep("done");
        toast.success(r.data.status === "paid" ? "Receipt generated." : "Partial receipt generated.");
      } else {
        setGenResult({
          status: "needs_review",
          message: r.data.message || "Submitted for committee review.",
          receipts: [],
        });
        setStep("done");
        toast.message("Submitted for review");
      }
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      toast.error(
        status === 429
          ? "Too many attempts. Please wait a minute."
          : typeof detail === "string"
            ? detail
            : "Could not generate receipt."
      );
    } finally {
      setSubmitBusy(false);
    }
  };

  const doneReceipts = genResult?.receipts?.length ? genResult.receipts : lookup?.receipts || [];

  return (
    <PublicLayout>
      <div className="mx-auto max-w-lg px-5 pb-16 pt-10 sm:pt-14">
        <h1 className="font-display text-5xl text-brown-900">Receipts</h1>
        <p className="mt-2 text-brown-800/70">
          Enter your tower and flat. If a receipt exists, download it. If not, upload your payment
          screenshot to generate one.
        </p>

        {step === "lookup" && (
          <form
            onSubmit={onLookup}
            className="mt-8 space-y-4 rounded-2xl border border-sun-400/30 bg-ivory-200 p-6 text-brown-900"
            data-testid="flat-lookup-form"
          >
            <div>
              <h2 className="font-display text-2xl">Find by flat</h2>
              <p className="mt-1 text-sm text-brown-800/65">
                We will check for receipts linked to this tower and flat.
              </p>
            </div>
            <div>
              <Label required htmlFor="tower">
                Tower / Block
              </Label>
              <Select
                id="tower"
                data-testid="lookup-tower"
                value={towerId}
                onChange={(e) => setTowerId(e.target.value)}
              >
                <option value="">Select tower</option>
                {towers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.label || t.id}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label required htmlFor="flat">
                Flat
              </Label>
              <Select
                id="flat"
                data-testid="lookup-flat"
                value={flatId}
                onChange={(e) => setFlatId(e.target.value)}
                disabled={!towerId}
              >
                <option value="">Select flat</option>
                {flats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.number || f.label || f.id}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              data-testid="lookup-submit-btn"
              disabled={lookupBusy}
            >
              {lookupBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4" /> Find receipt
                </>
              )}
            </Button>
            <p className="text-center text-xs text-brown-800/50">
              New subscriber?{" "}
              <Link
                to="/subscribe"
                className="font-semibold text-vermilion-600 underline underline-offset-2"
              >
                Subscribe &amp; Pay
              </Link>
            </p>
          </form>
        )}

        {step === "generate" && (
          <form
            onSubmit={onGenerate}
            className="mt-8 space-y-4 rounded-2xl border border-sun-400/30 bg-ivory-200 p-6 text-brown-900"
            data-testid="generate-form"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">Generate receipt</h2>
                <p className="mt-1 text-sm text-brown-800/65">
                  {lookup?.message ||
                    "No receipt on file. Upload payment proof to issue and record a receipt."}
                </p>
                {lookup?.household && (
                  <p className="mt-2 text-sm font-medium text-brown-800/80">
                    {[
                      lookup.household.tower_name,
                      lookup.household.flat_number
                        ? `Flat ${lookup.household.flat_number}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <Button type="button" variant="subtle" onClick={resetAll} data-testid="back-lookup-btn">
                <RotateCcw className="h-4 w-4" /> Change flat
              </Button>
            </div>

            <div>
              <Label required htmlFor="name">
                Name
              </Label>
              <Input
                id="name"
                data-testid="gen-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name on payment / subscription"
                autoComplete="name"
              />
            </div>
            <div>
              <Label required htmlFor="mobile">
                Mobile
              </Label>
              <Input
                id="mobile"
                data-testid="gen-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label required htmlFor="ref">
                UTR / UPI reference ID
              </Label>
              <Input
                id="ref"
                data-testid="gen-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. 312345678901"
              />
            </div>
            <div>
              <Label required htmlFor="shot">
                Payment screenshot
              </Label>
              <label
                htmlFor="shot"
                className="mt-1 flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brown-800/25 bg-ivory-50 px-4 py-5 text-center hover:border-vermilion-500/50"
                data-testid="gen-screenshot-drop"
              >
                <Upload className="h-6 w-6 text-vermilion-500" />
                <span className="mt-2 text-sm font-medium">
                  {screenshot ? screenshot.name : "Tap to upload PNG / JPG"}
                </span>
                <span className="mt-1 text-xs text-brown-800/45">
                  Screenshot of the successful payment
                </span>
                <input
                  id="shot"
                  data-testid="gen-screenshot"
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              data-testid="gen-submit-btn"
              disabled={submitBusy}
            >
              {submitBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Receipt className="h-4 w-4" /> Generate &amp; record receipt
                </>
              )}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="mt-8">
            {genResult?.status === "needs_review" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-brown-900">
                <div className="text-sm font-semibold text-amber-800">Submitted for review</div>
                <p className="mt-2 text-sm text-brown-800/80">{genResult.message}</p>
                <p className="mt-2 text-xs text-brown-800/55">
                  Do not pay again. The committee will verify and issue your receipt.
                </p>
              </div>
            ) : (
              <ReceiptCards receipts={doneReceipts} household={lookup?.household} />
            )}
            <div className="mt-6">
              <Button type="button" variant="subtle" onClick={resetAll} data-testid="start-over-btn">
                <RotateCcw className="h-4 w-4" /> Look up another flat
              </Button>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
