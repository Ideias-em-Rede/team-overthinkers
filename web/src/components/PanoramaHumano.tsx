import { useEffect, useMemo, useState } from "react";
import BrazilMapCount, { type UfCount } from "./BrazilMapCount";
import ColumnBar, { type ColumnBarDatum } from "./ColumnBar";
import GatekeepSankey from "./GatekeepSankey";
import PessoasBeeswarm from "./PessoasBeeswarm";
import "./PessoasBeeswarm.css";
import type {
  AchadoConvidados,
  AchadoDestaquePartido,
  AchadoPopulacaoUf,
  AchadoSelecao,
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
  opinioes: number;
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
    const opinioes = envolvidos.reduce(
      (a, e) => a + e.envolvidos.reduce((b, x) => b + x.quantidade_opinioes, 0),
      0
    );

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
      opinioes,
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
              value={agg.opinioes.toLocaleString("pt-BR")}
              label="opiniões atribuídas"
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

function StatCard({
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

/* ================== Gatekeeping (achados 1..4) ================== */

type Achado = "selecao" | "convidados" | "destaque" | "uf";

function GatekeepingAchados({ panorama }: { panorama: PanoramaFile }) {
  const [tab, setTab] = useState<Achado>("selecao");
  return (
    <div className="gka">
      <div className="gka__tabs">
        {(
          [
            ["selecao", "Palavras faladas × Citados"],
            ["convidados", "Convidados × Deputados"],
            ["destaque", "Destaque partidário"],
            ["uf", "Porte da UF"],
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
      {tab === "convidados" && (
        <AchadoConvidadosCard achado={panorama.achado_2_convidados_vs_deputados} />
      )}
      {tab === "destaque" && (
        <AchadoDestaqueCard achado={panorama.achado_3_destaque_partidario} />
      )}
      {tab === "uf" && (
        <AchadoUfCard achado={panorama.achado_4_populacao_uf} />
      )}
    </div>
  );
}

function AchadoCard({
  hipotese,
  chart,
  notes,
  footer,
}: {
  hipotese: string;
  chart: React.ReactNode;
  notes: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="gka__card">
      <div className="gka__h0">
        <span className="gka__h0-tag">Hipótese testada</span>
        <p>{hipotese}</p>
      </div>
      {chart}
      <div className="gka__notes">{notes}</div>
      <div className="gka__footer">{footer}</div>
    </div>
  );
}

function AchadoSelecaoCard({ achado }: { achado: AchadoSelecao }) {
  const max = Math.max(achado.mediana_palavras_cobertos, achado.mediana_palavras_nao_cobertos);
  const [ic0, ic1] = achado.ic95_taxa_cobertura;
  return (
    <AchadoCard
      hipotese={achado.hipotese_testada}
      chart={
        <div className="gka__chart">
          <div className="gka__chart-head">
            <span>Grupo</span>
            <span />
            <span>Mediana palavras</span>
          </div>
          <BarRow
            label="Citados na matéria"
            value={achado.mediana_palavras_cobertos}
            max={max}
          />
          <BarRow
            label="Não citados"
            value={achado.mediana_palavras_nao_cobertos}
            max={max}
          />
          <p className="gka__caption muted">
            Mediana de palavras faladas por participante.
          </p>
          <p className="gka__caption muted">
            Taxa de cobertura geral:{" "}
            <strong>{(achado.taxa_cobertura * 100).toFixed(1)}%</strong>{" "}
            (IC95% {(ic0 * 100).toFixed(1)}%–{(ic1 * 100).toFixed(1)}%). Em
            audiências com 2+ pessoas citadas, quem mais falou também foi quem
            mais apareceu na matéria em{" "}
            <strong>{achado.estatistica_descritiva_adicional.pct_coincidencia.toFixed(1)}%</strong>{" "}
            dos casos (
            {achado.estatistica_descritiva_adicional.coincidencia_top_falante_top_citado}
            /{achado.estatistica_descritiva_adicional.audiencias_com_2plus_cobertos}
            ).
          </p>
        </div>
      }
      notes={null}
      footer={
        <StatFooter
          items={[
            [achado.n_total.toLocaleString("pt-BR"), "N total"],
            [pValue(achado.p_valor), "p-valor"],
            [
              <DecisionPill sustained={achado.rejeita_h0_a_5pct} />,
              "no nível de 5%",
            ],
          ]}
        />
      }
    />
  );
}

function AchadoConvidadosCard({ achado }: { achado: AchadoConvidados }) {
  const max = Math.max(achado.media_opinioes_convidados, achado.media_opinioes_deputados);
  const [ic0, ic1] = achado.ols_ic95_is_convidado;
  return (
    <AchadoCard
      hipotese={achado.hipotese_testada}
      chart={
        <div className="gka__chart">
          <div className="gka__chart-head">
            <span>Grupo</span>
            <span />
            <span>Média opiniões</span>
          </div>
          <BarRow
            label="Convidados/especialistas"
            value={achado.media_opinioes_convidados}
            max={max}
            fmt={(v) => v.toFixed(2)}
          />
          <BarRow
            label="Deputados"
            value={achado.media_opinioes_deputados}
            max={max}
            fmt={(v) => v.toFixed(2)}
          />
          <p className="gka__caption muted">
            Média de opiniões atribuídas por pessoa citada na matéria.
          </p>
          <p className="gka__caption muted">
            Efeito controlado por volume de fala (OLS):{" "}
            <strong>
              +{achado.ols_coef_is_convidado.toFixed(2)} opiniões
            </strong>{" "}
            para convidados (IC95% {ic0.toFixed(2)}–{ic1.toFixed(2)}) — mesmo
            falando, em média, menos palavras (
            {Math.round(achado.media_palavras_convidados).toLocaleString("pt-BR")}{" "}
            vs. {Math.round(achado.media_palavras_deputados).toLocaleString("pt-BR")}
            ).
          </p>
        </div>
      }
      notes={null}
      footer={
        <StatFooter
          items={[
            [
              `${achado.n_deputados_cobertos} / ${achado.n_convidados_cobertos}`,
              "N (dep. / convid.)",
            ],
            [pValue(achado.p_valor), "p-valor (OLS)"],
            [
              <DecisionPill sustained={achado.rejeita_h0_a_5pct} />,
              "no nível de 5%",
            ],
          ]}
        />
      }
    />
  );
}

function AchadoDestaqueCard({ achado }: { achado: AchadoDestaquePartido }) {
  const rows = Object.entries(achado.tabela_destaque_por_partido)
    .map(([partido, v]) => ({ partido, ...v }))
    .sort((a, b) => b.pct - a.pct);
  const max = Math.max(...rows.map((r) => r.pct));
  const [ic0, ic1] = achado.ic95_odds_ratio_pl;
  const marginalSig = achado.rejeita_h0_global_a_5pct && achado.p_valor_global > 0.001;
  return (
    <AchadoCard
      hipotese={achado.hipotese_testada_global}
      chart={
        <div className="gka__chart">
          <div className="gka__chart-head">
            <span>Partido</span>
            <span />
            <span>% destaque</span>
          </div>
          {rows.map((r) => (
            <BarRow
              key={r.partido}
              label={r.partido}
              value={r.pct}
              max={max}
              fmt={(v) => `${v.toFixed(1)}%`}
              warn={r.partido === "PL"}
            />
          ))}
          <p className="gka__caption muted">
            % de citações que aparecem em título, subtítulo ou início da
            matéria, por partido.
          </p>
          <p className="gka__caption muted">
            PL isolado vs. restante:{" "}
            <strong>{achado.pl_pct_destaque.toFixed(1)}%</strong> vs.{" "}
            <strong>{achado.resto_pct_destaque.toFixed(1)}%</strong> (odds ratio
            = {achado.odds_ratio_pl.toFixed(2)}; IC95%{" "}
            {ic0.toFixed(2)}–{ic1.toFixed(2)}; p ={" "}
            {achado.p_valor_pl_vs_resto.toFixed(3)}).
          </p>
          <p className="gka__caption gka__caveat">
            <strong>Ressalva:</strong> o contraste PL vs. resto foi escolhido
            após observar os dados, sem correção para múltiplas comparações. As
            células envolvidas são pequenas (3 casos de destaque no PL). Tratar
            como hipótese a investigar.
          </p>
        </div>
      }
      notes={null}
      footer={
        <StatFooter
          items={[
            [
              `${achado.partidos_analisados_n15plus.length} partidos`,
              "N ≥ 15 citações",
            ],
            [`p = ${achado.p_valor_global.toFixed(4)}`, "p-valor (global)"],
            [
              <DecisionPill
                sustained={achado.rejeita_h0_global_a_5pct}
                caution={marginalSig}
                cautionLabel="Não é significativo o suficiente para afirmar"
              />,
              "",
            ],
          ]}
        />
      }
    />
  );
}

function AchadoUfCard({ achado }: { achado: AchadoPopulacaoUf }) {
  const rows = Object.entries(achado.tabela_cobertura_por_uf)
    .map(([uf, v]) => ({ uf, ...v }))
    .sort((a, b) => b.pct_cobertura - a.pct_cobertura);
  const max = Math.max(...rows.map((r) => r.pct_cobertura));
  const isCaution = achado.classificacao === "nao_significativo_o_suficiente_para_afirmar";
  const extremes = new Set(["MA", "AP", "RR"]);
  return (
    <AchadoCard
      hipotese={achado.hipotese_testada}
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
              label={r.uf}
              value={r.pct_cobertura}
              max={max}
              fmt={(v) => `${v.toFixed(1)}%`}
              warn={extremes.has(r.uf)}
            />
          ))}
          <p className="gka__caption muted">
            % de cobertura por UF, da maior para a menor.
          </p>
          <p className="gka__caption gka__caveat">
            <strong>Ressalva:</strong> {achado.observacao}
          </p>
        </div>
      }
      notes={null}
      footer={
        <StatFooter
          items={[
            [
              `${achado.n_deputados_com_uf} / ${achado.n_ufs_analisadas} UFs`,
              "N deputados / UFs",
            ],
            [`p = ${achado.p_valor.toFixed(3)}`, "p-valor"],
            [
              <DecisionPill
                sustained={achado.rejeita_h0_a_5pct}
                caution={isCaution}
                cautionLabel="Não é significativo o suficiente para afirmar"
              />,
              "",
            ],
          ]}
        />
      }
    />
  );
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
