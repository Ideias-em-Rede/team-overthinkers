"""
Análise de gatekeeping editorial: cruzamento entre quem fala nas audiências
públicas da Câmara dos Deputados (dados_transcricao.json) e quem é citado
nas matérias do jornal da Câmara sobre essas mesmas audiências
(noticias.json). Ambos os arquivos de entrada são agregados por metadado
(contagens, posição no texto, partido, UF etc.) — este script não analisa o
texto corrido das falas nem da matéria, só a camada de metadados, por
enquanto restrita às notícias reais (não geradas por IA).

O QUE O SCRIPT FAZ, PASSO A PASSO
----------------------------------
1. Carrega os dois JSONs de entrada.
2. Normaliza nomes (acentos, caixa, títulos como "Deputado"/"Dr.") pra
   deduplicar grafias diferentes da mesma pessoa.
3. Cruza cada participante da transcrição com o correspondente "envolvido"
   da matéria (match exato por nome normalizado, com fallback por
   sobreposição de >=2 tokens do nome), gerando uma linha por
   participante-por-audiência com: se foi citado ou não (`covered`),
   quantas menções recebeu, quantas opiniões foram atribuídas a ele e em
   que posição do texto apareceu.
4. Roda 4 testes de hipótese (um por achado) sobre essa tabela cruzada.
5. Salva a tabela cruzada e os resultados dos 4 testes em
   gatekeepers/humano/.

COMO CADA HIPÓTESE É TESTADA (achado -> pergunta -> teste estatístico)
------------------------------------------------------------------------
Cada achado é formalizado como uma hipótese de pesquisa afirmativa (H1),
definida a priori a partir de uma fase exploratória anterior sobre os
mesmos dados. O script reporta o p-valor do teste estatístico que avalia
se os dados sustentam essa hipótese — a leitura substantiva do resultado
(o que isso significa para o gatekeeping editorial) é do paper, não do
script. Estatisticamente, cada teste roda por trás uma hipótese nula de
"não há diferença/associação" e a compara ao p-valor de corte de 5%; o
script reporta o resultado já em termos da hipótese afirmativa (H1)
correspondente, e não da nula, para deixar a leitura direta.

  ACHADO 1 — Existe filtro de seleção, e ele não é só "quem fala mais"?
    H1: participantes citados na matéria falam significativamente mais
    palavras do que os não citados.
    Teste: Mann-Whitney U (unilateral: citados > não citados) — não
    paramétrico, apropriado porque a distribuição de palavras faladas é
    assimétrica (poucos falam muito, a maioria fala pouco).
    Estatística descritiva complementar (não é teste de hipótese): entre
    audiências com 2+ pessoas citadas, frequência com que quem mais falou
    também foi quem mais apareceu na matéria — mede se a seleção é
    redutível ao volume de fala ou se há um filtro editorial adicional.

  ACHADO 2 — Convidados/especialistas recebem mais espaço de opinião do
  que deputados, mesmo controlando pelo volume de fala?
    H1: convidados/especialistas recebem mais opiniões atribuídas na
    matéria do que deputados, mesmo controlando pelo volume de fala.
    Teste: Mann-Whitney U (comparação bruta) + regressão OLS
    (quantidade_opinioes ~ is_convidado + log_palavras) — a regressão é o
    teste que sustenta a conclusão, porque isola o efeito de "ser
    convidado" do efeito de "falar mais".

  ACHADO 3 — A posição de destaque no texto (título/subtítulo/início vs.
  corpo) depende do partido?
    H1 (global): a posição de destaque no texto depende do partido.
    Teste: qui-quadrado de independência entre os partidos com N>=15
    citações na matéria.
    H1 (PL vs. resto): o PL recebe menos destaque textual do que o
    restante dos partidos.
    Teste: qui-quadrado 2x2 isolando PL vs. todos os outros partidos
    somados, com odds ratio e IC95% — feito à parte do teste global porque
    foi o contraste mais forte identificado na fase exploratória.

  ACHADO 4 — A população da UF do deputado influencia a probabilidade de
  ele ser citado na matéria?
    H1: deputados de estados mais populosos têm maior probabilidade de
    serem citados na matéria, mesmo controlando pelo volume de fala.
    Teste: regressão logística (covered ~ log_populacao_uf + log_palavras),
    com população oficial do Censo IBGE 2022 por estado (constante fixa no
    script, não recalculada).
    IMPORTANTE: o teste dá suporte a essa hipótese (p<0,05), mas o script
    também calcula a cobertura por UF e sinaliza no campo "observacao" que
    os estados que mais contrastam têm N pequeno (a partir de ~10
    deputados) — ou seja, apesar de estatisticamente significativo, o
    achado é classificado como "nao_significativo_o_suficiente_para_afirmar"
    até que uma checagem de robustez (fora do escopo deste script) confirme
    que o efeito não depende de poucos casos.

REPRODUTIBILIDADE
------------------
Nenhuma etapa usa aleatoriedade, amostragem ou modelos de linguagem. A
normalização de nomes e a matching transcrição<->notícia são funções puras
e determinísticas; os testes estatísticos (scipy/statsmodels) são
determinísticos dado o mesmo input. Rodar este script duas vezes sobre os
mesmos dados produz exatamente os mesmos números — isso é esperado e
desejável para reprodutibilidade, não uma fraqueza do método.

USO
----
    python -m scripts.04_analise_gatekeepers_noticias_reais

Deve ser rodado a partir da raiz do repositório (ou de qualquer lugar — os
caminhos de entrada/saída são resolvidos relativos à raiz do repo,
calculada a partir da localização deste próprio arquivo).

ENTRADA / SAÍDA
-----------------
Entrada: dataset/transcricao_reorganizada/metadados/dados_transcricao.json
         dataset/noticias_reorganizadas/noticias.json
Saída:   gatekeepers/humano/rows_cruzados.json  (tabela cruzada completa)
         gatekeepers/humano/resultados.json     (os 4 achados com estatísticas)
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
# Caminhos (relativos à raiz do repositório; independem do diretório de onde
# o script é chamado)
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
TRANSCRICAO_PATH = REPO_ROOT / "dataset" / "transcricao_reorganizada" / "metadados" / "dados_transcricao.json"
NOTICIAS_PATH = REPO_ROOT / "dataset" / "noticias_reorganizadas" / "noticias.json"
OUTPUT_DIR = REPO_ROOT / "gatekeepers" / "humano"

GENERATORS = ["openai", "gemini", "deepseek"]


# ---------------------------------------------------------------------------
# Resolução de fonte (humano / llm)
# ---------------------------------------------------------------------------
def resolve_pipeline(source: str, generator: str | None) -> dict:
    """Retorna os paths de I/O para o pipeline atual."""

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
                REPO_ROOT
                / "web" / "public" / "data" / "llm" / "gatekeepers"
                / generator / "gatekeepers.json"
            ),
            "results_output": (
                REPO_ROOT
                / "web" / "public" / "data" / "llm" / "panorama"
                / generator / "panorama.json"
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

# População residente por UF — Censo Demográfico IBGE 2022 (resultados
# oficiais, primeiro apuramento). Fonte: IBGE, divulgação de 28/06/2023.
# Usada como variável explicativa fixa (nao muda entre execucoes do script).
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
        # Ignora entradas com "erro" (extração falhou) — evita contar como
        # se a notícia tivesse zero envolvidos.
        noticias = {
            n["id"]: n for n in json.load(f) if "erro" not in n
        }

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
# Achado 1: H0 = volume de fala nao difere entre citados e nao-citados
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
        "hipotese_testada": (
            "Participantes citados na materia falam significativamente "
            "mais palavras do que os nao citados "
            "(Mann-Whitney U, unilateral: citados > nao citados)"
        ),
        "n_total": n,
        "n_cobertos": k,
        "taxa_cobertura": round(p, 4),
        "ic95_taxa_cobertura": [round(p - 1.96 * se, 4), round(p + 1.96 * se, 4)],
        "mediana_palavras_cobertos": sorted(r["quantidade_palavras"] for r in covered)[len(covered) // 2],
        "mediana_palavras_nao_cobertos": sorted(r["quantidade_palavras"] for r in notcov)[len(notcov) // 2],
        "mannwhitney_U": u_stat,
        "p_valor": p_val,
        "hipotese_sustentada_a_5pct": bool(p_val < 0.05),
        "estatistica_descritiva_adicional": {
            "descricao": "entre audiencias com >=2 pessoas citadas na materia, frequencia com que quem mais falou tambem foi quem mais foi citado",
            "audiencias_com_2plus_cobertos": audiencias_elegiveis,
            "coincidencia_top_falante_top_citado": coincidencias,
            "pct_coincidencia": round(100 * coincidencias / audiencias_elegiveis, 1),
        },
    }


# ---------------------------------------------------------------------------
# Achado 2: H0 = opinioes atribuidas nao diferem entre convidados e
# deputados, controlando por volume de fala
# ---------------------------------------------------------------------------
def achado_2_convidados_vs_deputados(rows: list) -> dict:
    covered = [r for r in rows if r["covered"]]
    deputados = [r for r in covered if r["partido"]]
    convidados = [r for r in covered if not r["partido"]]

    u_stat, p_val_mw = stats.mannwhitneyu(
        [r["quantidade_opinioes"] for r in convidados],
        [r["quantidade_opinioes"] for r in deputados],
        alternative="greater",
    )

    df = pd.DataFrame(covered)
    df["is_convidado"] = df["partido"].isna().astype(int)
    df["log_palavras"] = (df["quantidade_palavras"] + 1).apply(math.log)
    modelo = smf.ols("quantidade_opinioes ~ is_convidado + log_palavras", data=df).fit()
    ic = modelo.conf_int().loc["is_convidado"]
    p_val_ols = modelo.pvalues["is_convidado"]

    return {
        "hipotese_testada": (
            "Convidados/especialistas recebem mais opinioes atribuidas na "
            "materia do que deputados, mesmo controlando pelo volume de "
            "fala (regressao OLS: quantidade_opinioes ~ "
            "is_convidado + log_palavras)"
        ),
        "n_deputados_cobertos": len(deputados),
        "n_convidados_cobertos": len(convidados),
        "media_opinioes_deputados": sum(r["quantidade_opinioes"] for r in deputados) / len(deputados),
        "media_opinioes_convidados": sum(r["quantidade_opinioes"] for r in convidados) / len(convidados),
        "media_palavras_deputados": sum(r["quantidade_palavras"] for r in deputados) / len(deputados),
        "media_palavras_convidados": sum(r["quantidade_palavras"] for r in convidados) / len(convidados),
        "mannwhitney_U": u_stat,
        "mannwhitney_p": p_val_mw,
        "ols_coef_is_convidado": modelo.params["is_convidado"],
        "p_valor": p_val_ols,
        "hipotese_sustentada_a_5pct": bool(p_val_ols < 0.05),
        "ols_ic95_is_convidado": [ic[0], ic[1]],
    }


# ---------------------------------------------------------------------------
# Achado 3: H0 = destaque textual e independente do partido
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

    return {
        "hipotese_testada_global": (
            "A posicao de destaque no texto (titulo/subtitulo/inicio "
            "vs. corpo) depende do partido (qui-quadrado de "
            "independencia, partidos com N>=15 citacoes)"
        ),
        "partidos_analisados_n15plus": labels,
        "tabela_destaque_por_partido": dict(zip(labels, [
            {"destaque": t[0], "total": t[0] + t[1], "pct": round(100 * t[0] / (t[0] + t[1]), 1)}
            for t in tabela
        ])),
        "chi2_global": chi2_global,
        "p_valor_global": p_global,
        "dof_global": dof,
        "hipotese_sustentada_global_a_5pct": bool(p_global < 0.05),
        "hipotese_testada_pl_vs_resto": (
            "O PL recebe menos destaque textual do que o restante dos "
            "partidos (qui-quadrado 2x2)"
        ),
        "pl_destaque": a,
        "pl_total": a + b,
        "pl_pct_destaque": round(100 * a / (a + b), 1),
        "resto_destaque": c,
        "resto_total": c + d,
        "resto_pct_destaque": round(100 * c / (c + d), 1),
        "chi2_pl_vs_resto": chi2_pl,
        "p_valor_pl_vs_resto": p_pl,
        "rejeita_h0_pl_vs_resto_a_5pct": bool(p_pl < 0.05),
        "odds_ratio_pl": odds_ratio,
        "ic95_odds_ratio_pl": ic_or,
    }


# ---------------------------------------------------------------------------
# Achado 4: H0 = populacao da UF nao influencia a probabilidade de cobertura
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

    modelo = smf.logit("covered_bin ~ log_populacao_uf + log_palavras", data=df).fit(disp=0)
    p_val = modelo.pvalues["log_populacao_uf"]
    ic = modelo.conf_int().loc["log_populacao_uf"]

    # tabela de cobertura por UF (apenas para leitura/grafico; UFs com N>=10)
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
    # ordenada da maior para a menor populacao, pra facilitar leitura do grafico
    tabela_uf = dict(sorted(tabela_uf.items(), key=lambda kv: -kv[1]["populacao"]))
    menor_n_na_tabela = min(v["n"] for v in tabela_uf.values())

    rejeita_h0 = bool(p_val < 0.05)
    classificacao = "nao_significativo_o_suficiente_para_afirmar" if rejeita_h0 else "nao_significativo"

    return {
        "hipotese_testada": (
            "H0: a populacao da UF do deputado nao influencia a "
            "probabilidade de ele ser citado na materia, controlando pelo "
            "volume de fala (regressao logistica: covered ~ "
            "log_populacao_uf + log_palavras; populacao = Censo IBGE 2022)"
        ),
        "n_deputados_com_uf": len(deputados_com_uf),
        "n_ufs_analisadas": len(por_uf),
        "coef_log_populacao_uf": modelo.params["log_populacao_uf"],
        "p_valor": p_val,
        "rejeita_h0_a_5pct": rejeita_h0,
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
        ),
    }


# ---------------------------------------------------------------------------
# main
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

    print("=" * 70)
    print(f"GATEKEEPING · {label}")
    print("=" * 70)

    if not transcricao_path.exists():
        raise FileNotFoundError(f"Nao encontrei {transcricao_path}")
    if not noticias_path.exists():
        raise FileNotFoundError(f"Nao encontrei {noticias_path}")

    rows, stats_matching = carregar_e_cruzar(transcricao_path, noticias_path)

    resultados = {
        "matching": stats_matching,
        "achado_1_filtro_de_selecao": achado_1_filtro_de_selecao(rows),
        "achado_2_convidados_vs_deputados": achado_2_convidados_vs_deputados(rows),
        "achado_3_destaque_partidario": achado_3_destaque_partidario(rows),
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
        description="Cruza transcrição × notícia e roda os 4 achados de "
        "gatekeeping. Suporta matérias humanas ou geradas por LLM."
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
        help="Override do path do arquivo de transcrição (default: "
        "dataset/transcricao_reorganizada/metadados/dados_transcricao.json).",
    )
    parser.add_argument(
        "--noticias",
        type=Path,
        default=None,
        help="Override do path do arquivo de notícias. Se passado, ignora "
        "o path resolvido pela combinação --source/--generator. "
        "Incompatível com --generator all (que roda vários pipelines).",
    )
    args = parser.parse_args()

    if args.noticias and args.generator == "all":
        sys.exit("--noticias não pode ser combinado com --generator all")

    if args.source == "humano":
        processar_pipeline(
            "humano",
            None,
            transcricao_override=args.transcricao,
            noticias_override=args.noticias,
        )
        return

    if not args.generator:
        sys.exit("--generator é obrigatório quando --source=llm")

    for gen in resolve_generators(args.generator):
        processar_pipeline(
            "llm",
            gen,
            transcricao_override=args.transcricao,
            noticias_override=args.noticias,
        )


if __name__ == "__main__":
    main()