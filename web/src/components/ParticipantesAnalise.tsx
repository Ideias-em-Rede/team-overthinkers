import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type {
  ParticipantesMateriaFile,
  ParticipantesTranscricaoFile,
} from "../types";
import MethodInfo from "./MethodInfo";
import BrazilMap from "./BrazilMap";
import { MATERIA_METHOD, TRANSCRICAO_METHOD } from "../methodology";
import "./ParticipantesAnalise.css";

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

interface Props {
  materiaId: number;
  editor: "humano" | "llm";
  embedded?: boolean;
}

interface Row {
  nome: string;
  nomeMateria: string | null;
  cargo: string | null;
  palavras: number;
  trechos: number;
  mencoes: number;
  citado: boolean;
  origem: "ambos" | "so_transcricao" | "so_materia";
  grupo: string;
  grupoColor: string;
}

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

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const MOCK_UFS = ["SP", "MG", "RJ", "RS", "BA", "PR", "PE", "CE", "DF", "GO"];
const MOCK_UF_WEIGHTS = [22, 15, 12, 9, 9, 8, 7, 7, 6, 5];
const MOCK_UF_CUMULATIVE = MOCK_UF_WEIGHTS.reduce<number[]>((acc, w) => {
  acc.push((acc[acc.length - 1] ?? 0) + w);
  return acc;
}, []);
const MOCK_UF_TOTAL = MOCK_UF_CUMULATIVE[MOCK_UF_CUMULATIVE.length - 1];

function mockGenero(nome: string): "Feminino" | "Masculino" {
  return hashStr("g:" + nome) % 100 < 28 ? "Feminino" : "Masculino";
}

function mockUF(nome: string): string {
  const pick = hashStr("uf:" + nome) % MOCK_UF_TOTAL;
  const idx = MOCK_UF_CUMULATIVE.findIndex((c) => pick < c);
  return MOCK_UFS[idx === -1 ? 0 : idx];
}

const GENDER_COLORS: Record<string, string> = {
  Feminino: "#c026d3",
  Masculino: "#0369a1",
};

function classifyGroup(
  partidoEstado: string | null,
  cargo: string | null
): { label: string; color: string } {
  if (partidoEstado) {
    let sigla = partidoEstado.split("-")[0].trim();
    if (sigla.includes("/")) sigla = sigla.split("/").pop()!.trim();
    sigla = sigla.toUpperCase();
    return { label: sigla, color: PARTY_COLORS[sigla] ?? "#6b7a8f" };
  }
  if (cargo) {
    const c = cargo.toLowerCase();
    if (/jornalista|colunista|repórter|reporter|editor|freelancer|fundador do site|reportagem|edição|edicao/.test(c))
      return { label: "Jornalista", color: PARTY_COLORS.Jornalista };
    if (/ministro|advogado|professor|especialista|pesquisador|presidente/.test(c))
      return { label: "Convidado", color: PARTY_COLORS.Convidado };
  }
  return { label: "N/D", color: PARTY_COLORS["N/D"] };
}

const URL_MATERIA_BY_EDITOR = {
  humano: (id: number) => `${import.meta.env.BASE_URL}data/participantes_materia/${id}.json`,
  llm: (id: number) => `${import.meta.env.BASE_URL}data/participantes_materia_llm/${id}.json`,
};

