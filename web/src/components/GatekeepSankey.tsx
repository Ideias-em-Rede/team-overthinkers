import { useMemo, useState } from "react";
import type { GatekeeperRow } from "../types";
import "./GatekeepSankey.css";

type Modo = "pessoa" | "partido" | "genero" | "estado" | "valor";

interface Props {
  rows: GatekeeperRow[];
  modes?: Modo[];
  compact?: boolean;
  valoresPorMateria?: Record<string, string[]>;
}

const DEFAULT_MODES: Modo[] = ["pessoa", "partido", "genero", "estado"];
const MODE_LABEL: Record<Modo, string> = {
  pessoa: "Pessoa",
  partido: "Partido",
  genero: "Gênero",
  estado: "Estado",
  valor: "Valor-notícia",
};

const VALOR_ORDER = [
  "proximidade",
  "proeminencia",
  "impacto",
  "conflito",
  "novidade",
  "interesse",
  "sensacionalismo",
];
const VALOR_LABEL: Record<string, string> = {
  proximidade: "Proximidade",
  proeminencia: "Proeminência",
  impacto: "Impacto",
  conflito: "Conflito",
  novidade: "Novidade",
  interesse: "Interesse",
  sensacionalismo: "Sensacionalismo",
};
const VALOR_COLORS: Record<string, string> = {
  proximidade: "#0891b2",
  proeminencia: "#7c3aed",
  impacto: "#dc2626",
  conflito: "#ea580c",
  novidade: "#16a34a",
  interesse: "#ca8a04",
  sensacionalismo: "#db2777",
};

const PARTY_COLORS: Record<string, string> = {
  PT: "#d1442c",
  PL: "#2d7d46",
  NOVO: "#f19c1f",
  PP: "#1e5aa8",
  PSDB: "#0077b6",
  MDB: "#8e44ad",
  UNIÃO: "#c0392b",
  PSD: "#16a085",
  REPUBLICANOS: "#5b6dcd",
  PSB: "#e67e22",
  PDT: "#c62828",
  PCdoB: "#b71c1c",
  SOLIDARIEDADE: "#455a64",
  PODE: "#7b1fa2",
  AVANTE: "#00838f",
  CIDADANIA: "#ef6c00",
};

const GENERO_COLOR: Record<string, string> = {
  masculino: "#003366",
  feminino: "#c94f7c",
};

const NA_COLOR = "#94a3b8";
const COBERTO = "#0077b6";
const SILENCIADO = "#cbd5e1";

interface SourceNode {
  key: string;
  label: string;
  weight: number;
  color: string;
  members: GatekeeperRow[];
  coveredWeight: number;
  silencedWeight: number;
}

