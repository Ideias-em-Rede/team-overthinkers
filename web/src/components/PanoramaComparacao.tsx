import { useEffect, useMemo, useState } from "react";
import type {
  GatekeeperRow,
  MateriaEnvolvidosEntry,
  PanoramaFile,
  ValoresPorMateriaMap,
} from "../types";
import "./PanoramaComparacao.css";

type Source = "humano" | "deepseek" | "gemini" | "openai";

const SOURCES: { key: Source; label: string; color: string }[] = [
  { key: "humano", label: "Humano", color: "#003366" },
  { key: "deepseek", label: "DeepSeek", color: "#0077b6" },
  { key: "gemini", label: "Gemini", color: "#c94f7c" },
  { key: "openai", label: "OpenAI", color: "#2d7d46" },
];

const VALORES: { key: string; label: string }[] = [
  { key: "proximidade", label: "Proximidade" },
  { key: "proeminencia", label: "Proeminência" },
  { key: "impacto", label: "Impacto" },
  { key: "conflito", label: "Conflito" },
  { key: "novidade", label: "Novidade" },
  { key: "interesse", label: "Interesse" },
  { key: "sensacionalismo", label: "Sensacionalismo" },
];

type ValoresBySource = Record<Source, ValoresPorMateriaMap | null>;
type PanoramaBySource = Record<Source, PanoramaFile | null>;
type GatekeepersBySource = Record<Source, GatekeeperRow[]>;
type EnvolvidosBySource = Record<Source, MateriaEnvolvidosEntry[]>;

const GK_PATHS: Record<Source, string> = {
  humano: import.meta.env.BASE_URL + "data/humano/gatekeepers/gatekeepers.json",
  deepseek: import.meta.env.BASE_URL + "data/llm/gatekeepers/deepseek/gatekeepers.json",
  gemini: import.meta.env.BASE_URL + "data/llm/gatekeepers/gemini/gatekeepers.json",
  openai: import.meta.env.BASE_URL + "data/llm/gatekeepers/openai/gatekeepers.json",
};

const ENV_PATHS: Record<Source, string> = {
  humano: import.meta.env.BASE_URL + "data/humano/materias/participantes/participantes.json",
  deepseek: import.meta.env.BASE_URL + "data/llm/materias_llm/participantes/deepseek/participantes.json",
  gemini: import.meta.env.BASE_URL + "data/llm/materias_llm/participantes/gemini/participantes.json",
  openai: import.meta.env.BASE_URL + "data/llm/materias_llm/participantes/openai/participantes.json",
};

