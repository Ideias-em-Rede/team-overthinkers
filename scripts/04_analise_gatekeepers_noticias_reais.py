"""
Análise de gatekeeping editorial: cruzamento entre quem fala nas audiências
públicas da Câmara dos Deputados e quem é citado nas matérias do jornal da
Câmara sobre essas mesmas audiências.

Produz três achados estatisticamente testados:

  1. Existe um filtro de seleção editorial real, e ele não é redutível a
     "quem falou mais" (Mann-Whitney U + taxa de coincidência top-falante
     vs. top-citado por audiência).
  2. Convidados/especialistas externos recebem mais opiniões atribuídas na
     matéria do que os próprios deputados, mesmo controlando pelo volume de
     fala (Mann-Whitney U + regressão OLS).
  3. Existe assimetria partidária em quem ganha destaque textual (título /
     subtítulo / início) entre os já citados, com o PL sistematicamente
     sub-representado em destaque (qui-quadrado global + PL vs. resto +
     regressão logística de robustez para o PSOL).

Reprodutibilidade: nenhuma etapa usa aleatoriedade, amostragem ou modelos de
linguagem. A normalização de nomes e a matching transcrição<->notícia são
funções puras e determinísticas; os testes estatísticos (scipy/statsmodels)
são determinísticos dado o mesmo input. A única heurística do pipeline é o
dicionário de palavras-chave usado para classificar o tema de cada audiência
(ver TEMAS abaixo) — não é usada nos achados 1 e 2, e no achado 3 aparece só
como variável de controle na regressão de robustez do PSOL.

Uso:
    python scripts/analise_gatekeeping.py

Deve ser rodado a partir da raiz do repositório (ou de qualquer lugar — os
caminhos de entrada/saída são resolvidos relativos à raiz do repo,
calculada a partir da localização deste próprio arquivo).
"""

import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats

# ---------------------------------------------------------------------------
# Caminhos (relativos à raiz do repositório; independem do diretório de onde
# o script é chamado)
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
TRANSCRICAO_PATH = REPO_ROOT / "dataset" / "transcricao_reorganizada" / "metadados" / "dados_transcricao.json"
NOTICIAS_PATH = REPO_ROOT / "dataset" / "noticias_reorganizadas" / "noticias.json"
OUTPUT_DIR = REPO_ROOT / "gatekeepers"

# ---------------------------------------------------------------------------
# Normalização de nomes (determinística, sem decisão manual caso a caso)
# ---------------------------------------------------------------------------
TITULOS = {
    "deputado", "deputada", "sr", "sra", "dr", "dra",
    "professor", "professora", "general", "pastor", "ministro", "ministra",
}


def normalize_name(nome: str) -> str:
    """Normaliza um nome para fins de matching/deduplicação: remove acentos,
    pontuação, títulos/tratamentos e caixa. Determinística e sem estado."""
    if not nome:
        return ""
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"[^a-z ]", " ", s)
    tokens = [t for t in s.split() if t and t not in TITULOS]
    return " ".join(tokens)


def match_envolvido(nome_key: str, envolvidos_by_norm: dict):
    """Casa um participante da transcrição com um 'envolvido' da matéria.
    Regra fixa: (1) match exato de chave normalizada; (2) fallback por
    sobreposição de >=2 tokens do nome (cobre variações tipo nome completo
    vs. nome de tratamento)."""
    if nome_key in envolvidos_by_norm:
        return envolvidos_by_norm[nome_key]
    ptoks = set(nome_key.split())
    if not ptoks:
        return None
    for env_key, env in envolvidos_by_norm.items():
        etoks = set(env_key.split())
        if etoks and (ptoks <= etoks or etoks <= ptoks) and len(ptoks & etoks) >= 2:
            return env
    return None