export default function GatekeepSankey({
  rows,
  modes = DEFAULT_MODES,
  compact = false,
  valoresPorMateria,
}: Props) {
  const [modo, setModo] = useState<Modo>(modes[0]);
  const [hover, setHover] = useState<string | null>(null);

  const weightOf = (raw: number): number =>
    compact ? Math.sqrt(Math.max(1, raw)) : Math.max(1, raw);

  const sources: SourceNode[] = useMemo(() => {
    const list = [...rows];
    if (modo === "valor" && valoresPorMateria) {
      const hearingIds = Array.from(new Set(list.map((r) => r.hearing_id)));
      return VALOR_ORDER.map((v) => {
        let presente = 0;
        let ausente = 0;
        for (const hid of hearingIds) {
          const presentes = valoresPorMateria[String(hid)] ?? [];
          if (presentes.includes(v)) presente += 1;
          else ausente += 1;
        }
        return {
          key: v,
          label: VALOR_LABEL[v] ?? v,
          weight: presente + ausente,
          color: VALOR_COLORS[v] ?? NA_COLOR,
          members: [],
          coveredWeight: presente,
          silencedWeight: ausente,
        };
      }).sort((a, b) => b.coveredWeight - a.coveredWeight);
    }
    if (modo === "pessoa") {
      return list
        .map((r) => {
          const w = weightOf(r.quantidade_palavras);
          return {
            key: r.nome_key,
            label: r.nome_canon,
            weight: w,
            color: colorFor(modo, r),
            members: [r],
            coveredWeight: r.covered ? w : 0,
            silencedWeight: r.covered ? 0 : w,
          };
        })
        .sort((a, b) => b.weight - a.weight);
    }
    const groupKey = (r: GatekeeperRow): string => {
      if (modo === "partido") return r.partido ?? "N/D";
      if (modo === "estado") return r.estado ?? "N/D";
      return r.genero || "N/D";
    };
    const groups = new Map<string, GatekeeperRow[]>();
    for (const r of list) {
      const k = groupKey(r);
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }
    return Array.from(groups.entries())
      .map(([k, members]) => {
        const weight = members.reduce(
          (a, r) => a + weightOf(r.quantidade_palavras),
          0
        );
        const coveredWeight = members.reduce(
          (a, r) => a + (r.covered ? weightOf(r.quantidade_palavras) : 0),
          0
        );
        return {
          key: k,
          label: k,
          weight,
          color: colorFor(modo, members[0]),
          members,
          coveredWeight,
          silencedWeight: weight - coveredWeight,
        };
      })
      .sort((a, b) => b.weight - a.weight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, modo, compact, valoresPorMateria]);

  const totals = useMemo(() => {
    const total = sources.reduce((a, s) => a + s.weight, 0);
    const covered = sources.reduce((a, s) => a + s.coveredWeight, 0);
    return { total, covered, silenced: total - covered };
  }, [sources]);

  const nCovered = rows.filter((r) => r.covered).length;
  const nSilenced = rows.length - nCovered;
  const isValor = modo === "valor";
  const nMaterias = useMemo(
    () => new Set(rows.map((r) => r.hearing_id)).size,
    [rows]
  );
  const totalPresente = sources.reduce((a, s) => a + s.coveredWeight, 0);
  const totalAusente = sources.reduce((a, s) => a + s.silencedWeight, 0);

  const visibleModes = modes.filter(
    (m) => m !== "valor" || !!valoresPorMateria
  );
  const coveredLabel = isValor ? "Presente" : "Coberto";
  const silencedLabel = isValor ? "Ausente" : "Não coberto";

  return (
    <div className={`gk ${compact ? "gk--compact" : ""}`}>
      <div className="gk__toolbar">
        <div className="gk__toggle">
          {visibleModes.map((m) => (
            <button
              key={m}
              className={`gk__toggle-btn ${modo === m ? "on" : ""}`}
              onClick={() => setModo(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="gk__summary muted">
          {isValor
            ? `${nMaterias} matérias · 7 valores-notícia`
            : `${rows.length} na audiência · ${nCovered} cobertos · ${nSilenced} não cobertos`}
        </div>
      </div>

      <SankeySvg
        sources={sources}
        totals={totals}
        hover={hover}
        setHover={setHover}
        compact={compact}
        coveredLabel={coveredLabel}
        silencedLabel={silencedLabel}
      />

      <div className="gk__legend muted">
        <span>
          <span className="gk__sw" style={{ background: COBERTO }} /> {coveredLabel}
          {" "}({isValor ? totalPresente : nCovered})
        </span>
        <span>
          <span className="gk__sw" style={{ background: SILENCIADO }} />{" "}
          {silencedLabel} ({isValor ? totalAusente : nSilenced})
        </span>
        <span className="gk__legend-note">
          {isValor
            ? "Largura do fluxo ∝ nº matérias."
            : "Largura do fluxo ∝ palavras faladas na audiência."}
        </span>
      </div>
    </div>
  );
}

function colorFor(modo: Modo, r: GatekeeperRow): string {
  if (modo === "genero") return GENERO_COLOR[r.genero] ?? NA_COLOR;
  if (modo === "partido") return PARTY_COLORS[r.partido ?? ""] ?? NA_COLOR;
  if (modo === "estado") return "#003366";
  // pessoa: color pelo partido (fallback gênero → cinza)
  return (
    PARTY_COLORS[r.partido ?? ""] ??
    GENERO_COLOR[r.genero] ??
    NA_COLOR
  );
}

interface SankeySvgProps {
  sources: SourceNode[];
  totals: { total: number; covered: number; silenced: number };
  hover: string | null;
  setHover: (k: string | null) => void;
  compact: boolean;
  coveredLabel: string;
  silencedLabel: string;
}

function SankeySvg({
  sources,
  totals,
  hover,
  setHover,
  compact,
  coveredLabel,
  silencedLabel,
}: SankeySvgProps) {
  const W = 780;
  const NODE_W = 12;
  const LEFT_X = 180;
  const RIGHT_X = W - 180;
  const GAP = 3; // gap between stacked nodes (in px, applied after scale)
  const PAD_TOP = 12;
  const PAD_BOTTOM = 12;

  const rowH = compact ? 18 : 26;
  const minH = compact ? 120 : 220;
  const maxH = compact ? 200 : 330;
  const H = Math.max(minH, Math.min(maxH, sources.length * rowH + 60));
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  // scale: total weight → available pixels (minus gaps)
  const totalGaps = Math.max(0, sources.length - 1) * GAP;
  const rightGaps = GAP; // between Coberto and Silenciado
  const availLeft = Math.max(1, innerH - totalGaps);
  const availRight = Math.max(1, innerH - rightGaps);

  // Use the smaller scale so both columns fit; then apply to each side
  const scaleLeft = availLeft / Math.max(1, totals.total);
  const scaleRight = availRight / Math.max(1, totals.total);

  // Layout left nodes
  let yCursorLeft = PAD_TOP;
  const leftLayout = sources.map((s) => {
    const h = Math.max(2, s.weight * scaleLeft);
    const y = yCursorLeft;
    yCursorLeft += h + GAP;
    return { s, y, h };
  });

  // Right nodes: Coberto on top, Silenciado below
  const hCovered = Math.max(2, totals.covered * scaleRight);
  const hSilenced = Math.max(2, totals.silenced * scaleRight);
  const yCovered = PAD_TOP;
  const ySilenced = yCovered + hCovered + GAP;

  // Track how much of each right node has been consumed by incoming links
  let coveredCursor = yCovered;
  let silencedCursor = ySilenced;

  const links = leftLayout.map(({ s, y, h }) => {
    const coveredPortion = totals.total ? s.coveredWeight / s.weight : 0;
    const silencedPortion = 1 - coveredPortion;
    const linkPieces: {
      x0: number;
      y0: number;
      h0: number;
      x1: number;
      y1: number;
      h1: number;
      color: string;
      tone: "covered" | "silenced";
    }[] = [];

    if (s.coveredWeight > 0) {
      const h1 = Math.max(1, h * coveredPortion);
      const targetH = Math.max(1, s.coveredWeight * scaleRight);
      linkPieces.push({
        x0: LEFT_X + NODE_W,
        y0: y,
        h0: h1,
        x1: RIGHT_X,
        y1: coveredCursor,
        h1: targetH,
        color: s.color,
        tone: "covered",
      });
      coveredCursor += targetH;
    }
    if (s.silencedWeight > 0) {
      const yOffset = y + (s.coveredWeight > 0 ? h * coveredPortion : 0);
      const h1 = Math.max(1, h * silencedPortion);
      const targetH = Math.max(1, s.silencedWeight * scaleRight);
      linkPieces.push({
        x0: LEFT_X + NODE_W,
        y0: yOffset,
        h0: h1,
        x1: RIGHT_X,
        y1: silencedCursor,
        h1: targetH,
        color: s.color,
        tone: "silenced",
      });
      silencedCursor += targetH;
    }

    return { s, y, h, pieces: linkPieces };
  });

  return (
    <div className="gk__stage">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="gk__svg"
        onMouseLeave={() => setHover(null)}
      >
        {/* Column labels */}
        <text x={LEFT_X + NODE_W / 2} y={12} className="gk__col-title" textAnchor="end">
          Audiência
        </text>
        <text x={RIGHT_X + NODE_W / 2} y={12} className="gk__col-title" textAnchor="start">
          Matéria
        </text>

        {/* Right nodes */}
        <g>
          <rect
            x={RIGHT_X}
            y={yCovered}
            width={NODE_W}
            height={hCovered}
            fill={COBERTO}
          />
          <text
            x={RIGHT_X + NODE_W + 8}
            y={yCovered + hCovered / 2}
            dominantBaseline="middle"
            className="gk__right-label"
          >
            {coveredLabel}
          </text>

          <rect
            x={RIGHT_X}
            y={ySilenced}
            width={NODE_W}
            height={hSilenced}
            fill={SILENCIADO}
          />
          <text
            x={RIGHT_X + NODE_W + 8}
            y={ySilenced + hSilenced / 2}
            dominantBaseline="middle"
            className="gk__right-label"
          >
            {silencedLabel}
          </text>
        </g>

        {/* Links (behind nodes) */}
        <g>
          {links.map(({ s, pieces }) =>
            pieces.map((p, i) => {
              const path = ribbonPath(p.x0, p.y0, p.h0, p.x1, p.y1, p.h1);
              const isHover = hover === s.key;
              const isDim = hover != null && !isHover;
              return (
                <path
                  key={`${s.key}-${i}`}
                  d={path}
                  fill={p.color}
                  fillOpacity={isHover ? 0.85 : isDim ? 0.12 : p.tone === "silenced" ? 0.35 : 0.55}
                  onMouseEnter={() => setHover(s.key)}
                >
                  <title>
                    {s.label}{"\n"}
                    {p.tone === "covered"
                      ? coveredLabel.toLowerCase()
                      : silencedLabel.toLowerCase()}
                  </title>
                </path>
              );
            })
          )}
        </g>

        {/* Left nodes */}
        <g>
          {leftLayout.map(({ s, y, h }) => {
            const isHover = hover === s.key;
            return (
              <g
                key={s.key}
                onMouseEnter={() => setHover(s.key)}
                className="gk__left"
              >
                <rect
                  x={LEFT_X}
                  y={y}
                  width={NODE_W}
                  height={h}
                  fill={s.color}
                  opacity={hover != null && !isHover ? 0.4 : 1}
                />
                <text
                  x={LEFT_X - 8}
                  y={y + h / 2}
                  dominantBaseline="middle"
                  textAnchor="end"
                  className={`gk__left-label ${h < 10 ? "small" : ""}`}
                >
                  {truncate(s.label, 26)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function ribbonPath(
  x0: number,
  y0: number,
  h0: number,
  x1: number,
  y1: number,
  h1: number
): string {
  const cx0 = x0 + (x1 - x0) * 0.5;
  const cx1 = x0 + (x1 - x0) * 0.5;
  const top = `M ${x0},${y0} C ${cx0},${y0} ${cx1},${y1} ${x1},${y1}`;
  const bot = `L ${x1},${y1 + h1} C ${cx1},${y1 + h1} ${cx0},${y0 + h0} ${x0},${y0 + h0} Z`;
  return `${top} ${bot}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
