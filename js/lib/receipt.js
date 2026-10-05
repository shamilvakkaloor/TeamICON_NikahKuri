/** A6 payment receipts, generated locally without a service or build step. */
import { fmtDate } from "./format.js";

const WIDTH = 1240;
const HEIGHT = 1748;

/** Canvas text preserves Unicode names and the rupee symbol in the PDF. */
export function createReceiptCanvas(details, createCanvas = () => document.createElement("canvas")) {
  const canvas = createCanvas();
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const green = "#1f5c46";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "#d6ded9";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, WIDTH - 80, HEIGHT - 80);

  function text(value, x, y, size = 36, color = "#1b2420", bold = false, maxWidth = 1056) {
    value = String(value || "Not recorded");
    ctx.fillStyle = color;
    ctx.font = `${bold ? "bold " : ""}${size}px Arial, sans-serif`;
    // Fit complete names and references rather than clipping or shortening them.
    ctx.fillText(value, x, y, maxWidth);
  }

  text(details.groupName || "Team ICON", 92, 135, 46, green, true);
  text("NIKAH KURI", 92, 195, 28, "#6b7370");
  text("PAYMENT RECEIPT", 92, 292, 48, green, true);
  text(details.edited ? "Corrected payment record" : "Payment recorded in the group ledger", 92, 345, 28, "#6b7370");

  ctx.fillStyle = "#e6f0eb";
  ctx.fillRect(92, 390, 1056, 180);
  text("AMOUNT RECEIVED", 124, 444, 26, green, true, 990);
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(details.amount);
  text(amount, 124, 532, 76, green, true, 990);

  const fields = [
    ["RECEIVED FROM", details.payerName],
    ["TEAM", details.team],
    ["FOR GROOM", details.groomName],
    ["ROUND", `Kuri ${details.kuriNumber}`],
    ["PAYMENT DATE", fmtDate(details.date)],
    ["RECORDED BY", details.recorderName],
  ];
  fields.forEach(([label, value], i) => {
    const y = 645 + i * 116;
    text(label, 92, y, 24, "#6b7370", true);
    text(value, 92, y + 48, 38);
  });

  ctx.strokeStyle = "#d6ded9";
  ctx.beginPath();
  ctx.moveTo(92, 1368);
  ctx.lineTo(1148, 1368);
  ctx.stroke();
  text("RECEIPT / PAYMENT REFERENCE", 92, 1422, 24, "#6b7370", true);
  text(details.id, 92, 1464, 28);
  text("This receipt acknowledges this payment only.", 92, 1550, 27, "#6b7370");
  text("Computer-generated receipt. No signature required.", 92, 1595, 27, "#6b7370");
  text("Issued from the payment ledger; reflects the current record.", 92, 1640, 24, "#6b7370");
  return canvas;
}

/** Embed the rendered receipt in a single-page PDF with exact A6 dimensions. */
export function receiptPdf(canvas) {
  const jpeg = Uint8Array.from(atob(canvas.toDataURL("image/jpeg", 0.95).split(",")[1]), (c) => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const append = (value) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    append(`${id} 0 obj\n${body}\nendobj\n`);
  };
  // 105 x 148 mm, converted to PDF points (72 points per inch).
  const w = (105 / 25.4 * 72).toFixed(5);
  const h = (148 / 25.4 * 72).toFixed(5);
  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Receipt 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  append(jpeg);
  append("\nendstream\nendobj\n");
  const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Receipt Do\nQ\n`;
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
  const xref = length;
  append("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) append(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}

export function downloadReceipt(details) {
  if (details.voided || !Number.isFinite(details.amount) || details.amount <= 0) {
    throw new Error("Receipts are available only for valid payments.");
  }
  const url = URL.createObjectURL(receiptPdf(createReceiptCanvas(details)));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Nikah-Kuri-${details.kuriNumber}-receipt-${details.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
