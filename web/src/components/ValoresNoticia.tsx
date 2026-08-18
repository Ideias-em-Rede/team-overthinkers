import { useEffect, useState } from "react";
import type { ValoresNoticiaFile } from "../types";
import MethodInfo from "./MethodInfo";
import { VALORES_METHOD } from "../methodology";
import "./ValoresNoticia.css";

const LABELS: Record<string, string> = {
  atualidade: "Atualidade",
  proximidade: "Proximidade",
  importancia: "Importância",
  impacto: "Impacto",
  conflito: "Conflito",
  proeminencia: "Proeminência",
  novidade: "Novidade",
  curiosidade: "Curiosidade",
  dramaticidade: "Dramaticidade",
  surpresa: "Surpresa",
  raridade: "Raridade",
};

const ORDER = Object.keys(LABELS);

interface Props {
  materiaId: number;
  source: "humano" | "llm";
}

const URL_BY_SOURCE = {
  humano: (id: number) => `/data/valores_noticia/${id}.json`,
  llm: (id: number) => `/data/valores_noticia_llm/${id}.json`,
};

export default function ValoresNoticia({ materiaId, source }: Props) {
  const [data, setData] = useState<ValoresNoticiaFile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "absent">("loading");

  useEffect(() => {
    setStatus("loading");
    setData(null);
    fetch(URL_BY_SOURCE[source](materiaId))
      .then((r) => {
        if (r.status === 404) {
          setStatus("absent");
          return null;
        }
        return r.json();
      })
      .then((d: ValoresNoticiaFile | null) => {
        if (d) {
          setData(d);
          setStatus("ready");
        }
      })
      .catch(() => setStatus("absent"));
  }, [materiaId, source]);

  if (status === "absent") return null;
  if (status === "loading" || !data) {
    return <div className="loading">Carregando valores-notícia…</div>;
  }

  const entries = ORDER.filter((k) => k in data.valores_noticia).map((k) => [
    k,
    data.valores_noticia[k],
  ] as const);
  const total = entries.length;
  const presentes = entries.filter(([, v]) => v.presente).length;
  const pct = total ? Math.round((presentes / total) * 100) : 0;

  const ordered = [...entries].sort((a, b) => {
    if (a[1].presente === b[1].presente) return 0;
    return a[1].presente ? -1 : 1;
  });

  return (
    <section className={`valores valores--${source}`}>
      <header className="valores__head">
        <div>
          <h2>Valores-notícia identificados</h2>
          <p className="muted valores__note">
            {source === "humano"
              ? "Sobre a matéria publicada pela Agência Câmara."
              : "Sobre a matéria gerada por LLM a partir da transcrição."}{" "}
            Análise por LLM ({data.modelo}). Base: critérios clássicos de noticiabilidade.
          </p>
          <MethodInfo
            descricao={VALORES_METHOD.descricao}
            code={VALORES_METHOD.prompt}
            codeLabel="prompt"
            origem={VALORES_METHOD.origem}
            parametros={VALORES_METHOD.parametros}
          />
        </div>
        <div className="valores__score">
          <span className="valores__score-value">
            {presentes}<span className="valores__score-total">/{total}</span>
          </span>
          <span className="valores__score-label">
            {source === "humano" ? "humano" : "LLM"}
          </span>
        </div>
      </header>

      <div className="valores__bar" aria-hidden="true">
        <div
          className="valores__bar-fill"
          data-source={source}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="valores__grid">
        {ordered.map(([key, v]) => (
          <div key={key} className={`valor ${v.presente ? "valor--on" : "valor--off"}`}>
            <div className="valor__row">
              <span className="valor__dot" aria-hidden="true" />
              <span className="valor__name">{LABELS[key] ?? key}</span>
              <span className="valor__flag">{v.presente ? "presente" : "ausente"}</span>
            </div>
            {v.presente && v.evidencia && (
              <blockquote className="valor__evidence">"{v.evidencia}"</blockquote>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
