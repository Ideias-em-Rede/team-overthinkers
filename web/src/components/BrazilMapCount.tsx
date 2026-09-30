import { useState } from "react";
import { BRAZIL_UF_PATHS, BRAZIL_VIEWBOX } from "./brazilPaths";
import "./BrazilMap.css";

export interface UfCount {
  uf: string;
  count: number;
  extra?: Record<string, number | string>;
}

interface Props {
  data: UfCount[];
  color: string;
  label: string;
}

const ALL_UFS = Object.keys(BRAZIL_UF_PATHS);

export default function BrazilMapCount({ data, color, label }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const byUf = new Map<string, UfCount>();
  for (const d of data) byUf.set(d.uf, d);

  const max = Math.max(1, ...data.map((d) => d.count));
  const hoverDatum = hover ? byUf.get(hover) : null;

  return (
    <div className="brmap">
      <div className="brmap__stage">
        <svg
          className="brmap__svg"
          viewBox={BRAZIL_VIEWBOX}
          role="img"
          aria-label={`Mapa do Brasil: ${label}`}
        >
          {ALL_UFS.map((uf) => {
            const datum = byUf.get(uf);
            const value = datum?.count ?? 0;
            const intensity = value / max;
            const alpha = value === 0 ? 0.06 : 0.25 + intensity * 0.75;
            const fill = value === 0 ? "#e5e9f0" : hexToRgba(color, alpha);
            return (
              <path
                key={uf}
                d={BRAZIL_UF_PATHS[uf]}
                fill={fill}
                stroke={hover === uf ? "#1a2332" : "#ffffff"}
                strokeWidth={hover === uf ? 1.4 : 0.6}
                onMouseEnter={() => setHover(uf)}
                onMouseLeave={() => setHover((h) => (h === uf ? null : h))}
                className="brmap__uf"
              >
                <title>
                  {uf}: {value} {label}
                </title>
              </path>
            );
          })}
        </svg>

        {hoverDatum && (
          <div className="brmap__tooltip">
            <strong>{hoverDatum.uf}</strong>
            <div>{hoverDatum.count} {label}</div>
            {hoverDatum.extra &&
              Object.entries(hoverDatum.extra).map(([k, v]) => (
                <div key={k} className="muted">{k}: {v}</div>
              ))}
          </div>
        )}
      </div>

      <div className="brmap__legend">
        <span className="brmap__legend-label muted">{label}</span>
        <div className="brmap__legend-scale">
          <span className="brmap__legend-min muted">0</span>
          <div
            className="brmap__legend-bar"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(color, 0.15)}, ${hexToRgba(color, 1)})`,
            }}
          />
          <span className="brmap__legend-max muted">{max}</span>
        </div>
      </div>
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
