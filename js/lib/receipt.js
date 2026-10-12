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
  const green = "#234c3e";
  const gold = "#a6884b";
  const muted = "#777467";
  ctx.fillStyle = "#fcfaf4";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(44, 44, WIDTH - 88, HEIGHT - 88);
  ctx.lineWidth = 1;
  ctx.strokeRect(58, 58, WIDTH - 116, HEIGHT - 116);

  function text(value, x, y, size = 36, color = green, serif = false, align = "left", maxWidth = 1016) {
    value = String(value || "Not recorded");
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.font = `${size}px ${serif ? 'Georgia, "Times New Roman", serif' : 'Arial, sans-serif'}`;
    ctx.fillText(value, x, y, maxWidth);
  }
  function line(x1, y, x2, color = "#ded5bf") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  }
  function ornament(y) {
    line(360, y, 592, gold);
    line(648, y, 880, gold);
    ctx.save();
    ctx.translate(620, y);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = gold;
    ctx.strokeRect(-8, -8, 16, 16);
    ctx.restore();
  }
  // Corner flourishes are decorative; no seal or signature is implied.
  for (const [x, y, direction] of [[82, 82, 1], [1158, 1666, -1]]) {
    ctx.strokeStyle = gold;
    ctx.beginPath();
    ctx.moveTo(x, y + direction * 46);
    ctx.lineTo(x, y);
    ctx.lineTo(x + direction * 46, y);
    ctx.stroke();
  }

  text(details.groupName || "Team ICON", 620, 163, 52, green, true, "center");
  text("N I K A H   K U R I", 620, 218, 25, muted, false, "center");
  ornament(267);
  text("Payment Receipt", 620, 353, 68, green, true, "center");
  text(details.edited ? "CORRECTED PAYMENT RECORD" : "ACKNOWLEDGEMENT OF CONTRIBUTION", 620, 407, 23, muted, false, "center");

  text("PAYMENT DATE", 112, 487, 23, muted);
  text(fmtDate(details.date), 112, 534, 36, green, true);
  text("ROUND", 1128, 487, 23, muted, false, "right");
  text(`Kuri ${details.kuriNumber}`, 1128, 534, 36, green, true, "right");
  line(112, 566, 1128);

  function field(label, value, y) {
    text(label, 112, y, 23, muted);
    text(value, 112, y + 51, 42, green, true);
    line(112, y + 77, 1128);
  }
  field("RECEIVED WITH THANKS FROM", details.payerName, 629);
  field("REGIONAL TEAM", details.team, 765);
  field("CONTRIBUTION FOR GROOM", details.groomName, 901);

  ctx.fillStyle = "#edf0e6";
  ctx.fillRect(112, 1030, 1016, 180);
  line(112, 1030, 1128, gold);
  line(112, 1210, 1128, gold);
  text("AMOUNT RECEIVED", 620, 1080, 24, muted, false, "center");
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(details.amount);
  text(amount, 620, 1170, 80, green, true, "center", 940);

  text("RECORDED BY", 112, 1280, 23, muted);
  text(details.recorderName, 112, 1326, 36, green, true);
  text("RECEIPT / PAYMENT REFERENCE", 112, 1393, 23, muted);
  text(details.id, 112, 1434, 27, green);
  ornament(1490);
  text("This receipt acknowledges this contribution only.", 620, 1547, 25, muted, false, "center");
  text("Computer-generated receipt. No signature required.", 620, 1590, 25, muted, false, "center");
  text("Reflects the current payment ledger record.", 620, 1632, 23, muted, false, "center");
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

export async function downloadReceipt(details, format = "pdf") {
  if (!["pdf", "png"].includes(format)) throw new Error("Choose PDF or PNG format.");
  if (details.voided || !Number.isFinite(details.amount) || details.amount <= 0) {
    throw new Error("Receipts are available only for valid payments.");
  }
  const canvas = createReceiptCanvas(details);
  const blob = format === "pdf" ? receiptPdf(canvas) : await new Promise((resolve, reject) => {
    canvas.toBlob((image) => image ? resolve(image) : reject(new Error("Could not create the receipt image.")), "image/png");
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Nikah-Kuri-${details.kuriNumber}-receipt-${details.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
