import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MateriaDetail as MateriaDetailT, MateriaLlmFile } from "../types";
import ValoresNoticia from "../components/ValoresNoticia";
import ParticipantesAnalise from "../components/ParticipantesAnalise";
import "./MateriaDetail.css";

type Tab = "humano" | "llm";

export default function MateriaDetail() {
  const { id } = useParams<{ id: string }>();
  const [materia, setMateria] = useState<MateriaDetailT | null>(null);
  const [llm, setLlm] = useState<MateriaLlmFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTranscricao, setShowTranscricao] = useState(false);
  const [tab, setTab] = useState<Tab>("humano");

  useEffect(() => {
    if (!id) return;
    setMateria(null);
    setLlm(null);
    setError(null);
    setShowTranscricao(false);
    setTab("humano");

    fetch(`/data/materias/${id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Matéria #${id} não encontrada`);
        return r.json();
      })
      .then(setMateria)
      .catch((e) => setError(e.message));

    fetch(`/data/materia_llm/${id}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setLlm)
      .catch(() => setLlm(null));
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

  const hasLlm = !!llm;
  const activeTab: Tab = hasLlm ? tab : "humano";

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
            sub={`${llm.modelo} · sobre a transcrição`}
          />
        </div>
      )}

      <div className="detail__grid">
        <div className="detail__col detail__col--main">
          {activeTab === "humano" ? (
            <ArticleHumano materia={materia} />
          ) : (
            llm && <ArticleLlm llm={llm} />
          )}
        </div>
        <aside className="detail__col detail__col--side">
          <ValoresNoticia materiaId={materia.id} source={activeTab} />
        </aside>
      </div>

      <ParticipantesAnalise materiaId={materia.id} editor={activeTab} />

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