# ---------------------------------------------------------------------------
# Classificação temática por palavra-chave (heurística, documentada;
# usada apenas como variável de controle na regressão de robustez do
# achado 3 — não sustenta sozinha nenhum achado)
# ---------------------------------------------------------------------------
TEMAS = {
    "Judiciario/Censura/Liberdade de expressao": [
        "censura", "moraes", "judiciario", "liberdade de expressao",
        "ativismo judicial", "stf", "poder judiciario", "judicializacao",
    ],
    "Economia/Trabalho/Fiscal": [
        "fgts", "tributaria", "orcament", "criptomoeda", "banco central",
        "imposto", "trabalh", "emprego", "consignado", "fiscal", "divida",
        "financ", "loteria", "economia",
    ],
    "Direitos humanos/Minorias/Inclusao": [
        "autismo", "deficien", "indigena", "racismo", "negro", "mulher",
        "genero", "lgbt", "direitos human", "violencia contra", "crianca",
        "idoso", "quilombola",
    ],
    "Meio ambiente/Desastres/Clima": [
        "seca", "desertific", "barragem", "mineradora", "clima",
        "ambiental", "desmatamento", "socioambiental", "enchente", "temporal",
    ],
    "Saude": ["vacin", "saude", "covid", "sus ", "medicamento", "hospital"],
    "Seguranca publica/Crime": [
        "seguranca publica", "crime", "policia", "violencia", "homicidio",
        "mortes violentas",
    ],
    "Educacao": ["educa", "escola", "ensino", "professor", "universidade", "capes"],
    "Tecnologia/IA/Telecom": [
        "inteligencia artificial", " ia ", "tecnolog", "telecom", "anatel",
        "e-commerce", "internet", "rede social", "plataform",
    ],
    "Transporte/Infraestrutura": [
        "transito", "velocidade", "rodovia", "transporte", "infraestrutura",
        "aviacao", "passagens", "123milhas",
    ],
    "Politica/Eleicoes/Institucional": [
        "eleic", "partido politico", "congresso", "camara dos deputados",
        "reforma politica", "cpi ", "ministro", "governo federal",
    ],
}