export default function PanoramaComparacao() {
  const [valores, setValores] = useState<ValoresBySource | null>(null);
  const [panorama, setPanorama] = useState<PanoramaBySource | null>(null);
  const [gatekeepers, setGatekeepers] = useState<GatekeepersBySource | null>(null);
  const [envolvidos, setEnvolvidos] = useState<EnvolvidosBySource | null>(null);

  useEffect(() => {
    const fetchJson = <T,>(url: string) =>
      fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : null));

    const perSourceGk = SOURCES.map(({ key }) =>
      fetchJson<GatekeeperRow[]>(GK_PATHS[key]).then((v) => v ?? [])
    );
    const perSourceEnv = SOURCES.map(({ key }) =>
      fetchJson<MateriaEnvolvidosEntry[]>(ENV_PATHS[key]).then((v) => v ?? [])
    );

    Promise.all([
      fetchJson<ValoresPorMateriaMap>(import.meta.env.BASE_URL + "data/humano/materias/valores_noticia_all.json"),
      fetchJson<ValoresPorMateriaMap>(import.meta.env.BASE_URL + "data/llm/materias_llm/valores_noticia_all/deepseek.json"),
      fetchJson<ValoresPorMateriaMap>(import.meta.env.BASE_URL + "data/llm/materias_llm/valores_noticia_all/gemini.json"),
      fetchJson<ValoresPorMateriaMap>(import.meta.env.BASE_URL + "data/llm/materias_llm/valores_noticia_all/openai.json"),
      fetchJson<PanoramaFile>(import.meta.env.BASE_URL + "data/humano/panorama/panorama.json"),
      fetchJson<PanoramaFile>(import.meta.env.BASE_URL + "data/llm/panorama/deepseek/panorama.json"),
      fetchJson<PanoramaFile>(import.meta.env.BASE_URL + "data/llm/panorama/gemini/panorama.json"),
      fetchJson<PanoramaFile>(import.meta.env.BASE_URL + "data/llm/panorama/openai/panorama.json"),
      Promise.all(perSourceGk),
      Promise.all(perSourceEnv),
    ]).then(
      ([vh, vd, vg, vo, ph, pd, pg, po, gks, envs]) => {
        setValores({ humano: vh, deepseek: vd, gemini: vg, openai: vo });
        setPanorama({ humano: ph, deepseek: pd, gemini: pg, openai: po });
        setGatekeepers({
          humano: gks[0], deepseek: gks[1], gemini: gks[2], openai: gks[3],
        });
        setEnvolvidos({
          humano: envs[0], deepseek: envs[1], gemini: envs[2], openai: envs[3],
        });
      }
    );
  }, []);

  if (!valores || !panorama || !gatekeepers || !envolvidos) {
    return <div className="loading">Carregando comparação…</div>;
  }

  return (
    <div className="cmp">
      <section className="cmp__section">
        <h3 className="cmp__section-title">Assinatura de valores-notícia</h3>
        <p className="cmp__section-sub muted">
          Percentual de matérias em que cada valor-notícia foi identificado
          (DeepSeek-V3 como extrator, aplicado igualmente às quatro fontes).
          Cada grupo compara o humano com os três LLMs geradores.
        </p>
        <ValoresComparacao valores={valores} />
      </section>

      <section className="cmp__section">
        <h3 className="cmp__section-title">Placar dos achados de gatekeeping</h3>
        <p className="cmp__section-sub muted">
          Cada linha é uma hipótese de gatekeeping testada; cada coluna é uma
          fonte (humano ou LLM). Verde = hipótese sustentada a 5%; amarelo =
          sustentada mas com ressalva; cinza = não sustentada.
        </p>
        <AchadosComparacao panorama={panorama} />
      </section>

      <section className="cmp__section">
        <h3 className="cmp__section-title">KPIs comparativos</h3>
        <p className="cmp__section-sub muted">
          Números-âncora por fonte: volume de matérias, quantas pessoas foram
          citadas, quantas opiniões atribuídas e taxa de cobertura da audiência.
        </p>
        <KpiComparacao
          gatekeepers={gatekeepers}
          envolvidos={envolvidos}
        />
      </section>

      <section className="cmp__section">
        <h3 className="cmp__section-title">Perfil demográfico dos citados</h3>
        <p className="cmp__section-sub muted">
          Distribuição das pessoas efetivamente citadas nas matérias (linhas
          com <code>covered=true</code>) por gênero, partido e estado. Barras
          agrupadas por categoria — cor por fonte.
        </p>
        <PerfilComparacao gatekeepers={gatekeepers} />
      </section>

      <section className="cmp__section">
        <h3 className="cmp__section-title">Concordância entre fontes</h3>
        <p className="cmp__section-sub muted">
          Para cada audiência, comparamos o conjunto de pessoas citadas por
          cada fonte. A célula é a mediana do índice de Jaccard{" "}
          <code>|A ∩ B| / |A ∪ B|</code> entre os pares — 1,0 = mesmos citados;
          0,0 = zero sobreposição. LLMs podem concordar estatisticamente (mesmo
          perfil agregado) e ainda assim escolher pessoas diferentes.
        </p>
        <ConcordanciaComparacao gatekeepers={gatekeepers} />
      </section>
    </div>
  );
}

interface AchadoLinha {
  key: string;
  label: string;
  descricao: string;
  extract: (p: PanoramaFile) => {
    p: number | null;
    sustained: boolean | null;
    caution: boolean;
    oppositeDirection?: boolean;
  };
}

