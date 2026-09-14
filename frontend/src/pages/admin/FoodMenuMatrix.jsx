import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, RefreshCw, ImagePlus, Save, X, Sparkles } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Button, Spinner, Input, Label } from "../../components/ui";
import { formatPaise } from "../../lib/utils";

function mediaUrl(path) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/${path}`;
}

function formatMenuDate(isoDate) {
  if (!isoDate) return "";
  try {
    const [y, m, d] = String(isoDate).split("-").map(Number);
    if (!y || !m || !d) return isoDate;
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return isoDate;
  }
}

function CellEditor({ cell, onClose, onSaved }) {
  const [price, setPrice] = useState(String(Math.round((Number(cell.amount_paise) || 0) / 100)));
  const [name, setName] = useState(cell.name || "");
  const [description, setDescription] = useState(cell.description || "");
  const [active, setActive] = useState(!!cell.active);
  const [isComplimentary, setIsComplimentary] = useState(!!cell.is_complimentary);
  const [complimentaryNote, setComplimentaryNote] = useState(cell.complimentary_note || "");
  const [priceNote, setPriceNote] = useState(cell.price_note || "");
  const [badge, setBadge] = useState(cell.badge || "");
  const [imageUrl, setImageUrl] = useState(cell.image_url || "");
  const [image, setImage] = useState(null);
  const [clearImage, setClearImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const save = async () => {
    const rupees = Number(price);
    if (Number.isNaN(rupees) || rupees < 0) {
      toast.error("Enter a valid price (0 allowed for free / included plates)");
      return;
    }
    if (!name.trim()) {
      toast.error("Menu name is required");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("day_code", cell.day_code);
      fd.append("meal", cell.meal);
      fd.append("diet", cell.diet);
      fd.append("name", name.trim());
      fd.append("description", description.trim());
      fd.append("price_rupees", String(rupees));
      fd.append("active", active ? "true" : "false");
      fd.append("is_complimentary", isComplimentary ? "true" : "false");
      fd.append("complimentary_note", complimentaryNote.trim());
      fd.append("price_note", priceNote.trim());
      fd.append("badge", badge.trim());
      if (clearImage) fd.append("clear_image", "true");
      else if (image) fd.append("image", image);
      else if (imageUrl.trim() && imageUrl.trim() !== (cell.image_url || "")) {
        fd.append("image_url", imageUrl.trim());
      }
      const r = await api.put("/admin/food-menu-matrix/cell", fd);
      toast.success("Cell saved");
      onSaved?.(r.data.item);
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save cell");
    } finally {
      setBusy(false);
    }
  };

  const previewSrc = image
    ? URL.createObjectURL(image)
    : (!clearImage && imageUrl ? mediaUrl(imageUrl) : "");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brown-900/40 p-3 sm:items-center" data-testid="food-matrix-cell-editor">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-sun-400/30 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-vermilion-500">
              {cell.day_label} · {cell.meal_label} · {cell.diet_label}
            </p>
            <h3 className="mt-1 font-display text-2xl text-brown-900">{formatMenuDate(cell.menu_date)} {cell.menu_date}</h3>
            <p className="mt-1 font-mono text-[11px] text-brown-800/45">{cell.matrix_key}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-brown-800/50 hover:bg-sun-50" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <Label required>Menu name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="matrix-cell-name" maxLength={120} />
          </div>
          <div>
            <Label>Description (dishes on the plate)</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={800}
              placeholder="What’s on the plate…"
              className="mt-1 w-full rounded-xl border border-sun-400/40 bg-white px-3 py-2 text-sm text-brown-900 outline-none focus:border-vermilion-500"
              data-testid="matrix-cell-desc"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label required>Price (₹)</Label>
              <Input type="number" min={0} step="1" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="matrix-cell-price" />
              <p className="mt-1 text-[11px] text-brown-800/45">Use extra-head price for complimentary meals.</p>
            </div>
            <div>
              <Label>Public badge</Label>
              <Input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="e.g. Complimentary (4) · Extra ₹150" maxLength={120} />
            </div>
          </div>
          <div>
            <Label>Price note</Label>
            <Input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="Shown under the plate (optional)" maxLength={300} />
          </div>
          <label className="flex items-center gap-2 text-sm text-brown-800/80">
            <input type="checkbox" checked={isComplimentary} onChange={(e) => setIsComplimentary(e.target.checked)} className="h-4 w-4" />
            Complimentary / special pricing exception
          </label>
          {isComplimentary ? (
            <div>
              <Label>Complimentary / exception note</Label>
              <textarea
                value={complimentaryNote}
                onChange={(e) => setComplimentaryNote(e.target.value)}
                rows={2}
                maxLength={400}
                placeholder="e.g. Complimentary for 4 heads per subscription. Extra ₹150 per head."
                className="mt-1 w-full rounded-xl border border-sun-400/40 bg-white px-3 py-2 text-sm text-brown-900 outline-none focus:border-vermilion-500"
              />
            </div>
          ) : null}
          <div>
            <Label>Menu image</Label>
            <div className="mt-1 flex flex-wrap items-start gap-3">
              {previewSrc ? (
                <img src={previewSrc} alt="" className="h-24 w-36 rounded-lg object-cover ring-1 ring-sun-400/30" />
              ) : (
                <div className="grid h-24 w-36 place-items-center rounded-lg border border-dashed border-amber-400/50 bg-amber-50 px-2 text-center">
                  <span className="text-[10px] font-semibold uppercase leading-tight text-amber-800/85">
                    Image not uploaded
                  </span>
                </div>
              )}
              <div className="min-w-[12rem] flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="subtle" size="sm" onClick={() => { setClearImage(false); fileRef.current?.click(); }}>
                    <ImagePlus className="h-4 w-4" /> Upload image
                  </Button>
                  {(previewSrc || cell.image_url) ? (
                    <Button
                      type="button"
                      variant="subtle"
                      size="sm"
                      onClick={() => { setImage(null); setClearImage(true); setImageUrl(""); }}
                    >
                      Clear image
                    </Button>
                  ) : null}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="matrix-cell-image"
                  onChange={(e) => { setClearImage(false); setImage(e.target.files?.[0] || null); }}
                />
                {image?.name && <p className="text-xs text-brown-800/50">{image.name}</p>}
                <div>
                  <Label>Or image URL / path</Label>
                  <Input
                    value={imageUrl}
                    onChange={(e) => { setClearImage(false); setImageUrl(e.target.value); }}
                    placeholder="/images/food-menu/day/…"
                    disabled={!!image || clearImage}
                  />
                </div>
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-brown-800/80">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
            Active on public Food page
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="admin" disabled={busy} onClick={save} data-testid="matrix-cell-save">
            <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save cell"}
          </Button>
          <Button type="button" variant="subtle" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function FoodMenuMatrix() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [overallUploading, setOverallUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draftPrices, setDraftPrices] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [seeding, setSeeding] = useState(false);
  const fileRef = useRef(null);
  const overallFileRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/food-menu-matrix")
      .then((r) => {
        setData(r.data);
        const prices = {};
        for (const c of r.data.cells || []) {
          prices[c.matrix_key] = String(Math.round((Number(c.amount_paise) || 0) / 100));
        }
        setDraftPrices(prices);
      })
      .catch(() => toast.error("Could not load food menu matrix"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const cellsByDay = useMemo(() => {
    const map = {};
    for (const c of data?.cells || []) {
      if (!map[c.day_code]) map[c.day_code] = {};
      map[c.day_code][`${c.meal}|${c.diet}`] = c;
    }
    return map;
  }, [data]);

  const columns = data?.columns || [];

  const quickSavePrice = async (cell) => {
    const key = cell.matrix_key;
    const rupees = Number(draftPrices[key]);
    if (Number.isNaN(rupees) || rupees < 0) {
      toast.error("Invalid price");
      return;
    }
    setSavingKey(key);
    try {
      const fd = new FormData();
      fd.append("day_code", cell.day_code);
      fd.append("meal", cell.meal);
      fd.append("diet", cell.diet);
      fd.append("name", cell.name || "");
      fd.append("description", cell.description || "");
      fd.append("price_rupees", String(rupees));
      fd.append("active", (!cell.exists || cell.active) ? "true" : "false");
      if (!cell.exists) fd.set("active", "true");
      await api.put("/admin/food-menu-matrix/cell", fd);
      toast.success("Price saved");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save price");
    } finally {
      setSavingKey("");
    }
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const r = await api.get("/admin/food-menu-matrix/template", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "one10_food_menu_matrix.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Matrix Excel downloaded");
    } catch {
      toast.error("Could not download template");
    } finally {
      setDownloading(false);
    }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/admin/food-menu-matrix/import", fd);
      setImportResult(r.data);
      toast.success(r.data.message || "Import complete");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Excel import failed");
    } finally {
      setUploading(false);
    }
  };

  const onOverallUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOverallUploading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/admin/food-menu-matrix/upload-overall", fd);
      setImportResult(r.data);
      toast.success(r.data.message || "Overall menu uploaded");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Overall menu upload failed");
    } finally {
      setOverallUploading(false);
    }
  };

  const seedOfficial = async () => {
    if (!window.confirm("Load the official Pujo poster menu (all 36 cells, prices, notes, day plate images)? Existing cell data will be overwritten.")) {
      return;
    }
    setSeeding(true);
    try {
      const r = await api.post("/admin/food-menu-matrix/seed-official");
      toast.success(r.data.message || "Official menu seeded");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not seed official menu");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Card className="mb-4" data-testid="food-menu-matrix-card">
      <CardBody>
        <div className="mb-4 rounded-xl border border-vermilion-500/25 bg-gradient-to-br from-vermilion-500/10 via-sun-50 to-white p-4" data-testid="food-overall-menu-upload">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-display text-lg text-brown-900">Upload overall food menu</div>
              <p className="mt-1 text-sm text-brown-800/65">
                One file for all days and categories — Word (.docx), Excel, PDF or image.
                Word/Excel fills the matrix below; you can still edit each cell afterward.
              </p>
              {data?.overall_menu_url ? (
                <p className="mt-2 text-xs text-brown-800/55">
                  Current:{" "}
                  <a
                    href={mediaUrl(data.overall_menu_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-vermilion-600 underline-offset-2 hover:underline"
                  >
                    {data.overall_menu_filename || "View uploaded menu"}
                  </a>
                  {data.overall_menu_uploaded_at ? ` · ${new Date(data.overall_menu_uploaded_at).toLocaleString("en-IN")}` : ""}
                </p>
              ) : null}
            </div>
            <div className="shrink-0">
              <Button
                variant="admin"
                disabled={overallUploading}
                onClick={() => overallFileRef.current?.click()}
                data-testid="food-overall-menu-upload-btn"
              >
                <Upload className="h-4 w-4" /> {overallUploading ? "Uploading…" : "Upload overall menu"}
              </Button>
              <input
                ref={overallFileRef}
                type="file"
                accept=".docx,.xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/*"
                className="hidden"
                onChange={onOverallUpload}
                data-testid="food-overall-menu-file"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="font-display text-xl text-brown-900">Pujo menu matrix</div>
            <p className="mt-1 text-sm text-brown-800/60">
              Edit each day × meal × diet cell — price, dishes, image, exceptions. Excel for bulk updates.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="subtle" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="admin" size="sm" disabled={seeding} onClick={seedOfficial} data-testid="food-matrix-seed-official">
              <Sparkles className="h-4 w-4" /> {seeding ? "Seeding…" : "Load official Pujo menu"}
            </Button>
            <Button variant="admin" size="sm" disabled={downloading} onClick={downloadTemplate} data-testid="food-matrix-excel-download">
              <Download className="h-4 w-4" /> {downloading ? "…" : "Excel template"}
            </Button>
            <Button variant="admin" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} data-testid="food-matrix-excel-upload">
              <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload Excel"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onUpload}
              data-testid="food-matrix-excel-file"
            />
          </div>
        </div>

        {importResult && (
          <div className="mt-3 rounded-lg border border-sun-400/30 bg-sun-50/60 px-3 py-2 text-sm text-brown-800/80" data-testid="food-matrix-import-result">
            {importResult.message}
            {!!(importResult.errors || []).length && (
              <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
                {importResult.errors.slice(0, 5).map((e) => (
                  <li key={`${e.row}-${e.error}`}>Row {e.row}: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loading || !data ? (
          <div className="py-10"><Spinner className="text-vermilion-500" /></div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[960px] w-full border-collapse text-sm" data-testid="food-menu-matrix-table">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-[10px] uppercase tracking-wider text-brown-800/45">Day</th>
                  {columns.map((col) => (
                    <th key={col.key} className="px-2 py-2 text-center text-[10px] uppercase tracking-wider text-brown-800/55">
                      <div>{col.meal_label}</div>
                      <div className={col.diet === "veg" ? "text-emerald-700" : "text-vermilion-600"}>{col.diet_label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.days || []).map((day) => (
                  <tr key={day.code} className="border-t border-sun-400/20">
                    <td className="sticky left-0 z-10 bg-white px-2 py-3 align-top">
                      <div className="font-semibold text-brown-900">{day.short_label || day.label}</div>
                      <div className="text-xs text-brown-800/50">{formatMenuDate(day.date)} · {day.weekday}</div>
                    </td>
                    {columns.map((col) => {
                      const cell = cellsByDay[day.code]?.[col.key];
                      if (!cell) {
                        return <td key={col.key} className="px-2 py-2 text-center text-brown-800/30">—</td>;
                      }
                      const draft = draftPrices[cell.matrix_key] ?? "";
                      return (
                        <td key={col.key} className="px-1.5 py-2 align-top">
                          <div
                            className={`rounded-xl border p-2 ${
                              cell.active
                                ? "border-emerald-400/40 bg-emerald-50/40"
                                : "border-sun-400/25 bg-sun-50/30"
                            }`}
                            data-testid={`matrix-cell-${cell.matrix_key}`}
                          >
                            <button
                              type="button"
                              className="mb-1.5 block w-full overflow-hidden rounded-lg bg-white"
                              onClick={() => setEditing(cell)}
                              title="Edit image & details"
                            >
                              {cell.image_url ? (
                                <img src={mediaUrl(cell.image_url)} alt="" className="h-14 w-full object-cover" />
                              ) : (
                                <div className="grid h-14 place-items-center bg-amber-50 px-1 text-center">
                                  <span className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-amber-800/80">
                                    Image not uploaded
                                  </span>
                                </div>
                              )}
                            </button>
                            {cell.badge || cell.is_complimentary ? (
                              <p className="mb-1 truncate text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                                {cell.badge || "Complimentary"}
                              </p>
                            ) : null}
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-brown-800/45">₹</span>
                              <input
                                type="number"
                                min={0}
                                className="h-8 w-full rounded-md border border-brown-800/15 bg-white px-1.5 text-sm tabular-nums"
                                value={draft}
                                onChange={(e) => setDraftPrices((p) => ({ ...p, [cell.matrix_key]: e.target.value }))}
                                data-testid={`matrix-price-${cell.matrix_key}`}
                              />
                            </div>
                            <div className="mt-1.5 flex gap-1">
                              <Button
                                type="button"
                                variant="subtle"
                                size="sm"
                                className="flex-1 px-1 text-[10px]"
                                disabled={savingKey === cell.matrix_key}
                                onClick={() => quickSavePrice(cell)}
                              >
                                {savingKey === cell.matrix_key ? "…" : "Save"}
                              </Button>
                              <Button
                                type="button"
                                variant="subtle"
                                size="sm"
                                className="px-2 text-[10px]"
                                onClick={() => setEditing(cell)}
                              >
                                Edit
                              </Button>
                            </div>
                            <div className="mt-1 text-[10px] text-brown-800/45">
                              {cell.active ? "Live" : cell.exists ? "Hidden" : "Not set"}
                              {cell.exists ? ` · ${formatPaise(cell.amount_paise)}` : ""}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

      {editing && (
        <CellEditor
          cell={editing}
          onClose={() => setEditing(null)}
          onSaved={() => load()}
        />
      )}
    </Card>
  );
}
