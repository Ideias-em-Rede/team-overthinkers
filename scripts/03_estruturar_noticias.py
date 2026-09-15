import json
import os
import re
import time
from pathlib import Path

from openai import OpenAI


# ============================================================
# CONFIGURAÇÕES
# ============================================================

DATASET = "dataset/PublicHearingBR_LDS.jsonl"
CAMPO_TEXTO = "materia"
MODEL = "deepseek-ai/DeepSeek-V3.2"

OUTPUT_PATH = Path("dataset/noticias_reorganizadas/noticias.json")

MAX_TENTATIVAS = 5
TEMPO_ESPERA = 3


# ============================================================
# CLIENTE DEEPINFRA
# ============================================================

DEEPINFRA_TOKEN = os.getenv("DEEPINFRA_TOKEN")

if not DEEPINFRA_TOKEN:
    raise EnvironmentError(
        "A variável de ambiente DEEPINFRA_TOKEN não foi definida."
    )

client = OpenAI(
    api_key=DEEPINFRA_TOKEN,
    base_url="https://api.deepinfra.com/v1/openai",
)


# ============================================================
# PROMPT
# ============================================================

PROMPT_SISTEMA = """\
Você é um assistente que estrutura notícias jornalísticas em JSON.

Dada uma notícia, extraia:

- "assunto": um resumo em uma frase do tema central da notícia.

- "envolvidos": lista de pessoas que de fato falam, opinam ou têm
alguma posição atribuída na notícia. Para cada pessoa, extraia:

  - "nome": nome da pessoa, exatamente ou da forma mais próxima possível
ao nome utilizado na notícia.

  - "mencoes": número aproximado de vezes em que a pessoa é mencionada
ao longo da notícia.

  - "citacoes_diretas": número de citações diretas atribuídas à pessoa.

  - "posicao_no_texto": posição de maior destaque em que a pessoa aparece.
Use apenas uma das seguintes categorias:
      - "titulo"
      - "subtitulo"
      - "inicio"
      - "corpo"

  - "opinioes": lista de declarações, argumentos, avaliações ou posições
atribuídas explicitamente à pessoa no texto. Cada item deve representar
uma opinião ou posicionamento identificável na notícia. Quando o texto
original tiver uma citação direta relevante, mantenha as aspas.

Regras:

- Inclua apenas pessoas que de fato falam, opinam ou têm alguma posição
atribuída na notícia.

- Não inclua pessoas apenas citadas de passagem sem uma opinião ou posição
atribuída.

- Não invente informações que não estejam no texto.

- Não inferir partido, estado ou gênero.

- Não adicione campos diferentes dos especificados.

- "mencoes" deve representar a quantidade de vezes em que o nome ou
referência inequívoca à pessoa aparece na notícia.

- "citacoes_diretas" deve contar somente declarações apresentadas como
fala direta da pessoa.

- Em "posicao_no_texto", considere:
  - "titulo": aparece no título;
  - "subtitulo": aparece no subtítulo/linha fina;
  - "inicio": aparece nos primeiros parágrafos da matéria;
  - "corpo": aparece somente posteriormente no corpo da matéria.

- "opinioes" deve conter apenas opiniões, argumentos, avaliações ou
posicionamentos efetivamente atribuídos à pessoa. Não transforme fatos
neutros em opiniões.

- "quantidade_opinioes" NÃO deve ser gerado por você. Esse campo será
calculado posteriormente pelo script.

Responda APENAS com um objeto JSON válido, sem nenhum texto antes ou depois,
sem blocos de código markdown (sem ```).

O JSON deve seguir exatamente este formato:

{
  "assunto": "...",
  "envolvidos": [
    {
      "nome": "...",
      "mencoes": 0,
      "citacoes_diretas": 0,
      "posicao_no_texto": "...",
      "opinioes": [
        "...",
        "..."
      ]
    }
  ]
}
"""


# ============================================================
# LIMPEZA DO JSON
# ============================================================

def limpar_json(texto: str) -> str:
    """
    Remove cercas de código markdown caso o modelo as retorne.
    """
    texto = texto.strip()

    texto = re.sub(
        r"^```(?:json)?\s*",
        "",
        texto,
        flags=re.IGNORECASE
    )

    texto = re.sub(
        r"\s*```$",
        "",
        texto
    )

    return texto.strip()


# ============================================================
# CHAMADA AO LLM
# ============================================================

