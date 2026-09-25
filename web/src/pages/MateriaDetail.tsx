import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import BrazilMapCount, { type UfCount } from "../components/BrazilMapCount";
import ColumnBar from "../components/ColumnBar";
import GatekeepSankey from "../components/GatekeepSankey";
import type {
  GatekeeperRow,
  MateriaDetail as MateriaDetailT,
  MateriaEnvolvidosEntry,
  MateriaLlmFile,
  ResumoTranscricaoEntry,
  ResumoTranscricaoMap,
  TemaEntry,
  TemasMap,
  ValoresNoticiaFile,
} from "../types";
import "./MateriaDetail.css";

type LlmProvider = "deepseek" | "gemini" | "openai";

const LLM_PROVIDERS: { key: LlmProvider; label: string }[] = [
  { key: "deepseek", label: "DeepSeek" },
  { key: "gemini", label: "Gemini" },
  { key: "openai", label: "OpenAI" },
];

const VALOR_LABELS: Record<string, string> = {
  proximidade: "Proximidade",
  proeminencia: "Proeminência",
  impacto: "Impacto",
  conflito: "Conflito",
  novidade: "Novidade",
  interesse: "Interesse",
  sensacionalismo: "Sensacionalismo",
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

interface PageData {
  materia: MateriaDetailT;
  valores: ValoresNoticiaFile;
  envolvidos: MateriaEnvolvidosEntry | null;
  resumo: ResumoTranscricaoEntry | null;
  tema: TemaEntry | null;
  gatekeepers: GatekeeperRow[];
  llm: Record<LlmProvider, MateriaLlmFile | null>;
  llmValores: Record<LlmProvider, ValoresNoticiaFile | null>;
}

export default function MateriaDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTranscricao, setShowTranscricao] = useState(false);
  const [materiaTab, setMateriaTab] = useState<"humano" | "llm">("humano");
  const [llmSelected, setLlmSelected] = useState<LlmProvider>("deepseek");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setData(null);
    setError(null);
    setShowTranscricao(false);
    setMateriaTab("humano");
    setLlmSelected("deepseek");

    const fetchLlm = (provider: LlmProvider) =>
      fetch(`/data/llm/materias_llm/${provider}/${id}.json`).then((r) =>
        r.ok ? (r.json() as Promise<MateriaLlmFile>) : null
      );

    const fetchLlmValores = (provider: LlmProvider) =>
      fetch(`/data/llm/materias_llm/valores_noticia/${provider}/${id}.json`).then((r) =>
        r.ok ? (r.json() as Promise<ValoresNoticiaFile>) : null
      );

    Promise.all([
      fetch(`/data/humano/materias/materias/${id}.json`).then((r) => {
        if (!r.ok) throw new Error(`Matéria #${id} não encontrada`);
        return r.json() as Promise<MateriaDetailT>;
      }),
      fetch(`/data/humano/materias/valores_noticia/${id}.json`).then((r) =>
        r.ok ? (r.json() as Promise<ValoresNoticiaFile>) : Promise.reject(new Error("valores_noticia ausente"))
      ),
      fetch(`/data/humano/materias/participantes/participantes.json`).then((r) =>
        r.ok ? (r.json() as Promise<MateriaEnvolvidosEntry[]>) : Promise.resolve([] as MateriaEnvolvidosEntry[])
      ),
      fetch(`/data/humano/transcricoes/resumo/resumo_transcricao.json`).then((r) =>
        r.ok ? (r.json() as Promise<ResumoTranscricaoMap>) : Promise.resolve({} as ResumoTranscricaoMap)
      ),
      fetch(`/data/humano/transcricoes/temas/temas_audiencias.json`).then((r) =>
        r.ok ? (r.json() as Promise<TemasMap>) : Promise.resolve({} as TemasMap)
      ),
      fetch(`/data/humano/gatekeepers/gatekeepers.json`).then((r) =>
        r.ok ? (r.json() as Promise<GatekeeperRow[]>) : Promise.resolve([] as GatekeeperRow[])
      ),
      fetchLlm("deepseek").catch(() => null),
      fetchLlm("gemini").catch(() => null),
      fetchLlm("openai").catch(() => null),
      fetchLlmValores("deepseek").catch(() => null),
      fetchLlmValores("gemini").catch(() => null),
      fetchLlmValores("openai").catch(() => null),
    ])
      .then(
        ([
          materia,
          valores,
          envolvidos,
          resumo,
          temas,
          gatekeepers,
          deepseek,
          gemini,
          openai,
          deepseekVal,
          geminiVal,
          openaiVal,
        ]) => {
          if (cancelled) return;
          setData({
            materia,
            valores,
            envolvidos: envolvidos.find((e) => e.id === materia.id) ?? null,
            resumo: resumo[String(materia.id)] ?? null,
            tema: temas[String(materia.id)] ?? null,
            gatekeepers: gatekeepers.filter((g) => g.hearing_id === materia.id),
            llm: { deepseek, gemini, openai },
            llmValores: {
              deepseek: deepseekVal,
              gemini: geminiVal,
              openai: openaiVal,
            },
          });
        }
      )
      .catch((e) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="detail">
        <Link to="/materias" className="btn ghost detail__back">← Voltar para matérias</Link>
        <div className="empty">{error}</div>
      </div>
    );
  }

  if (!data) return <div className="loading">Carregando matéria…</div>;

  const { materia, valores, envolvidos, resumo, tema, gatekeepers, llm, llmValores } = data;
  const totalOpinioes = envolvidos
    ? envolvidos.envolvidos.reduce((a, e) => a + e.quantidade_opinioes, 0)
    : null;

  return (
    <article className="detail">
      <Link to="/materias" className="btn ghost detail__back">← Voltar para matérias</Link>

      {/* Toggles: humano vs LLM */}
      <div className="materia-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={materiaTab === "humano"}
          className={`materia-tab ${materiaTab === "humano" ? "on" : ""}`}
          onClick={() => setMateriaTab("humano")}
        >
          Escrito por humano
        </button>
        <button
          role="tab"
          aria-selected={materiaTab === "llm"}
          className={`materia-tab ${materiaTab === "llm" ? "on" : ""}`}
          onClick={() => setMateriaTab("llm")}
        >
          Gerado por LLM
        </button>
      </div>

      {materiaTab === "llm" ? (
        <LlmPage
          files={llm}
          valores={llmValores}
          selected={llmSelected}
          onSelect={setLlmSelected}
        />
      ) : (
        <>
      {/* 1) Título */}
      <header className="detail__head">
        <div className="detail__meta">
          <span className="badge">#{materia.id}</span>
          {materia.data && (
            <span className="muted">
              {materia.data}
              {materia.hora ? ` · ${materia.hora}` : ""}
            </span>
          )}
          {tema?.tema && <span className="badge badge--tema">{tema.tema}</span>}
        </div>
        <h1>{materia.titulo}</h1>
        {materia.subtitulo && <p className="detail__sub">{materia.subtitulo}</p>}
        {(tema?.assunto || materia.assunto) && (
          <p className="detail__assunto">
            <strong>Assunto:</strong> {tema?.assunto ?? materia.assunto}
          </p>
        )}
      </header>

      {/* 2) Matéria */}
      <section className="detail__section">
        <h2 className="detail__section-title">Matéria</h2>
        <div className="detail__body">
          {materia.corpo.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* 3) Cards de números gerais */}
      <section className="detail__kpis">
        <KpiCard
          label="Participantes na audiência"
          value={resumo?.resumo.quantidade_participantes ?? "—"}
        />
        <KpiCard
          label="Mencionados na matéria"
          value={envolvidos?.envolvidos.length ?? "—"}
        />
        <KpiCard
          label="Mulheres na audiência"
          value={
            tema
              ? `${tema.quantidade_mulheres} (${tema.porcentagem_mulheres.toFixed(1)}%)`
              : "—"
          }
        />
        <KpiCard
          label="Opiniões atribuídas"
          value={totalOpinioes ?? "—"}
        />
      </section>

      {/* 4) Valores-notícia */}
      <section className="detail__section">
        <h2 className="detail__section-title">Valores-notícia</h2>
        <p className="detail__section-sub muted">
          Critérios de noticiabilidade identificados na matéria (DeepSeek-V3).
        </p>
        <ValoresList valores={valores} />
      </section>

      {/* 5) Distribuições */}
      <section className="detail__section">
        <h2 className="detail__section-title">Distribuição na audiência</h2>
        <p className="detail__section-sub muted">
          Perfil dos participantes na transcrição (extração feita por regex).
        </p>
        {resumo ? (
          <div className="detail__dists-stack">
            <div className="dist-row">
              <ColumnBar
                titulo="Por gênero"
                data={[
                  { k: "Homens", v: resumo.resumo.genero.masculino, color: "var(--navy)" },
                  { k: "Mulheres", v: resumo.resumo.genero.feminino, color: "#c94f7c" },
                ]}
              />
              <ColumnBar
                titulo="Por partido"
                data={Object.entries(resumo.resumo.partidos)
                  .map(([k, v]) => ({
                    k,
                    v: v.participantes,
                    color: PARTY_COLORS[k] ?? "var(--blue)",
                  }))
                  .sort((a, b) => b.v - a.v)}
              />
            </div>
            <div className="dist-row">
              <MapaEstados data={resumo.resumo.estados} />
              <div className="dist">
                <div className="dist__head">
                  <h3 className="dist__title">Gatekeep - Filtro editorial: quem foi coberto na matéria</h3>
                  <span className="muted">
                    audiência × matéria · largura ∝ palavras
                  </span>
                </div>
                {gatekeepers.length > 0 ? (
                  <GatekeepSankey rows={gatekeepers} />
                ) : (
                  <p className="muted">Sem dados de gatekeeping.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="muted">Sem dados de resumo para esta audiência.</p>
        )}
      </section>

      {/* 6) Mencionados na matéria (accordion) */}
      <section className="detail__section">
        <h2 className="detail__section-title">Mencionados na matéria</h2>
        <p className="detail__section-sub muted">
          Nomes citados na matéria com suas opiniões (DeepSeek-V3). Clique para
          expandir.
        </p>
        {envolvidos && envolvidos.envolvidos.length > 0 ? (
          <MencionadosAccordion envolvidos={envolvidos.envolvidos} />
        ) : (
          <p className="muted">Nenhum mencionado identificado.</p>
        )}
      </section>

      {/* 7) Transcrição */}
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
        </>
      )}
    </article>
  );
}

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="kpi">
      <div className="kpi__value">{value}</div>
      <div className="kpi__label">{label}</div>
    </div>
  );
}

