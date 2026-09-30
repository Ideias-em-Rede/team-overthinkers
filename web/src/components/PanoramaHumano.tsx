import { useEffect, useMemo, useState } from "react";
import BrazilMapCount, { type UfCount } from "./BrazilMapCount";
import ColumnBar, { type ColumnBarDatum } from "./ColumnBar";
import GatekeepSankey from "./GatekeepSankey";
import PessoasBeeswarm from "./PessoasBeeswarm";
import "./PessoasBeeswarm.css";
import type {
  AchadoPopulacaoUf,
  AchadoSelecao,
  AchadoSilenciamentoMulheres,
  AchadoViesPartidario,
  GatekeeperRow,
  MateriaEnvolvidosEntry,
  MateriaIndex,
  PanoramaFile,
  TemasMap,
  ValoresPorMateriaMap,
} from "../types";
import "./PanoramaHumano.css";

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
  PSOL: "#7d3c98",
};

const TEMA_COLOR = "#0077b6";
const NAVY = "#003366";
const ROSE = "#c94f7c";

function toTs(d: string): number {
  if (!d) return 0;
  const [dd, mm, yyyy] = d.split("/");
  return new Date(`${yyyy}-${mm}-${dd}`).getTime() || 0;
}

function formatDataRange(dates: string[]): { primeira: string; ultima: string } {
  const sorted = dates
    .filter(Boolean)
    .map((d) => ({ raw: d, ts: toTs(d) }))
    .sort((a, b) => a.ts - b.ts);
  return {
    primeira: sorted[0]?.raw ?? "",
    ultima: sorted[sorted.length - 1]?.raw ?? "",
  };
}

interface PerfilDist {
  homens: number;
  mulheres: number;
  partidoData: ColumnBarDatum[];
  ufData: UfCount[];
}

interface Aggregates {
  totalMaterias: number;
  primeira: string;
  ultima: string;
  temasDistintos: number;
  participantes: number;
  palavras: number;
  pctMulheres: number;
  mencionados: number;
  mulheresCitadas: number;
  pctMulheresCitadas: number;
  taxaCobertura: number;
  temaData: ColumnBarDatum[];
  audiencia: PerfilDist;
  materia: PerfilDist;
  destaqueBreakdown: ColumnBarDatum[];
  gatekeepersAll: GatekeeperRow[];
}

function computePerfil(rows: GatekeeperRow[]): PerfilDist {
  const homens = rows.filter((r) => r.genero === "masculino").length;
  const mulheres = rows.filter((r) => r.genero === "feminino").length;

  const partidoCounts = new Map<string, number>();
  for (const g of rows) {
    const p = g.partido ?? "N/D";
    partidoCounts.set(p, (partidoCounts.get(p) ?? 0) + 1);
  }
  const partidoData: ColumnBarDatum[] = Array.from(partidoCounts.entries())
    .map(([k, v]) => ({ k, v, color: PARTY_COLORS[k] ?? "#94a3b8" }))
    .sort((a, b) => b.v - a.v);

  const ufCounts = new Map<
    string,
    { count: number; falas: number; palavras: number }
  >();
  for (const g of rows) {
    if (!g.estado) continue;
    const cur = ufCounts.get(g.estado) ?? { count: 0, falas: 0, palavras: 0 };
    cur.count += 1;
    cur.falas += g.quantidade_falas;
    cur.palavras += g.quantidade_palavras;
    ufCounts.set(g.estado, cur);
  }
  const ufData: UfCount[] = Array.from(ufCounts.entries()).map(([uf, v]) => ({
    uf,
    count: v.count,
    extra: { falas: v.falas, palavras: v.palavras.toLocaleString("pt-BR") },
  }));

  return { homens, mulheres, partidoData, ufData };
}

