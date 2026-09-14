import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Upload } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Input, Label, Select, Textarea } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

const EMPTY = {
  package_code: "",
  business_name: "",
  contact_name: "",
  mobile: "",
  email: "",
  location_scope: "inside_one_ten",
  tower_or_area: "",
  category: "",
  headline: "",
  writeup: "",
  link_type: "none",
  link_url: "",
  link_label: "Visit",
  terms_accepted: false,
};

export default function AdvertiseApply() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resubmitToken = (searchParams.get("resubmit") || "").trim();
  const [catalog, setCatalog] = useState(null);
  const [payCfg, setPayCfg] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loadingResubmit, setLoadingResubmit] = useState(!!resubmitToken);
  const [adId, setAdId] = useState("");
  const [token, setToken] = useState("");
  const [isResubmit, setIsResubmit] = useState(false);
  const [existingMediaCount, setExistingMediaCount] = useState(0);
  const [hasExistingPayment, setHasExistingPayment] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [mediaFiles, setMediaFiles] = useState([]);
  const [utr, setUtr] = useState("");
  const [proof, setProof] = useState(null);

  useEffect(() => {
    api.get("/ads/packages").then((r) => setCatalog(r.data)).catch(() => {});
    api.get("/config").then((r) => setPayCfg(r.data?.payment || r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!resubmitToken) return;
    let cancelled = false;
    setLoadingResubmit(true);
    api.get(`/ads/status/${resubmitToken}`)
      .then((r) => {
        if (cancelled) return;
        const d = r.data;
        if (!d?.can_resubmit) {
          toast.error("This application cannot be resubmitted.");
          navigate(`/advertise/status/${resubmitToken}`, { replace: true });
          return;
        }
        setForm({
          package_code: d.package_code || "",
          business_name: d.business_name || "",
          contact_name: d.contact_name || "",
          mobile: d.mobile || "",
          email: d.email || "",
          location_scope: d.location_scope || "inside_one_ten",
          tower_or_area: d.tower_or_area || "",
          category: d.category || "",
          headline: d.headline || "",
          writeup: d.writeup || "",
          link_type: d.link_type || "none",
          link_url: d.link_url || "",
          link_label: d.link_label || "Visit",
          terms_accepted: true,
        });
        setAdId(d.id);
        setToken(d.status_token || resubmitToken);
        setIsResubmit(true);
        setExistingMediaCount((d.media || []).length);
        setHasExistingPayment(!!(d.payment_utr && d.payment_proof_doc_id));
        setUtr(d.payment_utr || "");
        setReviewNotes(d.review_notes || "");
        setStep(0);
        toast.message("Resubmit mode — update details, then re-upload if needed.");
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Could not load application for resubmit.");
          navigate("/advertise", { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingResubmit(false);
      });
    return () => { cancelled = true; };
  }, [resubmitToken, navigate]);

  const packages = catalog?.packages || [];
  const categories = catalog?.categories || [];
  const selected = useMemo(
    () => packages.find((p) => p.code === form.package_code),
    [packages, form.package_code],
  );
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const saveApplication = async () => {
    setBusy(true);
    try {
      if (isResubmit && adId && token) {
        const { data } = await api.put(`/ads/applications/${adId}`, { ...form, status_token: token });
        setAdId(data.id);
        setToken(data.status_token);
        setStep(2);
        toast.success("Details saved. Confirm creative and payment, then submit.");
      } else {
        const { data } = await api.post("/ads/applications", form);
        setAdId(data.id);
        setToken(data.status_token);
        setStep(2);
        toast.success("Application created. Upload creative and payment proof.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save application.");
    } finally {
      setBusy(false);
    }
  };

  const uploadAll = async () => {
    const needNewMedia = !existingMediaCount && !mediaFiles.length;
    if (needNewMedia) {
      toast.error("Add at least one image or video.");
      return;
    }
    const needPayment = !hasExistingPayment;
    if (needPayment && (!utr.trim() || !proof)) {
      toast.error("Enter UTR and upload payment screenshot.");
      return;
    }
    if (!needPayment && utr.trim() && !proof && !hasExistingPayment) {
      toast.error("Upload payment screenshot with the UTR.");
      return;
    }
    setBusy(true);
    try {
      for (const file of mediaFiles) {
        const fd = new FormData();
        fd.append("status_token", token);
        fd.append("kind", file.type.startsWith("video/") ? "video" : "image");
        fd.append("file", file);
        await api.post(`/ads/applications/${adId}/media`, fd);
      }
      if (proof || (utr.trim() && !hasExistingPayment)) {
        if (!utr.trim() || !proof) {
          toast.error("Enter UTR and upload payment screenshot.");
          setBusy(false);
          return;
        }
        const payFd = new FormData();
        payFd.append("status_token", token);
        payFd.append("utr", utr.trim());
        payFd.append("screenshot", proof);
        await api.post(`/ads/applications/${adId}/payment-proof`, payFd);
      }
      await api.post(`/ads/applications/${adId}/submit`, { status_token: token });
      toast.success(isResubmit ? "Resubmitted for committee review." : "Submitted for committee review.");
      navigate(`/advertise/status/${token}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload / submit failed.");
    } finally {
      setBusy(false);
    }
  };

  const upiId = payCfg?.upi?.vpa || payCfg?.upi?.upi_id || payCfg?.upi?.id || "";

  if (loadingResubmit) {
    return (
      <PublicLayout>
        <div className="grid min-h-[50vh] place-items-center text-brown-800/50">
          <Loader2 className="h-8 w-8 animate-spin text-vermilion-500" />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Link to="/advertise" className="inline-flex items-center gap-2 text-sm text-brown-800/70 hover:text-vermilion-600">
          <ArrowLeft className="h-4 w-4" /> Back to packages
        </Link>
        <h1 className="mt-4 font-display text-4xl text-brown-900">
          {isResubmit ? "Update & resubmit" : "Advertise with One Ten"}
        </h1>
        <p className="mt-2 text-brown-800/70">
          {isResubmit
            ? "Same application record — one resubmit only. Fix the notes below, then submit again."
            : "Paid application · committee review · one resubmit if changes are needed."}
        </p>
        {isResubmit && reviewNotes && (
          <div className="mt-4 rounded-xl border border-gold-500/40 bg-gold-50 px-4 py-3 text-sm text-brown-900" data-testid="ad-resubmit-notes">
            <span className="font-semibold">Committee notes: </span>{reviewNotes}
          </div>
        )}

        <div className="mt-6 flex gap-2 text-xs font-semibold uppercase tracking-wider text-brown-800/50">
          {["Package & details", "Confirm", "Pay & upload"].map((label, i) => (
            <span key={label} className={`rounded-full px-3 py-1 ${step === i ? "bg-vermilion-500 text-white" : "bg-ivory-200"}`}>{i + 1}. {label}</span>
          ))}
        </div>

        {step === 0 && (
          <div className="mt-8 space-y-4 rounded-2xl border border-brown-800/10 bg-white p-6">
            <div>
              <Label required>Package</Label>
              <Select data-testid="ad-package" value={form.package_code} onChange={(e) => set("package_code", e.target.value)}>
                <option value="">Select package</option>
                {packages.map((p) => (
                  <option key={p.code} value={p.code}>{p.name} — {formatPaise(p.amount_paise)}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label required>Business name</Label>
                <Input data-testid="ad-business-name" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
              </div>
              <div>
                <Label required>Contact name</Label>
                <Input data-testid="ad-contact-name" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
              </div>
              <div>
                <Label required>Mobile</Label>
                <Input data-testid="ad-mobile" inputMode="numeric" value={form.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <Label required>Location</Label>
                <Select data-testid="ad-scope" value={form.location_scope} onChange={(e) => set("location_scope", e.target.value)}>
                  <option value="inside_one_ten">Inside One Ten</option>
                  <option value="outside_one_ten">Outside One Ten</option>
                </Select>
              </div>
              <div>
                <Label>Tower / area</Label>
                <Input value={form.tower_or_area} onChange={(e) => set("tower_or_area", e.target.value)} placeholder="e.g. Tower 5 / Newtown" />
              </div>
              <div className="sm:col-span-2">
                <Label required>Category</Label>
                <Select data-testid="ad-category" value={form.category} onChange={(e) => set("category", e.target.value)}>
                  <option value="">Select category</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label required>Headline</Label>
                <Input data-testid="ad-headline" value={form.headline} onChange={(e) => set("headline", e.target.value)} maxLength={120} />
              </div>
              <div className="sm:col-span-2">
                <Label required>Write-up</Label>
                <Textarea data-testid="ad-writeup" value={form.writeup} onChange={(e) => set("writeup", e.target.value)} rows={5} maxLength={2000} />
              </div>
              <div>
                <Label>Link type</Label>
                <Select value={form.link_type} onChange={(e) => set("link_type", e.target.value)}>
                  <option value="none">No link</option>
                  <option value="internal">Internal page (starts with /)</option>
                  <option value="external">External https website</option>
                </Select>
              </div>
              <div>
                <Label>Link URL</Label>
                <Input value={form.link_url} onChange={(e) => set("link_url", e.target.value)} placeholder="/donate or https://..." />
              </div>
            </div>
            {!isResubmit && (
              <label className="flex items-start gap-2 text-sm text-brown-800/80">
                <input type="checkbox" checked={form.terms_accepted} onChange={(e) => set("terms_accepted", e.target.checked)} data-testid="ad-terms" />
                I confirm this is a paid advertisement, content is accurate, and One Ten EOC may approve or reject it.
              </label>
            )}
            <Button
              variant="primary"
              data-testid="ad-details-next"
              disabled={!form.package_code || !form.business_name || !form.contact_name || form.mobile.length !== 10 || !form.category || !form.headline || !form.writeup || !form.terms_accepted}
              onClick={() => setStep(1)}
            >
              Review <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="mt-8 space-y-4 rounded-2xl border border-brown-800/10 bg-white p-6">
            <h2 className="font-display text-2xl text-brown-900">Confirm before payment</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-brown-800/50">Package</dt><dd className="font-semibold">{selected?.name} · {formatPaise(selected?.amount_paise)}</dd></div>
              <div><dt className="text-brown-800/50">Business</dt><dd className="font-semibold">{form.business_name}</dd></div>
              <div><dt className="text-brown-800/50">Location</dt><dd className="font-semibold">{form.location_scope === "inside_one_ten" ? "Inside One Ten" : "Outside One Ten"}{form.tower_or_area ? ` · ${form.tower_or_area}` : ""}</dd></div>
              <div><dt className="text-brown-800/50">Category</dt><dd className="font-semibold">{form.category}</dd></div>
              <div className="sm:col-span-2"><dt className="text-brown-800/50">Headline</dt><dd className="font-semibold">{form.headline}</dd></div>
              <div className="sm:col-span-2"><dt className="text-brown-800/50">Write-up</dt><dd>{form.writeup}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-3">
              <Button variant="subtle" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /> Edit</Button>
              <Button variant="primary" data-testid="ad-create-btn" disabled={busy} onClick={saveApplication}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isResubmit ? "Save updates & continue" : "Create application & continue"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-8 space-y-5 rounded-2xl border border-brown-800/10 bg-white p-6">
            <h2 className="font-display text-2xl text-brown-900">
              {isResubmit ? "Refresh creative & confirm payment" : `Pay ${formatPaise(selected?.amount_paise)} and upload creative`}
            </h2>
            <p className="text-sm text-brown-800/70">
              {isResubmit
                ? "You do not need to pay again unless the package fee changed. Re-upload creative if requested; existing files stay unless replaced."
                : `Pay via the committee UPI${upiId ? ` (${upiId})` : ""}, then upload the payment screenshot with UTR plus your ad images/video.`}
            </p>
            {existingMediaCount > 0 && (
              <p className="text-xs text-brown-800/60" data-testid="ad-existing-media">
                {existingMediaCount} creative file(s) already on file. Optional: upload replacements below.
              </p>
            )}
            <div>
              <Label required={!existingMediaCount}>Creative files (images and/or one video)</Label>
              <Input data-testid="ad-media" type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" onChange={(e) => setMediaFiles(Array.from(e.target.files || []))} />
              {!!mediaFiles.length && <p className="mt-1 text-xs text-brown-800/60">{mediaFiles.length} new file(s) selected</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label required={!hasExistingPayment}>UTR / UPI reference</Label>
                <Input data-testid="ad-utr" value={utr} onChange={(e) => setUtr(e.target.value)} />
              </div>
              <div>
                <Label required={!hasExistingPayment}>Payment screenshot</Label>
                <Input data-testid="ad-payment-proof" type="file" accept="image/*,application/pdf" onChange={(e) => setProof(e.target.files?.[0] || null)} />
                {hasExistingPayment && !proof && (
                  <p className="mt-1 text-xs text-brown-800/60">Existing payment proof on file — re-upload only if you need to replace it.</p>
                )}
              </div>
            </div>
            <Button variant="primary" data-testid="ad-submit-btn" disabled={busy} onClick={uploadAll}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isResubmit ? "Resubmit for review" : "Upload & submit for review"}
            </Button>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
