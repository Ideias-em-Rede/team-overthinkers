# Análise dos Metadados

---
## Objetivo

Após a estruturação das transcrições e a captura dos seus metadados, a próxima etapa consiste em organizar esses dados em tabelas para a análise exploratória do corpus.

O objetivo deste script é transformar o arquivo consolidado `dados_transcricao.json` em três tabelas estruturadas que permitam observar, para cada audiência pública, a distribuição dos participantes e das falas segundo:

* partido;
* estado;
* gênero.

Essa etapa tem como finalidade produzir uma **linha de base descritiva do corpus**, antes do cruzamento entre as transcrições e as notícias jornalísticas.

O script deve atuar exclusivamente sobre os metadados já estruturados na etapa anterior. Portanto, **não deve reprocessar as transcrições, identificar participantes por expressões regulares ou recalcular as quantidades de falas e palavras**.

---
## Origem dos dados

O script (scripts/03_analisar_metadados.py) utiliza como entrada o arquivo:

```text
team-overthinkers/dataset/transcricao_reorganizada/metadados/dados_transcricao.json
```

Esse arquivo reúne os metadados de todas as audiências processadas na etapa anterior, organizados pelo `id` de cada audiência.

A estrutura contém informações sobre:

* audiência;
* participantes;
* gênero;
* partido;
* estado;
* quantidade de falas;
* quantidade de palavras.

Nesta etapa, serão utilizados apenas os dados necessários para as análises de **partido, estado e gênero**.

### Fonte da agregação: lista `participantes`, não `resumo`

Cada audiência no `dados_transcricao.json` contém dois blocos: `resumo` (com sub-blocos `genero`, `partidos` e `estados`) e `participantes` (a lista individual de cada pessoa).

**O bloco `resumo.partidos` e `resumo.estados` não deve ser usado como fonte da agregação.** Esses sub-blocos, no arquivo de origem, já omitem os participantes cujo `partido` ou `estado` é `null` — ou seja, não é possível reconstruir a categoria `NAO_INFORMADO` a partir deles, e usá-los como fonte fará com que as somas de integridade (ver seção correspondente) não fechem.

O script deve, portanto, iterar sobre a lista `participantes` de cada audiência e agregar diretamente os campos `genero`, `partido`, `estado`, `quantidade_falas` e `quantidade_palavras` de cada participante. 

---
## Regras gerais

O script deve seguir as seguintes regras:

1. Ler todas as audiências presentes em `dados_transcricao.json`.
2. Utilizar o `id` da audiência como identificador.
3. Agregar a partir da lista `participantes` de cada audiência (ver seção acima) — nunca a partir do bloco `resumo`.
4. Utilizar os valores de `quantidade_falas` e `quantidade_palavras` já presentes nos metadados, sem recalculá-los.
5. Não reprocessar o texto das transcrições.
6. Não realizar novas inferências sobre partido, estado ou gênero.
7. Quando `partido`, `estado` ou `genero` possuir valor `null`, utilizar a categoria:

```text
NAO_INFORMADO
```

8. A categoria `NAO_INFORMADO` deve participar normalmente das agregações e dos cálculos de porcentagem.
9. Todas as porcentagens devem ser calculadas em relação ao total da respectiva audiência.

### Nota sobre `NAO_INFORMADO`

No dataset atual, `partido` e `estado` são `null` em cerca de **64% dos participantes** — a maioria são jornalistas, especialistas e convidados sem mandato parlamentar, que naturalmente não têm partido ou UF associados. Isso significa que `NAO_INFORMADO` será, na prática, a categoria **majoritária** (não uma exceção rara) nas tabelas de partido e estado da maior parte das audiências. Isso é esperado e correto — não é um sinal de erro no processamento. Já em `genero`, o campo está 100% preenchido no dataset atual.

---
## Tabela de Partidos

A tabela de partidos deve organizar os participantes por partido dentro de cada audiência.

### Unidade

```text
1 linha = 1 partido em 1 audiência
```

### Campos

A tabela deve conter exatamente os seguintes campos:

* `id_audiencia`;
* `partido`;
* `quantidade_participantes_do_partido_na_audiencia`;
* `porcentagem_participantes_do_partido_sobre_total_participantes_audiencia`;
* `porcentagem_falas_do_partido_sobre_total_falas_audiencia`;
* `porcentagem_palavras_do_partido_sobre_total_palavras_audiencia`.

### Fórmulas

```text
quantidade_participantes_do_partido_na_audiencia
= número de participantes associados ao partido na audiência
```

```text
porcentagem_participantes_do_partido_sobre_total_participantes_audiencia
= quantidade_participantes_do_partido_na_audiencia
  / quantidade_total_de_participantes_na_audiencia
```

```text
quantidade_falas_do_partido_na_audiencia
= soma de quantidade_falas dos participantes associados ao partido
```

```text
porcentagem_falas_do_partido_sobre_total_falas_audiencia
= quantidade_falas_do_partido_na_audiencia
  / quantidade_total_de_falas_na_audiencia
```

```text
quantidade_palavras_do_partido_na_audiencia
= soma de quantidade_palavras dos participantes associados ao partido
```

```text
porcentagem_palavras_do_partido_sobre_total_palavras_audiencia
= quantidade_palavras_do_partido_na_audiencia
  / quantidade_total_de_palavras_na_audiencia
```

As porcentagens devem ser representadas como valores entre `0` e `1`.

---
## Tabela de Estados

A tabela de estados deve organizar os participantes por estado dentro de cada audiência.

Participantes cujo estado seja `null` devem ser agrupados na categoria:

```text
NAO_INFORMADO
```

### Unidade

```text
1 linha = 1 estado em 1 audiência
```

### Campos

A tabela deve conter exatamente os seguintes campos:

* `id_audiencia`;
* `estado`;
* `quantidade_participantes_do_estado_na_audiencia`;
* `porcentagem_participantes_do_estado_sobre_total_participantes_audiencia`;
* `porcentagem_falas_do_estado_sobre_total_falas_audiencia`;
* `porcentagem_palavras_do_estado_sobre_total_palavras_audiencia`.

### Fórmulas

```text
quantidade_participantes_do_estado_na_audiencia
= número de participantes associados ao estado na audiência
```

```text
porcentagem_participantes_do_estado_sobre_total_participantes_audiencia
= quantidade_participantes_do_estado_na_audiencia
  / quantidade_total_de_participantes_na_audiencia
```

```text
quantidade_falas_do_estado_na_audiencia
= soma de quantidade_falas dos participantes associados ao estado
```

```text
porcentagem_falas_do_estado_sobre_total_falas_audiencia
= quantidade_falas_do_estado_na_audiencia
  / quantidade_total_de_falas_na_audiencia
```

```text
quantidade_palavras_do_estado_na_audiencia
= soma de quantidade_palavras dos participantes associados ao estado
```

```text
porcentagem_palavras_do_estado_sobre_total_palavras_audiencia
= quantidade_palavras_do_estado_na_audiencia
  / quantidade_total_de_palavras_na_audiencia
```

As porcentagens devem ser representadas como valores entre `0` e `1`.

---
## Tabela de Gênero

A tabela de gênero deve organizar os participantes por gênero dentro de cada audiência.

Participantes cujo gênero seja `null` devem ser agrupados na categoria:

```text
NAO_INFORMADO
```

### Unidade

```text
1 linha = 1 gênero em 1 audiência
```

### Campos

A tabela deve conter exatamente os seguintes campos:

* `id_audiencia`;
* `genero`;
* `quantidade_participantes_do_genero_na_audiencia`;
* `porcentagem_participantes_do_genero_sobre_total_participantes_audiencia`;
* `porcentagem_falas_do_genero_sobre_total_falas_audiencia`;
* `porcentagem_palavras_do_genero_sobre_total_palavras_audiencia`.

### Fórmulas

```text
quantidade_participantes_do_genero_na_audiencia
= número de participantes associados ao gênero na audiência
```

