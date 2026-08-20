import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import api from "../../lib/api";
import { Card, CardBody, Table, THead, TR, TH, TD, Button, Spinner } from "../../components/ui";
import { formatDateIST } from "../../lib/utils";

export default function Reports() {
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get("/reports/list").then((r) => setList(r.data.items || [])); }, []);

  const open = async (key) => {
    setActive(key); setLoading(true); setData(null);
    try { const r = await api.get(`/reports/${key}`); setData(r.data); }
    catch { toast.error("Could not load report"); }
    finally { setLoading(false); }
  };

  const download = async (fmt) => {
    try {
      const r = await api.get(`/reports/${active}/export?format=${fmt}`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = `${active}.${fmt}`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  return (
    <div data-testid="reports-page">
      <h1 className="mb-1 font-display text-4xl">Reports</h1>
      <p className="mb-4 text-sm text-brown-800/50">Every export shows filters, generation time and generator. Spreadsheet formula-injection is neutralised.</p>
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card><CardBody>
          <div className="flex flex-col gap-1">
            {list.map((r) => (
              <button key={r.key} data-testid={`report-${r.key}`} onClick={() => open(r.key)}
                className={`rounded-md px-3 py-2 text-left text-sm font-medium ${active === r.key ? "bg-vermilion-500 text-white" : "hover:bg-ivory-300 text-brown-800"}`}>
                {r.title}
              </button>
            ))}
          </div>
        </CardBody></Card>

        <Card><CardBody>
          {!active && <div className="py-16 text-center text-sm text-brown-800/40">Select a report.</div>}
          {loading && <Spinner className="text-vermilion-500" />}
          {data && !loading && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl">{data.title}</h2>
                  <p className="text-xs text-brown-800/50">Generated {formatDateIST(data.generated_at)} · by {data.generated_by} · {data.rows.length} rows</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="subtle" size="sm" onClick={() => download("csv")} data-testid="export-csv"><FileDown className="h-4 w-4" /> CSV</Button>
                  <Button variant="subtle" size="sm" onClick={() => download("xlsx")} data-testid="export-xlsx"><FileSpreadsheet className="h-4 w-4" /> XLSX</Button>
                  <Button variant="subtle" size="sm" onClick={() => download("pdf")} data-testid="export-pdf"><FileText className="h-4 w-4" /> PDF</Button>
                </div>
              </div>
              <Table>
                <THead><TR>{data.headers.map((h) => <TH key={h}>{h}</TH>)}</TR></THead>
                <tbody>{data.rows.slice(0, 300).map((row, i) => (
                  <TR key={i}>{row.map((c, j) => <TD key={j}>{String(c)}</TD>)}</TR>
                ))}</tbody>
              </Table>
            </>
          )}
        </CardBody></Card>
      </div>
    </div>
  );
}
