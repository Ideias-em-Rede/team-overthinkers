import { useState } from "react";
import { Link } from "react-router-dom";
import PanoramaComparacao from "../components/PanoramaComparacao";
import PanoramaHumano from "../components/PanoramaHumano";
import PanoramaLlm from "../components/PanoramaLlm";
import "./Home.css";

type Corpus = "transcricao" | "humanos" | "llm" | "comparacao";

export default function Home() {
  const [corpus, setCorpus] = useState<Corpus>("transcricao");

  return (
    <div className="home">
      <section className="hero">
        <span className="hero__eyebrow">ARTIGO</span>
        <h1>You Shall Not Pass: Usando LLMs para Avaliar Gatekeeping na Agência Câmara de Notícias</h1>
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
        <h2>Questões de pesquisa</h2>
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

      <section className="panorama">
        <div className="panorama__head">
          <h2>Panorama</h2>
          <div className="panorama__tabs">
            <button
              className={`panorama__tab ${corpus === "transcricao" ? "on" : ""}`}
              onClick={() => setCorpus("transcricao")}
            >
              Transcrições
            </button>
            <button
              className={`panorama__tab ${corpus === "humanos" ? "on" : ""}`}
              onClick={() => setCorpus("humanos")}
            >
              Escritas por Humano
            </button>
            <button
              className={`panorama__tab ${corpus === "llm" ? "on" : ""}`}
              onClick={() => setCorpus("llm")}
            >
              Geradas por LLM
            </button>
            <button
              className={`panorama__tab ${corpus === "comparacao" ? "on" : ""}`}
              onClick={() => setCorpus("comparacao")}
            >
              Comparação
            </button>
          </div>
        </div>

        {corpus === "llm" ? (
          <PanoramaLlm />
        ) : corpus === "comparacao" ? (
          <PanoramaComparacao />
        ) : (
          <PanoramaHumano section={corpus} />
        )}
      </section>
    </div>
  );
}