function ValoresList({ valores }: { valores: ValoresNoticiaFile }) {
  const entries = Object.entries(VALOR_LABELS).map(([k, label]) => {
    const v = valores.valores_noticia[k];
    return { k, label, presente: !!v?.presente, evidencia: v?.evidencia ?? null };
  });
  return (
    <div className="valores-grid">
      {entries.map(({ k, label, presente, evidencia }) => (
        <div key={k} className={`valor-card ${presente ? "on" : "off"}`}>
          <div className="valor-card__head">
            <span className="valor-card__label">{label}</span>
            <span className={`valor-card__status ${presente ? "on" : "off"}`}>
              {presente ? "presente" : "ausente"}
            </span>
          </div>
          {presente && evidencia ? (
            <p className="valor-card__evidencia">{evidencia}</p>
          ) : (
            <p className="valor-card__evidencia valor-card__evidencia--empty muted">
              Sem evidência.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function MapaEstados({
  data,
}: {
  data: Record<string, { participantes: number; falas: number; palavras: number }>;
}) {
  const items: UfCount[] = useMemo(
    () =>
      Object.entries(data).map(([uf, v]) => ({
        uf,
        count: v.participantes,
        extra: { falas: v.falas, palavras: v.palavras.toLocaleString("pt-BR") },
      })),
    [data]
  );
  const total = items.reduce((a, i) => a + i.count, 0);

  return (
    <div className="dist">
      <div className="dist__head">
        <h3 className="dist__title">Por estado</h3>
        <span className="muted">
          {total} participantes · {items.length} UFs representadas
        </span>
      </div>
      {items.length > 0 ? (
        <BrazilMapCount data={items} color="#003366" label="participantes" />
      ) : (
        <p className="muted">Sem dados.</p>
      )}
    </div>
  );
}

function LlmPage({
  files,
  valores,
  selected,
  onSelect,
}: {
  files: Record<LlmProvider, MateriaLlmFile | null>;
  valores: Record<LlmProvider, ValoresNoticiaFile | null>;
  selected: LlmProvider;
  onSelect: (p: LlmProvider) => void;
}) {
  const file = files[selected];
  const val = valores[selected];
  const label = LLM_PROVIDERS.find((p) => p.key === selected)?.label ?? selected;

  return (
    <>
      <div className="llm-page__bar">
        <label className="llm-select">
          <span className="llm-select__label">Modelo</span>
          <select
            className="llm-select__control"
            value={selected}
            onChange={(e) => onSelect(e.target.value as LlmProvider)}
          >
            {LLM_PROVIDERS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {file && (
          <p className="llm-page__modelo muted">
            <strong>Modelo:</strong> {file.modelo}
            {typeof file.temperature === "number" && (
              <> · <strong>Temperatura:</strong> {file.temperature}</>
            )}
          </p>
        )}
      </div>

      <section className="detail__section">
        <h2 className="detail__section-title">Matéria</h2>
        {file ? (
          <div className="detail__body">
            {file.materia_llm.split(/\n\s*\n/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className="muted">
            Matéria gerada por {label} não disponível para esta audiência.
          </p>
        )}
      </section>

      <section className="detail__section">
        <h2 className="detail__section-title">Valores-notícia</h2>
        <p className="detail__section-sub muted">
          Critérios de noticiabilidade identificados na matéria gerada por {label} (DeepSeek-V3).
        </p>
        {val ? (
          <ValoresList valores={val} />
        ) : (
          <p className="muted">
            Valores-notícia ainda não extraídos para a matéria gerada por {label}.
          </p>
        )}
      </section>
    </>
  );
}

function MencionadosAccordion({
  envolvidos,
}: {
  envolvidos: MateriaEnvolvidosEntry["envolvidos"];
}) {
  const ordered = [...envolvidos].sort((a, b) => b.mencoes - a.mencoes);
  return (
    <div className="mencionados">
      {ordered.map((e) => (
        <details key={e.nome} className="mencionado">
          <summary className="mencionado__summary">
            <span className="mencionado__nome">{e.nome}</span>
            <span className="mencionado__stats muted">
              {e.mencoes} menç. · {e.quantidade_opinioes} opini
              {e.quantidade_opinioes === 1 ? "ão" : "ões"} · {e.posicao_no_texto}
            </span>
            <span className="mencionado__chev" aria-hidden>▾</span>
          </summary>
          {e.opinioes.length > 0 ? (
            <ul className="mencionado__opinioes">
              {e.opinioes.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          ) : (
            <p className="muted mencionado__empty">Sem opiniões registradas.</p>
          )}
        </details>
      ))}
    </div>
  );
}
