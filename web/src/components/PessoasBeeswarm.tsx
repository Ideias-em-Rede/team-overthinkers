import { useEffect, useMemo, useRef, useState } from "react";
import type { GatekeeperRow } from "../types";

interface Props {
  rows: GatekeeperRow[];
  height?: number;
}

interface AggPerson {
  nome: string;
  nome_key: string;
  genero: string | null;
  partido: string | null;
  estado: string | null;
  palavras: number;
  falas: number;
  mencoes: number;
  opinioes: number;
  audiencias: number;
  covered: boolean;
}

interface Node extends AggPerson {
  cx: number;
  cy: number;
  r: number;
}

const COLOR_COVERED = "#0077b6";
const COLOR_UNCOVERED = "#c5cdd8";
const STROKE_COVERED = "#003366";
const STROKE_UNCOVERED = "#94a3b8";

const MARGIN = { top: 24, right: 24, bottom: 44, left: 24 };
const MIN_R = 2.5;
const MAX_R = 22;

export default function PessoasBeeswarm({ rows, height = 460 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ node: Node; x: number; y: number } | null>(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const people: AggPerson[] = useMemo(() => aggregate(rows), [rows]);

  const nodes: Node[] = useMemo(() => layout(people, width, height), [people, width, height]);

  const totalPessoas = people.length;
  const citadas = people.filter((p) => p.covered).length;
  const maxPalavras = Math.max(...people.map((p) => p.palavras), 1);
  const ticks = niceTicks(maxPalavras, 5);

  const innerH = height - MARGIN.top - MARGIN.bottom;
  const midY = MARGIN.top + innerH / 2;

  return (
    <div className="beeswarm" ref={wrapRef}>
      <div className="beeswarm__head">
        <div className="beeswarm__legend">
          <span className="beeswarm__dot beeswarm__dot--on" /> Citada na matéria
          <span className="beeswarm__dot beeswarm__dot--off" /> Falou na audiência mas não foi citada
          <span className="beeswarm__size-hint">tamanho ∝ menções</span>
        </div>
        <div className="beeswarm__counts muted">
          {totalPessoas.toLocaleString("pt-BR")} pessoas · {citadas.toLocaleString("pt-BR")}{" "}
          citadas ({((citadas / totalPessoas) * 100).toFixed(1)}%)
        </div>
      </div>

      <svg width={width} height={height} className="beeswarm__svg">
        <line
          x1={MARGIN.left}
          x2={width - MARGIN.right}
          y1={midY}
          y2={midY}
          stroke="#e1e5ec"
          strokeDasharray="3 4"
        />

        {ticks.map((t) => {
          const x = scaleX(t, maxPalavras, width);
          return (
            <g key={t}>
              <line
                x1={x}
                x2={x}
                y1={MARGIN.top}
                y2={height - MARGIN.bottom}
                stroke="#f1f4f8"
              />
              <text
                x={x}
                y={height - MARGIN.bottom + 16}
                textAnchor="middle"
                className="beeswarm__tick"
              >
                {t.toLocaleString("pt-BR")}
              </text>
            </g>
          );
        })}

        <text
          x={(width - MARGIN.right + MARGIN.left) / 2}
          y={height - 6}
          textAnchor="middle"
          className="beeswarm__axis-label"
        >
          Palavras faladas na audiência
        </text>

        {nodes.map((n) => (
          <circle
            key={n.nome_key}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill={n.covered ? COLOR_COVERED : COLOR_UNCOVERED}
            stroke={n.covered ? STROKE_COVERED : STROKE_UNCOVERED}
            strokeWidth={0.5}
            fillOpacity={n.covered ? 0.85 : 0.6}
            onMouseEnter={(e) => {
              const rect = wrapRef.current?.getBoundingClientRect();
              setHover({
                node: n,
                x: e.clientX - (rect?.left ?? 0),
                y: e.clientY - (rect?.top ?? 0),
              });
            }}
            onMouseMove={(e) => {
              const rect = wrapRef.current?.getBoundingClientRect();
              setHover((h) =>
                h
                  ? {
                      ...h,
                      x: e.clientX - (rect?.left ?? 0),
                      y: e.clientY - (rect?.top ?? 0),
                    }
                  : null
              );
            }}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {hover && <Tooltip x={hover.x} y={hover.y} node={hover.node} />}
    </div>
  );
}

function Tooltip({ x, y, node }: { x: number; y: number; node: Node }) {
  return (
    <div
      className="beeswarm__tooltip"
      style={{ left: Math.max(8, x + 12), top: Math.max(8, y + 12) }}
    >
      <div className="beeswarm__tt-name">{node.nome}</div>
      <div className="beeswarm__tt-meta">
        {[node.partido, node.estado, generoLabel(node.genero)]
          .filter(Boolean)
          .join(" · ") || "sem metadados"}
      </div>
      <table className="beeswarm__tt-table">
        <tbody>
          <tr>
            <td>Palavras faladas</td>
            <td>{node.palavras.toLocaleString("pt-BR")}</td>
          </tr>
          <tr>
            <td>Falas</td>
            <td>{node.falas.toLocaleString("pt-BR")}</td>
          </tr>
          <tr>
            <td>Menções na matéria</td>
            <td>{node.mencoes.toLocaleString("pt-BR")}</td>
          </tr>
          <tr>
            <td>Opiniões atribuídas</td>
            <td>{node.opinioes.toLocaleString("pt-BR")}</td>
          </tr>
          <tr>
            <td>Audiências</td>
            <td>{node.audiencias}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function aggregate(rows: GatekeeperRow[]): AggPerson[] {
  const map = new Map<string, AggPerson>();
  for (const r of rows) {
    const cur = map.get(r.nome_key);
    if (!cur) {
      map.set(r.nome_key, {
        nome: r.nome_canon,
        nome_key: r.nome_key,
        genero: r.genero || null,
        partido: r.partido,
        estado: r.estado,
        palavras: r.quantidade_palavras,
        falas: r.quantidade_falas,
        mencoes: r.mencoes,
        opinioes: r.quantidade_opinioes,
        audiencias: 1,
        covered: r.covered,
      });
    } else {
      cur.palavras += r.quantidade_palavras;
      cur.falas += r.quantidade_falas;
      cur.mencoes += r.mencoes;
      cur.opinioes += r.quantidade_opinioes;
      cur.audiencias += 1;
      cur.covered = cur.covered || r.covered;
      cur.partido = cur.partido ?? r.partido;
      cur.estado = cur.estado ?? r.estado;
      cur.genero = cur.genero ?? r.genero ?? null;
    }
  }
  return Array.from(map.values());
}

function scaleX(v: number, maxV: number, width: number): number {
  const inner = width - MARGIN.left - MARGIN.right;
  const t = Math.sqrt(Math.max(0, v) / maxV);
  return MARGIN.left + t * inner;
}

function radius(mencoes: number, maxM: number): number {
  if (mencoes <= 0) return MIN_R;
  const t = Math.sqrt(mencoes / maxM);
  return MIN_R + t * (MAX_R - MIN_R);
}

function layout(people: AggPerson[], width: number, height: number): Node[] {
  const maxPalavras = Math.max(...people.map((p) => p.palavras), 1);
  const maxMencoes = Math.max(...people.map((p) => p.mencoes), 1);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const midY = MARGIN.top + innerH / 2;
  const maxDelta = innerH / 2 - MAX_R - 2;

  const sorted = [...people].sort((a, b) => {
    if (b.mencoes !== a.mencoes) return b.mencoes - a.mencoes;
    return b.palavras - a.palavras;
  });

  const placed: Node[] = [];
  for (const p of sorted) {
    const cx = scaleX(p.palavras, maxPalavras, width);
    const r = radius(p.mencoes, maxMencoes);
    const candidates: number[] = [midY];
    for (const q of placed) {
      const dx = cx - q.cx;
      const minDist = r + q.r + 1;
      if (Math.abs(dx) >= minDist) continue;
      const dy = Math.sqrt(minDist * minDist - dx * dx);
      candidates.push(q.cy + dy, q.cy - dy);
    }
    let best = midY;
    let bestDelta = Infinity;
    for (const y of candidates) {
      if (Math.abs(y - midY) > maxDelta) continue;
      let ok = true;
      for (const q of placed) {
        const dx = cx - q.cx;
        const dy = y - q.cy;
        const minDist = r + q.r + 1;
        if (dx * dx + dy * dy < minDist * minDist - 0.001) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const delta = Math.abs(y - midY);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = y;
      }
    }
    placed.push({ ...p, cx, cy: best, r });
  }
  return placed;
}

function niceTicks(max: number, n: number): number[] {
  const step = niceStep(max / n);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}

function niceStep(raw: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const base = raw / exp;
  const mult = base >= 5 ? 5 : base >= 2 ? 2 : 1;
  return mult * exp;
}

function generoLabel(g: string | null): string {
  if (g === "masculino") return "H";
  if (g === "feminino") return "M";
  return "";
}
