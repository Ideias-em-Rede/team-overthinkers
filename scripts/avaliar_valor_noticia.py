import json
import os
import time
from pathlib import Path

from openai import OpenAI, RateLimitError, APIStatusError


# ============================================================
# CONFIGURAÇÃO
# ============================================================

DATASET_PATH = Path(
    "/home/joaopedro/Documents/team-overthinkers/dataset/PublicHearingBR_LDS.jsonl"
)

OUTPUT_PATH = Path(
    "/home/joaopedro/Documents/team-overthinkers/"
    "resultados_valores_noticia_amostra_1.json"
)

MODEL = "deepseek-ai/DeepSeek-V4-Flash"

TARGET_ID = 1

MAX_RETRIES = 6

api_token = os.getenv("DEEPINFRA_API_TOKEN")

if not api_token:
    raise RuntimeError(
        "A variável de ambiente DEEPINFRA_API_TOKEN "
        "não foi definida."
    )

client = OpenAI(
    api_key=api_token,
    base_url="https://api.deepinfra.com/v1/openai",
)


# ============================================================
# PROTOCOLO DE LLM-AS-A-JUDGE
# ============================================================

SYSTEM_PROMPT = r"""
Você é um avaliador especializado em jornalismo, teoria do gatekeeping
e análise de noticiabilidade.

CONTEXTO TEÓRICO
================

A Teoria do Gatekeeping procura compreender como informações passam
por processos de seleção e filtragem antes de chegar ao público.

No jornalismo, o gatekeeper participa da seleção e construção das
notícias. Diante de um fluxo muito grande de acontecimentos, apenas
uma parcela consegue atravessar os diferentes "portões" e chegar ao
produto jornalístico.

Nesse processo, os valores-notícia são atributos que ajudam a
determinar quais acontecimentos possuem maior probabilidade de serem
selecionados e transformados em notícia.

Este estudo utiliza como base teórica a discussão de Shoemaker e Vos
(2011, p. 41–42), apresentada nas fontes utilizadas nesta pesquisa.
Os autores observam que listas de atributos de notícia geralmente
incluem alguns ou todos os seguintes fatores:

- proximidade;
- importância;
- impacto ou consequência;
- interesse;
- conflito ou controvérsia;
- sensacionalismo;
- proeminência;
- novidade, estranheza ou raridade.

Esses fatores constituem a BASE TEÓRICA da avaliação.

IMPORTANTE:
As definições operacionais apresentadas abaixo são uma
operacionalização específica deste estudo para permitir a anotação
sistemática das matérias da Agência Câmara de Notícias. Elas não
devem ser tratadas como citações literais de Shoemaker e Vos.

OBJETIVO DA AVALIAÇÃO
====================

Queremos identificar quais valores-notícia são OBSERVÁVEIS na matéria
jornalística fornecida.

A matéria deve ser analisada como um produto jornalístico.

A tarefa NÃO é descobrir subjetivamente quais critérios o jornalista
"teve na cabeça" ao escrever a matéria.

A tarefa NÃO é determinar quais critérios a Agência Câmara de Notícias
declara oficialmente utilizar.

A tarefa é identificar quais valores-notícia aparecem de maneira
observável no conteúdo, no enquadramento e na apresentação da notícia.

Portanto:

MATÉRIA → EVIDÊNCIAS TEXTUAIS → VALORES-NOTÍCIA OBSERVÁVEIS

Não faça inferências sobre intenções editoriais que não possam ser
sustentadas pelo próprio texto.

IDIOMA DA AVALIAÇÃO
===================

A resposta deve ser 100% em português do Brasil.

Isso inclui:
- todas as chaves do JSON;
- todos os valores;
- todas as classificações;
- todas as justificativas;
- todos os demais campos da resposta.

NÃO use palavras ou chaves em inglês na resposta.

As únicas exceções são palavras que façam parte literalmente de uma
citação retirada da própria notícia e que estejam presentes no texto
original.

CLASSIFICAÇÕES PERMITIDAS
=========================

Use EXATAMENTE uma das três classificações abaixo para cada critério:

- "PRESENTE"
- "AUSENTE"
- "INDETERMINADO"

Use:

PRESENTE
--------
Quando houver evidência textual suficiente de que o valor-notícia está
presente na construção da matéria.

AUSENTE
-------
Quando não houver evidência textual suficiente para considerar que o
valor-notícia está presente.

INDETERMINADO
-------------
Quando houver indícios relevantes, mas a decisão não puder ser feita
com segurança utilizando exclusivamente o texto da notícia.

REGRAS GERAIS
=============

1. Avalie cada valor-notícia independentemente.

2. Mais de um valor-notícia pode estar presente simultaneamente.

3. Não existe um número mínimo ou máximo de valores-notícia que uma
   matéria deve possuir.

4. Marque PRESENTE somente quando houver evidência textual suficiente
   para sustentar a classificação.

5. Marque AUSENTE quando não houver evidência suficiente.

6. Marque INDETERMINADO quando existirem indícios, mas a classificação
   exigir uma inferência relevante que não possa ser resolvida apenas
   pelo texto.

7. Toda evidência deve ser retirada literalmente da matéria.

8. Não invente, complete ou reformule as evidências.

9. Não utilize informações externas ao texto.

10. Não utilize conhecimento prévio sobre pessoas, instituições,
    acontecimentos históricos ou contexto político para justificar uma
    classificação.

11. Não utilize a transcrição da audiência.

12. Não utilize os metadados do dataset.

13. Não avalie se a notícia é verdadeira ou falsa.

14. Não avalie se a notícia é boa ou ruim.

15. Não avalie imparcialidade.

16. Não avalie viés político.

17. Não avalie se o jornalista tomou uma decisão correta.

18. Não avalie quais informações deveriam ter sido incluídas.

19. Não trate a simples presença de uma pessoa, instituição ou tema
    como evidência suficiente de qualquer valor-notícia.

20. A existência de uma característica no mundo real não é suficiente.
    O critério precisa ser observável na maneira como o acontecimento
    aparece e é construído no texto.

21. A justificativa deve ser derivada exclusivamente das evidências
    apresentadas.

22. Não faça afirmações sobre frequência, importância histórica,
    recorrência ou relevância social de um acontecimento se essas
    informações não estiverem presentes na própria matéria.

23. Não introduza na justificativa nenhum fato que não possa ser
    sustentado pela evidência apresentada.

24. Não confunda RECÊNCIA com NOVIDADE.

25. Não confunda IMPORTÂNCIA com IMPACTO OU CONSEQUÊNCIA.

26. Não confunda CONFLITO OU CONTROVÉRSIA com SENSACIONALISMO.

27. Não confunda PROEMINÊNCIA com simples menção de uma autoridade.

28. Não infira PROXIMIDADE apenas porque o acontecimento ocorreu
    no Brasil.

29. Não use a frequência com que o tema aparece em outros meios de
    comunicação como evidência, pois esse conhecimento não está
    disponível na matéria.

30. Quando não houver evidência clara, seja conservador e prefira
    AUSENTE ou INDETERMINADO.

VALORES-NOTÍCIA
===============

1. PROXIMIDADE
--------------

Base teórica:
Proximidade é um dos atributos de notícia listados por
Shoemaker e Vos.

Definição operacional deste estudo:
A matéria apresenta uma relação de proximidade entre o acontecimento
e seu público, podendo ser geográfica, política, institucional,
social ou relacionada diretamente ao contexto de atuação do veículo.

Para marcar PRESENTE, deve existir evidência textual dessa relação.

Possíveis evidências:
- acontecimento ocorrido em local diretamente relacionado ao público;
- consequência para uma comunidade ou grupo específico;
- relação direta com a instituição ou esfera política coberta;
- proximidade institucional explicitamente apresentada no texto.

Não marque PRESENTE apenas porque:
- a notícia está em português;
- o acontecimento ocorreu no Brasil;
- a Câmara está envolvida;
- a matéria foi publicada pela Agência Câmara.

2. IMPORTÂNCIA
--------------

Base teórica:
Importância é um dos atributos de notícia listados por
Shoemaker e Vos.

Definição operacional deste estudo:
O texto apresenta o acontecimento como significativo ou relevante
para uma questão pública, institucional ou social.

Pode aparecer por meio de:
- relevância institucional;
- importância para o funcionamento de uma instituição;
- relevância explícita para uma questão pública;
- referência a decisões ou acontecimentos apresentados como
  significativos.

Não marque PRESENTE apenas porque você, como avaliador, considera
o assunto importante.

A classificação deve ser sustentada pela forma como a matéria
apresenta o assunto.

3. IMPACTO_OU_CONSEQUENCIA
--------------------------

Base teórica:
Impacto ou consequência é um dos atributos de notícia listados por
Shoemaker e Vos.

Definição operacional deste estudo:
A matéria apresenta consequências, efeitos ou impactos decorrentes
do acontecimento para pessoas, instituições, políticas públicas,
direitos, economia ou sociedade.

Deve haver alguma relação explícita entre o acontecimento e suas
consequências.

Exemplos:
- uma decisão produz efeitos sobre determinada população;
- uma medida altera uma política pública;
- uma ação gera consequências institucionais;
- um acontecimento provoca perdas, mudanças ou efeitos sociais.

Não marque PRESENTE apenas porque o tema parece importante.

IMPORTÂNCIA não é sinônimo de IMPACTO.

4. INTERESSE
------------

Base teórica:
Interesse é um dos atributos de notícia listados por
Shoemaker e Vos.

Definição operacional deste estudo:
A matéria apresenta elementos que tornam o acontecimento
especialmente atraente ou relevante para a atenção do público,
de acordo com o que é explicitamente construído no texto.

Pode incluir:
- efeitos diretos sobre cidadãos ou grupos;
- elementos de interesse humano;
- situações que despertam curiosidade;
- aspectos apresentados como particularmente relevantes para
  a atenção do público.

Não use INTERESSE como sinônimo de IMPORTÂNCIA.

IMPORTÂNCIA pergunta:
"O acontecimento é apresentado como significativo?"

INTERESSE pergunta:
"Há elementos que tornam o acontecimento especialmente atraente
ou relevante para a atenção do público?"

5. CONFLITO_OU_CONTROVERSIA
---------------------------

Base teórica:
Conflito ou controvérsia é um dos atributos de notícia listados por
Shoemaker e Vos.

Definição operacional deste estudo:
A matéria apresenta explicitamente oposição, desacordo, disputa,
acusação, contestação ou posições incompatíveis entre pessoas,
grupos, instituições ou perspectivas.

Evidências possíveis:
- acusações e respostas;
- posições políticas opostas;
- disputas institucionais;
- divergências explícitas;
- contestação entre participantes;
- controvérsias apresentadas no texto.

Não marque PRESENTE apenas porque existem várias pessoas ou opiniões.

A presença de opiniões diferentes só constitui CONFLITO OU
CONTROVÉRSIA quando essas posições são apresentadas como oposição,
contestação, disputa ou divergência substantiva.

6. SENSACIONALISMO
------------------

Base teórica:
Sensacionalismo é um dos atributos de notícia listados por
Shoemaker e Vos.

Definição operacional deste estudo:
A matéria apresenta o acontecimento de maneira explicitamente
sensacionalista, extraordinária, emocionalmente carregada ou
exageradamente impactante, de modo a intensificar a atenção do leitor.

Procure evidências como:
- linguagem explicitamente sensacionalista;
- dramatização exagerada;
- formulações emocionalmente carregadas;
- destaque extraordinário;
- construção deliberadamente chocante ou alarmante.

IMPORTANTE:
CONFLITO OU CONTROVÉRSIA não implica automaticamente
SENSACIONALISMO.

Uma notícia pode apresentar conflito forte de maneira factual,
sem ser sensacionalista.

Também não classifique como sensacionalismo simplesmente porque
a matéria relata uma acusação grave.

7. PROEMINÊNCIA
---------------

Base teórica:
Proeminência é um dos atributos de notícia listados por
Shoemaker e Vos.

Definição operacional deste estudo:
A matéria dá destaque substantivo a pessoas, instituições,
organizações ou autoridades que possuem posição ou reconhecimento
social, político ou institucional relevante.

A simples menção de uma autoridade não é suficiente.

O ator deve desempenhar papel substantivo na construção da notícia.

Não considere automaticamente toda pessoa que ocupa cargo público
como proeminente para fins desta classificação.

A proeminência deve ser observável na forma como o ator participa
da matéria.

8. NOVIDADE_ESTRANHEZA_OU_RARIDADE
-----------------------------------

Base teórica:
Shoemaker e Vos incluem novidade, estranheza ou raridade entre
os atributos de notícia.

Definição operacional deste estudo:
Marque PRESENTE quando a matéria apresentar explicitamente pelo
menos uma destas características:

NOVIDADE:
algo novo, recém-descoberto, recém-revelado ou uma mudança
recente em relação ao estado anterior;

ESTRANHEZA:
algo incomum, atípico ou fora do padrão esperado;

RARIDADE:
algo excepcionalmente pouco frequente ou raro.

IMPORTANTE:

- A simples publicação da notícia não constitui novidade.
- O simples fato de o acontecimento ter ocorrido no dia da
  publicação não constitui novidade.
- Recência não é suficiente para marcar novidade.
- Uma referência a acontecimento anterior não constitui novidade
  por si só.
- Não utilize conhecimento externo para decidir que algo é raro,
  estranho ou novo.
- O texto precisa fornecer evidência dessa propriedade.

Na justificativa, indique qual dimensão foi identificada:
"novidade", "estranheza" ou "raridade".

DIFERENCIAÇÃO ENTRE CRITÉRIOS
=============================

IMPORTÂNCIA vs. IMPACTO_OU_CONSEQUENCIA
----------------------------------------
IMPORTÂNCIA:
o acontecimento é apresentado como significativo.

IMPACTO_OU_CONSEQUENCIA:
o acontecimento possui ou produz consequências identificáveis.

Uma matéria pode apresentar IMPORTÂNCIA sem apresentar
IMPACTO_OU_CONSEQUENCIA explicitamente.

CONFLITO_OU_CONTROVERSIA vs. SENSACIONALISMO
---------------------------------------------
CONFLITO_OU_CONTROVERSIA:
há oposição, disputa, contestação ou divergência.

SENSACIONALISMO:
a apresentação possui caráter explicitamente sensacionalista,
exagerado ou emocionalmente intensificado.

Conflito sozinho não implica sensacionalismo.

PROEMINÊNCIA vs. IMPORTÂNCIA
----------------------------
PROEMINÊNCIA:
a relevância está associada à posição ou reconhecimento de um ator.

IMPORTÂNCIA:
a relevância está associada ao significado do acontecimento ou
questão apresentada.

PROXIMIDADE vs. IMPORTÂNCIA
---------------------------
PROXIMIDADE:
relação direta com o público, território, comunidade ou contexto
específico.

IMPORTÂNCIA:
significado do acontecimento.

NOVIDADE vs. RECÊNCIA
---------------------
RECÊNCIA:
o acontecimento ocorreu recentemente.

NOVIDADE:
há algo novo, uma mudança, descoberta ou revelação relevante.

Recência isolada não é suficiente para classificar NOVIDADE.

PROCESSO DE AVALIAÇÃO
=====================

Para cada um dos oito critérios:

1. Leia a matéria integralmente.

2. Procure evidências textuais que possam sustentar a presença
   do critério.

3. Verifique se a evidência realmente corresponde à definição
   operacional do critério.

4. Classifique como PRESENTE, AUSENTE ou INDETERMINADO.

5. Caso classifique como PRESENTE ou INDETERMINADO, forneça até
   dois trechos literais da matéria que sustentem a decisão.

6. Caso classifique como AUSENTE, retorne uma lista vazia de
   evidências.

7. Forneça uma justificativa de no máximo duas frases.

8. A justificativa deve explicar exclusivamente a relação entre
   a evidência textual e a definição do critério.

9. Atribua uma confiança entre 0 e 1.

10. A confiança representa sua confiança na classificação,
    e NÃO uma probabilidade estatística calibrada.

11. Não tente preencher artificialmente todos os critérios.

12. É esperado que algumas matérias tenham vários critérios
    classificados como AUSENTE.

EVIDÊNCIA E AUDITABILIDADE
==========================

A avaliação será utilizada em uma pesquisa científica.

Portanto, cada classificação deve ser auditável.

Um pesquisador humano deve conseguir olhar para a evidência
fornecida e verificar se ela realmente sustenta a classificação.

As evidências:
- devem aparecer literalmente na notícia;
- devem ser suficientemente específicas;
- devem ser curtas;
- devem evitar trechos genéricos quando houver evidência mais direta.

Não utilize uma evidência que apenas sugira indiretamente o critério
quando houver outra evidência mais explícita disponível.

FORMATO DE SAÍDA
================

Retorne EXCLUSIVAMENTE um objeto JSON válido.

A resposta deve ser 100% em português.

Use exatamente esta estrutura:

{
  "id_amostra": 1,
  "criterios": {
    "proximidade": {
      "classificacao": "PRESENTE",
      "evidencias": [
        "trecho literal da notícia"
      ],
      "justificativa": "Justificativa curta baseada exclusivamente na evidência.",
      "confianca": 0.95
    },
    "importancia": {
      "classificacao": "AUSENTE",
      "evidencias": [],
      "justificativa": "Não há evidência textual suficiente para classificar este critério como presente.",
      "confianca": 0.90
    },
    "impacto_ou_consequencia": {
      "classificacao": "INDETERMINADO",
      "evidencias": [
        "trecho literal da notícia"
      ],
      "justificativa": "Há indícios de consequências, mas a evidência textual não permite uma classificação suficientemente segura.",
      "confianca": 0.68
    },
    "interesse": {
      "classificacao": "PRESENTE",
      "evidencias": [
        "trecho literal da notícia"
      ],
      "justificativa": "O texto apresenta elementos que tornam o assunto especialmente relevante para a atenção do público.",
      "confianca": 0.94
    },
    "conflito_ou_controversia": {
      "classificacao": "PRESENTE",
      "evidencias": [
        "trecho literal da notícia"
      ],
      "justificativa": "A matéria apresenta posições explicitamente opostas sobre o acontecimento.",
      "confianca": 0.97
    },
    "sensacionalismo": {
      "classificacao": "AUSENTE",
      "evidencias": [],
      "justificativa": "Não há evidência textual suficiente de apresentação sensacionalista.",
      "confianca": 0.91
    },
    "proeminencia": {
      "classificacao": "PRESENTE",
      "evidencias": [
        "trecho literal da notícia"
      ],
      "justificativa": "A matéria dá destaque substantivo a atores com posição institucional ou reconhecimento relevante.",
      "confianca": 0.95
    },
    "novidade_estranheza_ou_raridade": {
      "classificacao": "PRESENTE",
      "evidencias": [
        "trecho literal da notícia"
      ],
      "justificativa": "A matéria apresenta explicitamente um acontecimento como novo, estranho ou raro.",
      "confianca": 0.82
    }
  }
}

REGRAS RÍGIDAS DO JSON
======================

- A chave principal deve ser exatamente "id_amostra".
- A chave dos critérios deve ser exatamente "criterios".
- As oito chaves dos critérios devem ser exatamente aquelas definidas
  neste protocolo.
- "classificacao" deve ser exatamente:
  "PRESENTE", "AUSENTE" ou "INDETERMINADO".
- "evidencias" deve ser uma lista com no máximo dois trechos.
- Os trechos devem aparecer literalmente na notícia.
- "justificativa" deve ter no máximo duas frases.
- "confianca" deve ser um número entre 0 e 1.
- Não adicione critérios.
- Não remova critérios.
- Não adicione comentários.
- Não adicione markdown.
- Não coloque texto antes do JSON.
- Não coloque texto depois do JSON.
- Não use chaves, classificações ou explicações em inglês.
"""


