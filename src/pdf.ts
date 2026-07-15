import { CORNERS, personColorHex, scoresToPoint } from "./ternary";
import type { Person } from "./types";

// Chart coordinate space (matches the on-screen SVG viewBox)
const CHART_W = 520;
const CHART_H = 500;
const SCALE = 4; // render resolution multiplier for a crisp PDF

const FONT = "Inter, -apple-system, 'Segoe UI', sans-serif";

function drawChart(people: Person[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CHART_W * SCALE;
  canvas.height = CHART_H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is not available.");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CHART_W, CHART_H);

  // grid lines parallel to each side
  const corners = [CORNERS.m, CORNERS.a, CORNERS.f];
  ctx.strokeStyle = "#dce9f7";
  ctx.lineWidth = 1;
  for (let c = 0; c < 3; c++) {
    const corner = corners[c];
    const p = corners[(c + 1) % 3];
    const q = corners[(c + 2) % 3];
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      ctx.beginPath();
      ctx.moveTo(p.x + (corner.x - p.x) * t, p.y + (corner.y - p.y) * t);
      ctx.lineTo(q.x + (corner.x - q.x) * t, q.y + (corner.y - q.y) * t);
      ctx.stroke();
    }
  }

  // triangle outline
  ctx.beginPath();
  ctx.moveTo(CORNERS.m.x, CORNERS.m.y);
  ctx.lineTo(CORNERS.a.x, CORNERS.a.y);
  ctx.lineTo(CORNERS.f.x, CORNERS.f.y);
  ctx.closePath();
  ctx.strokeStyle = "#3a434e";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // corner labels (emoji render via the system font)
  ctx.font = `700 20px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#292f37";
  ctx.fillText("🍷 mausig", CORNERS.m.x, CORNERS.m.y - 34);
  ctx.fillText("🚬 atzig", CORNERS.a.x, CORNERS.a.y + 32);
  ctx.fillText("🫦 fotzig", CORNERS.f.x, CORNERS.f.y + 32);

  // people
  for (const person of people) {
    const point = scoresToPoint(person);
    const color = personColorHex(person.id);

    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = `600 14px ${FONT}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(person.name, point.x, point.y - 16);
    ctx.fillStyle = color;
    ctx.fillText(person.name, point.x, point.y - 16);
  }

  return canvas;
}

/** Builds a pretty A4 landscape PDF containing only the triangle. */
export async function exportTrianglePdf(people: Person[]): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const image = drawChart(people).toDataURL("image/png");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth(); // 297
  const pageH = doc.internal.pageSize.getHeight(); // 210
  const centerX = pageW / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor("#292f37");
  doc.text("Atzig · Fotzig · Mausig", centerX, 24, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor("#5e6c7a");
  doc.text("Das heilige Team-Dreieck", centerX, 32, { align: "center" });

  const imageH = 152;
  const imageW = (CHART_W / CHART_H) * imageH;
  doc.addImage(image, "PNG", centerX - imageW / 2, 40, imageW, imageH);

  const date = new Date().toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.setFontSize(9);
  doc.setTextColor("#8fa1b4");
  doc.text(
    `${people.length} ${people.length === 1 ? "Person" : "Personen"} · ${date}`,
    centerX,
    pageH - 10,
    { align: "center" },
  );

  doc.save("team-dreieck.pdf");
}
