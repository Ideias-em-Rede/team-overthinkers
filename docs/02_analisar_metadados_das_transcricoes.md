# Análise dos Metadados

---
## Objetivo

Após a estruturação das transcrições e a captura dos seus metadados, a próxima etapa consiste em **organizar esses dados em tabelas para a análise exploratória do corpus**.

O objetivo deste script é transformar o arquivo consolidado `dados_transcricao.json` em tabelas estruturadas que permitam observar como as audiências públicas se distribuem em relação a **participantes, gênero, partidos, estados, quantidade de falas e quantidade de palavras**.

Essa etapa tem como finalidade produzir uma **linha de base descritiva do corpus**, antes do cruzamento entre as transcrições e as notícias jornalísticas.

---
## Origem dos dados

O script utiliza como entrada o arquivo:

```text
team-overthinkers/dataset/transcricao_reorganizada/metadados/dados_transcricao.json
````

Esse arquivo reúne os metadados de todas as audiências processadas na etapa anterior, organizados pelo `id` de cada audiência.

A estrutura contém informações sobre:

* audiência;
* participantes;
* gênero;
* partido;
* estado;
* quantidade de falas;
* quantidade de palavras.

A partir desses dados, o script reorganiza as informações em diferentes níveis de análise.

---
## Análise

A análise é organizada em diferentes unidades para permitir observar o corpus de diferentes perspectivas.

### Audiências

A primeira unidade é a própria audiência pública.

Essa tabela permite observar:

* quantidade de participantes;
* quantidade de falas;
* quantidade de palavras;
* média de palavras por fala;
* média de palavras por participante;
* quantidade de participantes com partido informado;
* quantidade de participantes sem partido informado;
* quantidade de participantes com estado informado;
* quantidade de participantes sem estado informado.

Essa visão permite caracterizar o tamanho e a composição geral das audiências.

---
### Participantes

A segunda unidade é o participante dentro de cada audiência.

Essa tabela permite observar:

* nome;
* gênero;
* partido;
* estado;
* quantidade de falas;
* quantidade de palavras;
* média de palavras por fala;
* participação nas falas da audiência;
* participação nas palavras da audiência.

A unidade utilizada é a **participação de uma pessoa em uma audiência**. Portanto, uma mesma pessoa pode aparecer em mais de uma linha quando participa de diferentes audiências.

Essa estrutura permite analisar não apenas a presença de um participante, mas também o espaço discursivo ocupado por ele dentro de cada audiência.

---
### Partidos

A tabela de partidos agrega os participantes por partido dentro de cada audiência.

São considerados:

* quantidade de participantes;
* quantidade de falas;
* quantidade de palavras;
* proporção de participantes;
* proporção de falas;
* proporção de palavras;
* média de palavras por fala.

Essa estrutura permite comparar a presença e o espaço discursivo ocupado pelos diferentes partidos em cada audiência.

A participação em palavras é especialmente importante porque permite observar quanto do conteúdo discursivo de uma audiência está associado a determinado partido.

---
### Estados

A tabela de estados segue a mesma lógica da tabela de partidos, mas organiza os dados segundo o estado associado ao participante.

São considerados:

* quantidade de participantes;
* quantidade de falas;
* quantidade de palavras;
* proporção de participantes;
* proporção de falas;
* proporção de palavras;
* média de palavras por fala.

Essa tabela permite observar a distribuição regional dos participantes e do espaço discursivo dentro das audiências.

---
### Gênero

A tabela de gênero organiza os dados segundo o gênero informado para cada participante.

São considerados:

* quantidade de participantes;
* quantidade de falas;
* quantidade de palavras;
* proporção de participantes;
* proporção de falas;
* proporção de palavras;
* média de palavras por fala.

Essa estrutura permite caracterizar a participação de homens e mulheres nas audiências e observar diferenças no espaço discursivo ocupado por cada grupo.

---
## Participação e espaço discursivo

Uma das principais finalidades desta etapa é distinguir **presença** de **espaço de fala**.

A presença de um participante, partido, estado ou grupo de gênero indica que esse elemento está representado na audiência.

Entretanto, a presença, por si só, não informa quanto espaço discursivo foi ocupado.

Por isso, o script também calcula proporções baseadas na quantidade de falas e de palavras.

Por exemplo:

```text
participação em palavras
=
palavras do grupo / palavras totais da audiência
```

Dessa forma, é possível comparar tanto a quantidade de participantes quanto a parcela do conteúdo discursivo associada a cada grupo.

---
## Tabelas geradas

Ao final da análise, são produzidas as seguintes tabelas:

```text
dataset/
└── transcricao_reorganizada/
    └── analises_metadados/
        ├── tabela_audiencias.csv
        ├── tabela_participantes.csv
        ├── tabela_partidos.csv
        ├── tabela_estados.csv
        ├── tabela_genero.csv
        └── resumo_geral.csv
```

Cada arquivo representa uma perspectiva diferente do corpus.

O `resumo_geral.csv` reúne indicadores descritivos gerais das audiências processadas.

---
## Utilização dos dados

As tabelas produzidas nesta etapa constituem a **base para a análise exploratória das 206 audiências públicas**.

A partir delas, será possível investigar a composição do corpus e identificar padrões relacionados a:

* participação partidária;
* distribuição regional;
* participação por gênero;
* quantidade de falas;
* quantidade de palavras;
* concentração do espaço discursivo.

Essas informações também servirão como **linha de base para as etapas posteriores da pesquisa**.

Na etapa seguinte, os dados da transcrição poderão ser comparados com os dados extraídos das notícias jornalísticas, permitindo investigar quais participantes, partidos, estados, temas e posições presentes nas audiências são selecionados, omitidos ou recebem maior espaço na cobertura jornalística.

---
## Relação com as etapas seguintes

A análise dos metadados não busca, isoladamente, identificar viés jornalístico.

Sua função é **caracterizar o corpus e estabelecer uma referência sobre a participação existente nas audiências**.

O fluxo da pesquisa passa a ser:

```text
Transcrição original
        ↓
Estruturação da transcrição
        ↓
Captura dos metadados
        ↓
Análise exploratória do corpus
        ↓
Estruturação das notícias
        ↓
Comparação notícia × transcrição
        ↓
Análise de seleção e possíveis vieses
```

Assim, os resultados desta etapa fornecem a referência necessária para avaliar posteriormente como a cobertura jornalística se relaciona com aquilo que efetivamente ocorreu nas audiências.