def estruturar_com_llm(texto_noticia: str) -> dict:
    """
    Envia uma notícia ao LLM.

    Faz até MAX_TENTATIVAS tentativas em caso de erro.

    IMPORTANTE:
    Há uma espera de TEMPO_ESPERA segundos após TODA chamada à API,
    seja ela bem-sucedida ou não.
    """

    ultimo_erro = None

    for tentativa in range(1, MAX_TENTATIVAS + 1):

        try:
            print(
                f"    Tentativa {tentativa}/{MAX_TENTATIVAS}..."
            )

            resposta = client.chat.completions.create(
                model=MODEL,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": PROMPT_SISTEMA
                    },
                    {
                        "role": "user",
                        "content": texto_noticia
                    },
                ],
            )

            # Toda chamada à API é seguida por 3 segundos de espera.
            print(
                f"    Aguardando {TEMPO_ESPERA}s após a chamada..."
            )
            time.sleep(TEMPO_ESPERA)

            if not resposta.choices:
                raise ValueError(
                    "A API não retornou nenhuma escolha."
                )

            conteudo = resposta.choices[0].message.content

            if not conteudo:
                raise ValueError(
                    "O modelo retornou conteúdo vazio."
                )

            bruto = limpar_json(conteudo)

            try:
                estrutura = json.loads(bruto)
            except json.JSONDecodeError as erro:
                raise ValueError(
                    f"O modelo não retornou JSON válido:\n{bruto}"
                ) from erro

            if not isinstance(estrutura, dict):
                raise ValueError(
                    "O resultado retornado pelo modelo não é um objeto JSON."
                )

            return estrutura

        except Exception as erro:

            ultimo_erro = erro

            print(
                f"    Erro na tentativa {tentativa}: {erro}"
            )

            # Se ainda haverá outra tentativa, o sleep da chamada
            # já ocorreu antes de entrar novamente no loop.
            if tentativa < MAX_TENTATIVAS:
                print(
                    "    Nova tentativa será iniciada após "
                    f"{TEMPO_ESPERA}s."
                )

    raise RuntimeError(
        f"Falha após {MAX_TENTATIVAS} tentativas."
    ) from ultimo_erro


# ============================================================
# NORMALIZAÇÃO DA RESPOSTA
# ============================================================

def normalizar_estrutura(
    estrutura_llm: dict,
    target_id: int
) -> dict:
    """
    Garante o formato final do JSON.

    O ID é definido exclusivamente pelo script.
    Campos não permitidos pelo schema são descartados.
    """

    envolvidos_normalizados = []

    envolvidos = estrutura_llm.get("envolvidos", [])

    if not isinstance(envolvidos, list):
        envolvidos = []

    for pessoa in envolvidos:

        if not isinstance(pessoa, dict):
            continue

        nome = pessoa.get("nome")

        if not nome:
            continue

        opinioes = pessoa.get("opinioes", [])

        if not isinstance(opinioes, list):
            opinioes = []

        opinioes = [
            str(opiniao).strip()
            for opiniao in opinioes
            if opiniao is not None and str(opiniao).strip()
        ]

        # Garante que mencoes seja inteiro.
        mencoes = pessoa.get("mencoes", 0)

        try:
            mencoes = int(mencoes)
        except (TypeError, ValueError):
            mencoes = 0

        # Garante que citacoes_diretas seja inteiro.
        citacoes_diretas = pessoa.get("citacoes_diretas", 0)

        try:
            citacoes_diretas = int(citacoes_diretas)
        except (TypeError, ValueError):
            citacoes_diretas = 0

        posicao = pessoa.get("posicao_no_texto")

        posicoes_validas = {
            "titulo",
            "subtitulo",
            "inicio",
            "corpo",
        }

        if posicao not in posicoes_validas:
            posicao = None

        pessoa_normalizada = {
            "nome": str(nome).strip(),
            "mencoes": mencoes,
            "citacoes_diretas": citacoes_diretas,
            "posicao_no_texto": posicao,
            "opinioes": opinioes,
            "quantidade_opinioes": len(opinioes),
        }

        envolvidos_normalizados.append(
            pessoa_normalizada
        )

    # O ID vem EXCLUSIVAMENTE do dataset/script.
    return {
        "id": target_id,
        "assunto": estrutura_llm.get("assunto"),
        "envolvidos": envolvidos_normalizados,
    }


# ============================================================
# LEITURA DO DATASET
# ============================================================

def carregar_noticias(path: str) -> list[dict]:
    """
    Lê todas as notícias do arquivo JSONL.
    """

    noticias = []

    with open(path, "r", encoding="utf-8") as f:

        for numero_linha, line in enumerate(f, start=1):

            line = line.strip()

            if not line:
                continue

            try:
                row = json.loads(line)

            except json.JSONDecodeError as erro:

                print(
                    f"[AVISO] Linha {numero_linha} ignorada: "
                    f"JSON inválido. Erro: {erro}"
                )
                continue

            if "id" not in row:

                print(
                    f"[AVISO] Linha {numero_linha} ignorada: "
                    "não possui campo 'id'."
                )
                continue

            if CAMPO_TEXTO not in row:

                print(
                    f"[AVISO] Notícia ID {row['id']} ignorada: "
                    f"não possui campo '{CAMPO_TEXTO}'."
                )
                continue

            noticias.append(row)

    return noticias


# ============================================================
# CARREGAR RESULTADOS EXISTENTES
# ============================================================

