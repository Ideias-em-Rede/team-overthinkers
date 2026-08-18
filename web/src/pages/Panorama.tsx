import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type {
  MateriaDetail as MateriaDetailT,
  MateriaLlmFile,
  ParticipantesMateriaFile,
  ParticipantesTranscricaoFile,
  ValoresNoticiaFile,
} from "../types";
import "./Panorama.css";

const NAVY = "#003366";
const BLUE = "#0077b6";
const GRAY = "#94a3b8";

const PARTY_COLORS: Record<string, string> = {
  PT: "#d1442c",
  PL: "#2d7d46",
  NOVO: "#f19c1f",
  PP: "#1e5aa8",
  PSDB: "#0077b6",
  MDB: "#8e44ad",
  UNIÃO: "#c0392b",
  PSD: "#16a085",
  Jornalista: "#6b7a8f",
  Convidado: "#94a3b8",
  "N/D": "#cbd5e1",
};

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

const ID = 1;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function lastName(s: string): string {
  const parts = normalize(s).split(" ").filter((t) => t.length >= 4);
  return parts[parts.length - 1] ?? "";
}
function match(rowNome: string, listNomes: string[]): string | null {
  const rowLn = lastName(rowNome);
  if (!rowLn) return null;
  for (const other of listNomes) {
    const otherNorm = normalize(other);
    if (otherNorm.includes(rowLn)) return other;
    const otherLn = lastName(other);
    if (otherLn && normalize(rowNome).includes(otherLn)) return other;
  }
  return null;
}
function classifyGroup(
  partidoEstado: string | null,
  cargo: string | null
): string {
  if (partidoEstado) {
    let sigla = partidoEstado.split("-")[0].trim();
    if (sigla.includes("/")) sigla = sigla.split("/").pop()!.trim();
    return sigla.toUpperCase();
  }
  if (cargo) {
    const c = cargo.toLowerCase();
    if (/jornalista|colunista|repórter|reporter|editor|freelancer|fundador do site|reportagem|edição|edicao/.test(c))
      return "Jornalista";
    if (/ministro|advogado|professor|especialista|pesquisador|presidente/.test(c))
      return "Convidado";
  }
  return "N/D";
}

interface Data {
  humanoMateria: MateriaDetailT;
  llmMateria: MateriaLlmFile;
  humanoValores: ValoresNoticiaFile;
  llmValores: ValoresNoticiaFile;
  trParticipantes: ParticipantesTranscricaoFile;
  humanoParticipantes: ParticipantesMateriaFile;
  llmParticipantes: ParticipantesMateriaFile;
}

