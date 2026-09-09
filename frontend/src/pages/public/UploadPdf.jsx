import React, { useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";

const MAX_BYTES = 6 * 1024 * 1024;

export default function UploadPdf() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      toast.error("Please choose a PDF file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("PDF must be 6 MB or smaller.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload-pdf", fd);
      setResult(r.data);
      toast.success("PDF uploaded");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <div className="mx-auto max-w-xl px-5 py-12" data-testid="upload-pdf-page">
        <h1 className="font-display text-5xl text-brown-900">Upload PDF</h1>
        <p className="mt-2 text-brown-800/70">
          Choose a PDF up to <b>6 MB</b>. After upload you get a public link.
        </p>

        <div className="mt-8 rounded-2xl border border-sun-400/30 bg-white p-6 text-brown-900">
          <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-vermilion-500/50 bg-vermilion-500/10 px-6 py-12 text-center hover:bg-vermilion-500/15">
            {busy ? (
              <Loader2 className="h-8 w-8 animate-spin text-vermilion-600" />
            ) : (
              <FileUp className="h-8 w-8 text-vermilion-600" />
            )}
            <span className="mt-3 text-lg font-semibold text-vermilion-700" data-testid="upload-pdf-btn">
              {busy ? "Uploading…" : "Select PDF to upload"}
            </span>
            <span className="mt-1 text-xs text-brown-800/55">PDF only · max 6 MB</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={busy}
              data-testid="upload-pdf-file"
              onChange={onFile}
            />
          </label>

          {result?.url && (
            <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Uploaded
              </div>
              <p className="mt-1 break-all">{result.original_filename} · {(result.size / 1024).toFixed(0)} KB</p>
              <a
                href={result.absolute_url || result.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 font-semibold text-vermilion-600 underline"
                data-testid="upload-pdf-link"
              >
                Open PDF <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <p className="mt-2 break-all text-xs text-emerald-900/70">{result.absolute_url || result.url}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  navigator.clipboard?.writeText(result.absolute_url || result.url);
                  toast.success("Link copied");
                }}
              >
                Copy link
              </Button>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
