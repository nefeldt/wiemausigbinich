import type { Person, Scores } from "../types";
import {
  CORNERS,
  formatPercentages,
  personColor,
  scoresToPoint,
} from "../ternary";

interface TernaryChartProps {
  people: Person[];
  preview?: { name: string; scores: Scores } | null;
}

function gridLines() {
  const corners = [CORNERS.m, CORNERS.a, CORNERS.f];
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let c = 0; c < 3; c++) {
    const corner = corners[c];
    const p = corners[(c + 1) % 3];
    const q = corners[(c + 2) % 3];
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      lines.push({
        x1: p.x + (corner.x - p.x) * t,
        y1: p.y + (corner.y - p.y) * t,
        x2: q.x + (corner.x - q.x) * t,
        y2: q.y + (corner.y - q.y) * t,
      });
    }
  }
  return lines;
}

const GRID_LINES = gridLines();

export function TernaryChart({ people, preview }: TernaryChartProps) {
  const trianglePath = `M ${CORNERS.m.x} ${CORNERS.m.y} L ${CORNERS.a.x} ${CORNERS.a.y} L ${CORNERS.f.x} ${CORNERS.f.y} Z`;

  return (
    <svg
      className="afm-chart"
      viewBox="0 0 520 500"
      role="img"
      aria-label="Triangle with the axes mausig, atzig, and fotzig"
    >
      <path d={trianglePath} className="afm-chart__triangle" />
      {GRID_LINES.map((line, i) => (
        <line key={i} {...line} className="afm-chart__grid" />
      ))}

      <text x={CORNERS.m.x} y={CORNERS.m.y - 28} className="afm-chart__corner">
        🍷 mausig
      </text>
      <text x={CORNERS.a.x} y={CORNERS.a.y + 38} className="afm-chart__corner">
        🚬 atzig
      </text>
      <text x={CORNERS.f.x} y={CORNERS.f.y + 38} className="afm-chart__corner">
        🫦 fotzig
      </text>

      {people.map((person) => {
        const point = scoresToPoint(person);
        const color = personColor(person.id);
        return (
          <g key={person.id}>
            <title>{`${person.name}: ${formatPercentages(person)}`}</title>
            <circle
              cx={point.x}
              cy={point.y}
              r={8}
              style={{ fill: color }}
              className="afm-chart__dot"
            />
            <text
              x={point.x}
              y={point.y - 14}
              style={{ fill: color }}
              className="afm-chart__name"
            >
              {person.name}
            </text>
          </g>
        );
      })}

      {preview && (
        <g className="afm-chart__preview">
          <title>{`Preview: ${formatPercentages(preview.scores)}`}</title>
          {(() => {
            const point = scoresToPoint(preview.scores);
            return (
              <>
                <circle cx={point.x} cy={point.y} r={9} className="afm-chart__preview-dot" />
                <text x={point.x} y={point.y - 15} className="afm-chart__name afm-chart__name--preview">
                  {preview.name || "You?"}
                </text>
              </>
            );
          })()}
        </g>
      )}
    </svg>
  );
}
