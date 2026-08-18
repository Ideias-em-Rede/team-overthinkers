import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MateriaIndex } from "../types";
import "./MateriasList.css";

export default function MateriasList() {
  const [items, setItems] = useState<MateriaIndex[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"id" | "data" | "envolvidos">("id");

  useEffect(() => {
    fetch("/data/index.json")
      .then((r) => r.json())
      .then(setItems);
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    let out = items;
    if (q) {
      out = out.filter(
        (m) =>
          m.titulo.toLowerCase().includes(q) ||
          m.subtitulo.toLowerCase().includes(q) ||
          m.assunto.toLowerCase().includes(q) ||
          m.cargos.some((c) => c.toLowerCase().includes(q))
      );
    }
    const cmp: Record<typeof sort, (a: MateriaIndex, b: MateriaIndex) => number> = {
      id: (a, b) => a.id - b.id,
      envolvidos: (a, b) => b.num_envolvidos - a.num_envolvidos,
      data: (a, b) => toTs(b.data) - toTs(a.data),
    };
    return [...out].sort(cmp[sort]);
  }, [items, query, sort]);

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
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="id">Ordem original</option>
            <option value="data">Mais recentes</option>
            <option value="envolvidos">Mais envolvidos</option>
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
                <h3>{m.titulo}</h3>
                {m.subtitulo && <p className="materia-card__sub">{m.subtitulo}</p>}
                <p className="materia-card__assunto">
                  <strong>Assunto:</strong> {m.assunto}
                </p>
                <div className="materia-card__footer">
                  <span>{m.num_envolvidos} envolvidos</span>
                  <span>·</span>
                  <span>{m.num_opinioes} opiniões</span>
                  <span>·</span>
                  <span>{m.cargos.length} cargos distintos</span>
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