# ============================================================
# LEITURA DA AMOSTRA
# ============================================================

def carregar_amostra(
    caminho_dataset: Path,
    id_alvo: int = 1,
) -> dict:
    """
    Lê o JSONL até encontrar a amostra com o ID solicitado.
    """

    if not caminho_dataset.exists():
        raise FileNotFoundError(
            f"Dataset não encontrado em: {caminho_dataset}"
        )

    with caminho_dataset.open("r", encoding="utf-8") as arquivo:
        for numero_linha, linha in enumerate(arquivo, start=1):

            linha = linha.strip()

            if not linha:
                continue

            try:
                amostra = json.loads(linha)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"JSON inválido na linha {numero_linha}: {exc}"
                ) from exc

            if amostra.get("id") == id_alvo:
                return amostra

    raise ValueError(
        f"Amostra com id={id_alvo} não encontrada no dataset."
    )


sample = carregar_amostra(
    DATASET_PATH,
    id_alvo=TARGET_ID,
)

article = sample.get("materia")

if not isinstance(article, str) or not article.strip():
    raise ValueError(
        "O campo 'materia' da amostra está vazio "
        "ou não é uma string."
    )


# ============================================================
# CHAMADA AO MODELO COM RETRY
# ============================================================

def chamar_modelo_com_retry(
    cliente: OpenAI,
    *,
    modelo: str,
    mensagens: list,
    temperatura: float = 0.0,
    max_tokens: int = 5000,
    max_tentativas: int = 6,
):
    """
    Faz a chamada à API com exponential backoff para erros
    temporários, como 429 e erros 5xx.
    """

    for tentativa in range(max_tentativas):

        try:

            print(
                f"Enviando requisição ao modelo "
                f"{modelo} "
                f"(tentativa {tentativa + 1}/{max_tentativas})..."
            )

            return cliente.chat.completions.create(
                model=modelo,
                messages=mensagens,
                temperature=temperatura,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )

        except RateLimitError:

            tempo_espera = 2 ** tentativa

            print(
                "Modelo ocupado ou limite temporário atingido."
            )
            print(
                f"Aguardando {tempo_espera} segundos antes "
                "de tentar novamente..."
            )

            if tentativa == max_tentativas - 1:
                raise

            time.sleep(tempo_espera)

        except APIStatusError as exc:

            codigo = exc.status_code

            if codigo in {500, 502, 503, 504}:

                tempo_espera = 2 ** tentativa

                print(
                    f"Erro temporário HTTP {codigo}."
                )
                print(
                    f"Aguardando {tempo_espera} segundos antes "
                    "de tentar novamente..."
                )

                if tentativa == max_tentativas - 1:
                    raise

                time.sleep(tempo_espera)

            else:
                raise


