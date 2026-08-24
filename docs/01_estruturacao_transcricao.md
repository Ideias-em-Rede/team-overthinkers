# Estruturação da Transcrição

---
## Objetivo

A primeira etapa do pipeline consiste em **estruturar as transcrições das audiências públicas** do dataset `PublicHearingBR_LDS.jsonl`. Para isso, utilizamos expressões regulares para identificar os participantes e seus respectivos blocos de fala e, em seguida, organizamos os metadados extraídos.

---
## Pipeline

```mermaid
flowchart TD

    A[PublicHearingBR_LDS.jsonl] --> B[01_regex_transcricao.py]

    B --> C[transcricao_ID.json]

    C --> D[02_capturar_metadados_da_transcricao.py]

    D --> E[Metadados em Markdown]

    D --> F[Metadados em JSON consolidado]
```

O primeiro script reorganiza cada audiência a partir do seu `id`, identificando os participantes e suas respectivas falas. Ao final, os dados da transcrição reorganizada são armazenados **apenas em JSON**.

O segundo script utiliza o JSON estruturado para gerar metadados sobre os participantes, considerando gênero, partidos, estados, quantidade de falas e quantidade de palavras. Os resultados são armazenados em **Markdown** e em um **JSON consolidado**.

---
## Script 01 — Estruturação da Transcrição

O script 01 organiza a transcrição original em **blocos de fala separados por participante**.

### Execução

Execute o comando:

```bash
python3 -m scripts.01_regex_transcricao ID
```

Substitua `ID` pelo identificador da audiência que deseja processar. Por exemplo, para processar a audiência de ID `01`:

```bash
python3 -m scripts.01_regex_transcricao 01
```

O resultado é salvo em:

```text
team-overthinkers/dataset/transcricao_reorganizada/jsons
```

### Expressão Regular

#### Em uma linha

```regex
(?ms)^(?P<gender>O SR\.|A SRA\.)\s+(?P<speaker>[^\r\n(]+?)(?:\s*\((?P<meta>[^)\r\n]*)\))?\s*[-–—]\s*(?P<fala>.*?)(?=^(?:O SR\.|A SRA\.)\s+|\Z)
```

#### Versão utilizada no código

```python
SPEECH_RE = re.compile(
    r"(?ms)^(?P<gender>O SR\.|A SRA\.)\s+"
    r"(?P<speaker>[^\r\n(]+?)"
    r"(?:\s*\((?P<meta>[^)\r\n]*)\))?"
    r"\s*[-–—]\s*"
    r"(?P<fala>.*?)(?=^(?:O SR\.|A SRA\.)\s+|\Z)"
)
```

A expressão regular procura os **cabeçalhos de fala** presentes na transcrição, identificados por `O SR.` ou `A SRA.`, e utiliza esses cabeçalhos para identificar o participante e delimitar o conteúdo associado a ele.

Depois dessa identificação, cada participante passa a ter um **bloco de fala**, que reúne suas falas ao longo da audiência. Esses dados são então organizados e armazenados no JSON da transcrição reorganizada.

---
## Script 02 — Estruturação dos Metadados

Após a estruturação da transcrição em blocos de fala por participante, o script 02 identifica e organiza os seguintes metadados:

* quantidade de participantes;
* gênero;
* partidos;
* estados;
* quantidade de falas e palavras de cada participante;
* quantidade de falas e palavras de cada partido;
* quantidade de falas e palavras de cada estado.

### Execução

Execute o comando:

```bash
python3 -m scripts.02_capturar_metadados_da_transcricao ID
```

Substitua `ID` pelo identificador da audiência correspondente. Por exemplo:

```bash
python3 -m scripts.02_capturar_metadados_da_transcricao 01
```

Os metadados ficam salvos em:

```text
team-overthinkers/dataset/transcricao_reorganizada/metadados
```

Essa estrutura constitui a base para as etapas posteriores de análise e para o cruzamento entre a **transcrição** e a **notícia jornalística**.

---
## Decisões de Estrutura e Armazenamento

A transcrição reorganizada é armazenada em **arquivos JSON individuais, um para cada audiência**, em vez de um único arquivo contendo todas as transcrições.

Essa escolha foi feita porque cada audiência constitui uma unidade independente de processamento e análise. A separação permite:

* processar ou reprocessar uma audiência individualmente;
* localizar e inspecionar com facilidade eventuais problemas de estruturação;
* evitar a necessidade de carregar ou reescrever todas as transcrições quando apenas uma audiência for modificada;
* manter os arquivos de texto estruturado separados dos dados agregados.

Os metadados, por outro lado, são mantidos em um **JSON consolidado**, pois possuem natureza agregada e funcionam como uma visão geral das audiências processadas. Além disso, são gerados arquivos **Markdown** por audiência para facilitar a visualização e inspeção desses metadados.

Dessa forma, a organização dos dados segue a lógica:

```text
Transcrições reorganizadas
└── um JSON por audiência

Metadados
├── um JSON consolidado
└── arquivos Markdown por audiência
```