export default function Panorama() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/data/materias/${ID}.json`).then((r) => r.json()),
      fetch(`/data/materia_llm/${ID}.json`).then((r) => r.json()),
      fetch(`/data/valores_noticia/${ID}.json`).then((r) => r.json()),
      fetch(`/data/valores_noticia_llm/${ID}.json`).then((r) => r.json()),
      fetch(`/data/participantes_transcricao/${ID}.json`).then((r) => r.json()),
      fetch(`/data/participantes_materia/${ID}.json`).then((r) => r.json()),
      fetch(`/data/participantes_materia_llm/${ID}.json`).then((r) => r.json()),
    ])
      .then(([hm, lm, hv, lv, tp, hp, lp]) => {
        setData({
          humanoMateria: hm,
          llmMateria: lm,
          humanoValores: hv,
          llmValores: lv,
          trParticipantes: tp,
          humanoParticipantes: hp,
          llmParticipantes: lp,
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  const derived = useMemo(() => {
    if (!data) return null;

    const humanoWords = data.humanoMateria.materia_raw.split(/\s+/).filter(Boolean).length;
    const llmWords = data.llmMateria.materia_llm.split(/\s+/).filter(Boolean).length;

    const humanoCitacoes = data.humanoParticipantes.totais.num_citacoes_diretas;
    const llmCitacoes = data.llmParticipantes.totais.num_citacoes_diretas;

    const concordancia = ORDER.filter(
      (k) =>
        data.humanoValores.valores_noticia[k]?.presente ===
        data.llmValores.valores_noticia[k]?.presente
    ).length;

    const humNames = data.humanoParticipantes.participantes.map((p) => p.nome);
    const llmNames = data.llmParticipantes.participantes.map((p) => p.nome);
    const soHumano: string[] = [];
    const ambos: { humano: string; llm: string }[] = [];
    const usadosLlm = new Set<string>();
    for (const h of humNames) {
      const m = match(h, llmNames);
      if (m) {
        ambos.push({ humano: h, llm: m });
        usadosLlm.add(m);
      } else {
        soHumano.push(h);
      }
    }
    const soLlm = llmNames.filter((n) => !usadosLlm.has(n));
    const uniao = soHumano.length + ambos.length + soLlm.length;
    const jaccard = uniao ? ambos.length / uniao : 0;

    const trPartMap = new Map(
      data.trParticipantes.participantes.map((p) => [p.nome, p])
    );

    function grupoDo(nome: string, cargo: string | null): string {
      const tr = trPartMap.get(nome);
      if (tr) return classifyGroup(tr.partido_estado, cargo);
      for (const [k, v] of trPartMap.entries()) {
        if (normalize(k).includes(lastName(nome)) || normalize(nome).includes(lastName(k))) {
          return classifyGroup(v.partido_estado, cargo);
        }
      }
      return classifyGroup(null, cargo);
    }

    const gruposHumano = new Map<string, number>();
    for (const p of data.humanoParticipantes.participantes) {
      const g = grupoDo(p.nome, p.cargo);
      gruposHumano.set(g, (gruposHumano.get(g) ?? 0) + 1);
    }
    const gruposLlm = new Map<string, number>();
    for (const p of data.llmParticipantes.participantes) {
      const g = grupoDo(p.nome, p.cargo);
      gruposLlm.set(g, (gruposLlm.get(g) ?? 0) + 1);
    }
    const allGroups = Array.from(new Set([...gruposHumano.keys(), ...gruposLlm.keys()])).sort();

    const scatterHumano: { x: number; y: number; nome: string; grupo: string }[] = [];
    const scatterLlm: { x: number; y: number; nome: string; grupo: string }[] = [];
    for (const p of data.trParticipantes.participantes) {
      const hM = match(p.nome, humNames);
      const hMp = hM ? data.humanoParticipantes.participantes.find((x) => x.nome === hM) : null;
      const lM = match(p.nome, llmNames);
      const lMp = lM ? data.llmParticipantes.participantes.find((x) => x.nome === lM) : null;
      const grupo = classifyGroup(p.partido_estado, hMp?.cargo ?? lMp?.cargo ?? null);
      scatterHumano.push({ x: p.palavras, y: hMp?.mencoes ?? 0, nome: p.nome, grupo });
      scatterLlm.push({ x: p.palavras, y: lMp?.mencoes ?? 0, nome: p.nome, grupo });
    }

    return {
      humanoWords,
      llmWords,
      humanoCitacoes,
      llmCitacoes,
      concordancia,
      totalValores: ORDER.length,
      soHumano,
      ambos,
      soLlm,
      jaccard,
      gruposHumano,
      gruposLlm,
      allGroups,
      scatterHumano,
      scatterLlm,
    };
  }, [data]);

  if (error) return <div className="empty">Erro carregando dados: {error}</div>;
  if (!data || !derived) return <div className="loading">Carregando panorama…</div>;

  const humanoPres = ORDER.filter((k) => data.humanoValores.valores_noticia[k]?.presente).length;
  const llmPres = ORDER.filter((k) => data.llmValores.valores_noticia[k]?.presente).length;

  return (
    <div className="pan">
      <header className="pan__head">
        <h1>Panorama · Matéria #1</h1>
        <p className="muted">
          Comparativo humano × LLM. Escopo atual: <strong>1 matéria</strong>. Quando a
          pipeline rodar nas 206, esta página vira o dashboard corpus-level.
        </p>
      </header>

      {/* ============ CARDS DESCRITIVOS ============ */}
      <section className="pan__section">
        <h2>Comparativo direto</h2>
        <div className="pan__cards">
          <CompareCard
            title="Tamanho da matéria"
            humano={`${derived.humanoWords} palavras`}
            llm={`${derived.llmWords} palavras`}
            hint={`LLM produz ${derived.llmWords < derived.humanoWords ? "menos" : "mais"} texto (${Math.round((derived.llmWords / derived.humanoWords) * 100)}% do humano)`}
          />
          <CompareCard
            title="Citações diretas"
            humano={`${derived.humanoCitacoes}`}
            llm={`${derived.llmCitacoes}`}
            hint="Trechos entre aspas atribuídos a participantes"
          />
          <CompareCard
            title="Valores-notícia presentes"
            humano={`${humanoPres}/11`}
            llm={`${llmPres}/11`}
            hint={`concordância: ${derived.concordancia}/${derived.totalValores}`}
          />
          <CompareCard
            title="Participantes citados"
            humano={`${data.humanoParticipantes.participantes.length}`}
            llm={`${data.llmParticipantes.participantes.length}`}
            hint={`Jaccard: ${(derived.jaccard * 100).toFixed(0)}%`}
          />
        </div>
      </section>

      {/* ============ VALORES-NOTÍCIA (PAIRED BARS) ============ */}
      <section className="pan__section">
        <div className="pan__section-head">
          <h2>Critérios (valores-notícia)</h2>
          <span className="muted">
            Presença de cada critério em cada versão. Linhas em amarelo = divergência.
          </span>
        </div>

        <div className="pan-bars">
          {ORDER.map((k) => {
            const h = !!data.humanoValores.valores_noticia[k]?.presente;
            const l = !!data.llmValores.valores_noticia[k]?.presente;
            const diverge = h !== l;
            return (
              <div key={k} className={`pan-bar ${diverge ? "pan-bar--diverge" : ""}`}>
                <span className="pan-bar__label">{LABELS[k]}</span>
                <div className="pan-bar__pair">
                  <span className="pan-bar__src">humano</span>
                  <div className="pan-bar__track">
                    <div className={`pan-bar__fill pan-bar__fill--h ${h ? "on" : ""}`} />
                  </div>
                </div>
                <div className="pan-bar__pair">
                  <span className="pan-bar__src">LLM</span>
                  <div className="pan-bar__track">
                    <div className={`pan-bar__fill pan-bar__fill--l ${l ? "on" : ""}`} />
                  </div>
                </div>
                <span className={`pan-bar__status ${diverge ? "warn" : "ok"}`}>
                  {diverge ? "⚠" : "✓"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ SCATTER ============ */}
      <section className="pan__section">
        <div className="pan__section-head">
          <h2>Fala na audiência × Menções na matéria</h2>
          <span className="muted">
            Cada ponto = 1 participante. Sobreposição das duas versões (humano em navy, LLM em azul).
          </span>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 40, left: 16 }}>
            <CartesianGrid stroke="#e5e9f0" />
            <XAxis
              type="number"
              dataKey="x"
              stroke="#6b7a8f"
              fontSize={12}
              label={{
                value: "Palavras faladas na audiência",
                position: "insideBottom",
                offset: -12,
                fill: "#6b7a8f",
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              stroke="#6b7a8f"
              fontSize={12}
              allowDecimals={false}
              label={{
                value: "Menções na matéria",
                angle: -90,
                position: "insideLeft",
                fill: "#6b7a8f",
                fontSize: 12,
              }}
            />
            <ZAxis type="number" dataKey="x" range={[60, 700]} name="palavras" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTip />} />
            <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Scatter name="humano" data={derived.scatterHumano} fill={NAVY} fillOpacity={0.7} />
            <Scatter name="LLM" data={derived.scatterLlm} fill={BLUE} fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </section>

      {/* ============ HEATMAP ============ */}
      <section className="pan__section">
        <div className="pan__section-head">
          <h2>Heatmap · Valor-notícia × Grupo</h2>
          <span className="muted">
            Contagem de participantes de cada grupo citados quando o valor está presente.
            Com n=1 matéria o padrão é raso; ganha densidade em corpus grande.
          </span>
        </div>
        <div className="pan__heatmaps">
          <Heatmap
            titulo="Editor: humano"
            tone="h"
            valores={ORDER}
            grupos={derived.allGroups}
            valorPresente={(k) => !!data.humanoValores.valores_noticia[k]?.presente}
            countGrupo={(g) => derived.gruposHumano.get(g) ?? 0}
          />
          <Heatmap
            titulo="Editor: LLM"
            tone="l"
            valores={ORDER}
            grupos={derived.allGroups}
            valorPresente={(k) => !!data.llmValores.valores_noticia[k]?.presente}
            countGrupo={(g) => derived.gruposLlm.get(g) ?? 0}
          />
        </div>
      </section>

      {/* ============ WHO WAS CITED ============ */}
      <section className="pan__section">
        <div className="pan__section-head">
          <h2>Quem foi citado</h2>
          <span className="muted">
            Overlap dos participantes selecionados por cada editor. Jaccard: {(derived.jaccard * 100).toFixed(0)}%
          </span>
        </div>
        <div className="pan__ovl">
          <OvlCol titulo="Só humano" tone="h" items={derived.soHumano.map((n) => ({ text: n }))} />
          <OvlCol
            titulo="Em ambos"
            tone="both"
            items={derived.ambos.map((a) => ({
              text: a.humano,
              sub: a.humano !== a.llm ? `LLM: ${a.llm}` : undefined,
            }))}
          />
          <OvlCol titulo="Só LLM" tone="l" items={derived.soLlm.map((n) => ({ text: n }))} />
        </div>
      </section>
    </div>
  );
}

function CompareCard({
  title,
  humano,
  llm,
  hint,
}: {
  title: string;
  humano: string;
  llm: string;
  hint?: string;
}) {
  return (
    <div className="pan-card">
      <div className="pan-card__title">{title}</div>
      <div className="pan-card__row">
        <div className="pan-card__side pan-card__side--h">
          <span className="pan-card__src">humano</span>
          <span className="pan-card__val">{humano}</span>
        </div>
        <div className="pan-card__side pan-card__side--l">
          <span className="pan-card__src">LLM</span>
          <span className="pan-card__val">{llm}</span>
        </div>
      </div>
      {hint && <div className="pan-card__hint">{hint}</div>}
    </div>
  );
}

function Heatmap({
  titulo,
  tone,
  valores,
  grupos,
  valorPresente,
  countGrupo,
}: {
  titulo: string;
  tone: "h" | "l";
  valores: string[];
  grupos: string[];
  valorPresente: (v: string) => boolean;
  countGrupo: (g: string) => number;
}) {
  const maxCount = Math.max(1, ...grupos.map(countGrupo));
  return (
    <div className={`pan-heat pan-heat--${tone}`}>
      <div className="pan-heat__title">{titulo}</div>
      <div className="pan-heat__wrap">
        <table className="pan-heat__tbl">
          <thead>
            <tr>
              <th></th>
              {valores.map((v) => (
                <th key={v} className={valorPresente(v) ? "" : "pan-heat__col-off"}>
                  <span>{LABELS[v]?.slice(0, 4)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const gc = countGrupo(g);
              return (
                <tr key={g}>
                  <th>
                    <span
                      className="pan-heat__dot"
                      style={{ background: PARTY_COLORS[g] ?? "#6b7a8f" }}
                    />
                    {g}
                  </th>
                  {valores.map((v) => {
                    const on = valorPresente(v);
                    const val = on ? gc : 0;
                    const intensity = val / maxCount;
                    const alpha = val === 0 ? 0.06 : 0.15 + intensity * 0.75;
                    const bg =
                      tone === "h"
                        ? `rgba(0, 51, 102, ${alpha})`
                        : `rgba(0, 119, 182, ${alpha})`;
                    return (
                      <td
                        key={v}
                        style={{ background: bg, color: intensity > 0.5 ? "#fff" : "#1a2332" }}
                      >
                        {val > 0 ? val : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OvlCol({
  titulo,
  tone,
  items,
}: {
  titulo: string;
  tone: "h" | "both" | "l";
  items: { text: string; sub?: string }[];
}) {
  return (
    <div className={`pan-ovl pan-ovl--${tone}`}>
      <div className="pan-ovl__head">
        <strong>{titulo}</strong>
        <span className="pan-ovl__count">{items.length}</span>
      </div>
      <ul>
        {items.length ? (
          items.map((it, i) => (
            <li key={i}>
              {it.text}
              {it.sub && <span className="muted"> · {it.sub}</span>}
            </li>
          ))
        ) : (
          <li className="muted">—</li>
        )}
      </ul>
    </div>
  );
}

function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="pan-tooltip">
      <strong>{p.nome}</strong>
      {p.grupo && <div className="pan-tooltip__group">{p.grupo}</div>}
      <div>
        {p.x} palavras · {p.y} menções
      </div>
    </div>
  );
}

void GRAY;
