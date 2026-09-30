#!/usr/bin/env python3

import json
import re
import sys
import unicodedata

from utils.salvar_dados import salvar_transcricao_em_json


DATASET = "dataset/PublicHearingBR_LDS.jsonl"


SPEECH_RE = re.compile(
    r"(?ms)^(?P<gender>O SR\.|A SRA\.)\s+"
    r"(?P<speaker>[^\r\n(]+?)"
    r"(?:\s*\((?P<meta>[^)\r\n]*)\))?"
    r"\s*[-–—]\s*"
    r"(?P<fala>.*?)(?=^(?:O SR\.|A SRA\.)\s+|\Z)"
)


def normalizar_texto(texto: str) -> str:
    """
    Normaliza um texto para fins de comparação/agrupamento.

    Remove diferenças de:
    - maiúsculas e minúsculas;
    - acentuação;
    - espaços duplicados.

    O texto original não é alterado no JSON final.
    """
    texto = " ".join(texto.split())

    texto = unicodedata.normalize("NFKD", texto)

    texto = "".join(
        caractere
        for caractere in texto
        if not unicodedata.combining(caractere)
    )

    return texto.casefold()


def resolver_participante(match: re.Match) -> dict:
    """
    A partir de um match de SPEECH_RE, resolve os dados do participante:
    gênero, nome, partido e estado (quando disponíveis).
    """
    genero = (
        "masculino"
        if match.group("gender") == "O SR."
        else "feminino"
    )

    speaker = match.group("speaker").strip()
    meta = (match.group("meta") or "").strip()

    nome = speaker
    partido_uf = meta

    # Quando o cabeçalho traz um cargo antes dos parênteses,
    # como:
    #
    # PRESIDENTE (Lucas Redecker. Bloco/PSDB - RS)
    #
    # o conteúdo do parênteses segue o padrão "Nome. Partido - UF"
    # e usamos o texto antes do ponto como nome.
    #
    # Exigimos também a presença de " - " para confirmar que é
    # esse o padrão, porque o parênteses às vezes traz outra coisa
    # com ponto, sem ser "Nome. Partido - UF" — por exemplo uma
    # anotação como:
    #
    # (Manifestação em língua estrangeira. Tradução não Simultânea.)
    #
    # Sem essa checagem, esse tipo de conteúdo era tratado como se
    # fosse o nome do participante, sobrescrevendo o nome real.
    #
    # Dividimos no ÚLTIMO ponto (e não no primeiro) porque o nome
    # pode vir precedido de um título abreviado com ponto, como em:
    #
    # PRESIDENTE (Dr. Zacharias Calil. Bloco/UNIÃO - GO)
    #
    # Dividir no primeiro ponto faz "Dr" virar o nome e
    # "Zacharias Calil. Bloco/UNIÃO" virar o partido — poluindo a
    # tabela de partidos com uma categoria falsa. O trecho de
    # partido/UF nunca contém ponto, então dividir no último ponto
    # é seguro tanto para esse caso quanto para o caso comum
    # (sem título), sem alterar o resultado antigo.
    if meta and " - " in meta and "." in meta:
        nome, partido_uf = (
            parte.strip()
            for parte in meta.rsplit(".", 1)
        )

    partido = None
    estado = None

    # Só tratamos como "PARTIDO - UF" quando há esse separador.
    # Outros conteúdos entre parênteses não são interpretados
    # como partido/estado.
    if " - " in partido_uf:
        partido_bruto, estado = (
            parte.strip()
            for parte in partido_uf.rsplit(" - ", 1)
        )

        partido = re.sub(
            r"^Bloco/",
            "",
            partido_bruto,
        ).strip()

    return {
        "genero": genero,
        "nome": nome,
        "partido": partido,
        "estado": estado,
        # Conteúdo original do parênteses, preservado sem qualquer
        # processamento. Usado apenas para o agrupamento (ver
        # `usa_meta_como_identificador`), nunca é exposto no JSON
        # final.
        "meta_bruto": meta,
    }


def usa_meta_como_identificador(participante: dict) -> bool:
    """
    Indica se o conteúdo bruto do parênteses deve compor a chave de
    agrupamento, além de nome/gênero/partido/estado.

    Isso é necessário para rótulos de cargo genéricos que não são o
    nome de uma pessoa específica, como "INTÉRPRETE". Nesses casos,
    o parênteses não traz "Nome. Partido - UF", mas sim o nome de
    quem está de fato falando, por exemplo:

    A SRA. INTÉRPRETE(SANDRA PATRÍCIA DE FARIA DO NASCIMENTO) - ...
    A SRA. INTÉRPRETE(ADRIANA LOPES) - ...

    Sem usar esse conteúdo no agrupamento, intérpretes diferentes
    eram todos agrupados como se fossem uma única pessoa chamada
    "INTÉRPRETE".

    Não usamos o conteúdo do parênteses quando ele contém "." ou
    " - ": esses casos já foram tratados como "Nome. Partido - UF"
    (ver `resolver_participante`) ou correspondem a uma anotação
    sobre a fala em si — como "Manifestação em língua estrangeira.
    Tradução não Simultânea." — que não identifica uma pessoa e não
    deve ser usada para diferenciar participantes.
    """
    meta = participante["meta_bruto"]

    return (
        bool(meta)
        and " - " not in meta
        and "." not in meta
    )


def montar_chave_agrupamento(participante: dict) -> tuple:
    """
    Cria a chave usada internamente para agrupar as falas.

    A chave normaliza nome, partido e estado para evitar que diferenças
    de capitalização ou acentuação façam o mesmo participante aparecer
    como pessoas diferentes.

    O nome original continua sendo preservado nos dados finais.
    """
    chave = [
        normalizar_texto(participante["nome"]),
        normalizar_texto(participante["genero"]),
        normalizar_texto(participante["partido"] or ""),
        normalizar_texto(participante["estado"] or ""),
    ]

    if usa_meta_como_identificador(participante):
        chave.append(
            normalizar_texto(participante["meta_bruto"])
        )

    return tuple(chave)


def main():
    if len(sys.argv) != 2:
        raise ValueError(
            f"Uso: python {sys.argv[0]} <id>"
        )

    target_id = int(sys.argv[1])

    with open(DATASET, "r", encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)

            if row.get("id") == target_id:
                break
        else:
            raise ValueError(
                f"ID {target_id} não encontrado."
            )

    grouped = {}

    for match in SPEECH_RE.finditer(row["transcricao"]):
        participante = resolver_participante(match)

        # A chave normalizada é usada somente para agrupamento.
        chave = montar_chave_agrupamento(participante)

        # Cada match da regex corresponde a um bloco de fala.
        fala = re.sub(
            r"\s+",
            " ",
            match.group("fala"),
        ).strip()

        if not fala:
            continue

        if chave not in grouped:
            grouped[chave] = {
                **participante,
                "falas": [],
            }

        grouped[chave]["falas"].append(fala)

    # --- JSON ---
    participantes = [
        {
            "nome": dados["nome"],
            "genero": dados["genero"],
            "partido": dados["partido"],
            "estado": dados["estado"],
            "falas": dados["falas"],
            "quantidade_falas": len(dados["falas"]),
            "quantidade_palavras": sum(
                len(fala.split())
                for fala in dados["falas"]
            ),
        }
        for dados in grouped.values()
    ]

    transcricao_reorganizada_json = {
        "id": target_id,
        "participantes": participantes,
    }

    path_json = salvar_transcricao_em_json(
        transcricao_reorganizada_json,
        target_id,
    )

    print(
        f"Transcrição salva em json: {path_json}"
    )


if __name__ == "__main__":
    main()