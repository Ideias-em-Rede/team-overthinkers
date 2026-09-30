# You Shall Not Pass: Usando LLMs para Avaliar Gatekeeping na Agência Câmara de Notícias

> **Comparando Padrões de Seleção entre Jornalistas e LLMs com o Dataset PublicHearingBR**

Este repositório contém os dados, scripts de auditoria, código-fonte do artigo e a interface web da pesquisa que investiga como Modelos de Linguagem de Grande Porte (LLMs) atuam como *gatekeepers* algorítmicos ao sintetizar audiências públicas em comparação à cobertura editorial humana da Agência Câmara de Notícias.

🌐 **Painel Interativo / Dashboard:** [https://ideias-em-rede.github.io/team-overthinkers/](https://ideias-em-rede.github.io/team-overthinkers/)

---

## 📁 Estrutura do Repositório

```text
.
├── artigo/               # Código-fonte e arquivos em LaTeX do artigo científico
├── dataset/              # Transcrições do PublicHearingBR e matérias (humanas e geradas por IA)
├── gatekeepers/humano/   # Análises e extração do gatekeeping da imprensa institucional
├── scripts/              # Pipelines de geração com LLMs, auditoria e testes estatísticos
├── utils/                # Funções utilitárias e scripts auxiliares
├── web/ & front/         # Código e componentes do painel interativo (GitHub Pages)
└── requirements.txt      # Dependências do projeto em Python
```

---

## 🚀 Como Executar

**1. Clonar o Repositório:**
```bash
git clone [https://github.com/Ideias-em-Rede/team-overthinkers.git](https://github.com/Ideias-em-Rede/team-overthinkers.git)
cd team-overthinkers
```

**2. Instalar as dependências:**
```bash
pip install -r requirements.txt
```

**3. Executar as Análises:**
```bash
Explore a pasta scripts/ para rodar os pipelines de avaliação dos modelos, cálculo do índice de Jaccard e testes de hipóteses.
```

---

## 🤝 Agradecimentos

Projeto desenvolvido no âmbito da iniciativa Ideias em Rede, com o incentivo da Kunumi.
