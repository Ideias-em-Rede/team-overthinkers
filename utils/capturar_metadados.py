#!/usr/bin/env python3

import os
import re


TRANSCRICOES_DIR = "/home/joaopedro/Documents/team-overthinkers/dataset/transcricao_reorganizada"
METADADOS_DIR = os.path.join(TRANSCRICOES_DIR, "metadados")

# ---------------------------------------------------------------------------
# Regex
# ---------------------------------------------------------------------------
# A transcrição reorganizada (gerada pelo script principal) segue sempre
# este formato:
#
#   ## SR. NOME(PARTIDO - UF)
#
#   - primeira fala
#   - segunda fala
#
#   ## SRA. OUTRO NOME
#
#   - fala
#
# Ou seja, cada bloco de participante é:
#   1. um cabeçalho "## SR./SRA. NOME" com um "(PARTIDO - UF)" opcional;
#   2. seguido pelo corpo (as falas), até o próximo "## " ou o fim do texto.
#
# PARTICIPANTE_RE captura cabeçalho + corpo de cada bloco em um único regex,
# para não espalhar a extração em vários padrões diferentes. FALA_RE, à
# parte, extrai as falas (bullets) de dentro do corpo de um bloco.
#
# Isso deixa o regex fácil de testar isoladamente, por exemplo:
#
#   >>> m = PARTICIPANTE_RE.search("## SRA. BIA KICIS(PL - DF)\n\n- Oi.\n")
#   >>> m.group("genero"), m.group("nome"), m.group("partido_uf")
#   ('SRA.', 'BIA KICIS', 'PL - DF')

PARTICIPANTE_RE = re.compile(
    r"(?ms)"
    r"^##\s+"
    r"(?P<genero>SR\.|SRA\.)\s+"
    r"(?P<nome>[^\r\n(]+?)"
    r"(?:\((?P<partido_uf>[^)\r\n]*)\))?"
    r"\s*$"
    r"\n+"
    r"(?P<corpo>.*?)"
    r"(?=^##\s+|\Z)"
)

# Dentro do corpo de um bloco, cada fala é uma linha de bullet "- ...".
FALA_RE = re.compile(r"(?m)^-\s+(?P<fala>.+)$")


def parse_participantes(markdown_transcricao: str) -> list[dict]:
    """
    A partir da transcrição reorganizada (markdown), extrai um registro
    por participante com gênero, nome, partido, estado, quantidade de
    falas e quantidade de palavras.
    """
    participantes = []

    for match in PARTICIPANTE_RE.finditer(markdown_transcricao):
        genero = match.group("genero")
        nome = match.group("nome").strip()
        partido_uf = (match.group("partido_uf") or "").strip()
        corpo = match.group("corpo")

        # Só tratamos como "PARTIDO - UF" quando há esse separador.
        # Alguns cabeçalhos trazem apelidos ou observações entre
        # parênteses (ex.: "(MESTRE CHICO)", "(Manifestação em língua
        # estrangeira...)"), que não são partido/estado.
        partido = None
        estado = None
        if " - " in partido_uf:
            partido_bruto, estado = (
                parte.strip() for parte in partido_uf.rsplit(" - ", 1)
            )
            partido = re.sub(r"^Bloco/", "", partido_bruto).strip()

        falas = FALA_RE.findall(corpo)
        n_falas = len(falas)
        n_palavras = sum(len(fala.split()) for fala in falas)

        participantes.append(
            {
                "nome": nome,
                "genero": genero,
                "partido": partido,
                "estado": estado,
                "falas": n_falas,
                "palavras": n_palavras,
            }
        )

    return participantes


def _agrupar_por(participantes: list[dict], chave: str) -> dict:
    """Agrega falas/palavras/participantes por partido ou por estado."""
    grupos: dict[str, dict] = {}

    for p in participantes:
        valor = p[chave]
        if not valor:
            continue

        grupo = grupos.setdefault(
            valor, {"participantes": 0, "falas": 0, "palavras": 0}
        )
        grupo["participantes"] += 1
        grupo["falas"] += p["falas"]
        grupo["palavras"] += p["palavras"]

    return grupos


def montar_tabela_markdown(participantes: list[dict], target_id: int) -> str:
    """Monta o markdown final com o resumo geral e as tabelas de metadados."""
    total_participantes = len(participantes)
    homens = sum(1 for p in participantes if p["genero"] == "SR.")
    mulheres = sum(1 for p in participantes if p["genero"] == "SRA.")

    partidos = sorted({p["partido"] for p in participantes if p["partido"]})
    estados = sorted({p["estado"] for p in participantes if p["estado"]})

    linhas = [
        f"# Metadados da Audiência ID {target_id}",
        "",
        "## Resumo geral",
        "",
        "| Métrica | Valor |",
        "|---|---|",
        f"| Quantidade de participantes | {total_participantes} |",
        f"| Homens (SR.) | {homens} |",
        f"| Mulheres (SRA.) | {mulheres} |",
        f"| Quantidade de partidos | {len(partidos)} |",
        f"| Partidos | {', '.join(partidos) if partidos else '-'} |",
        f"| Quantidade de estados | {len(estados)} |",
        f"| Estados | {', '.join(estados) if estados else '-'} |",
        "",
        "## Falas e palavras por participante",
        "",
        "| Participante | Gênero | Partido | Estado | Falas | Palavras |",
        "|---|---|---|---|---|---|",
    ]

    for p in participantes:
        linhas.append(
            f"| {p['nome']} | {p['genero']} | {p['partido'] or '-'} | "
            f"{p['estado'] or '-'} | {p['falas']} | {p['palavras']} |"
        )

    linhas += [
        "",
        "## Falas e palavras por partido",
        "",
        "| Partido | Participantes | Falas | Palavras |",
        "|---|---|---|---|",
    ]

    por_partido = _agrupar_por(participantes, "partido")
    for partido in sorted(por_partido):
        agg = por_partido[partido]
        linhas.append(
            f"| {partido} | {agg['participantes']} | {agg['falas']} | {agg['palavras']} |"
        )

    linhas += [
        "",
        "## Falas e palavras por estado",
        "",
        "| Estado | Participantes | Falas | Palavras |",
        "|---|---|---|---|",
    ]

    por_estado = _agrupar_por(participantes, "estado")
    for estado in sorted(por_estado):
        agg = por_estado[estado]
        linhas.append(
            f"| {estado} | {agg['participantes']} | {agg['falas']} | {agg['palavras']} |"
        )

    return "\n".join(linhas).rstrip() + "\n"


def salvar_metadados(conteudo: str, target_id: int) -> str:
    """Salva a tabela de metadados seguindo o padrão dados_transcricao_ID.md."""
    os.makedirs(METADADOS_DIR, exist_ok=True)

    path = os.path.join(METADADOS_DIR, f"dados_transcricao_{target_id}.md")

    with open(path, "w", encoding="utf-8") as f:
        f.write(conteudo)

    return path


def capturar_metadados(markdown_transcricao: str, target_id: int) -> str:
    """
    Recebe a transcrição reorganizada (markdown) e o id da audiência,
    monta a tabela de metadados e a salva em disco. Retorna o caminho
    do arquivo salvo.
    """
    participantes = parse_participantes(markdown_transcricao)
    tabela = montar_tabela_markdown(participantes, target_id)
    return salvar_metadados(tabela, target_id)