const ACHADO_LINHAS: AchadoLinha[] = [
  {
    key: "h1",
    label: "H1 · Filtro de fala",
    descricao:
      "Citados na matéria falam mais palavras que os não citados (Mann-Whitney U, unilateral).",
    extract: (p) => {
      const a = p.achado_1_filtro_de_selecao as any;
      return {
        p: numOrNull(a?.p_valor),
        sustained: boolOrDerive(
          a?.hipotese_sustentada_a_5pct,
          a?.rejeita_h0_a_5pct,
          a?.p_valor
        ),
        caution: false,
      };
    },
  },
  {
    key: "h2",
    label: "H2 · Silenciamento de mulheres",
    descricao:
      "Mulheres têm menor chance de serem citadas, controlando por volume de fala (logística; H1 unilateral coef < 0).",
    extract: (p) => {
      const a = p.achado_2_silenciamento_mulheres as any;
      const pv = numOrNull(a?.p_valor);
      const coef = numOrNull(a?.coef_is_mulher);
      // Efeito oposto = teste significativo mas direção contrária a H1
      const oppositeDirection =
        pv !== null && pv < 0.05 && coef !== null && coef > 0;
      return {
        p: pv,
        sustained: boolOrDerive(a?.hipotese_sustentada_a_5pct),
        caution: false,
        oppositeDirection,
      };
    },
  },
  {
    key: "h3",
    label: "H3 · Viés partidário",
    descricao:
      "A chance de um deputado ser citado depende do partido (qui-quadrado de independência, N≥15).",
    extract: (p) => {
      const a = p.achado_3_vies_partidario as any;
      return {
        p: numOrNull(a?.p_valor),
        sustained: boolOrDerive(a?.hipotese_sustentada_a_5pct, undefined, a?.p_valor),
        caution: false,
      };
    },
  },
  {
    key: "h4",
    label: "H4 · População da UF",
    descricao:
      "Deputados de UFs mais populosas têm mais chance de citação, controlando por fala (logística).",
    extract: (p) => {
      const a = p.achado_4_populacao_uf as any;
      const sustained = boolOrDerive(
        a?.hipotese_sustentada_a_5pct,
        a?.rejeita_h0_a_5pct,
        a?.p_valor
      );
      return {
        p: numOrNull(a?.p_valor),
        sustained,
        caution:
          sustained === true &&
          a?.classificacao === "nao_significativo_o_suficiente_para_afirmar",
      };
    },
  },
];

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function boolOrDerive(
  ...vals: (boolean | number | null | undefined)[]
): boolean | null {
  for (const v of vals) {
    if (typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v < 0.05;
  }
  return null;
}

function AchadosComparacao({ panorama }: { panorama: PanoramaBySource }) {
  return (
    <div className="cmp-achados">
      <table className="cmp-achados__table">
        <thead>
          <tr>
            <th className="cmp-achados__th-hip">Hipótese</th>
            {SOURCES.map((s) => (
              <th key={s.key} className="cmp-achados__th-src">
                <span
                  className="cmp-achados__th-dot"
                  style={{ background: s.color }}
                />
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ACHADO_LINHAS.map((row) => (
            <tr key={row.key}>
              <td className="cmp-achados__hip">
                <div className="cmp-achados__hip-label">{row.label}</div>
                <div className="cmp-achados__hip-desc muted">
                  {row.descricao}
                </div>
              </td>
              {SOURCES.map((s) => {
                const pf = panorama[s.key];
                if (!pf) {
                  return (
                    <td key={s.key} className="cmp-achados__cell">
                      <span className="cmp-achados__pill cmp-achados__pill--na">
                        s/ dado
                      </span>
                    </td>
                  );
                }
                const { p: pval, sustained, caution, oppositeDirection } = row.extract(pf);
                return (
                  <td key={s.key} className="cmp-achados__cell">
                    <VeredictoPill
                      sustained={sustained}
                      caution={caution}
                      oppositeDirection={oppositeDirection}
                    />
                    <div className="cmp-achados__pval muted">
                      {formatP(pval)}
                      {oppositeDirection && (
                        <span className="cmp-achados__opposite">
                          {" "}· efeito na direção oposta
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VeredictoPill({
  sustained,
  caution,
  oppositeDirection,
}: {
  sustained: boolean | null;
  caution: boolean;
  oppositeDirection?: boolean;
}) {
  if (sustained === null) {
    return (
      <span className="cmp-achados__pill cmp-achados__pill--na">s/ dado</span>
    );
  }
  if (sustained && caution) {
    return (
      <span className="cmp-achados__pill cmp-achados__pill--caution">
        Com ressalva
      </span>
    );
  }
  if (sustained) {
    return (
      <span className="cmp-achados__pill cmp-achados__pill--yes">
        Sustentada
      </span>
    );
  }
  if (oppositeDirection) {
    return (
      <span className="cmp-achados__pill cmp-achados__pill--opposite">
        Efeito oposto
      </span>
    );
  }
  return (
    <span className="cmp-achados__pill cmp-achados__pill--no">
      Não sustentada
    </span>
  );
}

function formatP(p: number | null): string {
  if (p === null) return "";
  if (p < 0.0001) return "p < 0,0001";
  if (p < 0.001) return "p < 0,001";
  return `p = ${p.toFixed(3).replace(".", ",")}`;
}

/* ============ Concordância (Jaccard) ============ */

interface ConcordanciaResult {
  jaccardMedian: Record<Source, Record<Source, number>>;
  audienciasCount: number;
  llm3Median: number;
  humano3llmMedian: number;
  bucketMedians: {
    only1: number;
    in2: number;
    inAll3: number;
  };
}

function computeConcordancia(
  gks: GatekeepersBySource
): ConcordanciaResult {
  const bySrcByHearing: Record<Source, Map<number, Set<string>>> = {} as any;
  const hearingIds = new Set<number>();

  for (const { key } of SOURCES) {
    const map = new Map<number, Set<string>>();
    for (const g of gks[key]) {
      if (!g.covered) continue;
      hearingIds.add(g.hearing_id);
      let s = map.get(g.hearing_id);
      if (!s) {
        s = new Set();
        map.set(g.hearing_id, s);
      }
      s.add(g.nome_key);
    }
    bySrcByHearing[key] = map;
  }

  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };

  const jaccard = (a: Set<string>, b: Set<string>): number | null => {
    if (a.size === 0 && b.size === 0) return null;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? null : inter / union;
  };

  const jaccardMedian: Record<Source, Record<Source, number>> = {} as any;
  for (const { key: srcA } of SOURCES) {
    jaccardMedian[srcA] = {} as Record<Source, number>;
    for (const { key: srcB } of SOURCES) {
      if (srcA === srcB) {
        jaccardMedian[srcA][srcB] = 1;
        continue;
      }
      const values: number[] = [];
      for (const h of hearingIds) {
        const a = bySrcByHearing[srcA].get(h) ?? new Set<string>();
        const b = bySrcByHearing[srcB].get(h) ?? new Set<string>();
        const j = jaccard(a, b);
        if (j !== null) values.push(j);
      }
      jaccardMedian[srcA][srcB] = median(values);
    }
  }

  const llm3Ratios: number[] = [];
  const humano3llmRatios: number[] = [];
  const only1Counts: number[] = [];
  const in2Counts: number[] = [];
  const inAll3Counts: number[] = [];

  for (const h of hearingIds) {
    const d = bySrcByHearing.deepseek.get(h) ?? new Set<string>();
    const g = bySrcByHearing.gemini.get(h) ?? new Set<string>();
    const o = bySrcByHearing.openai.get(h) ?? new Set<string>();
    const hu = bySrcByHearing.humano.get(h) ?? new Set<string>();

    const union3 = new Set<string>([...d, ...g, ...o]);
    if (union3.size > 0) {
      let inter3 = 0;
      let in2 = 0;
      let only1 = 0;
      for (const x of union3) {
        const n = (d.has(x) ? 1 : 0) + (g.has(x) ? 1 : 0) + (o.has(x) ? 1 : 0);
        if (n === 3) inter3++;
        else if (n === 2) in2++;
        else only1++;
      }
      llm3Ratios.push(inter3 / union3.size);
      only1Counts.push(only1);
      in2Counts.push(in2);
      inAll3Counts.push(inter3);
    }

    if (hu.size > 0 && union3.size > 0) {
      let interAll4 = 0;
      for (const x of hu) {
        if (d.has(x) && g.has(x) && o.has(x)) interAll4++;
      }
      const union4 = new Set<string>([...hu, ...d, ...g, ...o]);
      humano3llmRatios.push(interAll4 / union4.size);
    }
  }

  return {
    jaccardMedian,
    audienciasCount: hearingIds.size,
    llm3Median: median(llm3Ratios),
    humano3llmMedian: median(humano3llmRatios),
    bucketMedians: {
      only1: median(only1Counts),
      in2: median(in2Counts),
      inAll3: median(inAll3Counts),
    },
  };
}

function ConcordanciaComparacao({
  gatekeepers,
}: {
  gatekeepers: GatekeepersBySource;
}) {
  const result = useMemo(() => computeConcordancia(gatekeepers), [gatekeepers]);

  const cellColor = (j: number): string => {
    // 0 → cinza claro; 1 → navy denso. Escala linear pra simplicidade.
    const t = Math.min(1, Math.max(0, j));
    const r = Math.round(230 - t * (230 - 0));
    const g = Math.round(235 - t * (235 - 51));
    const b = Math.round(240 - t * (240 - 102));
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div className="cmp-conc">
      <div className="cmp-conc__grid">
        <table className="cmp-conc__matrix">
          <thead>
            <tr>
              <th />
              {SOURCES.map((s) => (
                <th key={s.key}>
                  <span
                    className="cmp-conc__dot"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((srcA) => (
              <tr key={srcA.key}>
                <th className="cmp-conc__row-th">
                  <span
                    className="cmp-conc__dot"
                    style={{ background: srcA.color }}
                  />
                  {srcA.label}
                </th>
                {SOURCES.map((srcB) => {
                  const j = result.jaccardMedian[srcA.key][srcB.key];
                  const isDiag = srcA.key === srcB.key;
                  return (
                    <td
                      key={srcB.key}
                      className="cmp-conc__cell"
                      style={{
                        background: isDiag ? "#f6f8fb" : cellColor(j),
                        color: !isDiag && j > 0.5 ? "#fff" : "var(--text)",
                      }}
                    >
                      {isDiag ? "—" : j.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="cmp-conc__side">
          <div className="cmp-conc__stat">
            <div className="cmp-conc__stat-value">
              {(result.llm3Median * 100).toFixed(1)}%
            </div>
            <div className="cmp-conc__stat-label">
              interseção mediana entre os 3 LLMs por audiência ·{" "}
              <code>|D ∩ G ∩ O| / |D ∪ G ∪ O|</code>
            </div>
          </div>
          <div className="cmp-conc__stat">
            <div className="cmp-conc__stat-value">
              {(result.humano3llmMedian * 100).toFixed(1)}%
            </div>
            <div className="cmp-conc__stat-label">
              interseção mediana entre humano ∩ todos os 3 LLMs por audiência
            </div>
          </div>
          <div className="cmp-conc__stat">
            <div className="cmp-conc__stat-value">
              {result.bucketMedians.only1.toFixed(0)} /{" "}
              {result.bucketMedians.in2.toFixed(0)} /{" "}
              {result.bucketMedians.inAll3.toFixed(0)}
            </div>
            <div className="cmp-conc__stat-label">
              pessoas citadas por 1 / 2 / 3 LLMs (mediana por audiência)
            </div>
          </div>
        </div>
      </div>

      <p className="cmp-conc__nota muted">
        Base: {result.audienciasCount} audiências. Comparação feita sobre
        pessoas com <code>nome_key</code> presente em ambos os lados (normalizado
        no build do gatekeepers).
      </p>
    </div>
  );
}

/* ============ KPI comparativo ============ */

function KpiComparacao({
  gatekeepers,
  envolvidos,
}: {
  gatekeepers: GatekeepersBySource;
  envolvidos: EnvolvidosBySource;
}) {
  const kpis = useMemo(() => {
    return SOURCES.map(({ key }) => {
      const gks = gatekeepers[key];
      const envs = envolvidos[key];
      const total = gks.length;
      const cobertos = gks.filter((g) => g.covered);
      const mulheresCitadas = cobertos.filter(
        (g) => g.genero === "feminino"
      ).length;
      const mencionados = envs.reduce((a, e) => a + e.envolvidos.length, 0);
      return {
        source: key,
        totalMaterias: envs.length,
        mencionados,
        mulheresCitadas,
        pctMulheresCitadas:
          cobertos.length > 0 ? (mulheresCitadas / cobertos.length) * 100 : 0,
        taxaCobertura: total > 0 ? (cobertos.length / total) * 100 : 0,
      };
    });
  }, [gatekeepers, envolvidos]);

  const rows: {
    label: string;
    fmt: (v: number, k: (typeof kpis)[number]) => string;
    get: (k: (typeof kpis)[number]) => number;
  }[] = [
    { label: "Matérias analisadas", fmt: (v) => v.toLocaleString("pt-BR"), get: (k) => k.totalMaterias },
    { label: "Pessoas mencionadas nas matérias", fmt: (v) => v.toLocaleString("pt-BR"), get: (k) => k.mencionados },
    {
      label: "Mulheres citadas na matéria",
      fmt: (v, k) =>
        `${v.toLocaleString("pt-BR")} (${k.pctMulheresCitadas.toFixed(1)}%)`,
      get: (k) => k.mulheresCitadas,
    },
    { label: "Taxa de cobertura da audiência", fmt: (v) => `${v.toFixed(1)}%`, get: (k) => k.taxaCobertura },
  ];

  return (
    <div className="cmp-kpi">
      <table className="cmp-kpi__table">
        <thead>
          <tr>
            <th className="cmp-kpi__th-metric">Métrica</th>
            {SOURCES.map((s) => (
              <th key={s.key} className="cmp-kpi__th-src">
                <span
                  className="cmp-kpi__th-dot"
                  style={{ background: s.color }}
                />
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = kpis.map(row.get);
            const max = Math.max(...values);
            return (
              <tr key={row.label}>
                <td className="cmp-kpi__metric">{row.label}</td>
                {kpis.map((k, i) => (
                  <td
                    key={k.source}
                    className={`cmp-kpi__value ${
                      values[i] === max ? "cmp-kpi__value--max" : ""
                    }`}
                  >
                    {row.fmt(values[i], k)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============ Perfil demográfico dos citados ============ */

const GENERO_ORDER = ["masculino", "feminino"];
const GENERO_LABEL: Record<string, string> = {
  masculino: "Homens",
  feminino: "Mulheres",
};

function PerfilComparacao({
  gatekeepers,
}: {
  gatekeepers: GatekeepersBySource;
}) {
  const perfil = useMemo(() => computePerfilBySource(gatekeepers), [gatekeepers]);

  return (
    <div className="cmp-perfil">
      <div className="cmp-valores__legend">
        {SOURCES.map((s) => (
          <span key={s.key} className="cmp-valores__legend-item">
            <span
              className="cmp-valores__legend-dot"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <PerfilDim
        titulo="Por gênero"
        categorias={GENERO_ORDER.map((k) => ({
          key: k,
          label: GENERO_LABEL[k] ?? k,
        }))}
        distribuicoes={perfil.genero}
      />
      <PerfilDim
        titulo="Por partido (top 8)"
        categorias={perfil.topPartidos.map((k) => ({ key: k, label: k }))}
        distribuicoes={perfil.partido}
      />
      <PerfilDim
        titulo="Por estado (top 8)"
        categorias={perfil.topEstados.map((k) => ({ key: k, label: k }))}
        distribuicoes={perfil.estado}
      />
    </div>
  );
}

interface PerfilResult {
  genero: Record<Source, Record<string, number>>;
  partido: Record<Source, Record<string, number>>;
  estado: Record<Source, Record<string, number>>;
  topPartidos: string[];
  topEstados: string[];
}

function computePerfilBySource(gks: GatekeepersBySource): PerfilResult {
  const pctByCategory = (
    rows: GatekeeperRow[],
    field: "genero" | "partido" | "estado"
  ): Record<string, number> => {
    const covered = rows.filter((r) => r.covered && r[field]);
    const total = covered.length;
    if (total === 0) return {};
    const counts: Record<string, number> = {};
    for (const r of covered) {
      const k = String(r[field]);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(counts)) {
      out[k] = (v / total) * 100;
    }
    return out;
  };

  const genero: Record<Source, Record<string, number>> = {} as any;
  const partido: Record<Source, Record<string, number>> = {} as any;
  const estado: Record<Source, Record<string, number>> = {} as any;

  for (const { key } of SOURCES) {
    genero[key] = pctByCategory(gks[key], "genero");
    partido[key] = pctByCategory(gks[key], "partido");
    estado[key] = pctByCategory(gks[key], "estado");
  }

  const topN = (
    dists: Record<Source, Record<string, number>>,
    n: number
  ): string[] => {
    const total: Record<string, number> = {};
    for (const src of Object.keys(dists) as Source[]) {
      for (const [k, v] of Object.entries(dists[src])) {
        total[k] = (total[k] ?? 0) + v;
      }
    }
    return Object.entries(total)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);
  };

  return {
    genero,
    partido,
    estado,
    topPartidos: topN(partido, 8),
    topEstados: topN(estado, 8),
  };
}

function PerfilDim({
  titulo,
  categorias,
  distribuicoes,
}: {
  titulo: string;
  categorias: { key: string; label: string }[];
  distribuicoes: Record<Source, Record<string, number>>;
}) {
  return (
    <div className="cmp-perfil__dim">
      <h4 className="cmp-perfil__dim-title">{titulo}</h4>
      <div className="cmp-valores__grid">
        {categorias.map((cat) => (
          <div key={cat.key} className="cmp-valores__group">
            <div className="cmp-valores__group-label">{cat.label}</div>
            <div className="cmp-valores__group-bars">
              {SOURCES.map((s) => {
                const pct = distribuicoes[s.key][cat.key] ?? 0;
                return (
                  <div key={s.key} className="cmp-valores__row">
                    <span className="cmp-valores__row-label">{s.label}</span>
                    <div className="cmp-valores__row-track">
                      <div
                        className="cmp-valores__row-fill"
                        style={{ width: `${pct}%`, background: s.color }}
                      />
                    </div>
                    <span className="cmp-valores__row-value">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValoresComparacao({ valores }: { valores: ValoresBySource }) {
  const percentByValorBySource = useMemo(() => {
    const out: Record<string, Record<Source, number | null>> = {};
    for (const { key: valor } of VALORES) {
      out[valor] = { humano: null, deepseek: null, gemini: null, openai: null };
      for (const { key: src } of SOURCES) {
        const m = valores[src];
        if (!m) continue;
        const total = Object.keys(m).length;
        if (total === 0) {
          out[valor][src] = null;
          continue;
        }
        const count = Object.values(m).filter((vs) => vs.includes(valor)).length;
        out[valor][src] = (count / total) * 100;
      }
    }
    return out;
  }, [valores]);

  const totalsBySource: Record<Source, number> = {
    humano: valores.humano ? Object.keys(valores.humano).length : 0,
    deepseek: valores.deepseek ? Object.keys(valores.deepseek).length : 0,
    gemini: valores.gemini ? Object.keys(valores.gemini).length : 0,
    openai: valores.openai ? Object.keys(valores.openai).length : 0,
  };

  return (
    <div className="cmp-valores">
      <div className="cmp-valores__legend">
        {SOURCES.map((s) => (
          <span key={s.key} className="cmp-valores__legend-item">
            <span
              className="cmp-valores__legend-dot"
              style={{ background: s.color }}
            />
            {s.label}{" "}
            <span className="muted">
              ({totalsBySource[s.key].toLocaleString("pt-BR")} matérias)
            </span>
          </span>
        ))}
      </div>

      <div className="cmp-valores__grid">
        {VALORES.map(({ key: valor, label }) => (
          <div key={valor} className="cmp-valores__group">
            <div className="cmp-valores__group-label">{label}</div>
            <div className="cmp-valores__group-bars">
              {SOURCES.map((s) => {
                const pct = percentByValorBySource[valor][s.key];
                return (
                  <div key={s.key} className="cmp-valores__row">
                    <span className="cmp-valores__row-label">{s.label}</span>
                    <div className="cmp-valores__row-track">
                      <div
                        className="cmp-valores__row-fill"
                        style={{
                          width: pct == null ? 0 : `${pct}%`,
                          background: s.color,
                        }}
                      />
                    </div>
                    <span className="cmp-valores__row-value">
                      {pct == null ? "—" : `${pct.toFixed(1)}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