# ============================================================
# PROMPT DA AMOSTRA
# ============================================================

USER_PROMPT = f"""
Avalie a seguinte notícia de acordo com o protocolo fornecido.

ID DA AMOSTRA:
{sample["id"]}

NOTÍCIA:
--------------------
{article}
--------------------

LEMBRETES IMPORTANTES:

- use somente o texto da notícia;
- não use a transcrição da audiência;
- não use os metadados;
- não utilize conhecimento externo;
- avalie exatamente os oito critérios definidos no protocolo;
- forneça evidências literais da notícia;
- use exclusivamente as classificações PRESENTE, AUSENTE
  ou INDETERMINADO;
- toda a resposta deve estar em português do Brasil;
- retorne somente JSON válido.
"""


# ============================================================
# EXECUÇÃO
# ============================================================

response = chamar_modelo_com_retry(
    client,
    modelo=MODEL,
    mensagens=[
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": USER_PROMPT,
        },
    ],
    temperatura=0.0,
    max_tokens=5000,
    max_tentativas=MAX_RETRIES,
)


# ============================================================
# LEITURA DA RESPOSTA
# ============================================================

raw_output = response.choices[0].message.content

if not raw_output:
    raise ValueError(
        "O modelo retornou uma resposta vazia."
    )


print("\nResposta bruta do modelo:\n")
print(raw_output)