def normalize_text(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def classify_tema(assunto: str) -> str:
    a = normalize_text(assunto)
    scores = {tema: sum(1 for kw in kws if kw in a) for tema, kws in TEMAS.items()}
    scores = {t: s for t, s in scores.items() if s > 0}
    return max(scores, key=scores.get) if scores else "Outros"


def is_destaque(posicao_no_texto) -> bool:
    return posicao_no_texto in ("titulo", "subtitulo", "inicio")


# ---------------------------------------------------------------------------
# Etapa 1: carregar dados e construir a tabela cruzada (uma linha por
# participante por audiência)
# ---------------------------------------------------------------------------
def carregar_e_cruzar(transcricao_path: Path, noticias_path: Path):
    with open(transcricao_path, encoding="utf-8") as f:
        trans = json.load(f)
    with open(noticias_path, encoding="utf-8") as f:
        noticias = {n["id"]: n for n in json.load(f)}

    # nome canônico por chave normalizada (grafia mais frequente na base)
    raw_names_by_key = defaultdict(Counter)
    for hearing in trans.values():
        for p in hearing.get("participantes", []):
            raw_names_by_key[normalize_name(p["nome"])][p["nome"]] += 1
    canon_map = {k: c.most_common(1)[0][0] for k, c in raw_names_by_key.items()}

    rows = []
    total_envolvidos = 0
    envolvidos_sem_match = 0

    for hearing_id_str, hearing in trans.items():
        hearing_id = int(hearing_id_str)
        noticia = noticias.get(hearing_id)
        if noticia is None:
            continue

        tema = classify_tema(noticia["assunto"])
        envolvidos = noticia.get("envolvidos", [])
        total_envolvidos += len(envolvidos)
        envolvidos_by_norm = {normalize_name(e["nome"]): e for e in envolvidos}

        matched_envolvidos = set()
        for p in hearing.get("participantes", []):
            nome_key = normalize_name(p["nome"])
            match = match_envolvido(nome_key, envolvidos_by_norm)

            rows.append({
                "hearing_id": hearing_id,
                "tema": tema,
                "nome_canon": canon_map.get(nome_key, p["nome"]),
                "nome_key": nome_key,
                "genero": p.get("genero"),
                "partido": p.get("partido"),
                "estado": p.get("estado"),
                "quantidade_falas": p.get("quantidade_falas", 0),
                "quantidade_palavras": p.get("quantidade_palavras", 0),
                "covered": match is not None,
                "mencoes": match["mencoes"] if match else 0,
                "quantidade_opinioes": match["quantidade_opinioes"] if match else 0,
                "posicao_no_texto": match["posicao_no_texto"] if match else None,
            })
            if match:
                matched_envolvidos.add(normalize_name(match["nome"]))

        envolvidos_sem_match += len(envolvidos) - len(matched_envolvidos)

    stats_matching = {
        "total_registros_fala": len(rows),
        "pessoas_canonicas_distintas": len(set(r["nome_key"] for r in rows)),
        "total_envolvidos_em_noticias": total_envolvidos,
        "envolvidos_sem_correspondencia_no_transcript": envolvidos_sem_match,
        "pct_envolvidos_sem_correspondencia": round(
            100 * envolvidos_sem_match / total_envolvidos, 1
        ) if total_envolvidos else None,
    }
    return rows, stats_matching


# ---------------------------------------------------------------------------
# Achado 1: filtro de seleção real e não-mecânico
# ---------------------------------------------------------------------------
def achado_1_filtro_de_selecao(rows: list) -> dict:
    covered = [r for r in rows if r["covered"]]
    notcov = [r for r in rows if not r["covered"]]
    n, k = len(rows), len(covered)
    p = k / n
    se = math.sqrt(p * (1 - p) / n)

    u_stat, p_val = stats.mannwhitneyu(
        [r["quantidade_palavras"] for r in covered],
        [r["quantidade_palavras"] for r in notcov],
        alternative="greater",
    )

    by_hearing = defaultdict(list)
    for r in rows:
        by_hearing[r["hearing_id"]].append(r)

    audiencias_elegiveis = 0
    coincidencias = 0
    for items in by_hearing.values():
        covered_items = [r for r in items if r["covered"]]
        if len(covered_items) < 2:
            continue
        audiencias_elegiveis += 1
        top_falante = max(items, key=lambda r: r["quantidade_palavras"])
        top_citado = max(covered_items, key=lambda r: r["mencoes"])
        if top_falante["nome_key"] == top_citado["nome_key"]:
            coincidencias += 1

    return {
        "descricao": "Filtro de selecao editorial existe e nao e mecanico",
        "n_total": n,
        "n_cobertos": k,
        "taxa_cobertura": round(p, 4),
        "ic95_taxa_cobertura": [round(p - 1.96 * se, 4), round(p + 1.96 * se, 4)],
        "mediana_palavras_cobertos": stats.tmean([r["quantidade_palavras"] for r in covered]) and
                                       sorted(r["quantidade_palavras"] for r in covered)[len(covered)//2],
        "mediana_palavras_nao_cobertos": sorted(r["quantidade_palavras"] for r in notcov)[len(notcov)//2],
        "mannwhitney_U": u_stat,
        "mannwhitney_p": p_val,
        "audiencias_com_2plus_cobertos": audiencias_elegiveis,
        "coincidencia_top_falante_top_citado": coincidencias,
        "pct_coincidencia": round(100 * coincidencias / audiencias_elegiveis, 1),
    }


# ---------------------------------------------------------------------------
# Achado 2: convidados/especialistas recebem mais opinioes atribuidas
# do que deputados, mesmo controlando pelo volume de fala
# ---------------------------------------------------------------------------
def achado_2_convidados_vs_deputados(rows: list) -> dict:
    covered = [r for r in rows if r["covered"]]
    deputados = [r for r in covered if r["partido"]]
    convidados = [r for r in covered if not r["partido"]]

    u_stat, p_val = stats.mannwhitneyu(
        [r["quantidade_opinioes"] for r in convidados],
        [r["quantidade_opinioes"] for r in deputados],
        alternative="greater",
    )

    df = pd.DataFrame(covered)
    df["is_convidado"] = df["partido"].isna().astype(int)
    df["log_palavras"] = (df["quantidade_palavras"] + 1).apply(math.log)
    modelo = smf.ols("quantidade_opinioes ~ is_convidado + log_palavras", data=df).fit()
    ic = modelo.conf_int().loc["is_convidado"]

    return {
        "descricao": "Convidados/especialistas recebem mais opinioes atribuidas que deputados, controlando por volume de fala",
        "n_deputados_cobertos": len(deputados),
        "n_convidados_cobertos": len(convidados),
        "media_opinioes_deputados": sum(r["quantidade_opinioes"] for r in deputados) / len(deputados),
        "media_opinioes_convidados": sum(r["quantidade_opinioes"] for r in convidados) / len(convidados),
        "media_palavras_deputados": sum(r["quantidade_palavras"] for r in deputados) / len(deputados),
        "media_palavras_convidados": sum(r["quantidade_palavras"] for r in convidados) / len(convidados),
        "mannwhitney_U": u_stat,
        "mannwhitney_p": p_val,
        "ols_coef_is_convidado": modelo.params["is_convidado"],
        "ols_p_is_convidado": modelo.pvalues["is_convidado"],
        "ols_ic95_is_convidado": [ic[0], ic[1]],
    }


# ---------------------------------------------------------------------------
# Achado 3: assimetria partidaria em destaque textual (+ robustez PSOL)
# ---------------------------------------------------------------------------
def achado_3_destaque_partidario(rows: list) -> dict:
    covered_com_partido = [r for r in rows if r["covered"] and r["partido"]]
    contagem_partidos = Counter(r["partido"] for r in covered_com_partido)
    partidos_grandes = [p for p, c in contagem_partidos.items() if c >= 15]

    tabela, labels = [], []
    for p in partidos_grandes:
        itens = [r for r in covered_com_partido if r["partido"] == p]
        d = sum(1 for r in itens if is_destaque(r["posicao_no_texto"]))
        tabela.append([d, len(itens) - d])
        labels.append(p)
    chi2_global, p_global, dof, _ = stats.chi2_contingency(tabela)

    pl = [r for r in covered_com_partido if r["partido"] == "PL"]
    resto = [r for r in covered_com_partido if r["partido"] != "PL"]
    a = sum(1 for r in pl if is_destaque(r["posicao_no_texto"]))
    b = len(pl) - a
    c = sum(1 for r in resto if is_destaque(r["posicao_no_texto"]))
    d = len(resto) - c
    chi2_pl, p_pl, _, _ = stats.chi2_contingency([[a, b], [c, d]])
    odds_ratio = (a / b) / (c / d)
    se_logor = math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
    logor = math.log(odds_ratio)
    ic_or = [math.exp(logor - 1.96 * se_logor), math.exp(logor + 1.96 * se_logor)]

    # Robustez: PSOL segue com chance maior de ser citado mesmo controlando
    # tema da audiencia e volume de fala (regressao logistica)
    df = pd.DataFrame(rows)
    df["covered_bin"] = df["covered"].astype(int)
    df["is_psol"] = (df["partido"] == "PSOL").astype(int)
    df["log_palavras"] = (df["quantidade_palavras"] + 1).apply(math.log)
    modelo = smf.logit("covered_bin ~ is_psol + log_palavras + C(tema)", data=df).fit(disp=0)
    ic_psol = modelo.conf_int().loc["is_psol"]

    return {
        "descricao": "Assimetria partidaria em quem ganha destaque textual entre os ja citados; PL sub-representado em destaque",
        "partidos_analisados_n15plus": labels,
        "tabela_destaque_por_partido": dict(zip(labels, [
            {"destaque": t[0], "total": t[0] + t[1], "pct": round(100 * t[0] / (t[0] + t[1]), 1)}
            for t in tabela
        ])),
        "chi2_global": chi2_global,
        "p_global": p_global,
        "dof_global": dof,
        "pl_destaque": a,
        "pl_total": a + b,
        "pl_pct_destaque": round(100 * a / (a + b), 1),
        "resto_destaque": c,
        "resto_total": c + d,
        "resto_pct_destaque": round(100 * c / (c + d), 1),
        "chi2_pl_vs_resto": chi2_pl,
        "p_pl_vs_resto": p_pl,
        "odds_ratio_pl": odds_ratio,
        "ic95_odds_ratio_pl": ic_or,
        "robustez_psol_odds_ratio": math.exp(modelo.params["is_psol"]),
        "robustez_psol_p": modelo.pvalues["is_psol"],
        "robustez_psol_ic95": [math.exp(ic_psol[0]), math.exp(ic_psol[1])],
    }


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    if not TRANSCRICAO_PATH.exists():
        raise FileNotFoundError(f"Nao encontrei {TRANSCRICAO_PATH}")
    if not NOTICIAS_PATH.exists():
        raise FileNotFoundError(f"Nao encontrei {NOTICIAS_PATH}")

    rows, stats_matching = carregar_e_cruzar(TRANSCRICAO_PATH, NOTICIAS_PATH)

    resultados = {
        "matching": stats_matching,
        "achado_1_filtro_de_selecao": achado_1_filtro_de_selecao(rows),
        "achado_2_convidados_vs_deputados": achado_2_convidados_vs_deputados(rows),
        "achado_3_destaque_partidario": achado_3_destaque_partidario(rows),
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_DIR / "rows_cruzados.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    with open(OUTPUT_DIR / "resultados.json", "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2, default=str)

    print(f"OK - {len(rows)} registros processados.")
    print(f"Salvo em: {OUTPUT_DIR / 'rows_cruzados.json'}")
    print(f"Salvo em: {OUTPUT_DIR / 'resultados.json'}")
    print()
    print(json.dumps(resultados, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()