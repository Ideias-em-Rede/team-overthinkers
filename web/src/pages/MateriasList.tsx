import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MateriaIndex, TemasMap } from "../types";
import "./MateriasList.css";

type SortKey = "id" | "data" | "envolvidos" | "participantes";

interface EnrichedMateria extends MateriaIndex {
  tema: string | null;
  participantesAudiencia: number | null;
  porcentagemMulheres: number | null;
}

export default function MateriasList() {
  const [items, setItems] = useState<EnrichedMateria[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("id");
  const [tema, setTema] = useState<string>("");

  useEffect(() => {
    Promise.all([
      fetch("/data/index.json").then((r) => r.json() as Promise<MateriaIndex[]>),
      fetch("/data/humano/transcricoes/temas/temas_audiencias.json")
        .then((r) => (r.ok ? (r.json() as Promise<TemasMap>) : ({} as TemasMap))),
    ]).then(([base, temas]) => {
      const enriched: EnrichedMateria[] = base.map((m) => {
        const t = temas[String(m.id)];
        return {
          ...m,
          tema: t?.tema ?? null,
          participantesAudiencia: t?.quantidade_total_participantes ?? null,
          porcentagemMulheres: t?.porcentagem_mulheres ?? null,
        };
      });
      setItems(enriched);
    });
  }, []);

  const temasDisponiveis = useMemo(() => {
    if (!items) return [];
    return Array.from(new Set(items.map((m) => m.tema).filter(Boolean) as string[])).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    let out = items;
    if (tema) out = out.filter((m) => m.tema === tema);
    if (q) {
      out = out.filter(
        (m) =>
          m.titulo.toLowerCase().includes(q) ||
          m.subtitulo.toLowerCase().includes(q) ||
          m.assunto.toLowerCase().includes(q) ||
          m.cargos.some((c) => c.toLowerCase().includes(q))
      );
    }
    const cmp: Record<SortKey, (a: EnrichedMateria, b: EnrichedMateria) => number> = {
      id: (a, b) => a.id - b.id,
      envolvidos: (a, b) => b.num_envolvidos - a.num_envolvidos,
      data: (a, b) => toTs(b.data) - toTs(a.data),
      participantes: (a, b) =>
        (b.participantesAudiencia ?? 0) - (a.participantesAudiencia ?? 0),
    };
    return [...out].sort(cmp[sort]);
  }, [items, query, sort, tema]);

  return (
    <div className="materias">
      <header className="materias__head">
        <div>
          <h1>Matérias</h1>
          <p className="muted">
            {items ? `${filtered.length} de ${items.length} matérias` : "Carregando…"}
          </p>
        </div>
        <div className="materias__controls">
          <input
            type="search"
            placeholder="Buscar por título, assunto ou cargo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={tema} onChange={(e) => setTema(e.target.value)}>
            <option value="">Todos os temas</option>
            {temasDisponiveis.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="id">Ordem original</option>
            <option value="data">Mais recentes</option>
            <option value="envolvidos">Mais mencionados</option>
            <option value="participantes">Mais participantes</option>
          </select>
        </div>
      </header>

      {!items ? (
        <div className="loading">Carregando índice…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">Nenhuma matéria corresponde à busca.</div>
      ) : (
        <ul className="materia-list">
          {filtered.map((m) => (
            <li key={m.id}>
              <Link to={`/materias/${m.id}`} className="materia-card">
                <div className="materia-card__meta">
                  <span className="badge">#{m.id}</span>
                  {m.data && <span className="muted">{m.data}</span>}
                </div>
                {m.tema && <span className="materia-card__tema">{m.tema}</span>}
                <h3>{m.titulo}</h3>
                {m.subtitulo && <p className="materia-card__sub">{m.subtitulo}</p>}
                <p className="materia-card__assunto">
                  <strong>Assunto:</strong> {m.assunto}
                </p>
                <div className="materia-card__footer">
                  {m.participantesAudiencia != null && (
                    <span>{m.participantesAudiencia} na audiência</span>
                  )}
                  {m.participantesAudiencia != null && <span>·</span>}
                  <span>{m.num_envolvidos} mencionados</span>
                  {m.porcentagemMulheres != null && (
                    <>
                      <span>·</span>
                      <span>{m.porcentagemMulheres.toFixed(0)}% mulheres</span>
                    </>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toTs(d: string): number {
  if (!d) return 0;
  const [dd, mm, yyyy] = d.split("/");
  return new Date(`${yyyy}-${mm}-${dd}`).getTime() || 0;
}
