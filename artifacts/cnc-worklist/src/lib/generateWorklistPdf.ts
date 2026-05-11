import type { WorklistItem } from "@workspace/api-client-react";

interface WorklistPdfData {
  worklistNumber: string;
  folderNumber?: number | null;
  machineType?: string | null;
  status: string;
  projectId?: string | null;
  projectAddress?: string | null;
  createdAt: string;
  cutlistRefs: string[];
  cutlistItem?: string | null;
  items: WorklistItem[];
}

export function printWorklistPdf(data: WorklistPdfData) {
  const {
    worklistNumber,
    folderNumber,
    machineType,
    status,
    projectId,
    projectAddress,
    createdAt,
    cutlistRefs,
    cutlistItem,
    items,
  } = data;

  const createdDate = new Date(createdAt).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const statusColors: Record<string, string> = {
    draft: "#71717a",
    active: "#1d4ed8",
    complete: "#15803d",
  };
  const statusBg: Record<string, string> = {
    draft: "#f4f4f5",
    active: "#eff6ff",
    complete: "#f0fdf4",
  };
  const statusColor = statusColors[status] ?? "#71717a";
  const statusBgColor = statusBg[status] ?? "#f4f4f5";

  const itemRows = items
    .map(
      (item, i) => `
    <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">
      <td style="padding:10px 12px; font-family:monospace; font-size:12px; color:#2563eb; border-bottom:1px solid #e2e8f0; white-space:nowrap;">${item.pcode ?? ""}</td>
      <td style="padding:10px 12px; font-size:13px; color:#1e293b; border-bottom:1px solid #e2e8f0;">${item.displayName ?? ""}</td>
      <td style="padding:10px 12px; font-size:13px; color:#1e293b; text-align:center; border-bottom:1px solid #e2e8f0; font-weight:600;">${item.quantity ?? ""}</td>
      <td style="padding:10px 12px; font-family:monospace; font-size:12px; color:#475569; text-align:right; border-bottom:1px solid #e2e8f0;">${item.length != null ? Number(item.length).toFixed(0) : "—"}</td>
      <td style="padding:10px 12px; font-family:monospace; font-size:12px; color:#475569; text-align:right; border-bottom:1px solid #e2e8f0;">${item.width != null ? Number(item.width).toFixed(0) : "—"}</td>
      <td style="padding:10px 12px; font-size:12px; color:#475569; border-bottom:1px solid #e2e8f0;">${item.notes ? `<span style="color:#374151;">${escapeHtml(item.notes)}</span>` : `<span style="color:#cbd5e1; font-style:italic;">—</span>`}</td>
    </tr>`
    )
    .join("");

  const cutlistPills = cutlistRefs
    .map(
      (ref) =>
        `<span style="display:inline-block; background:#eef2ff; border:1px solid #c7d2fe; color:#3730a3; font-family:monospace; font-size:12px; padding:2px 10px; border-radius:4px; margin-right:6px;">${ref}</span>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Worklist ${worklistNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #ffffff;
      color: #1e293b;
      padding: 32px 40px;
      font-size: 13px;
      line-height: 1.5;
    }

    @page {
      size: A4 portrait;
      margin: 18mm 16mm;
    }

    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }

    /* ── Header bar ── */
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding-bottom: 20px;
      border-bottom: 2px solid #e2e8f0;
      margin-bottom: 20px;
    }

    .header-left h1 {
      font-size: 28px;
      font-weight: 800;
      font-family: monospace;
      letter-spacing: -0.5px;
      color: #0f172a;
    }

    .badges {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      flex-wrap: wrap;
    }

    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 4px;
      border: 1px solid;
      font-family: monospace;
    }

    .badge-folder {
      background: #dbeafe;
      color: #1e40af;
      border-color: #bfdbfe;
    }

    .badge-machine {
      background: #f4f4f5;
      color: #52525b;
      border-color: #d4d4d8;
    }

    .badge-status {
      background: ${statusBgColor};
      color: ${statusColor};
      border-color: currentColor;
      text-transform: capitalize;
    }

    .header-right {
      text-align: right;
    }

    .header-right .label {
      font-size: 11px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
    }

    .header-right .value {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }

    .header-right .date {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }

    /* ── Meta row ── */
    .meta-row {
      display: flex;
      align-items: center;
      gap: 28px;
      margin-bottom: 18px;
      font-size: 13px;
      color: #64748b;
      flex-wrap: wrap;
    }

    .meta-row .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .meta-row .meta-label {
      font-weight: 500;
      color: #94a3b8;
    }

    .meta-row .meta-value {
      font-weight: 700;
      color: #0f172a;
      font-family: monospace;
    }

    /* ── Cutlist section ── */
    .cutlist-section {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .cutlist-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
      color: #94a3b8;
    }

    .cutlist-desc {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-left: 4px;
    }

    /* ── Section title ── */
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      color: #94a3b8;
      margin-bottom: 8px;
    }

    /* ── Table ── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
      font-size: 13px;
    }

    .items-table thead tr {
      background: #f1f5f9;
    }

    .items-table thead th {
      padding: 10px 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #64748b;
      border-bottom: 2px solid #cbd5e1;
      white-space: nowrap;
    }

    .items-table thead th.right { text-align: right; }
    .items-table thead th.center { text-align: center; }

    /* ── Footer ── */
    .footer {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #94a3b8;
      font-size: 11px;
    }

    .footer .total {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
    }

    .footer .total span {
      color: #0f172a;
      font-weight: 700;
    }

    /* ── Print button (screen only) ── */
    .print-btn {
      position: fixed;
      top: 24px;
      right: 24px;
      background: #1d4ed8;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(29,78,216,0.25);
    }

    .print-btn:hover { background: #1e40af; }
  </style>
</head>
<body>

  <button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      ${cutlistItem ? `<p style="font-size:14px; font-weight:600; color:#475569; margin-bottom:6px;">${escapeHtml(cutlistItem)}</p>` : ""}
      <h1>${worklistNumber}</h1>
      <div class="badges">
        ${folderNumber != null ? `<span class="badge badge-folder">${folderNumber}</span>` : ""}
        ${machineType ? `<span class="badge badge-machine">Rover ${machineType}</span>` : ""}
        <span class="badge badge-status">${status}</span>
      </div>
    </div>
    <div class="header-right">
      <div class="label">CNC Worklist</div>
      ${projectId ? `<div class="value">Project ${escapeHtml(projectId)}</div>` : ""}
      <div class="date">${createdDate}</div>
      ${projectAddress ? `<div style="font-size:12px; color:#64748b; margin-top:4px; max-width:220px; text-align:right;">${escapeHtml(projectAddress)}</div>` : ""}
    </div>
  </div>

  <!-- Cutlist refs -->
  ${
    cutlistRefs.length > 0
      ? `<div class="cutlist-section">
      <span class="cutlist-label">Cutlists:</span>
      ${cutlistPills}
      ${cutlistItem ? `<span class="cutlist-desc">— ${escapeHtml(cutlistItem)}</span>` : ""}
    </div>`
      : ""
  }

  <!-- Items -->
  <div class="section-title">Items (${items.length})</div>

  ${
    items.length === 0
      ? `<p style="color:#94a3b8; font-style:italic; padding:24px 0;">No items on this worklist.</p>`
      : `<table class="items-table">
      <thead>
        <tr>
          <th>PCODE</th>
          <th>Description</th>
          <th class="center">Qty</th>
          <th class="right">L (mm)</th>
          <th class="right">W (mm)</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>`
  }

  <!-- Footer -->
  <div class="footer">
    <div class="total">
      Total items: <span>${items.length}</span>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      Total sheets: <span>${items.reduce((sum, it) => sum + (it.quantity ?? 0), 0)}</span>
    </div>
    <div>Printed ${new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })}</div>
  </div>

</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
