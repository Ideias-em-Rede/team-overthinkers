import { useState } from "react";
import { BRAZIL_UF_PATHS, BRAZIL_VIEWBOX } from "./brazilPaths";
import "./BrazilMap.css";

export interface BrazilMapDatum {
  uf: string;
  naAudiencia: number;
  citados: number;
}

interface Props {
  data: BrazilMapDatum[];
  editorColor: string;
  editor: "humano" | "llm";
}

const ALL_UFS = Object.keys(BRAZIL_UF_PATHS);

export default function BrazilMap({ data, editorColor, editor }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const byUf = new Map<string, BrazilMapDatum>();
  for (const d of data) byUf.set(d.uf, d);

  const maxCitados = Math.max(1, ...data.map((d) => d.citados));

  const hoverDatum = hover ? byUf.get(hover) : null;

  return (
    <div className="brmap">
      <div className="brmap__stage">
        <svg
          className="brmap__svg"
          viewBox={BRAZIL_VIEWBOX}
          role="img"
          aria-label="Mapa do Brasil com distribuição por UF"
        >
          {ALL_UFS.map((uf) => {
            const datum = byUf.get(uf);
            const value = datum?.citados ?? 0;
            const intensity = value / maxCitados;
            const alpha = value === 0 ? 0.08 : 0.2 + intensity * 0.8;
            const fill = value === 0 ? "#e5e9f0" : hexToRgba(editorColor, alpha);
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
                  {uf}: {datum?.citados ?? 0} citados · {datum?.naAudiencia ?? 0} na audiência
                </title>
              </path>
            );
          })}
        </svg>

        {hoverDatum && (
          <div className="brmap__tooltip">
            <strong>{hoverDatum.uf}</strong>
            <div>{hoverDatum.citados} citados por {editor}</div>
            <div className="muted">{hoverDatum.naAudiencia} na audiência</div>
          </div>
        )}
      </div>

      <div className="brmap__legend">
        <span className="brmap__legend-label muted">
          citados por {editor}
        </span>
        <div className="brmap__legend-scale">
          <span className="brmap__legend-min muted">0</span>
          <div
            className="brmap__legend-bar"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(editorColor, 0.15)}, ${hexToRgba(editorColor, 1)})`,
            }}
          />
          <span className="brmap__legend-max muted">{maxCitados}</span>
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
