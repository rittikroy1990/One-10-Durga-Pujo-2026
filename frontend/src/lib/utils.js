import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatPaise(paise) {
  const rupees = (Number(paise || 0) / 100);
  return "₹" + rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function rupees(paise) {
  return (Number(paise || 0) / 100).toLocaleString("en-IN");
}

export function formatDateIST(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " IST";
  } catch {
    return iso;
  }
}

/** Escape a CSV cell; prefix formula-like values to avoid spreadsheet injection. */
function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Download a UTF-8 CSV (with BOM) from headers + row arrays. */
export function downloadCsv(filename, headers, rows) {
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build CSV rows from objects using column defs: { key, label, exportValue? }. */
export function exportRowsCsv(filename, columns, items) {
  const headers = columns.map((c) => c.label || c.key);
  const rows = (items || []).map((item) =>
    columns.map((c) => {
      if (typeof c.exportValue === "function") return c.exportValue(item);
      const v = item?.[c.key];
      if (v == null) return "";
      if (typeof v === "boolean") return v ? "yes" : "no";
      if (Array.isArray(v)) return v.join("; ");
      return v;
    }),
  );
  downloadCsv(filename, headers, rows);
}
