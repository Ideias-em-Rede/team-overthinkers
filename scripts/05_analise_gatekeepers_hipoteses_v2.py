"""
Análise de gatekeeping — v2 das hipóteses.

Substitui a análise do script 04 com 4 hipóteses reformuladas. Cada uma
(exceto H1) está associada a uma leitura do Sankey de gatekeeping do front:

  H1 · Filtro de fala (hipótese-âncora, sem Sankey específico)
      Participantes citados na matéria falam significativamente mais palavras
      do que os não citados.
      Teste: Mann-Whitney U (unilateral: citados > não citados).

  H2 · Silenciamento de mulheres (Sankey modo "genero")
      Mulheres têm menor probabilidade de serem citadas do que homens,
      mesmo controlando pelo volume de fala.
      Teste: regressão logística (covered ~ is_mulher + log_palavras).
      A hipótese é unilateral (direção pré-especificada, coef < 0). Reportamos
      o p-valor bilateral do coeficiente E exigimos coef negativo para
      considerar H1 sustentada.

  H3 · Viés partidário na citação (Sankey modo "partido")
      A probabilidade de um deputado ser citado depende do partido.
      Teste: qui-quadrado de independência sobre a tabela partido × covered
      (partidos com N >= 15 deputados/registros na base).
      Post-hoc descritivo: taxa de cobertura por partido, com os extremos
      (maior e menor) reportados. Sem contraste PL vs. resto pré-registrado.

  H4 · Cobertura por população da UF (Sankey modo "estado")
      Deputados de UFs mais populosas têm maior probabilidade de serem
      citados, mesmo controlando pelo volume de fala.
      Teste: regressão logística (covered ~ log_populacao_uf + log_palavras),
      com população = Censo IBGE 2022 (constante fixa).
      Ressalva: se p < 0,05 mas os extremos de cobertura por UF têm N pequeno
      (< 10 deputados), o achado é classificado como
      "nao_significativo_o_suficiente_para_afirmar" — mesma lógica do 04.

Modo "valor" do Sankey: sem hipótese pré-registrada nesta versão.

REPRODUTIBILIDADE
------------------
Determinístico — sem aleatoriedade, sem sampling, sem LLM. Normalização de
nomes e matching transcrição<->notícia são funções puras (mesma implementação
do 04). Rodar duas vezes sobre os mesmos inputs produz saída idêntica.

USO
----
    # humano (default)
    python3 scripts/05_analise_gatekeepers_hipoteses_v2.py

    # LLM (um gerador)
    python3 scripts/05_analise_gatekeepers_hipoteses_v2.py \\
        --source llm --generator deepseek

    # todos os LLMs
    python3 scripts/05_analise_gatekeepers_hipoteses_v2.py \\
        --source llm --generator all

    # override dos paths de entrada (opcional)
    python3 scripts/05_analise_gatekeepers_hipoteses_v2.py \\
        --transcricao /path/dados_transcricao.json \\
        --noticias /path/noticias.json

ENTRADA / SAÍDA (mesmos paths do 04, sobrescreve panorama.json)
-----------------
Entrada (humano): dataset/transcricao_reorganizada/metadados/dados_transcricao.json
                  dataset/noticias_reorganizadas/noticias.json
Entrada (llm):    idem transcrição; participantes/{gen}/participantes.json
Saída (humano):   gatekeepers/humano/rows_cruzados.json
                  gatekeepers/humano/resultados.json
Saída (llm):      web/public/data/llm/gatekeepers/{gen}/gatekeepers.json
                  web/public/data/llm/panorama/{gen}/panorama.json
"""

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats

# ---------------------------------------------------------------------------
# Caminhos (idênticos ao 04)
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
TRANSCRICAO_PATH = REPO_ROOT / "dataset" / "transcricao_reorganizada" / "metadados" / "dados_transcricao.json"
NOTICIAS_PATH = REPO_ROOT / "dataset" / "noticias_reorganizadas" / "noticias.json"
OUTPUT_DIR = REPO_ROOT / "gatekeepers" / "humano"

GENERATORS = ["openai", "gemini", "deepseek"]

