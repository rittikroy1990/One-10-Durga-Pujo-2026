import React from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui";
import { downloadCsv, exportRowsCsv } from "../lib/utils";

/**
 * Export CSV from either:
 * - columns + items (object rows), or
 * - headers + rows (array-of-arrays).
 */
export default function ExportCsvButton({
  filename = "export.csv",
  columns,
  items,
  headers,
  rows,
  disabled,
  className,
  "data-testid": testId = "export-csv-btn",
  label = "Export CSV",
}) {
  const onClick = () => {
    try {
      const empty =
        (columns && (!items || items.length === 0)) ||
        (headers && (!rows || rows.length === 0));
      if (empty) {
        toast.error("Nothing to export");
        return;
      }
      if (columns) exportRowsCsv(filename, columns, items);
      else downloadCsv(filename, headers, rows);
      toast.success("CSV downloaded");
    } catch {
      toast.error("Export failed");
    }
  };

  return (
    <Button
      type="button"
      variant="subtle"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-testid={testId}
    >
      <FileDown className="h-4 w-4" /> {label}
    </Button>
  );
}