# ============================================================
# CONVERSÃO PARA JSON
# ============================================================

try:

    evaluation = json.loads(raw_output)

except json.JSONDecodeError as exc:

    raise ValueError(
        "O modelo não retornou um JSON válido."
    ) from exc


# ============================================================
# VALIDAÇÃO DO ID
# ============================================================

if evaluation.get("id_amostra") != sample["id"]:

    raise ValueError(
        "O id_amostra retornado pelo modelo não corresponde "
        "ao ID da amostra avaliada."
    )


# ============================================================
# VALIDAÇÃO DA ESTRUTURA
# ============================================================

required_criteria = {
    "proximidade",
    "importancia",
    "impacto_ou_consequencia",
    "interesse",
    "conflito_ou_controversia",
    "sensacionalismo",
    "proeminencia",
    "novidade_estranheza_ou_raridade",
}


if "criterios" not in evaluation:

    raise ValueError(
        "A resposta do modelo não contém a chave 'criterios'."
    )


returned_criteria = set(
    evaluation["criterios"].keys()
)


missing = required_criteria - returned_criteria

extra = returned_criteria - required_criteria


if missing:

    raise ValueError(
        "Critérios ausentes na resposta do modelo: "
        f"{sorted(missing)}"
    )


if extra:

    raise ValueError(
        "Critérios inesperados na resposta do modelo: "
        f"{sorted(extra)}"
    )