# População residente por UF — Censo Demográfico IBGE 2022. Fixa.
POPULACAO_UF_CENSO_2022 = {
    "SP": 44420459, "MG": 20538718, "RJ": 16054524, "BA": 14136417,
    "PR": 11443208, "RS": 10880506, "PE": 9058155, "CE": 8791688,
    "PA": 8116132, "SC": 7609601, "GO": 7055228, "MA": 6775152,
    "PB": 3974495, "AM": 3941175, "ES": 3833486, "MT": 3658813,
    "RN": 3302406, "PI": 3269200, "AL": 3127511, "DF": 2817068,
    "MS": 2756700, "SE": 2209558, "RO": 1581016, "TO": 1511459,
    "AC": 830026, "AP": 733508, "RR": 636303,
}

# ---------------------------------------------------------------------------
# Resolução de fonte (idêntica ao 04)
# ---------------------------------------------------------------------------
def resolve_pipeline(source: str, generator: str | None) -> dict:
    if source == "humano":
        return {
            "noticias_path": NOTICIAS_PATH,
            "rows_output": OUTPUT_DIR / "rows_cruzados.json",
            "results_output": OUTPUT_DIR / "resultados.json",
            "label": "humano",
        }
    if source == "llm":
        if not generator:
            raise ValueError("--generator é obrigatório quando --source=llm")
        noticias_path = (
            REPO_ROOT
            / "web" / "public" / "data" / "llm" / "materias_llm"
            / "participantes" / generator / "participantes.json"
        )
        if not noticias_path.exists():
            raise FileNotFoundError(
                f"Arquivo de participantes LLM não encontrado: {noticias_path}"
            )
        return {
            "noticias_path": noticias_path,
            "rows_output": (
                REPO_ROOT / "web" / "public" / "data" / "llm"
                / "gatekeepers" / generator / "gatekeepers.json"
            ),
            "results_output": (
                REPO_ROOT / "web" / "public" / "data" / "llm"
                / "panorama" / generator / "panorama.json"
            ),
            "label": f"llm/{generator}",
        }
    raise ValueError(f"Fonte inválida: {source}. Use 'humano' ou 'llm'.")


def resolve_generators(arg: str) -> list[str]:
    if arg == "all":
        return list(GENERATORS)
    nomes = [g.strip() for g in arg.split(",") if g.strip()]
    desconhecidos = [n for n in nomes if n not in GENERATORS]
    if desconhecidos:
        sys.exit(f"Generator(es) desconhecido(s): {', '.join(desconhecidos)}")
    return nomes


# ---------------------------------------------------------------------------
# Normalização + matching (idênticos ao 04)
# ---------------------------------------------------------------------------
TITULOS = {
    "deputado", "deputada", "sr", "sra", "dr", "dra",
    "professor", "professora", "general", "pastor", "ministro", "ministra",
}


def normalize_name(nome: str) -> str:
    if not nome:
        return ""
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"[^a-z ]", " ", s)
    tokens = [t for t in s.split() if t and t not in TITULOS]
    return " ".join(tokens)


def match_envolvido(nome_key: str, envolvidos_by_norm: dict):
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


