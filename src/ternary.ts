import type { Scores } from "./types";

export interface Point {
  x: number;
  y: number;
}

/**
 * Corners of the equilateral triangle in SVG coordinates (viewBox 0 0 520 500).
 * Top: mausig 🍷, bottom left: atzig 🚬, bottom right: fotzig 🫦
 */
export const CORNERS = {
  m: { x: 260, y: 70 },
  a: { x: 50, y: 434 },
  f: { x: 470, y: 434 },
} as const;

/** Barycentric position: only the ratio of m/a/f matters. */
export function scoresToPoint(scores: Scores): Point {
  const total = scores.m + scores.a + scores.f;
  if (total <= 0) {
    return {
      x: (CORNERS.m.x + CORNERS.a.x + CORNERS.f.x) / 3,
      y: (CORNERS.m.y + CORNERS.a.y + CORNERS.f.y) / 3,
    };
  }
  return {
    x: (scores.m * CORNERS.m.x + scores.a * CORNERS.a.x + scores.f * CORNERS.f.x) / total,
    y: (scores.m * CORNERS.m.y + scores.a * CORNERS.a.y + scores.f * CORNERS.f.y) / total,
  };
}

export function toPercentages(scores: Scores): Scores {
  const total = scores.m + scores.a + scores.f;
  if (total <= 0) return { m: 0, a: 0, f: 0 };
  return {
    m: Math.round((scores.m / total) * 100),
    a: Math.round((scores.a / total) * 100),
    f: Math.round((scores.f / total) * 100),
  };
}

export function formatPercentages(scores: Scores): string {
  const p = toPercentages(scores);
  return `🍷 ${p.m}% mausig · 🚬 ${p.a}% atzig · 🫦 ${p.f}% fotzig`;
}

/**
 * Reads m/a/f from an atzigfotzigmausig.de result URL
 * (e.g. https://atzigfotzigmausig.de/result?m=4&a=2.8&f=6.2)
 * or directly from a query string ("m=4&a=2.8&f=6.2").
 */
export function parseResultInput(input: string): Scores | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let params: URLSearchParams;
  try {
    params = new URL(trimmed).searchParams;
  } catch {
    params = new URLSearchParams(trimmed.replace(/^\?/, ""));
  }

  const read = (key: string): number | null => {
    const raw = params.get(key);
    if (raw === null) return null;
    const num = Number(raw.replace(",", "."));
    return Number.isFinite(num) && num >= 0 && num <= 10 ? num : null;
  };

  const m = read("m");
  const a = read("a");
  const f = read("f");
  if (m === null || a === null || f === null) return null;
  if (m + a + f <= 0) return null;
  return { m, a, f };
}

// Flow's categorical chart colors, so dots look like mStudio data viz
const PALETTE = [
  { token: "azure", hex: "#147af3" },
  { token: "magenta", hex: "#de3d82" },
  { token: "green", hex: "#008f5d" },
  { token: "violet", hex: "#7326d3" },
  { token: "tangerine", hex: "#f68511" },
  { token: "sea-green", hex: "#0fb5ae" },
  { token: "palatinate-blue", hex: "#4046ca" },
  { token: "alloy-orange", hex: "#cb5d00" },
  { token: "tropical-indigo", hex: "#7e84fa" },
];

function personPalette(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function personColor(id: string): string {
  const { token, hex } = personPalette(id);
  return `var(--color--categorical--${token}, ${hex})`;
}

/** Resolved hex value for contexts without CSS variables (canvas, PDF). */
export function personColorHex(id: string): string {
  return personPalette(id).hex;
}