# ============================================================
# VALIDAÇÃO DOS CAMPOS
# ============================================================

valid_labels = {
    "PRESENTE",
    "AUSENTE",
    "INDETERMINADO",
}


for criterio, resultado in evaluation["criterios"].items():

    if not isinstance(resultado, dict):

        raise ValueError(
            f"O valor do critério '{criterio}' "
            "deve ser um objeto JSON."
        )


    # --------------------------------------------------------
    # CLASSIFICAÇÃO
    # --------------------------------------------------------

    classificacao = resultado.get("classificacao")

    if classificacao not in valid_labels:

        raise ValueError(
            f"Classificação inválida para "
            f"'{criterio}': {classificacao}"
        )


    # --------------------------------------------------------
    # EVIDÊNCIAS
    # --------------------------------------------------------

    evidencias = resultado.get("evidencias")

    if not isinstance(evidencias, list):

        raise ValueError(
            f"'evidencias' deveria ser uma lista "
            f"para '{criterio}'."
        )


    if len(evidencias) > 2:

        raise ValueError(
            f"O critério '{criterio}' possui mais "
            "de duas evidências."
        )


    for evidencia in evidencias:

        if not isinstance(evidencia, str):

            raise ValueError(
                f"Todas as evidências de '{criterio}' "
                "devem ser textos."
            )

        if evidencia.strip() and evidencia not in article:

            raise ValueError(
                f"Evidência de '{criterio}' não encontrada "
                "literalmente na notícia:\n{evidencia}"
            )


    # --------------------------------------------------------
    # JUSTIFICATIVA
    # --------------------------------------------------------

    justificativa = resultado.get("justificativa")

    if not isinstance(justificativa, str):

        raise ValueError(
            f"'justificativa' deveria ser uma string "
            f"para '{criterio}'."
        )


    # --------------------------------------------------------
    # CONFIANÇA
    # --------------------------------------------------------

    confianca = resultado.get("confianca")

    if isinstance(confianca, bool) or not isinstance(
        confianca,
        (int, float),
    ):

        raise ValueError(
            f"Confiança inválida para '{criterio}': "
            f"{confianca}"
        )


    if not 0 <= confianca <= 1:

        raise ValueError(
            f"Confiança fora do intervalo [0, 1] "
            f"para '{criterio}': {confianca}"
        )


# ============================================================
# SALVAMENTO DO RESULTADO
# ============================================================

OUTPUT_PATH.parent.mkdir(
    parents=True,
    exist_ok=True,
)


with OUTPUT_PATH.open(
    "w",
    encoding="utf-8",
) as arquivo:

    json.dump(
        evaluation,
        arquivo,
        ensure_ascii=False,
        indent=2,
    )


# ============================================================
# RESULTADO FINAL
# ============================================================

print("\n" + "=" * 70)
print("AVALIAÇÃO CONCLUÍDA COM SUCESSO")
print("=" * 70)

print(
    json.dumps(
        evaluation,
        ensure_ascii=False,
        indent=2,
    )
)

print()
print(f"Resultado salvo em: {OUTPUT_PATH}")