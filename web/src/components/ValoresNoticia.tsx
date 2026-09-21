import { useEffect, useState } from "react";
import type { ValoresNoticiaFile } from "../types";
import MethodInfo from "./MethodInfo";
import { VALORES_METHOD } from "../methodology";
import "./ValoresNoticia.css";

const LABELS: Record<string, string> = {
  proximidade: "Proximidade",
  proeminencia: "Proeminência",
  impacto: "Impacto",
  conflito: "Conflito",
  novidade: "Novidade",
  interesse: "Interesse",
  sensacionalismo: "Sensacionalismo",
};

const DESCRIPTIONS: Record<string, string> = {
  proximidade:
    "O impacto geográfico ou cultural do acontecimento em relação ao cotidiano e à vida do público-alvo.",
  proeminencia:
    "O envolvimento de pessoas conhecidas, elites, celebridades, instituições influentes ou autoridades governamentais.",
  impacto:
    "A importância, magnitude ou gravidade das repercussões que o evento terá diretamente sobre a vida dos cidadãos e da sociedade civil.",
  conflito:
    "Disputas, tensões, desentendimentos e debates que envolvem forças políticas, sociais ou institucionais opostas.",
  novidade:
    "Fatos fora do comum, bizarros, inesperados ou que rompem de alguma forma com a normalidade cotidiana.",
  interesse:
    "O potencial de capturar a atenção, despertar a curiosidade ou responder a uma necessidade real do público.",
  sensacionalismo:
    "Aspectos dramáticos, sexuais ou chocantes estrategicamente explorados para maximizar a audiência.",
};

const ORDER = Object.keys(LABELS);

interface Props {
  materiaId: number;
  source: "humano" | "llm";
  generator?: string | null;
  embedded?: boolean;
}

const BASE_URL_BY_SOURCE = {
  humano: "/data/valores_noticia",
  llm: "/data/valores_noticia_llm",
};

export default function ValoresNoticia({
  materiaId,
  source,
  generator = null,
  embedded = false,
}: Props) {
  const [data, setData] = useState<ValoresNoticiaFile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "absent">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setData(null);

    if (source === "llm" && !generator) {
      setStatus("absent");
      return;
    }

    const base = BASE_URL_BY_SOURCE[source];
    const url =
      source === "llm"
        ? `${base}/${generator}/${materiaId}.json`
        : `${base}/${materiaId}.json`;

    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<ValoresNoticiaFile>) : null))
      .catch(() => null)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setStatus(d ? "ready" : "absent");
      });

    return () => {
      cancelled = true;
    };
  }, [materiaId, source, generator]);

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
    <section className={`valores valores--${source} ${embedded ? "valores--embedded" : ""}`}>
      <header className="valores__head">
        <div>
          {!embedded && <h2>Valores-notícia identificados</h2>}
          <p className="muted valores__note">
            {source === "humano"
              ? "Sobre a matéria publicada pela Agência Câmara."
              : "Sobre a matéria gerada por LLM a partir da transcrição."}{" "}
            Base: critérios clássicos de noticiabilidade. Extração por DeepSeek ·{" "}
            {data.modelo}.
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
        {ordered.map(([key, v]) => {
          const descricao = DESCRIPTIONS[key];
          return (
            <div key={key} className={`valor ${v.presente ? "valor--on" : "valor--off"}`}>
              <div className="valor__row">
                <span
                  className="valor__status"
                  aria-hidden="true"
                  data-state={v.presente ? "on" : "off"}
                >
                  {v.presente ? "✓" : "–"}
                </span>
                <span className="valor__name">{LABELS[key] ?? key}</span>
                <span className="valor__actions">
                  {descricao && (
                    <span
                      className="valor__info"
                      tabIndex={0}
                      role="button"
                      aria-label={`O que é ${LABELS[key] ?? key}: ${descricao}`}
                    >
                      <span aria-hidden="true">i</span>
                      <span className="valor__tooltip" role="tooltip">
                        <strong>{LABELS[key] ?? key}</strong>
                        {descricao}
                      </span>
                    </span>
                  )}
                  <span className="valor__flag">{v.presente ? "presente" : "ausente"}</span>
                </span>
              </div>
              {v.presente && v.evidencia && (
                <blockquote className="valor__evidence">"{v.evidencia}"</blockquote>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
