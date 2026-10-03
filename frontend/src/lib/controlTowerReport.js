/** Professional WhatsApp-shareable Control Tower PNG (canvas). */

const W = 1080;
const H = 1920;
const M = 48; // outer margin
const CONTENT = W - M * 2; // 984
const GAP = 16;

const C = {
  night: "#1A100E",
  night2: "#2A1814",
  panel: "#FFFBF5",
  panelLine: "rgba(31,20,18,0.08)",
  gold: "#C9A227",
  goldSoft: "rgba(201,162,39,0.35)",
  vermilion: "#C4321A",
  emerald: "#0B7A5A",
  white: "#FFFFFF",
  muted: "rgba(255,251,245,0.68)",
  ink: "#1A100E",
  inkSoft: "rgba(26,16,14,0.55)",
  inkFaint: "rgba(26,16,14,0.28)",
  grid: "rgba(26,16,14,0.08)",
};

const TOWER_COLORS = [
  "#C4321A", "#C9A227", "#0B7A5A", "#0284C7",
  "#7C3AED", "#D97706", "#E11D48", "#0F766E",
  "#DB2777", "#2563EB", "#A16207",
];

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, fill, stroke) {
  roundRect(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function text(ctx, value, x, y, opts = {}) {
  const {
    size = 24,
    weight = "600",
    color = C.ink,
    align = "left",
    baseline = "alphabetic",
    family = "system-ui, -apple-system, Segoe UI, sans-serif",
    maxWidth,
  } = opts;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (maxWidth) ctx.fillText(String(value ?? ""), x, y, maxWidth);
  else ctx.fillText(String(value ?? ""), x, y);
}

function compactMoney(s) {
  const raw = String(s ?? "");
  return raw.replace(/\.00(?!\d)/g, "");
}

function stampDate() {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " IST";
}

function drawDonut(ctx, cx, cy, radius, slices, holeFill = C.panel) {
  const total = slices.reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (!total) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = C.grid;
    ctx.fill();
    return;
  }
  let angle = -Math.PI / 2;
  slices.forEach((slice, i) => {
    const next = angle + ((Number(slice.value) || 0) / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, next);
    ctx.closePath();
    ctx.fillStyle = slice.color || TOWER_COLORS[i % TOWER_COLORS.length];
    ctx.fill();
    angle = next;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = holeFill;
  ctx.fill();
}

/** Vertical bar chart — amounts by tower (no duplicate donut of same data). */
function drawTowerBars(ctx, x, y, w, h, towers) {
  const padL = 56;
  const padB = 42;
  const padT = 12;
  const padR = 12;
  const plotX = x + padL;
  const plotY = y + padT;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const max = Math.max(...towers.map((t) => Number(t.value) || 0), 1);

  // gridlines
  for (let i = 0; i <= 4; i += 1) {
    const gy = plotY + plotH - (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.stroke();
    const rupees = (max * i) / 4 / 100;
    const label = rupees >= 1000
      ? `₹${(rupees / 1000).toFixed(rupees % 1000 === 0 ? 0 : 1)}k`
      : `₹${Math.round(rupees)}`;
    text(ctx, label, plotX - 10, gy + 4, {
      size: 14, weight: "500", color: C.inkSoft, align: "right",
    });
  }

  const n = towers.length || 1;
  const slot = plotW / n;
  const barW = Math.min(42, slot * 0.62);

  towers.forEach((t, i) => {
    const val = Number(t.value) || 0;
    const bh = (val / max) * plotH;
    const bx = plotX + slot * i + (slot - barW) / 2;
    const by = plotY + plotH - bh;
    const color = t.color || TOWER_COLORS[i % TOWER_COLORS.length];
    fillRound(ctx, bx, by, barW, Math.max(bh, 2), 6, color);
    text(ctx, t.name, plotX + slot * i + slot / 2, y + h - 14, {
      size: 15, weight: "700", color: C.ink, align: "center",
    });
  });
}

/** Horizontal bars — paid household counts (different metric from ₹ bars). */
function drawHomesBars(ctx, x, y, w, h, homes) {
  const max = Math.max(...homes.map((t) => Number(t.value) || 0), 1);
  const rowH = Math.min(36, h / Math.max(homes.length, 1));
  homes.forEach((t, i) => {
    const ry = y + i * rowH;
    const barMax = w - 120;
    const bw = ((Number(t.value) || 0) / max) * barMax;
    text(ctx, t.name, x, ry + rowH * 0.62, { size: 15, weight: "700", color: C.ink });
    fillRound(ctx, x + 44, ry + 8, Math.max(bw, 4), rowH - 14, 5, t.color || TOWER_COLORS[i % TOWER_COLORS.length]);
    text(ctx, String(t.value), x + 52 + Math.max(bw, 4), ry + rowH * 0.62, {
      size: 14, weight: "600", color: C.inkSoft,
    });
  });
}

/**
 * @param {object} payload
 * @returns {Promise<Blob>}
 */
export async function buildControlTowerPngBlob(payload) {
  const {
    collected = "—",
    paidHouseholds = "—",
    expenses = "—",
    netBalance = "—",
    foodOrders = "—",
    towerSlices = [],
    methodSlices = [],
    towerHomes = [],
  } = payload || {};

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.night);
  bg.addColorStop(0.34, C.night2);
  bg.addColorStop(0.34, "#EFE4D4");
  bg.addColorStop(1, "#E8D9C4");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, 0, W, 8);

  // —— Header ——
  text(ctx, "ONE 10 EVENTS", M, 64, {
    size: 22, weight: "700", color: C.gold, family: "Georgia, 'Times New Roman', serif",
  });
  text(ctx, "Durga Pujo 2026", M, 96, { size: 18, weight: "500", color: C.muted });
  text(ctx, "Control Tower Report", M, 156, {
    size: 44, weight: "700", color: C.white, family: "Georgia, 'Times New Roman', serif",
  });
  text(ctx, stampDate(), M, 196, { size: 18, weight: "500", color: C.muted });

  // —— KPI grid 2×2 (aligned to content width) ——
  const kpiY = 230;
  const kpiH = 112;
  const kpiCols = 2;
  const kpiRows = 2;
  const kpiW = (CONTENT - GAP) / kpiCols;
  const kpis = [
    { label: "COLLECTED", value: compactMoney(collected), accent: "#34D399" },
    { label: "PAID HOMES", value: String(paidHouseholds), accent: C.gold },
    { label: "EXPENSES", value: compactMoney(expenses), accent: "#FB7185" },
    { label: "NET BALANCE", value: compactMoney(netBalance), accent: C.white },
  ];
  kpis.forEach((kpi, i) => {
    const col = i % kpiCols;
    const row = Math.floor(i / kpiCols);
    const x = M + col * (kpiW + GAP);
    const y = kpiY + row * (kpiH + GAP);
    fillRound(ctx, x, y, kpiW, kpiH, 18, "rgba(255,255,255,0.07)", C.goldSoft);
    text(ctx, kpi.label, x + 22, y + 36, { size: 14, weight: "700", color: C.muted });
    text(ctx, kpi.value, x + 22, y + 78, {
      size: String(kpi.value).length > 11 ? 26 : 30,
      weight: "700",
      color: kpi.accent,
      maxWidth: kpiW - 44,
    });
  });

  // —— Main cream panel ——
  const panelY = kpiY + kpiRows * (kpiH + GAP) + 12;
  const panelH = H - panelY - M;
  fillRound(ctx, M, panelY, CONTENT, panelH, 28, C.panel);

  const pad = 28;
  const innerX = M + pad;
  const innerW = CONTENT - pad * 2;
  let cursor = panelY + pad + 8;

  // Section: Tower bars (₹)
  text(ctx, "Collected by tower", innerX, cursor, {
    size: 28, weight: "700", color: C.ink, family: "Georgia, 'Times New Roman', serif",
  });
  cursor += 28;
  text(ctx, "Amount on issued receipts · Towers 1–11", innerX, cursor, {
    size: 16, weight: "500", color: C.inkSoft,
  });
  cursor += 18;

  const towers = (towerSlices || []).filter((t) => Number(t.value) > 0);
  const barBoxH = 320;
  fillRound(ctx, innerX, cursor, innerW, barBoxH, 16, "#FFF8EE", C.panelLine);
  if (towers.length) {
    drawTowerBars(ctx, innerX + 8, cursor + 8, innerW - 16, barBoxH - 16, towers);
  } else {
    text(ctx, "No tower collections yet", innerX + innerW / 2, cursor + barBoxH / 2, {
      size: 18, weight: "500", color: C.inkSoft, align: "center",
    });
  }
  cursor += barBoxH + 28;

  // Section row: methods donut + homes bars (two columns, same height)
  const colGap = 16;
  const colW = (innerW - colGap) / 2;
  const blockH = 360;

  // Payment methods (donut) — left
  fillRound(ctx, innerX, cursor, colW, blockH, 16, "#FFF8EE", C.panelLine);
  text(ctx, "Payment methods", innerX + 20, cursor + 36, {
    size: 20, weight: "700", color: C.ink, family: "Georgia, 'Times New Roman', serif",
  });
  text(ctx, "Share of collected amount", innerX + 20, cursor + 60, {
    size: 14, weight: "500", color: C.inkSoft,
  });
  const methods = (methodSlices || []).filter((m) => Number(m.value) > 0);
  const donutCx = innerX + colW / 2;
  const donutCy = cursor + 155;
  drawDonut(ctx, donutCx, donutCy, 78, methods);
  methods.forEach((m, i) => {
    const ly = cursor + 255 + i * 34;
    ctx.beginPath();
    ctx.arc(innerX + 28, ly, 7, 0, Math.PI * 2);
    ctx.fillStyle = m.color || TOWER_COLORS[i % TOWER_COLORS.length];
    ctx.fill();
    text(ctx, m.name, innerX + 44, ly + 5, { size: 15, weight: "600", color: C.ink });
    text(ctx, compactMoney(m.valueFmt || ""), innerX + colW - 20, ly + 5, {
      size: 15, weight: "600", color: C.inkSoft, align: "right",
    });
  });

  // Paid homes (horizontal bars) — right, different metric
  const rightX = innerX + colW + colGap;
  fillRound(ctx, rightX, cursor, colW, blockH, 16, "#FFF8EE", C.panelLine);
  text(ctx, "Paid homes by tower", rightX + 20, cursor + 36, {
    size: 20, weight: "700", color: C.ink, family: "Georgia, 'Times New Roman', serif",
  });
  text(ctx, "Households with receipts", rightX + 20, cursor + 60, {
    size: 14, weight: "500", color: C.inkSoft,
  });
  const homes = (towerHomes || []).filter((t) => Number(t.value) > 0);
  if (homes.length) {
    drawHomesBars(ctx, rightX + 20, cursor + 80, colW - 40, blockH - 100, homes);
  } else {
    text(ctx, "No paid households yet", rightX + colW / 2, cursor + blockH / 2, {
      size: 16, weight: "500", color: C.inkSoft, align: "center",
    });
  }
  cursor += blockH + 24;

  // Footer strip inside panel
  const footH = 72;
  const footY = Math.min(cursor, panelY + panelH - pad - footH);
  fillRound(ctx, innerX, footY, innerW, footH, 16, C.night);
  text(ctx, `Food orders  ${foodOrders}`, innerX + 24, footY + 44, {
    size: 18, weight: "600", color: C.muted,
  });
  text(ctx, "one10events.in", innerX + innerW - 24, footY + 44, {
    size: 18, weight: "700", color: C.gold, align: "right",
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Could not create PNG"));
      else resolve(blob);
    }, "image/png");
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadPng(blob, filename, title = "One 10 Control Tower") {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title,
        text: "One 10 Events · Durga Pujo 2026 — Control Tower update",
      });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

export { TOWER_COLORS };