export default function PanoramaHumano({
  section,
}: {
  section: "transcricao" | "humanos";
}) {
  const [index, setIndex] = useState<MateriaIndex[] | null>(null);
  const [temas, setTemas] = useState<TemasMap | null>(null);
  const [gatekeepers, setGatekeepers] = useState<GatekeeperRow[] | null>(null);
  const [envolvidos, setEnvolvidos] = useState<MateriaEnvolvidosEntry[] | null>(null);
  const [panorama, setPanorama] = useState<PanoramaFile | null>(null);
  const [valoresPorMateria, setValoresPorMateria] = useState<ValoresPorMateriaMap | null>(null);

  useEffect(() => {
    fetch("/data/index.json").then((r) => r.json()).then(setIndex);
    fetch("/data/humano/transcricoes/temas/temas_audiencias.json")
      .then((r) => r.json()).then(setTemas);
    fetch("/data/humano/gatekeepers/gatekeepers.json")
      .then((r) => r.json()).then(setGatekeepers);
    fetch("/data/humano/materias/participantes/participantes.json")
      .then((r) => r.json()).then(setEnvolvidos);
    fetch("/data/humano/panorama/panorama.json")
      .then((r) => r.json()).then(setPanorama);
    fetch("/data/humano/materias/valores_noticia_all.json")
      .then((r) => r.json()).then(setValoresPorMateria);
  }, []);

  const agg: Aggregates | null = useMemo(() => {
    if (!index || !temas || !gatekeepers || !envolvidos) return null;

    const { primeira, ultima } = formatDataRange(index.map((m) => m.data));
    const total = gatekeepers.length;

    const temaCounts = new Map<string, number>();
    for (const t of Object.values(temas)) {
      temaCounts.set(t.tema, (temaCounts.get(t.tema) ?? 0) + 1);
    }
    const temaData: ColumnBarDatum[] = Array.from(temaCounts.entries())
      .map(([k, v]) => ({ k: shortenTema(k), v, color: TEMA_COLOR }))
      .sort((a, b) => b.v - a.v);

    const audiencia = computePerfil(gatekeepers);
    const cobertosRows = gatekeepers.filter((g) => g.covered);
    const materia = computePerfil(cobertosRows);

    const mencionados = envolvidos.reduce((a, e) => a + e.envolvidos.length, 0);
    const mulheresCitadas = cobertosRows.filter(
      (g) => g.genero === "feminino"
    ).length;

    const posCounts = new Map<string, number>();
    for (const g of cobertosRows) {
      const p = g.posicao_no_texto ?? "N/D";
      posCounts.set(p, (posCounts.get(p) ?? 0) + 1);
    }
    const posOrder = ["titulo", "subtitulo", "inicio", "corpo", "N/D"];
    const destaqueBreakdown: ColumnBarDatum[] = posOrder
      .filter((k) => posCounts.has(k))
      .map((k) => ({
        k: labelPos(k),
        v: posCounts.get(k)!,
        color: k === "titulo" || k === "subtitulo" || k === "inicio" ? "#003366" : "#0077b6",
      }));

    return {
      totalMaterias: index.length,
      primeira,
      ultima,
      temasDistintos: temaCounts.size,
      participantes: total,
      palavras: gatekeepers.reduce((a, g) => a + g.quantidade_palavras, 0),
      pctMulheres: total > 0 ? (audiencia.mulheres / total) * 100 : 0,
      mencionados,
      mulheresCitadas,
      pctMulheresCitadas:
        cobertosRows.length > 0
          ? (mulheresCitadas / cobertosRows.length) * 100
          : 0,
      taxaCobertura: total > 0 ? (cobertosRows.length / total) * 100 : 0,
      temaData,
      audiencia,
      materia,
      destaqueBreakdown,
      gatekeepersAll: gatekeepers,
    };
  }, [index, temas, gatekeepers, envolvidos]);

  if (!agg) return <div className="loading">Carregando panorama…</div>;

  return (
    <div className="ph">
      {section === "transcricao" && (
        <>
          <div className="ph__cards">
            <StatCard value={agg.totalMaterias} label="audiências" />
            <StatCard
              value={`${agg.primeira} → ${agg.ultima}`}
              label="período coberto"
              small
            />
            <StatCard value={agg.temasDistintos} label="temas distintos" />
            <StatCard
              value={agg.participantes.toLocaleString("pt-BR")}
              label="participantes na audiência"
            />
            <StatCard
              value={agg.palavras.toLocaleString("pt-BR")}
              label="palavras faladas"
            />
            <StatCard
              value={`${agg.audiencia.homens.toLocaleString("pt-BR")} H · ${agg.audiencia.mulheres.toLocaleString("pt-BR")} M`}
              label={`mulheres · ${agg.pctMulheres.toFixed(1)}% da audiência`}
              small
            />
          </div>

          <section className="ph__section">
            <h3 className="ph__section-title">Perfil da audiência (transcrição)</h3>
            <p className="ph__section-sub muted">
              Quem esteve presente nas 206 audiências públicas (regex sobre a
              transcrição).
            </p>
            <div className="dist-stack">
              <ColumnBar
                titulo="Por tema"
                subtitle={`${agg.totalMaterias} audiências · ${agg.temasDistintos} temas`}
                data={agg.temaData}
                valueLabel="audiências"
                height={260}
              />
              <PerfilTriplo perfil={agg.audiencia} total={agg.participantes} label="participantes" />
            </div>
          </section>
        </>
      )}

      {section === "humanos" && (
        <>
          <div className="ph__cards">
            <StatCard value={agg.totalMaterias} label="matérias" />
            <StatCard
              value={agg.mencionados.toLocaleString("pt-BR")}
              label="mencionados na matéria"
            />
            <StatCard
              value={`${agg.mulheresCitadas.toLocaleString("pt-BR")} (${agg.pctMulheresCitadas.toFixed(1)}%)`}
              label="mulheres citadas na matéria"
              small
            />
            <StatCard
              value={`${agg.taxaCobertura.toFixed(1)}%`}
              label="taxa média de cobertura"
            />
          </div>

          <section className="ph__section">
            <h3 className="ph__section-title">Quem falou e quem foi citado</h3>
            <p className="ph__section-sub muted">
              Cada bolha é uma pessoa distinta que participou de alguma
              audiência. Posição no eixo x = total de palavras faladas; tamanho
              = menções nas matérias; cor indica se foi citada. Passe o mouse
              para ver partido, gênero e estado.
            </p>
            <div className="dist">
              <PessoasBeeswarm rows={agg.gatekeepersAll} />
            </div>
          </section>

          <section className="ph__section">
            <h3 className="ph__section-title">Fluxo agregado audiência → matéria</h3>
            <p className="ph__section-sub muted">
              Volume que atravessa o filtro editorial nas 206 audiências.
              Alterne entre partido, gênero, estado ou valor-notícia.
            </p>
            <div className="dist">
              <GatekeepSankey
                rows={agg.gatekeepersAll}
                modes={["partido", "genero", "estado", "valor"]}
                valoresPorMateria={valoresPorMateria ?? undefined}
                compact
              />
            </div>
          </section>

          {panorama && (
            <section className="ph__section">
              <h3 className="ph__section-title">Gatekeeping · testes de hipótese</h3>
              <p className="ph__section-sub muted">
                Cruzamento entre quem fala nas audiências e quem é citado nas
                matérias.
              </p>
              <GatekeepingAchados panorama={panorama} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PerfilTriplo({
  perfil,
  total,
  label,
}: {
  perfil: PerfilDist;
  total: number;
  label: string;
}) {
  return (
    <div className="dist-stack">
      <div className="dist-row">
        <ColumnBar
          titulo="Por gênero"
          subtitle={`${total.toLocaleString("pt-BR")} ${label}`}
          data={[
            { k: "Homens", v: perfil.homens, color: NAVY },
            { k: "Mulheres", v: perfil.mulheres, color: ROSE },
          ]}
        />
        <ColumnBar
          titulo="Por partido"
          subtitle={`${perfil.partidoData.length} categorias`}
          data={perfil.partidoData}
        />
      </div>
      <div className="dist">
        <div className="dist__head">
          <h3 className="dist__title">Por estado</h3>
          <span className="muted">
            {perfil.ufData.length} UFs representadas
          </span>
        </div>
        <BrazilMapCount data={perfil.ufData} color="#003366" label={label} />
      </div>
    </div>
  );
}

export function StatCard({
  value,
  label,
  small,
}: {
  value: string | number;
  label: string;
  small?: boolean;
}) {
  return (
    <div className="stat">
      <span className={`stat__value ${small ? "stat__value--sm" : ""}`}>
        {value}
      </span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

/* ================== Gatekeeping (achados 1..4 v2) ================== */

type Achado = "selecao" | "mulheres" | "partido" | "uf";

export function GatekeepingAchados({ panorama }: { panorama: PanoramaFile }) {
  const [tab, setTab] = useState<Achado>("selecao");
  return (
    <div className="gka">
      <div className="gka__tabs">
        {(
          [
            ["selecao", "H1 · Filtro de fala"],
            ["mulheres", "H2 · Silenciamento de mulheres"],
            ["partido", "H3 · Viés partidário"],
            ["uf", "H4 · População da UF"],
          ] as [Achado, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            className={`gka__tab ${tab === k ? "on" : ""}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "selecao" && (
        <AchadoSelecaoCard achado={panorama.achado_1_filtro_de_selecao} />
      )}
      {tab === "mulheres" && (
        <AchadoMulheresCard achado={panorama.achado_2_silenciamento_mulheres} />
      )}
      {tab === "partido" && (
        <AchadoPartidoCard achado={panorama.achado_3_vies_partidario} />
      )}
      {tab === "uf" && (
        <AchadoUfCard achado={panorama.achado_4_populacao_uf} />
      )}
    </div>
  );
}

function AchadoCard({
  h0,
  h1,
  veredito,
  chart,
  footer,
}: {
  h0: string;
  h1: string;
  veredito: React.ReactNode;
  chart: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="gka__card">
      <div className="gka__hipoteses">
        <div className="gka__hip gka__hip--h0">
          <span className="gka__hip-tag">H0 · hipótese nula</span>
          <p>{h0}</p>
        </div>
        <div className="gka__hip gka__hip--h1">
          <span className="gka__hip-tag">H1 · hipótese alternativa</span>
          <p>{h1}</p>
        </div>
      </div>
      <div className="gka__veredito">{veredito}</div>
      {chart}
      <div className="gka__footer">{footer}</div>
    </div>
  );
}

type VereditoKind = "sustained" | "not_sustained" | "sustained_caution";

function Veredito({
  kind,
  motivo,
}: {
  kind: VereditoKind;
  motivo: React.ReactNode;
}) {
  const label =
    kind === "sustained"
      ? "H1 sustentada · H0 rejeitada"
      : kind === "sustained_caution"
        ? "H1 sustentada com ressalva"
        : "H1 não sustentada · H0 não rejeitada";
  const cls =
    kind === "sustained"
      ? "gka__veredito-pill gka__veredito-pill--yes"
      : kind === "sustained_caution"
        ? "gka__veredito-pill gka__veredito-pill--caution"
        : "gka__veredito-pill gka__veredito-pill--no";
  return (
    <>
      <div className="gka__veredito-head">
        <span className="gka__veredito-tag">Veredito</span>
        <span className={cls}>{label}</span>
      </div>
      <p className="gka__veredito-motivo">{motivo}</p>
    </>
  );
}

/* ---------------- Achado 1: filtro de fala ---------------- */

function AchadoSelecaoCard({ achado }: { achado: AchadoSelecao }) {
  const max = Math.max(
    achado.mediana_palavras_cobertos,
    achado.mediana_palavras_nao_cobertos
  );
  const [ic0, ic1] = achado.ic95_taxa_cobertura;
  const isSustained = sustentada(
    (achado as any).hipotese_sustentada_a_5pct,
    (achado as any).rejeita_h0_a_5pct,
    achado.p_valor
  );
  const razao = achado.mediana_palavras_cobertos / Math.max(1, achado.mediana_palavras_nao_cobertos);

  return (
    <AchadoCard
      h0="A distribuição de palavras faladas na audiência é a mesma entre participantes citados e não citados na matéria."
      h1="Participantes citados na matéria falam significativamente mais palavras do que os não citados."
      veredito={
        <Veredito
          kind={isSustained ? "sustained" : "not_sustained"}
          motivo={
            isSustained ? (
              <>
                Mediana de palavras dos citados ({achado.mediana_palavras_cobertos.toLocaleString("pt-BR")}) é{" "}
                <strong>{razao.toFixed(1)}× a dos não citados</strong> ({achado.mediana_palavras_nao_cobertos.toLocaleString("pt-BR")}).
                O teste Mann-Whitney U unilateral (citados &gt; não citados) retornou {pValue(achado.p_valor)},
                rejeitando H0 a 5% (na verdade a 0,0001%).
              </>
            ) : (
              <>
                O teste Mann-Whitney U unilateral retornou {pValue(achado.p_valor)}, que não é
                suficiente para rejeitar H0 a 5%. A distribuição de palavras faladas não difere
                significativamente entre citados e não citados.
              </>
            )
          }
        />
      }
      chart={
        <div className="gka__chart">
          <div className="gka__chart-head">
            <span>Grupo</span>
            <span />
            <span>Mediana palavras</span>
          </div>
          <BarRow label="Citados na matéria" value={achado.mediana_palavras_cobertos} max={max} />
          <BarRow label="Não citados" value={achado.mediana_palavras_nao_cobertos} max={max} />
          <p className="gka__caption muted">
            Mediana de palavras faladas por participante.
          </p>
          <p className="gka__caption muted">
            Taxa de cobertura geral:{" "}
            <strong>{(achado.taxa_cobertura * 100).toFixed(1)}%</strong>{" "}
            (IC95% {(ic0 * 100).toFixed(1)}%–{(ic1 * 100).toFixed(1)}%). Em audiências com 2+
            pessoas citadas, quem mais falou também foi quem mais apareceu na matéria em{" "}
            <strong>{achado.estatistica_descritiva_adicional.pct_coincidencia.toFixed(1)}%</strong>{" "}
            dos casos ({achado.estatistica_descritiva_adicional.coincidencia_top_falante_top_citado}
            /{achado.estatistica_descritiva_adicional.audiencias_com_2plus_cobertos}) — sinal
            de que o filtro <em>não</em> é redutível ao volume de fala.
          </p>
        </div>
      }
      footer={
        <StatFooter
          items={[
            [achado.n_total.toLocaleString("pt-BR"), "N total"],
            [pValue(achado.p_valor), "p-valor (Mann-Whitney U)"],
            [
              <DecisionPill sustained={isSustained} />,
              "no nível de 5%",
            ],
          ]}
        />
      }
    />
  );
}

/* ---------------- Achado 2: silenciamento de mulheres ---------------- */

function AchadoMulheresCard({ achado }: { achado: AchadoSilenciamentoMulheres }) {
  const taxaH = achado.taxa_cobertura_homens * 100;
  const taxaM = achado.taxa_cobertura_mulheres * 100;
  const or = achado.odds_ratio_is_mulher;
  const [icOr0, icOr1] = achado.ic95_odds_ratio_is_mulher;
  const isSustained = sustentada(
    (achado as any).hipotese_sustentada_a_5pct,
    undefined,
    undefined
  );
  const p = achado.p_valor;
  const coefNeg = achado.coef_is_mulher < 0;
  const kind: VereditoKind = isSustained ? "sustained" : "not_sustained";

  return (
    <AchadoCard
      h0="Homens e mulheres têm a mesma probabilidade de serem citados na matéria, controlando pelo volume de fala."
      h1="Mulheres têm menor probabilidade de serem citadas do que homens, mesmo controlando pelo volume de fala."
      veredito={
        <Veredito
          kind={kind}
          motivo={
            isSustained ? (
              <>
                Regressão logística <code>covered ~ is_mulher + log_palavras</code> retornou{" "}
                <strong>OR = {or.toFixed(2)}</strong> (IC95% {icOr0.toFixed(2)}–{icOr1.toFixed(2)},{" "}
                {pValue(p)}). Ser mulher{" "}
                {or < 1 ? "reduz" : "aumenta"} a chance de citação em{" "}
                <strong>{Math.abs((1 - or) * 100).toFixed(1)}%</strong> em relação a homens, controlando pelo
                volume de fala. A direção {coefNeg ? "negativa" : "positiva"} do coeficiente confirma H1.
              </>
            ) : p < 0.05 && !coefNeg ? (
              <>
                Há diferença estatisticamente significativa ({pValue(p)}, OR = {or.toFixed(2)}), mas na direção{" "}
                <strong>oposta</strong> à hipótese: mulheres tenderam a ter <em>maior</em> chance de citação,
                controlando por fala. H1 (silenciamento) não sustentada.
              </>
            ) : (
              <>
                Regressão logística retornou {pValue(p)} para o coeficiente de <code>is_mulher</code> —
                não há evidência de diferença significativa entre gêneros na chance de citação, controlando
                pelo volume de fala. H0 não rejeitada.
              </>
            )
          }
        />
      }
      chart={
        <div className="gka__chart">
          <div className="gka__chart-head">
            <span>Gênero</span>
            <span />
            <span>% cobertura bruta</span>
          </div>
          <BarRow label="Homens" value={taxaH} max={Math.max(taxaH, taxaM)} fmt={(v) => `${v.toFixed(1)}%`} />
          <BarRow label="Mulheres" value={taxaM} max={Math.max(taxaH, taxaM)} fmt={(v) => `${v.toFixed(1)}%`} warn={taxaM < taxaH} />
          <p className="gka__caption muted">
            Taxa de cobertura bruta por gênero (sem controlar por fala). N: {achado.n_homens.toLocaleString("pt-BR")} homens · {achado.n_mulheres.toLocaleString("pt-BR")} mulheres.
            Chi² 2×2 bruto: {pValueLoose(achado.p_valor_chi2_bruto)}.
          </p>
          <p className="gka__caption muted">
            <strong>Com controle por fala</strong> (regressão logística):
            OR = {or.toFixed(2)} · IC95% {icOr0.toFixed(2)}–{icOr1.toFixed(2)} · {pValue(p)}.
          </p>
        </div>
      }
      footer={
        <StatFooter
          items={[
            [achado.n_total.toLocaleString("pt-BR"), "N total"],
            [pValue(p), "p-valor (logística)"],
            [<DecisionPill sustained={isSustained} />, "no nível de 5%"],
          ]}
        />
      }
    />
  );
}

/* ---------------- Achado 3: viés partidário ---------------- */

function AchadoPartidoCard({ achado }: { achado: AchadoViesPartidario }) {
  const rows = Object.entries(achado.tabela_cobertura_por_partido)
    .map(([partido, v]) => ({ partido, ...v, pct: v.taxa_cobertura * 100 }))
    .sort((a, b) => b.pct - a.pct);
  const max = Math.max(...rows.map((r) => r.pct));
  const isSustained = sustentada(
    (achado as any).hipotese_sustentada_a_5pct,
    undefined,
    undefined
  );
  const top = achado.post_hoc.partido_maior_cobertura;
  const bot = achado.post_hoc.partido_menor_cobertura;

  return (
    <AchadoCard
      h0="A probabilidade de um deputado ser citado na matéria é independente do partido."
      h1="A probabilidade de um deputado ser citado depende do partido."
      veredito={
        <Veredito
          kind={isSustained ? "sustained" : "not_sustained"}
          motivo={
            isSustained ? (
              <>
                Qui-quadrado de independência (χ² = {achado.chi2.toFixed(2)}, dof = {achado.dof},{" "}
                {pValue(achado.p_valor)}) rejeita a independência entre partido e cobertura.
                Post-hoc: <strong>{top.partido}</strong> tem a maior taxa de cobertura ({(top.taxa * 100).toFixed(1)}% · N={top.n})
                e <strong>{bot.partido}</strong> a menor ({(bot.taxa * 100).toFixed(1)}% · N={bot.n}) entre os partidos analisados.
              </>
            ) : (
              <>
                Qui-quadrado (χ² = {achado.chi2.toFixed(2)}, dof = {achado.dof}, {pValue(achado.p_valor)})
                não rejeita a independência. A chance de citação é estatisticamente compatível com ser
                independente do partido.
              </>
            )
          }
        />
      }
      chart={
        <div className="gka__chart">
          <div className="gka__chart-head">
            <span>Partido</span>
            <span />
            <span>% cobertura</span>
          </div>
          {rows.map((r) => (
            <BarRow
              key={r.partido}
              label={`${r.partido} (N=${r.n})`}
              value={r.pct}
              max={max}
              fmt={(v) => `${v.toFixed(1)}%`}
              warn={r.partido === top.partido || r.partido === bot.partido}
            />
          ))}
          <p className="gka__caption muted">
            Taxa de cobertura por partido, entre os {achado.partidos_analisados_n15plus.length} partidos
            com N ≥ 15 registros na base.
          </p>
          <p className="gka__caption muted">
            <strong>Post-hoc:</strong> {achado.post_hoc.descricao}
          </p>
        </div>
      }
      footer={
        <StatFooter
          items={[
            [`${achado.n_deputados.toLocaleString("pt-BR")}`, "N deputados"],
            [pValue(achado.p_valor), "p-valor (χ²)"],
            [<DecisionPill sustained={isSustained} />, "no nível de 5%"],
          ]}
        />
      }
    />
  );
}

/* ---------------- Achado 4: população da UF ---------------- */

function AchadoUfCard({ achado }: { achado: AchadoPopulacaoUf }) {
  const rows = Object.entries(achado.tabela_cobertura_por_uf)
    .map(([uf, v]) => ({ uf, ...v }))
    .sort((a, b) => b.pct_cobertura - a.pct_cobertura);
  const max = Math.max(...rows.map((r) => r.pct_cobertura));
  const isCaution =
    achado.classificacao === "nao_significativo_o_suficiente_para_afirmar";
  const isSustained = sustentada(
    (achado as any).hipotese_sustentada_a_5pct,
    (achado as any).rejeita_h0_a_5pct,
    achado.p_valor
  );
  const or = achado.odds_ratio_log_populacao_uf;
  const [icOr0, icOr1] = achado.ic95_odds_ratio;
  const coefPos = achado.coef_log_populacao_uf > 0;
  const kind: VereditoKind = !isSustained
    ? "not_sustained"
    : isCaution
      ? "sustained_caution"
      : "sustained";
  const extremes = new Set([
    rows[0]?.uf,
    rows[rows.length - 1]?.uf,
  ]);

  return (
    <AchadoCard
      h0="A probabilidade de um deputado ser citado é independente da população da UF, controlando pelo volume de fala."
      h1="Deputados de UFs mais populosas têm maior probabilidade de serem citados, mesmo controlando pelo volume de fala."
      veredito={
        <Veredito
          kind={kind}
          motivo={
            kind === "sustained_caution" ? (
              <>
                Regressão logística <code>covered ~ log_populacao_uf + log_palavras</code> retornou{" "}
                <strong>OR = {or.toFixed(2)}</strong> (IC95% {icOr0.toFixed(2)}–{icOr1.toFixed(2)},{" "}
                {pValue(achado.p_valor)}). Estatisticamente H0 rejeitada, mas as UFs extremas na tabela
                têm N pequeno — o efeito pode depender de poucos casos.{" "}
                <em>{achado.observacao}</em>
              </>
            ) : isSustained ? (
              <>
                Regressão logística retornou OR = {or.toFixed(2)} (IC95% {icOr0.toFixed(2)}–{icOr1.toFixed(2)},{" "}
                {pValue(achado.p_valor)}). Cada aumento em log(população) {coefPos ? "aumenta" : "reduz"} a
                chance de citação, controlando por fala. H1 sustentada.
              </>
            ) : (
              <>
                Regressão logística retornou {pValue(achado.p_valor)} para o coeficiente de{" "}
                <code>log_populacao_uf</code>. Sem evidência de que a população da UF prediz cobertura
                controlando por fala. H0 não rejeitada.
              </>
            )
          }
        />
      }
      chart={
        <div className="gka__chart">
          <div className="gka__chart-head">
            <span>UF</span>
            <span />
            <span>% cobertura</span>
          </div>
          {rows.map((r) => (
            <BarRow
              key={r.uf}
              label={`${r.uf} (N=${r.n})`}
              value={r.pct_cobertura}
              max={max}
              fmt={(v) => `${v.toFixed(1)}%`}
              warn={extremes.has(r.uf)}
            />
          ))}
          <p className="gka__caption muted">
            % de cobertura por UF, ordenada da maior para a menor.
          </p>
          {achado.observacao && (
            <p className="gka__caption gka__caveat">
              <strong>Ressalva:</strong> {achado.observacao}
            </p>
          )}
        </div>
      }
      footer={
        <StatFooter
          items={[
            [
              `${achado.n_deputados_com_uf} / ${achado.n_ufs_analisadas} UFs`,
              "N deputados / UFs",
            ],
            [pValue(achado.p_valor), "p-valor (logística)"],
            [
              <DecisionPill
                sustained={isSustained}
                caution={isCaution}
                cautionLabel="Sustentada com ressalva"
              />,
              "no nível de 5%",
            ],
          ]}
        />
      }
    />
  );
}

function pValueLoose(p: number): string {
  return pValue(p);
}

function BarRow({
  label,
  value,
  max,
  fmt,
  warn,
}: {
  label: string;
  value: number;
  max: number;
  fmt?: (v: number) => string;
  warn?: boolean;
}) {
  const pct = max ? (value / max) * 100 : 0;
  const formatted = fmt ? fmt(value) : value.toLocaleString("pt-BR");
  return (
    <div className="gka__row">
      <div className="gka__row-label">{label}</div>
      <div className="gka__row-track">
        <div
          className={`gka__row-fill ${warn ? "warn" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="gka__row-value">{formatted}</div>
    </div>
  );
}

function StatFooter({
  items,
}: {
  items: [React.ReactNode, string][];
}) {
  return (
    <div className="gka__stats">
      {items.map(([value, label], i) => (
        <div key={i} className="gka__stat">
          <div className="gka__stat-value">{value}</div>
          {label && <div className="gka__stat-label">{label}</div>}
        </div>
      ))}
    </div>
  );
}

function DecisionPill({
  sustained,
  caution,
  cautionLabel,
}: {
  sustained: boolean;
  caution?: boolean;
  cautionLabel?: string;
}) {
  if (caution) {
    return (
      <span className="gka__pill caution">
        {cautionLabel ?? "Cautela"}
      </span>
    );
  }
  return (
    <span className={`gka__pill ${sustained ? "reject" : "keep"}`}>
      {sustained ? "Hipótese sustentada" : "Hipótese não sustentada"}
    </span>
  );
}

function sustentada(
  ...vals: (boolean | number | null | undefined)[]
): boolean {
  for (const v of vals) {
    if (typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v < 0.05;
  }
  return false;
}

function pValue(p: number): string {
  if (p < 0.0001) return "p < 0,0001";
  if (p < 0.001) return "p < 0,001";
  return `p = ${p.toFixed(3)}`;
}

function labelPos(k: string): string {
  const m: Record<string, string> = {
    titulo: "Título",
    subtitulo: "Subtítulo",
    inicio: "Início",
    corpo: "Corpo",
    "N/D": "N/D",
  };
  return m[k] ?? k;
}

function shortenTema(t: string): string {
  return t
    .replace(/^Direitos humanos, inclusão e diversidade$/, "Dir. humanos")
    .replace(/^Energia, infraestrutura e transportes$/, "Energia/infra")
    .replace(/^Segurança pública, justiça e sistema prisional$/, "Segurança")
    .replace(/^Trabalho, emprego e previdência$/, "Trabalho")
    .replace(/^Tecnologia, comunicação e mídia$/, "Tecnologia")
    .replace(/^Meio ambiente, clima e desastres$/, "Meio ambiente")
    .replace(/^Gênero, mulheres e relações familiares$/, "Gênero")
    .replace(/^Relações internacionais e migração$/, "Rel. internac.")
    .replace(/^Agricultura, produção rural e território$/, "Agricultura")
    .replace(/^Educação, ciência e pesquisa$/, "Educação")
    .replace(/^Cultura, esporte e turismo$/, "Cultura")
    .replace(/^Saúde e saúde pública$/, "Saúde")
    .replace(/^Política e instituições$/, "Política");
}
