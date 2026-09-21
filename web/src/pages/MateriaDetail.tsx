import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MateriaDetail as MateriaDetailT, MateriaLlmFile } from "../types";
import ValoresNoticia from "../components/ValoresNoticia";
import ParticipantesAnalise from "../components/ParticipantesAnalise";
import "./MateriaDetail.css";

type Tab = "humano" | "llm";

const GENERATORS: { id: string; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "anthropic", label: "Anthropic" },
  { id: "deepseek", label: "DeepSeek" },
];

export default function MateriaDetail() {
  const { id } = useParams<{ id: string }>();
  const [materia, setMateria] = useState<MateriaDetailT | null>(null);
  const [llmByGenerator, setLlmByGenerator] = useState<Record<string, MateriaLlmFile>>({});
  const [selectedGenerator, setSelectedGenerator] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTranscricao, setShowTranscricao] = useState(false);
  const [tab, setTab] = useState<Tab>("humano");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setMateria(null);
    setLlmByGenerator({});
    setSelectedGenerator(null);
    setError(null);
    setShowTranscricao(false);
    setTab("humano");

    fetch(`/data/materias/${id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Matéria #${id} não encontrada`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setMateria(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });

    Promise.all(
      GENERATORS.map(async ({ id: gid }) => {
        try {
          const r = await fetch(`/data/materia_llm/${gid}/${id}.json`);
          if (!r.ok) return null;
          const d = (await r.json()) as MateriaLlmFile;
          return [gid, d] as const;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, MateriaLlmFile> = {};
      for (const r of results) if (r) map[r[0]] = r[1];
      setLlmByGenerator(map);
      const first = GENERATORS.find(({ id: gid }) => map[gid])?.id ?? null;
      setSelectedGenerator(first);
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="detail">
        <Link to="/materias" className="btn ghost">
          ← Voltar para matérias
        </Link>
        <div className="empty">{error}</div>
      </div>
    );
  }

  if (!materia) return <div className="loading">Carregando matéria…</div>;

  const availableGenerators = GENERATORS.filter(({ id: gid }) => llmByGenerator[gid]);
  const hasLlm = availableGenerators.length > 0 && !!selectedGenerator;
  const activeTab: Tab = hasLlm ? tab : "humano";
  const llm = selectedGenerator ? llmByGenerator[selectedGenerator] : null;

  return (
    <article className="detail">
      <Link to="/materias" className="btn ghost detail__back">
        ← Voltar para matérias
      </Link>

      {hasLlm && (
        <div className="tabs">
          <TabBtn
            active={activeTab === "humano"}
            onClick={() => setTab("humano")}
            icon="📰"
            title="Matéria humana"
            sub="Agência Câmara"
          />
          <TabBtn
            active={activeTab === "llm"}
            onClick={() => setTab("llm")}
            icon="🤖"
            title="Matéria gerada por LLM"
            sub={llm ? `${llm.modelo} · sobre a transcrição` : "sobre a transcrição"}
          />
        </div>
      )}

      <section className="detail__section detail__section--materia">
        <div className="detail__section-head">
          <span className="detail__section-eyebrow">Matéria</span>
        </div>
        {activeTab === "llm" && availableGenerators.length > 0 && (
          <div className="detail__generator-toolbar">
            <label className="detail__generator">
              <span className="detail__generator-label">Modelo Gerador</span>
              <select
                className="detail__generator-select"
                value={selectedGenerator ?? ""}
                onChange={(e) => setSelectedGenerator(e.target.value)}
              >
                {availableGenerators.map(({ id: gid, label }) => {
                  const d = llmByGenerator[gid];
                  return (
                    <option key={gid} value={gid}>
                      {label} · {d.modelo}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        )}
        {activeTab === "humano" ? (
          <ArticleHumano materia={materia} />
        ) : (
          llm && <ArticleLlm llm={llm} />
        )}
      </section>

      <section className="detail__section detail__section--selecao">
        <div className="detail__section-head">
          <span className="detail__section-eyebrow">Seleção jornalística</span>
        </div>

        <div className="detail__subgroup">
          <div className="detail__subgroup-head">
            <h2>Valores-notícia</h2>
            <p className="detail__subgroup-intro">
              Critérios tradicionalmente utilizados para explicar a seleção de
              acontecimentos jornalísticos.
            </p>
          </div>
          <ValoresNoticia
            materiaId={materia.id}
            source={activeTab}
            generator={activeTab === "llm" ? selectedGenerator : null}
            embedded
          />
        </div>

        <div className="detail__subgroup">
          <div className="detail__subgroup-head">
            <h2>Padrões de seleção</h2>
            <p className="detail__subgroup-intro">
              Características analisadas para investigar quem aparece na
              notícia e quanto espaço recebe.
            </p>
          </div>
          <ParticipantesAnalise
            materiaId={materia.id}
            editor={activeTab}
            embedded
          />
        </div>
      </section>

      <section className="detail__transcricao-section">
        <div className="detail__transcricao-head">
          <h2>Transcrição da audiência</h2>
          <button
            className="btn ghost"
            onClick={() => setShowTranscricao((v) => !v)}
          >
            {showTranscricao ? "Ocultar" : "Mostrar"} transcrição (
            {(materia.transcricao.length / 1000).toFixed(1)}k caracteres)
          </button>
        </div>
        {showTranscricao && (
          <pre className="detail__transcricao">{materia.transcricao}</pre>
        )}
      </section>
    </article>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  sub: string;
}) {
  return (
    <button
      className={`tabs__tab ${active ? "tabs__tab--active" : ""}`}
      onClick={onClick}
    >
      <span className="tabs__icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <span className="tabs__sub">{sub}</span>
      </span>
    </button>
  );
}

function ArticleHumano({ materia }: { materia: MateriaDetailT }) {
  return (
    <>
      <header className="detail__head">
        <div className="detail__meta">
          <span className="badge">#{materia.id}</span>
          {materia.data && (
            <span className="muted">
              {materia.data}
              {materia.hora ? ` · ${materia.hora}` : ""}
            </span>
          )}
        </div>
        <h1>{materia.titulo}</h1>
        {materia.subtitulo && <p className="detail__sub">{materia.subtitulo}</p>}
      </header>
      <div className="detail__body">
        {materia.corpo.split(/\n\s*\n/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </>
  );
}

function ArticleLlm({ llm }: { llm: MateriaLlmFile }) {
  return (
    <>
      <header className="detail__head detail__head--llm">
        <div className="detail__meta">
          <span className="badge badge--llm">gerada por LLM</span>
          <span className="muted">
            {llm.modelo} · temperatura {llm.temperature}
          </span>
        </div>
        <p className="detail__llm-note">
          Texto produzido por LLM a partir da transcrição da audiência, sem
          contato com a versão humana.
        </p>
      </header>
      <div className="detail__body">
        {llm.materia_llm.split(/\n\s*\n/).map((p, i) => (
          <p key={i} dangerouslySetInnerHTML={{ __html: renderLite(p) }} />
        ))}
      </div>
    </>
  );
}

function renderLite(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