def carregar_resultados_existentes(
    output_path: Path
) -> tuple[list[dict], set]:
    """
    Carrega resultados já salvos.

    Apenas registros sem o campo "erro" são considerados
    processados com sucesso.

    Registros com erro serão tentados novamente.
    """

    if not output_path.exists():
        return [], set()

    try:

        with open(
            output_path,
            "r",
            encoding="utf-8"
        ) as f:

            dados = json.load(f)

    except (json.JSONDecodeError, OSError) as erro:

        print(
            f"[AVISO] Não foi possível ler o arquivo existente: {erro}"
        )

        return [], set()

    if not isinstance(dados, list):

        print(
            "[AVISO] O arquivo existente não contém uma lista JSON. "
            "Será iniciado um novo resultado."
        )

        return [], set()

    processados = []

    ids_processados = set()

    for item in dados:

        if not isinstance(item, dict):
            continue

        target_id = item.get("id")

        if target_id is None:
            continue

        # Somente sucesso é considerado processado.
        if "erro" not in item:

            processados.append(item)
            ids_processados.add(target_id)

    return processados, ids_processados


# ============================================================
# SALVAMENTO
# ============================================================

def salvar_resultado(
    noticias_estruturadas: list[dict],
    output_path: Path
) -> None:

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    # Salva em arquivo temporário primeiro.
    # Isso reduz o risco de corromper o JSON se o programa for
    # interrompido durante a gravação.
    temp_path = output_path.with_suffix(".tmp")

    with open(
        temp_path,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            noticias_estruturadas,
            f,
            ensure_ascii=False,
            indent=2
        )

        f.flush()
        os.fsync(f.fileno())

    temp_path.replace(output_path)


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("ESTRUTURAÇÃO DAS NOTÍCIAS")
    print("=" * 70)

    noticias = carregar_noticias(DATASET)

    print(
        f"\nTotal de notícias encontradas no dataset: {len(noticias)}"
    )

    if not noticias:

        raise ValueError(
            "Nenhuma notícia válida foi encontrada no dataset."
        )

    # --------------------------------------------------------
    # Carrega o que já foi processado anteriormente.
    # --------------------------------------------------------

    resultados, ids_processados = carregar_resultados_existentes(
        OUTPUT_PATH
    )

    if ids_processados:

        print(
            f"Notícias já processadas anteriormente: "
            f"{len(ids_processados)}"
        )

    restantes = [
        noticia
        for noticia in noticias
        if noticia["id"] not in ids_processados
    ]

    print(
        f"Notícias restantes para processamento: {len(restantes)}"
    )

    if not restantes:

        print(
            "\nTodas as notícias já foram processadas."
        )

        print(
            f"Arquivo: {OUTPUT_PATH}"
        )

        return

    total_restante = len(restantes)

    # --------------------------------------------------------
    # Processamento
    # --------------------------------------------------------

    for indice, row in enumerate(restantes, start=1):

        target_id = row["id"]
        texto_noticia = row[CAMPO_TEXTO]

        print(
            f"\n[{indice}/{total_restante}] "
            f"Processando notícia ID {target_id}"
        )

        try:

            estrutura_llm = estruturar_com_llm(
                texto_noticia
            )

            estrutura_final = normalizar_estrutura(
                estrutura_llm,
                target_id
            )

            # Caso exista um registro de erro anterior com esse ID,
            # ele é removido antes de adicionar o sucesso.
            resultados = [
                item
                for item in resultados
                if item.get("id") != target_id
            ]

            resultados.append(
                estrutura_final
            )

            # ------------------------------------------------
            # SALVA IMEDIATAMENTE APÓS CADA NOTÍCIA
            # ------------------------------------------------

            salvar_resultado(
                resultados,
                OUTPUT_PATH
            )

            print(
                f"    ✓ Notícia ID {target_id} processada e salva."
            )

            print(
                f"    Progresso: "
                f"{len(resultados)}/{len(noticias)} notícias salvas."
            )

        except Exception as erro:

            print(
                f"    ✗ Falha definitiva na notícia "
                f"ID {target_id}: {erro}"
            )

            # Salva o erro no JSON para deixar registrado,
            # mas esse ID NÃO será considerado processado com sucesso
            # em uma execução futura.
            resultados = [
                item
                for item in resultados
                if item.get("id") != target_id
            ]

            resultados.append(
                {
                    "id": target_id,
                    "assunto": None,
                    "envolvidos": [],
                    "erro": str(erro),
                }
            )

            salvar_resultado(
                resultados,
                OUTPUT_PATH
            )

            print(
                f"    Registro de erro salvo para o ID {target_id}."
            )

        # ----------------------------------------------------
        # A espera entre chamadas é controlada dentro de
        # estruturar_com_llm().
        #
        # Aqui NÃO fazemos outro sleep, pois isso criaria
        # 6 segundos entre notícias após uma chamada bem-sucedida.
        # ----------------------------------------------------

    # ========================================================
    # RESUMO
    # ========================================================

    sucessos = sum(
        1
        for item in resultados
        if "erro" not in item
    )

    erros = sum(
        1
        for item in resultados
        if "erro" in item
    )

    print("\n" + "=" * 70)
    print("PROCESSAMENTO FINALIZADO")
    print("=" * 70)

    print(f"Total no dataset: {len(noticias)}")
    print(f"Processadas com sucesso: {sucessos}")
    print(f"Com erro: {erros}")
    print(f"Arquivo salvo em: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()