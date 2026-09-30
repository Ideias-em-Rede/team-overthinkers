import { useEffect, useMemo, useState } from "react";
import GatekeepSankey from "./GatekeepSankey";
import { GatekeepingAchados, StatCard } from "./PanoramaHumano";
import PessoasBeeswarm from "./PessoasBeeswarm";
import "./PessoasBeeswarm.css";
import type {
  GatekeeperRow,
  MateriaEnvolvidosEntry,
  PanoramaFile,
  ValoresPorMateriaMap,
} from "../types";

type Provider = "deepseek" | "gemini" | "openai";

const PROVIDERS: { key: Provider; label: string }[] = [
  { key: "deepseek", label: "DeepSeek" },
  { key: "gemini", label: "Gemini" },
  { key: "openai", label: "OpenAI" },
];

interface ProviderData {
  gatekeepers: GatekeeperRow[];
  panorama: PanoramaFile | null;
  envolvidos: MateriaEnvolvidosEntry[];
  valoresPorMateria: ValoresPorMateriaMap | null;
}

interface Aggregate {
  totalMaterias: number;
  mencionados: number;
  mulheresCitadas: number;
  pctMulheresCitadas: number;
  taxaCobertura: number;
}

function computeAgg(d: ProviderData): Aggregate {
  const total = d.gatekeepers.length;
  const cobertos = d.gatekeepers.filter((g) => g.covered);
  const mencionados = d.envolvidos.reduce(
    (a, e) => a + e.envolvidos.length,
    0
  );
  const mulheresCitadas = cobertos.filter((g) => g.genero === "feminino").length;
  return {
    totalMaterias: d.envolvidos.length,
    mencionados,
    mulheresCitadas,
    pctMulheresCitadas:
      cobertos.length > 0 ? (mulheresCitadas / cobertos.length) * 100 : 0,
    taxaCobertura: total > 0 ? (cobertos.length / total) * 100 : 0,
  };
}

export default function PanoramaLlm() {
  const [data, setData] = useState<Record<Provider, ProviderData> | null>(null);
  const [selected, setSelected] = useState<Provider>("deepseek");

  useEffect(() => {
    const fetchOne = async (p: Provider): Promise<ProviderData> => {
      const [gk, pn, env, val] = await Promise.all([
        fetch(`/data/llm/gatekeepers/${p}/gatekeepers.json`).then((r) =>
          r.ok ? (r.json() as Promise<GatekeeperRow[]>) : []
        ),
        fetch(`/data/llm/panorama/${p}/panorama.json`).then((r) =>
          r.ok ? (r.json() as Promise<PanoramaFile>) : null
        ),
        fetch(
          `/data/llm/materias_llm/participantes/${p}/participantes.json`
        ).then((r) =>
          r.ok ? (r.json() as Promise<MateriaEnvolvidosEntry[]>) : []
        ),
        fetch(
          `/data/llm/materias_llm/valores_noticia_all/${p}.json`
        ).then((r) =>
          r.ok ? (r.json() as Promise<ValoresPorMateriaMap>) : null
        ),
      ]);
      return { gatekeepers: gk, panorama: pn, envolvidos: env, valoresPorMateria: val };
    };

    Promise.all(PROVIDERS.map(({ key }) => fetchOne(key))).then((results) => {
      setData({
        deepseek: results[0],
        gemini: results[1],
        openai: results[2],
      });
    });
  }, []);

  const current = data?.[selected] ?? null;
  const agg = useMemo(() => (current ? computeAgg(current) : null), [current]);

  if (!data || !current || !agg) {
    return <div className="loading">Carregando panorama LLM…</div>;
  }

  const label = PROVIDERS.find((p) => p.key === selected)?.label ?? selected;

  return (
    <div className="ph">
      <div className="ph__llm-bar">
        <label className="ph__llm-select">
          <span className="ph__llm-select-label">Modelo</span>
          <select
            className="ph__llm-select-control"
            value={selected}
            onChange={(e) => setSelected(e.target.value as Provider)}
          >
            {PROVIDERS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted ph__llm-hint">
          Todos os gráficos abaixo refletem as matérias geradas por {label}.
        </span>
      </div>

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
          = menções nas matérias geradas por {label}; cor indica se foi
          citada. Passe o mouse para ver partido, gênero e estado.
        </p>
        <div className="dist">
          <PessoasBeeswarm rows={current.gatekeepers} />
        </div>
      </section>

      <section className="ph__section">
        <h3 className="ph__section-title">Fluxo agregado audiência → matéria</h3>
        <p className="ph__section-sub muted">
          Volume que atravessa o filtro das matérias geradas por {label}.
          Alterne entre partido, gênero, estado ou valor-notícia.
        </p>
        <div className="dist">
          <GatekeepSankey
            rows={current.gatekeepers}
            modes={["partido", "genero", "estado", "valor"]}
            valoresPorMateria={current.valoresPorMateria ?? undefined}
            compact
          />
        </div>
      </section>

      {current.panorama && (
        <section className="ph__section">
          <h3 className="ph__section-title">
            Gatekeeping · testes de hipótese
          </h3>
          <p className="ph__section-sub muted">
            Cruzamento entre quem fala nas audiências e quem é citado nas
            matérias geradas por {label}.
          </p>
          <GatekeepingAchados panorama={current.panorama} />
        </section>
      )}
    </div>
  );
}