```text
porcentagem_participantes_do_genero_sobre_total_participantes_audiencia
= quantidade_participantes_do_genero_na_audiencia
  / quantidade_total_de_participantes_na_audiencia
```

```text
quantidade_falas_do_genero_na_audiencia
= soma de quantidade_falas dos participantes associados ao gênero
```

```text
porcentagem_falas_do_genero_sobre_total_falas_audiencia
= quantidade_falas_do_genero_na_audiencia
  / quantidade_total_de_falas_na_audiencia
```

```text
quantidade_palavras_do_genero_na_audiencia
= soma de quantidade_palavras dos participantes associados ao gênero
```

```text
porcentagem_palavras_do_genero_sobre_total_palavras_audiencia
= quantidade_palavras_do_genero_na_audiencia
  / quantidade_total_de_palavras_na_audiencia
```

As porcentagens devem ser representadas como valores entre `0` e `1`.

---
## Tabelas geradas

Ao final da análise, devem ser produzidas as seguintes tabelas:

```text
dataset/
└── transcricao_reorganizada/
    └── analises_metadados/
        ├── tabela_partidos.csv
        ├── tabela_estados.csv
        └── tabela_genero.csv
```

Cada arquivo representa uma perspectiva diferente do corpus.

---
## Integridade dos dados

Para cada audiência, os agregados devem preservar os totais existentes nos metadados.

Na tabela de partidos:

```text
soma(quantidade_participantes_do_partido_na_audiencia) = quantidade_total_de_participantes_na_audiencia
soma(quantidade_falas_do_partido_na_audiencia)         = quantidade_total_de_falas_na_audiencia
soma(quantidade_palavras_do_partido_na_audiencia)      = quantidade_total_de_palavras_na_audiencia
```

Na tabela de estados:

```text
soma(quantidade_participantes_do_estado_na_audiencia) = quantidade_total_de_participantes_na_audiencia
soma(quantidade_falas_do_estado_na_audiencia)         = quantidade_total_de_falas_na_audiencia
soma(quantidade_palavras_do_estado_na_audiencia)      = quantidade_total_de_palavras_na_audiencia
```

Na tabela de gênero:

```text
soma(quantidade_participantes_do_genero_na_audiencia) = quantidade_total_de_participantes_na_audiencia
soma(quantidade_falas_do_genero_na_audiencia)         = quantidade_total_de_falas_na_audiencia
soma(quantidade_palavras_do_genero_na_audiencia)      = quantidade_total_de_palavras_na_audiencia
```

A inclusão da categoria `NAO_INFORMADO` garante que participantes sem partido, estado ou gênero informado não sejam excluídos dessas agregações. Como essas somas usam a lista `participantes` como fonte (e não `resumo.partidos`/`resumo.estados`, que já vêm sem os `null`), a integridade só se sustenta se a regra da seção "Fonte da agregação" for seguida.

---
## Utilização dos dados

As tabelas produzidas nesta etapa constituem a base para a análise exploratória das audiências públicas.

A partir delas, será possível investigar:

* distribuição dos participantes por partido;
* distribuição dos participantes por estado;
* distribuição dos participantes por gênero;
* distribuição das falas por partido;
* distribuição das falas por estado;
* distribuição das falas por gênero;
* distribuição das palavras por partido, estado e gênero — uma medida complementar à quantidade de falas, útil para distinguir participantes com poucas falas longas de participantes com muitas falas curtas.

Essas informações servirão como **linha de base para as etapas posteriores da pesquisa**.

Esta etapa possui caráter exclusivamente **descritivo e exploratório**, no nível de cada audiência individual. Uma eventual visão agregada entre as 206 audiências (por exemplo, em quantas audiências cada partido apareceu, ou sua fala média percentual ao longo do corpus) fica fora do escopo desta etapa e pode ser tratada separadamente, caso necessário.

Ela não busca, isoladamente, identificar viés jornalístico.

---
## Como executar

O script disponível em **scripts/03_analisar_metadados.py**, pode ser executado com o comando:

```shell
python3 -m scripts.03_analisar_metadados
```