export default function ParticipantesAnalise({ materiaId, editor, embedded = false }: Props) {
  const [tr, setTr] = useState<ParticipantesTranscricaoFile | null>(null);
  const [ma, setMa] = useState<ParticipantesMateriaFile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "absent">("loading");

  useEffect(() => {
    setStatus("loading");
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/participantes_transcricao/${materiaId}.json`).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(URL_MATERIA_BY_EDITOR[editor](materiaId)).then((r) =>
        r.ok ? r.json() : null
      ),
    ])
      .then(([t, m]) => {
        if (!t || !m) {
          setStatus("absent");
          return;
        }
        setTr(t);
        setMa(m);
        setStatus("ready");
      })
      .catch(() => setStatus("absent"));
  }, [materiaId, editor]);

  const rows = useMemo<Row[]>(() => {
    if (!tr || !ma) return [];
    const matNames = ma.participantes.map((p) => p.nome);
    const usadosMateria = new Set<string>();

    const fromTr: Row[] = tr.participantes.map((p) => {
      const matched = match(p.nome, matNames);
      const mp = matched
        ? ma.participantes.find((m) => m.nome === matched)
        : undefined;
      if (matched) usadosMateria.add(matched);
      const g = classifyGroup(p.partido_estado, mp?.cargo ?? null);
      return {
        nome: p.nome,
        nomeMateria: matched,
        cargo: mp?.cargo ?? p.partido_estado ?? null,
        palavras: p.palavras,
        trechos: p.trechos,
        mencoes: mp?.mencoes ?? 0,
        citado: !!matched,
        origem: matched ? "ambos" : "so_transcricao",
        grupo: g.label,
        grupoColor: g.color,
      };
    });

    const fromMa: Row[] = ma.participantes
      .filter((p) => !usadosMateria.has(p.nome))
      .map((p) => {
        const g = classifyGroup(null, p.cargo);
        return {
          nome: p.nome,
          nomeMateria: p.nome,
          cargo: p.cargo,
          palavras: 0,
          trechos: 0,
          mencoes: p.mencoes,
          citado: true,
          origem: "so_materia" as const,
          grupo: g.label,
          grupoColor: g.color,
        };
      });

    return [...fromTr, ...fromMa];
  }, [tr, ma]);

  const sankey = useMemo(() => {
    const audRows = rows.filter((r) => r.palavras > 0);
    if (!audRows.length) return null;

    const grupos = Array.from(new Set(audRows.map((r) => r.grupo)));
    const partidoIdx: Record<string, number> = {};
    grupos.forEach((g, i) => (partidoIdx[g] = i));

    const participanteBase = grupos.length;
    const participanteIdx: Record<string, number> = {};
    audRows.forEach((r, i) => (participanteIdx[r.nome] = participanteBase + i));

    const citadoIdx = participanteBase + audRows.length;
    const naoCitadoIdx = citadoIdx + 1;

    const editorColor = editor === "humano" ? NAVY : BLUE;
    const citadoLabel = editor === "humano" ? "Citado (humano)" : "Citado (LLM)";

    const nodes = [
      ...grupos.map((g) => ({
        name: g,
        color: PARTY_COLORS[g] ?? "#6b7a8f",
        kind: "partido" as const,
      })),
      ...audRows.map((r) => ({
        name: shortName(r.nome),
        fullName: r.nome,
        color: r.grupoColor,
        kind: "participante" as const,
      })),
      { name: citadoLabel, color: editorColor, kind: "seleção" as const },
      { name: "Não citado", color: GRAY, kind: "seleção" as const },
    ];

    const links: {
      source: number;
      target: number;
      value: number;
      color: string;
    }[] = [];
    for (const r of audRows) {
      const pIdx = partidoIdx[r.grupo];
      const nIdx = participanteIdx[r.nome];
      const sIdx = r.citado ? citadoIdx : naoCitadoIdx;
      links.push({ source: pIdx, target: nIdx, value: r.palavras, color: r.grupoColor });
      links.push({ source: nIdx, target: sIdx, value: r.palavras, color: r.grupoColor });
    }

    return { nodes, links };
  }, [rows, editor]);

  if (status === "absent") return null;
  if (status === "loading" || !tr || !ma) {
    return <div className="loading">Carregando análise de participantes…</div>;
  }

  const totalAudiencia = tr.totais.num_participantes;
  const citados = rows.filter((r) => r.origem === "ambos").length;
  const naoCitados = rows.filter((r) => r.origem === "so_transcricao").length;
  const soMateria = rows.filter((r) => r.origem === "so_materia").length;
  const pctSelecionados = totalAudiencia
    ? Math.round((citados / totalAudiencia) * 100)
    : 0;
  const editorLabel = editor === "humano" ? "humano (Agência Câmara)" : `LLM (${ma.modelo})`;
  const editorColor = editor === "humano" ? NAVY : BLUE;

  const barData = rows
    .filter((r) => r.palavras > 0)
    .sort((a, b) => b.palavras - a.palavras)
    .map((r) => ({
      nome: r.nome,
      palavras: r.palavras,
      citado: r.citado,
      color: r.grupoColor,
      grupo: r.grupo,
    }));

  const scatterCitados = rows
    .filter((r) => r.origem === "ambos")
    .map((r) => ({ x: r.palavras, y: r.mencoes, nome: r.nome, cargo: r.cargo, grupo: r.grupo }));
  const scatterNao = rows
    .filter((r) => r.origem === "so_transcricao")
    .map((r) => ({ x: r.palavras, y: 0, nome: r.nome, cargo: r.cargo, grupo: r.grupo }));

  const gruposLegenda = Array.from(
    new Set(rows.filter((r) => r.palavras > 0).map((r) => r.grupo))
  );

  const audienceRows = rows.filter((r) => r.origem !== "so_materia");

  const partidoAgg = (() => {
    const map = new Map<string, { grupo: string; naAudiencia: number; citados: number; color: string }>();
    for (const r of audienceRows) {
      const cur = map.get(r.grupo) ?? {
        grupo: r.grupo,
        naAudiencia: 0,
        citados: 0,
        color: r.grupoColor,
      };
      cur.naAudiencia += 1;
      if (r.citado) cur.citados += 1;
      map.set(r.grupo, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.naAudiencia - a.naAudiencia);
  })();

  const generoAgg = (() => {
    const map = new Map<string, { genero: string; naAudiencia: number; citados: number; color: string }>();
    for (const r of audienceRows) {
      const g = mockGenero(r.nome);
      const cur = map.get(g) ?? {
        genero: g,
        naAudiencia: 0,
        citados: 0,
        color: GENDER_COLORS[g] ?? "#6b7a8f",
      };
      cur.naAudiencia += 1;
      if (r.citado) cur.citados += 1;
      map.set(g, cur);
    }
    return ["Feminino", "Masculino"]
      .map((k) => map.get(k))
      .filter((v): v is NonNullable<typeof v> => !!v);
  })();

  const ufAgg = (() => {
    const map = new Map<string, { uf: string; naAudiencia: number; citados: number }>();
    for (const r of audienceRows) {
      const u = mockUF(r.nome);
      const cur = map.get(u) ?? { uf: u, naAudiencia: 0, citados: 0 };
      cur.naAudiencia += 1;
      if (r.citado) cur.citados += 1;
      map.set(u, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.naAudiencia - a.naAudiencia);
  })();

  const methodsBlock = (
    <div className="pa__methods">
      <div className="pa__method pa__method--regex">
        <strong>Transcrição</strong>
        <span>método: regex determinístico</span>
        <span className="muted">
          cobertura {(tr.cobertura.proporcao * 100).toFixed(1)}%
        </span>
        <MethodInfo
          descricao={TRANSCRICAO_METHOD.descricao}
          code={TRANSCRICAO_METHOD.regex}
          codeLabel="padrão regex"
          origem={TRANSCRICAO_METHOD.origem}
        />
      </div>
      <div className={`pa__method pa__method--${editor}`}>
        <strong>Seleção editorial</strong>
        <span>{editor === "humano" ? "por Agência Câmara" : `por LLM (${ma.modelo})`}</span>
        <span className="muted">
          {editor === "humano"
            ? "extração LLM sobre matéria humana"
            : "extração LLM sobre matéria LLM"}
        </span>
        <MethodInfo
          descricao={MATERIA_METHOD.descricao}
          code={MATERIA_METHOD.prompt}
          codeLabel="prompt"
          origem={MATERIA_METHOD.origem}
          parametros={MATERIA_METHOD.parametros}
        />
      </div>
    </div>
  );

  const participacaoBody = (
    <>
      <div className="pa__stats">
        <Stat
          value={totalAudiencia}
          label="na audiência"
          items={rows
            .filter((r) => r.origem !== "so_materia")
            .sort((a, b) => b.palavras - a.palavras)
            .map((r) => ({
              nome: r.nome,
              meta: `${r.palavras} palavras · ${r.grupo}`,
              color: r.grupoColor,
            }))}
        />
        <Stat
          value={citados}
          label={`citados por ${editor}`}
          tone="on"
          items={rows
            .filter((r) => r.origem === "ambos")
            .sort((a, b) => b.mencoes - a.mencoes || b.palavras - a.palavras)
            .map((r) => ({
              nome: r.nomeMateria ?? r.nome,
              meta: `${r.mencoes} menções · ${r.palavras} palavras · ${r.grupo}`,
              color: r.grupoColor,
            }))}
        />
        <Stat
          value={naoCitados}
          label="não citados"
          tone="off"
          items={rows
            .filter((r) => r.origem === "so_transcricao")
            .sort((a, b) => b.palavras - a.palavras)
            .map((r) => ({
              nome: r.nome,
              meta: `${r.palavras} palavras · ${r.grupo}`,
              color: r.grupoColor,
            }))}
        />
        <Stat value={`${pctSelecionados}%`} label="taxa de seleção" tone="accent" />
        {soMateria > 0 && (
          <Stat
            value={soMateria}
            label="só na matéria"
            tone="warn"
            items={rows
              .filter((r) => r.origem === "so_materia")
              .sort((a, b) => b.mencoes - a.mencoes)
              .map((r) => ({
                nome: r.nomeMateria ?? r.nome,
                meta: `${r.mencoes} menções · ${r.cargo ?? "sem cargo"}`,
                color: r.grupoColor,
              }))}
          />
        )}
      </div>

      {sankey && (
        <div className="pa__chart">
          <div className="pa__chart-head">
            <h3>Fluxo de Seleção</h3>
            <span className="muted">
              Espessura do fluxo = palavras faladas na audiência. Cor = partido/grupo.
              Fluxos terminando em "Não citado" mostram fala filtrada pelo editor {editor}.
            </span>
          </div>
          <div className="pa__legend">
            {gruposLegenda.map((g) => (
              <span key={g} className="pa__legend-item">
                <span
                  className="pa__legend-dot"
                  style={{ background: PARTY_COLORS[g] ?? "#6b7a8f" }}
                />
                {g}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={Math.max(420, rows.filter(r => r.palavras > 0).length * 32)}>
            <Sankey
              data={sankey}
              nodePadding={16}
              nodeWidth={14}
              linkCurvature={0.55}
              iterations={64}
              margin={{ top: 10, right: 160, bottom: 10, left: 90 }}
              node={<SankeyNode />}
              link={<SankeyLink />}
            >
              <Tooltip content={<SankeyTooltip />} />
            </Sankey>
          </ResponsiveContainer>
        </div>
      )}

      <div className="pa__chart">
        <div className="pa__chart-head">
          <h3>Fala na audiência × menções na matéria</h3>
          <span className="muted">
            Cada ponto é um participante.
          </span>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 12, right: 24, bottom: 40, left: 16 }}>
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
            <ZAxis
              type="number"
              dataKey="x"
              range={[60, 700]}
              name="palavras faladas"
            />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTooltip />} />
            <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Scatter name="citados" data={scatterCitados} fill={editorColor} />
            <Scatter name="não citados" data={scatterNao} fill={GRAY} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </>
  );

  const partidoBody = (
    <div className="pa__chart">
      <div className="pa__chart-head">
        <h3 className="pa__sr-only">Volume de fala por participante</h3>
        <span className="muted">
          Cor = partido/grupo. Barras esmaecidas = não citados pelo editor {editor}.
        </span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(320, barData.length * 30)}>
        <BarChart
          data={barData}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" horizontal={false} />
          <XAxis type="number" stroke="#6b7a8f" fontSize={12} />
          <YAxis
            type="category"
            dataKey="nome"
            stroke="#6b7a8f"
            fontSize={11}
            width={180}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,51,102,0.04)" }}
            content={<BarTooltip />}
          />
          <Bar dataKey="palavras" radius={[0, 4, 4, 0]}>
            {barData.map((d, i) => (
              <Cell
                key={i}
                fill={d.color}
                fillOpacity={d.citado ? 1 : 0.38}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {partidoAgg.length > 0 && (
        <div className="pa__aggregate">
          <div className="pa__aggregate-head">Totais por partido / grupo</div>
          <ul className="pa__aggregate-list">
            {partidoAgg.map((p) => (
              <li key={p.grupo}>
                <span
                  className="pa__aggregate-dot"
                  style={{ background: p.color }}
                />
                <span className="pa__aggregate-label">{p.grupo}</span>
                <span className="pa__aggregate-value">
                  {p.citados}<span className="muted"> / {p.naAudiencia}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="pa__aggregate-legend muted">citados / na audiência</p>
        </div>
      )}
    </div>
  );

  const generoBody = (
    <div className="pa__chart">
      <div className="pa__chart-head">
        <span className="pa__mock-flag">dados de exemplo</span>
        <span className="muted">
          Distribuição por gênero entre quem participou da audiência e quem foi citado pelo editor {editor}.
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={generoAgg}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
          <XAxis dataKey="genero" stroke="#6b7a8f" fontSize={12} />
          <YAxis stroke="#6b7a8f" fontSize={12} allowDecimals={false} />
          <Tooltip cursor={{ fill: "rgba(0,51,102,0.04)" }} content={<AggTooltip />} />
          <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="naAudiencia" name="na audiência" fill={GRAY} radius={[4, 4, 0, 0]} />
          <Bar dataKey="citados" name={`citados por ${editor}`} fill={editorColor} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const ufBody = (
    <div className="pa__chart">
      <div className="pa__chart-head">
        <span className="pa__mock-flag">dados de exemplo</span>
        <span className="muted">
          Distribuição por unidade federativa entre quem foi citado pelo editor {editor}.
          Intensidade da cor = número de citados; UFs em cinza claro não têm participantes nesta matéria.
        </span>
      </div>
      <BrazilMap data={ufAgg} editorColor={editorColor} editor={editor} />
    </div>
  );

  return (
    <section className={`pa pa--${editor} ${embedded ? "pa--embedded" : ""}`}>
      {!embedded && (
        <header className="pa__head">
          <h2>Participantes: quem falou vs. quem virou notícia</h2>
          <p className="muted pa__subtitle">
            Editor ativo: <strong>{editorLabel}</strong>. Compara quem falou na
            audiência (regex sobre a transcrição) com quem foi selecionado por
            este editor.
          </p>
          {methodsBlock}
        </header>
      )}

      {embedded && (
        <p className="muted pa__editor-line">
          Editor ativo: <strong>{editorLabel}</strong>.
        </p>
      )}
      {embedded && methodsBlock}

      <div className="pa__subsection">
        <div className="pa__subsection-head">
          <h3>Participação</h3>
        </div>
        {participacaoBody}
      </div>

      <div className="pa__row pa__row--split">
        <div className="pa__subsection">
          <div className="pa__subsection-head">
            <h3>Partido / Bloco</h3>
          </div>
          {partidoBody}
        </div>
        <div className="pa__subsection">
          <div className="pa__subsection-head">
            <h3>Gênero</h3>
          </div>
          {generoBody}
        </div>
      </div>

      <div className="pa__subsection">
        <div className="pa__subsection-head">
          <h3>UF</h3>
        </div>
        {ufBody}
      </div>
    </section>
  );
}

function AggTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pa-tooltip">
      <strong>{label}</strong>
      {payload.map((p: any) => (
        <div key={p.dataKey}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

function shortName(nome: string): string {
  const parts = nome.split(/\s+/);
  if (parts.length <= 2) return nome;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

interface StatItem {
  nome: string;
  meta?: string;
  color?: string;
}

function Stat({
  value,
  label,
  tone,
  items,
}: {
  value: string | number;
  label: string;
  tone?: "on" | "off" | "accent" | "warn";
  items?: StatItem[];
}) {
  const inner = (
    <>
      <span className="pa-stat__value">{value}</span>
      <span className="pa-stat__label">{label}</span>
    </>
  );

  if (!items || items.length === 0) {
    return <div className={`pa-stat pa-stat--${tone ?? "default"}`}>{inner}</div>;
  }

  return (
    <details className={`pa-stat pa-stat--${tone ?? "default"} pa-stat--expandable`}>
      <summary className="pa-stat__summary">
        {inner}
        <span className="pa-stat__caret" aria-hidden="true">▾</span>
      </summary>
      <ul className="pa-stat__list">
        {items.map((it, i) => (
          <li key={i}>
            {it.color && (
              <span
                className="pa-stat__dot"
                style={{ background: it.color }}
                aria-hidden="true"
              />
            )}
            <span className="pa-stat__nome">{it.nome}</span>
            {it.meta && <span className="pa-stat__meta">{it.meta}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="pa-tooltip">
      <strong>{p.nome}</strong>
      {p.grupo && <div className="pa-tooltip__group">{p.grupo}</div>}
      {p.cargo && <div className="muted">{p.cargo}</div>}
      <div>{p.x} palavras · {p.y} menções</div>
    </div>
  );
}

function BarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="pa-tooltip">
      <strong>{p.nome}</strong>
      <div className="pa-tooltip__group">{p.grupo}</div>
      <div>{p.palavras} palavras · {p.citado ? "citado" : "não citado"}</div>
    </div>
  );
}

function SankeyNode({ x, y, width, height, index, payload }: any) {
  const isRight = x > 400;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={payload.color ?? "#6b7a8f"}
        fillOpacity={0.9}
      />
      <text
        x={isRight ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isRight ? "end" : "start"}
        dominantBaseline="middle"
        fontSize={payload.kind === "participante" ? 11 : 12}
        fontWeight={payload.kind === "participante" ? 400 : 600}
        fill="#1a2332"
      >
        {payload.name}
      </text>
      <title>{payload.fullName ?? payload.name}</title>
      <desc>#{index}</desc>
    </g>
  );
}

function SankeyLink(props: any) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
  const color = payload?.color ?? "#94a3b8";
  return (
    <path
      d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={color}
      strokeOpacity={0.35}
      strokeWidth={linkWidth}
    />
  );
}

function SankeyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  if (item.name && !item.source) {
    return (
      <div className="pa-tooltip">
        <strong>{item.fullName ?? item.name}</strong>
        {item.value != null && <div>{item.value} palavras (total)</div>}
      </div>
    );
  }
  const src = item.source?.name ?? "";
  const tgt = item.target?.name ?? "";
  return (
    <div className="pa-tooltip">
      <strong>{src} → {tgt}</strong>
      <div>{item.value} palavras</div>
    </div>
  );
}