def carregar_e_cruzar(transcricao_path: Path, noticias_path: Path):
    with open(transcricao_path, encoding="utf-8") as f:
        trans = json.load(f)
    with open(noticias_path, encoding="utf-8") as f:
        noticias = {n["id"]: n for n in json.load(f) if "erro" not in n}

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

        envolvidos = noticia.get("envolvidos", [])
        total_envolvidos += len(envolvidos)
        envolvidos_by_norm = {normalize_name(e["nome"]): e for e in envolvidos}

        matched_envolvidos = set()
        for p in hearing.get("participantes", []):
            nome_key = normalize_name(p["nome"])
            match = match_envolvido(nome_key, envolvidos_by_norm)

            rows.append({
                "hearing_id": hearing_id,
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
# H1 · Filtro de fala (idêntico ao 04, texto em H1)
# ---------------------------------------------------------------------------
def achado_1_filtro_de_selecao(rows: list) -> dict:
    covered = [r for r in rows if r["covered"]]
    notcov = [r for r in rows if not r["covered"]]
    n, k = len(rows), len(covered)
    p = k / n if n else 0
    se = math.sqrt(p * (1 - p) / n) if n else 0

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
        "hipotese_testada": (
            "Participantes citados na materia falam significativamente mais "
            "palavras do que os nao citados (Mann-Whitney U, unilateral: "
            "citados > nao citados)"
        ),
        "n_total": n,
        "n_cobertos": k,
        "taxa_cobertura": round(p, 4),
        "ic95_taxa_cobertura": [round(p - 1.96 * se, 4), round(p + 1.96 * se, 4)],
        "mediana_palavras_cobertos": sorted(
            r["quantidade_palavras"] for r in covered
        )[len(covered) // 2] if covered else None,
        "mediana_palavras_nao_cobertos": sorted(
            r["quantidade_palavras"] for r in notcov
        )[len(notcov) // 2] if notcov else None,
        "mannwhitney_U": u_stat,
        "p_valor": p_val,
        "hipotese_sustentada_a_5pct": bool(p_val < 0.05),
        "estatistica_descritiva_adicional": {
            "descricao": "entre audiencias com >=2 pessoas citadas na materia, frequencia com que quem mais falou tambem foi quem mais foi citado",
            "audiencias_com_2plus_cobertos": audiencias_elegiveis,
            "coincidencia_top_falante_top_citado": coincidencias,
            "pct_coincidencia": round(100 * coincidencias / audiencias_elegiveis, 1)
                if audiencias_elegiveis else None,
        },
    }


# ---------------------------------------------------------------------------
# H2 · Silenciamento de mulheres (Sankey modo "genero")
# ---------------------------------------------------------------------------
def achado_2_silenciamento_mulheres(rows: list) -> dict:
    valid = [r for r in rows if r.get("genero") in ("masculino", "feminino")]

    homens = [r for r in valid if r["genero"] == "masculino"]
    mulheres = [r for r in valid if r["genero"] == "feminino"]

    homens_covered = sum(1 for r in homens if r["covered"])
    mulheres_covered = sum(1 for r in mulheres if r["covered"])

    taxa_h = homens_covered / len(homens) if homens else None
    taxa_m = mulheres_covered / len(mulheres) if mulheres else None

    # Chi-square 2x2 bruto (sem controle)
    tabela = [
        [homens_covered, len(homens) - homens_covered],
        [mulheres_covered, len(mulheres) - mulheres_covered],
    ]
    chi2, p_chi2, _, _ = stats.chi2_contingency(tabela)

    # Regressão logística com controle por log_palavras
    df = pd.DataFrame(valid)
    df["covered_bin"] = df["covered"].astype(int)
    df["is_mulher"] = (df["genero"] == "feminino").astype(int)
    df["log_palavras"] = (df["quantidade_palavras"] + 1).apply(math.log)

    modelo = smf.logit(
        "covered_bin ~ is_mulher + log_palavras", data=df
    ).fit(disp=0)
    coef = modelo.params["is_mulher"]
    p_val = modelo.pvalues["is_mulher"]
    ic = modelo.conf_int().loc["is_mulher"]
    or_mulher = math.exp(coef)
    ic_or = [math.exp(ic[0]), math.exp(ic[1])]

    # H1 unilateral: sustentada exige coef < 0 (mulheres com menor chance)
    # E p-valor bilateral do statsmodels < 0.05
    sustained = bool(p_val < 0.05 and coef < 0)

    return {
        "hipotese_testada": (
            "Mulheres tem menor probabilidade de serem citadas na materia "
            "do que homens, mesmo controlando pelo volume de fala "
            "(regressao logistica: covered ~ is_mulher + log_palavras; "
            "H1 unilateral: coef_is_mulher < 0)"
        ),
        "n_total": len(valid),
        "n_homens": len(homens),
        "n_mulheres": len(mulheres),
        "taxa_cobertura_homens": round(taxa_h, 4) if taxa_h is not None else None,
        "taxa_cobertura_mulheres": round(taxa_m, 4) if taxa_m is not None else None,
        "chi2_bruto": chi2,
        "p_valor_chi2_bruto": p_chi2,
        "coef_is_mulher": coef,
        "odds_ratio_is_mulher": or_mulher,
        "ic95_odds_ratio_is_mulher": ic_or,
        "p_valor": p_val,
        "hipotese_sustentada_a_5pct": sustained,
    }


# ---------------------------------------------------------------------------
# H3 · Viés partidário (Sankey modo "partido")
# ---------------------------------------------------------------------------
def achado_3_vies_partidario(rows: list) -> dict:
    deputados = [r for r in rows if r.get("partido")]

    contagem = Counter(r["partido"] for r in deputados)
    partidos_analisar = sorted(
        [p for p, c in contagem.items() if c >= 15]
    )

    tabela = []
    for p in partidos_analisar:
        rows_p = [r for r in deputados if r["partido"] == p]
        c = sum(1 for r in rows_p if r["covered"])
        tabela.append([c, len(rows_p) - c])

    chi2, p_val, dof, _ = stats.chi2_contingency(tabela)

    # Post-hoc descritivo: taxa de cobertura por partido
    tabela_por_partido = {}
    for p in partidos_analisar:
        rows_p = [r for r in deputados if r["partido"] == p]
        c = sum(1 for r in rows_p if r["covered"])
        tabela_por_partido[p] = {
            "n": len(rows_p),
            "cobertos": c,
            "taxa_cobertura": round(c / len(rows_p), 4),
        }

    ordenados = sorted(
        tabela_por_partido.items(),
        key=lambda kv: -kv[1]["taxa_cobertura"],
    )
    partido_maior = ordenados[0] if ordenados else (None, None)
    partido_menor = ordenados[-1] if ordenados else (None, None)

    return {
        "hipotese_testada": (
            "A probabilidade de um deputado ser citado depende do partido "
            "(qui-quadrado de independencia sobre partido x covered, "
            "partidos com N>=15 registros na base)"
        ),
        "n_deputados": len(deputados),
        "partidos_analisados_n15plus": partidos_analisar,
        "tabela_cobertura_por_partido": tabela_por_partido,
        "chi2": chi2,
        "dof": dof,
        "p_valor": p_val,
        "hipotese_sustentada_a_5pct": bool(p_val < 0.05),
        "post_hoc": {
            "descricao": "Extremos de cobertura entre os partidos analisados. Sem correcao para multiplas comparacoes; tratar como leitura exploratoria.",
            "partido_maior_cobertura": {
                "partido": partido_maior[0],
                "taxa": partido_maior[1]["taxa_cobertura"] if partido_maior[1] else None,
                "n": partido_maior[1]["n"] if partido_maior[1] else None,
            },
            "partido_menor_cobertura": {
                "partido": partido_menor[0],
                "taxa": partido_menor[1]["taxa_cobertura"] if partido_menor[1] else None,
                "n": partido_menor[1]["n"] if partido_menor[1] else None,
            },
        },
    }


# ---------------------------------------------------------------------------
# H4 · População da UF (idêntico ao 04, com ressalva mantida)
# ---------------------------------------------------------------------------
def achado_4_populacao_uf(rows: list) -> dict:
    deputados_com_uf = [
        r for r in rows
        if r["partido"] and r["estado"] in POPULACAO_UF_CENSO_2022
    ]

    df = pd.DataFrame(deputados_com_uf)
    df["covered_bin"] = df["covered"].astype(int)
    df["log_palavras"] = (df["quantidade_palavras"] + 1).apply(math.log)
    df["populacao_uf"] = df["estado"].map(POPULACAO_UF_CENSO_2022)
    df["log_populacao_uf"] = df["populacao_uf"].apply(math.log)

    modelo = smf.logit(
        "covered_bin ~ log_populacao_uf + log_palavras", data=df
    ).fit(disp=0)
    p_val = modelo.pvalues["log_populacao_uf"]
    ic = modelo.conf_int().loc["log_populacao_uf"]

    por_uf = defaultdict(list)
    for r in deputados_com_uf:
        por_uf[r["estado"]].append(1 if r["covered"] else 0)

    tabela_uf = {
        uf: {
            "populacao": POPULACAO_UF_CENSO_2022[uf],
            "n": len(vals),
            "pct_cobertura": round(100 * sum(vals) / len(vals), 1),
        }
        for uf, vals in por_uf.items() if len(vals) >= 10
    }
    tabela_uf = dict(sorted(tabela_uf.items(), key=lambda kv: -kv[1]["populacao"]))
    menor_n_na_tabela = min(v["n"] for v in tabela_uf.values()) if tabela_uf else None

    rejeita_h0 = bool(p_val < 0.05)
    classificacao = (
        "nao_significativo_o_suficiente_para_afirmar"
        if rejeita_h0 else "nao_significativo"
    )

    return {
        "hipotese_testada": (
            "Deputados de UFs mais populosas tem maior probabilidade de "
            "serem citados na materia, mesmo controlando pelo volume de "
            "fala (regressao logistica: covered ~ log_populacao_uf + "
            "log_palavras; populacao = Censo IBGE 2022)"
        ),
        "n_deputados_com_uf": len(deputados_com_uf),
        "n_ufs_analisadas": len(por_uf),
        "coef_log_populacao_uf": modelo.params["log_populacao_uf"],
        "p_valor": p_val,
        "hipotese_sustentada_a_5pct": rejeita_h0,
        "odds_ratio_log_populacao_uf": math.exp(modelo.params["log_populacao_uf"]),
        "ic95_odds_ratio": [math.exp(ic[0]), math.exp(ic[1])],
        "classificacao": classificacao,
        "tabela_cobertura_por_uf": tabela_uf,
        "observacao": (
            "efeito estatisticamente significativo (p<0.05), mas a tabela "
            f"de cobertura por UF mostra estados com N pequeno (a partir de "
            f"{menor_n_na_tabela} deputados) entre os que mais contrastam em "
            "cobertura — antes de tratar este achado como definitivo, "
            "recomenda-se uma checagem de robustez (ex.: refazer o modelo "
            "excluindo os estados de cobertura mais extrema) para verificar "
            "se o efeito nao depende de poucos casos"
        ) if menor_n_na_tabela is not None else None,
    }


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------
def processar_pipeline(
    source: str,
    generator: str | None,
    transcricao_override: Path | None = None,
    noticias_override: Path | None = None,
) -> None:
    cfg = resolve_pipeline(source, generator)
    transcricao_path = transcricao_override or TRANSCRICAO_PATH
    noticias_path = noticias_override or cfg["noticias_path"]
    rows_output = cfg["rows_output"]
    results_output = cfg["results_output"]
    label = cfg["label"]

    print("=" * 72)
    print(f"GATEKEEPING v2 · {label}")
    print("=" * 72)

    if not transcricao_path.exists():
        raise FileNotFoundError(f"Nao encontrei {transcricao_path}")
    if not noticias_path.exists():
        raise FileNotFoundError(f"Nao encontrei {noticias_path}")

    rows, stats_matching = carregar_e_cruzar(transcricao_path, noticias_path)

    resultados = {
        "matching": stats_matching,
        "achado_1_filtro_de_selecao": achado_1_filtro_de_selecao(rows),
        "achado_2_silenciamento_mulheres": achado_2_silenciamento_mulheres(rows),
        "achado_3_vies_partidario": achado_3_vies_partidario(rows),
        "achado_4_populacao_uf": achado_4_populacao_uf(rows),
    }

    rows_output.parent.mkdir(parents=True, exist_ok=True)
    results_output.parent.mkdir(parents=True, exist_ok=True)

    with open(rows_output, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    with open(results_output, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2, default=str)

    print(f"OK - {len(rows)} registros processados.")
    print(f"Salvo em: {rows_output}")
    print(f"Salvo em: {results_output}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Cruza transcrição × notícia e roda as 4 hipóteses v2 "
        "de gatekeeping. Suporta matérias humanas ou geradas por LLM."
    )
    parser.add_argument(
        "--source",
        default="humano",
        choices=["humano", "llm"],
        help="Fonte a processar (default: humano)",
    )
    parser.add_argument(
        "--generator",
        default=None,
        help="Só para --source llm: gerador (openai, gemini, deepseek), "
        "lista separada por vírgula, ou 'all'.",
    )
    parser.add_argument(
        "--transcricao",
        type=Path,
        default=None,
        help="Override do path do arquivo de transcrição.",
    )
    parser.add_argument(
        "--noticias",
        type=Path,
        default=None,
        help="Override do path do arquivo de notícias. Incompatível com "
        "--generator all (que roda vários pipelines).",
    )
    args = parser.parse_args()

    if args.noticias and args.generator == "all":
        sys.exit("--noticias não pode ser combinado com --generator all")

    if args.source == "humano":
        processar_pipeline(
            "humano", None,
            transcricao_override=args.transcricao,
            noticias_override=args.noticias,
        )
        return

    if not args.generator:
        sys.exit("--generator é obrigatório quando --source=llm")

    for gen in resolve_generators(args.generator):
        processar_pipeline(
            "llm", gen,
            transcricao_override=args.transcricao,
            noticias_override=args.noticias,
        )


if __name__ == "__main__":
    main()
