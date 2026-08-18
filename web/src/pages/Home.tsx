import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { MateriaIndex } from "../types";
import "./Home.css";

interface Stats {
  totalMaterias: number;
  totalEnvolvidos: number;
  totalOpinioes: number;
  mediaEnvolvidos: number;
  primeiraData: string;
  ultimaData: string;
}

function computeStats(index: MateriaIndex[]): Stats {
  const totalEnvolvidos = index.reduce((s, m) => s + m.num_envolvidos, 0);
  const totalOpinioes = index.reduce((s, m) => s + m.num_opinioes, 0);
  const datas = index
    .map((m) => m.data)
    .filter(Boolean)
    .map((d) => {
      const [dd, mm, yyyy] = d.split("/");
      return { raw: d, ts: new Date(`${yyyy}-${mm}-${dd}`).getTime() };
    })
    .sort((a, b) => a.ts - b.ts);
  return {
    totalMaterias: index.length,
    totalEnvolvidos,
    totalOpinioes,
    mediaEnvolvidos: index.length ? totalEnvolvidos / index.length : 0,
    primeiraData: datas[0]?.raw ?? "",
    ultimaData: datas[datas.length - 1]?.raw ?? "",
  };
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/data/index.json")
      .then((r) => r.json())
      .then((data: MateriaIndex[]) => setStats(computeStats(data)));
  }, []);

  return (
    <div className="home">
      <section className="hero">
        <span className="hero__eyebrow">ARTIGO</span>
        <h1>You Shall Not Pass: Gatekeeping na Agência Câmara de Notícias</h1>
        <p className="hero__lead">
          Explorando quais critérios e valores orientam a seleção de dados e participantes nas matérias jornalísticas produzidas pela Agência Câmara sobre
          audiências públicas na Câmara dos Deputados.
        </p>
        <p className="hero__body">
          Baseado no dataset <strong>PublicHearingBR</strong>, que reúne 206
          transcrições de audiências públicas da Câmara dos Deputados pareadas com
          as matérias jornalísticas publicadas pela Agência Câmara de Notícias.
          Cada matéria vem acompanhada de um sumário estruturado com os envolvidos
          citados, seus cargos e as opiniões atribuídas a eles. Este par
          transcrição/matéria permite investigar decisões editoriais que
          transformam horas de debate em notícia.
        </p>
        <div className="hero__actions">
          <Link to="/materias" className="btn">
            Explorar matérias
          </Link>
          <a
            href="https://arxiv.org/abs/2410.07495"
            target="_blank"
            rel="noreferrer"
            className="btn ghost"
          >
            Ler o paper do dataset
          </a>
        </div>
      </section>

      <section className="rqs">
        <h2>Perguntas de pesquisa</h2>
        <div className="rq-grid">
          <article className="rq-card">
            <span className="badge">RQ1</span>
            <h3>Seleção jornalística humana</h3>
            <p>
              Quais valores-notícia e participantes caracterizam as notícias da Agência Câmara?
            </p>
          </article>
          <article className="rq-card">
            <span className="badge">RQ2</span>
            <h3>Seleção jornalística de um modelo</h3>
            <p>
              Quais valores-notícia e participantes caracterizam as notícias geradas por LLMs?
            </p>
          </article>
          <article className="rq-card">
            <span className="badge">RQ3</span>
            <h3>Padrões de seleção</h3>
            <p>
              Em que medida os LLMs reproduzem os padrões observados na Agência Câmara?
            </p>
          </article>
        </div>
      </section>

      <section className="stats">
        <h2>Panorama do corpus</h2>
        {!stats ? (
          <div className="loading">Carregando estatísticas…</div>
        ) : (
          <div className="stat-grid">
            <div className="stat">
              <span className="stat__value">{stats.totalMaterias}</span>
              <span className="stat__label">matérias</span>
            </div>
            <div className="stat stat--wide">
              <span className="stat__value stat__value--sm">
                {stats.primeiraData} → {stats.ultimaData}
              </span>
              <span className="stat__label">período coberto</span>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
