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

O script utiliza como entrada o arquivo:

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

---
## Regras gerais

O script deve seguir as seguintes regras:

1. Ler todas as audiências presentes em `dados_transcricao.json`.
2. Utilizar o `id` da audiência como identificador.
3. Utilizar os valores de `quantidade_falas` já presentes nos metadados, sem recalculá-los.
4. Não reprocessar o texto das transcrições.
5. Não realizar novas inferências sobre partido, estado ou gênero.
6. Quando `partido`, `estado` ou `genero` possuir valor `null`, utilizar a categoria:

```text
NAO_INFORMADO
```

7. A categoria `NAO_INFORMADO` deve participar normalmente das agregações e dos cálculos de porcentagem.
8. Todas as porcentagens devem ser calculadas em relação ao total da respectiva audiência.

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
* `porcentagem_falas_do_partido_sobre_total_falas_audiencia`.


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
* `porcentagem_falas_do_estado_sobre_total_falas_audiencia`.

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
* `porcentagem_falas_do_genero_sobre_total_falas_audiencia`.

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
soma(quantidade_participantes_do_partido_na_audiencia)
= quantidade_total_de_participantes_na_audiencia
```

```text
soma(quantidade_falas_do_partido_na_audiencia)
= quantidade_total_de_falas_na_audiencia
```

Na tabela de estados:

```text
soma(quantidade_participantes_do_estado_na_audiencia)
= quantidade_total_de_participantes_na_audiencia
```

```text
soma(quantidade_falas_do_estado_na_audiencia)
= quantidade_total_de_falas_na_audiencia
```

Na tabela de gênero:

```text
soma(quantidade_participantes_do_genero_na_audiencia)
= quantidade_total_de_participantes_na_audiencia
```

```text
soma(quantidade_falas_do_genero_na_audiencia)
= quantidade_total_de_falas_na_audiencia
```

A inclusão da categoria `NAO_INFORMADO` garante que participantes sem partido, estado ou gênero informado não sejam excluídos dessas agregações.

---
## Utilização dos dados

As tabelas produzidas nesta etapa constituem a base para a análise exploratória das audiências públicas.

A partir delas, será possível investigar:

* distribuição dos participantes por partido;
* distribuição dos participantes por estado;
* distribuição dos participantes por gênero;
* distribuição das falas por partido;
* distribuição das falas por estado;
* distribuição das falas por gênero.

Essas informações servirão como **linha de base para as etapas posteriores da pesquisa**.

Esta etapa possui caráter exclusivamente **descritivo e exploratório**. Ela não busca, isoladamente, identificar viés jornalístico.

---
## Relação com as etapas seguintes

A análise dos metadados tem como função caracterizar a participação existente nas audiências e estabelecer uma referência quantitativa para a análise posterior.

O fluxo da pesquisa passa a ser:

```text
Transcrição original
        ↓
Estruturação da transcrição
        ↓
Captura dos metadados
        ↓
Análise dos metadados
        ↓
Estruturação das notícias
        ↓
Comparação notícia × transcrição
        ↓
Análise de seleção e possíveis vieses
```

Os resultados desta etapa fornecerão a referência necessária para avaliar posteriormente como os participantes e grupos presentes nas audiências são representados na cobertura jornalística.