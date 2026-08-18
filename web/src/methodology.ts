// Espelha o que está em scripts/*.py. Se um prompt/regex mudar num script,
// atualize aqui também. Melhor abordagem futura: gerar isto de metodologia.json.

export const TRANSCRICAO_METHOD = {
  tipo: "regex",
  descricao:
    "Extração determinística por regex sobre o formato padronizado da transcrição da Câmara. Não usa LLM. Aceita marcadores 'O SR.' (masculino) e 'A SRA.' (feminino) — o padrão original só reconhecia o masculino, descartando silenciosamente falas de participantes mulheres.",
  regex: String.raw`(?:O\s+SR\.|A\s+SRA\.)\s+(.+?)(?:\((.*?)\))?\s*-\s*(.*?)(?=\n(?:O\s+SR\.|A\s+SRA\.)\s+|\Z)`,
  origem: "scripts/extrai_participantes_transcricao.py",
} as const;

export const MATERIA_METHOD = {
  tipo: "llm",
  descricao:
    "Extração via LLM (OpenAI). O modelo identifica pessoas nomeadas, cargo (quando explicitado), número de menções e citações diretas atribuídas. Requer verificação humana em amostra por ser probabilística.",
  prompt: `Analise a matéria jornalística abaixo e extraia todas as pessoas mencionadas nominalmente.

Para cada pessoa, retorne:
- "nome": o nome mais completo com que a pessoa aparece na matéria.
- "cargo": cargo, função ou instituição, se citado explicitamente no texto. Use null se não citado.
- "mencoes": número de vezes que a pessoa é referenciada (por nome completo, sobrenome ou pronomes que a referenciem inequivocamente).
- "citacoes_diretas": lista com trechos entre aspas atribuídos exatamente a essa pessoa (frases exatamente como aparecem no texto). Lista vazia se não houver.

Regras:
- Só inclua pessoas mencionadas nominalmente na matéria. Não incluir cargos genéricos sem nome ("um deputado", "o presidente da comissão") se o nome não é dado.
- Não invente informações. Só extraia o que está explicitamente no texto.
- Nomes de instituições ou órgãos NÃO devem entrar.
- Retorne exclusivamente JSON válido, sem explicações adicionais.

Formato:

{
  "participantes": [
    {
      "nome": "...",
      "cargo": "...",
      "mencoes": 3,
      "citacoes_diretas": ["...", "..."]
    }
  ]
}

MATÉRIA:
{{NOTICIA}}`,
  parametros: { temperature: 0, response_format: "json_object" },
  origem: "scripts/extrai_participantes_materia.py",
} as const;

export const VALORES_METHOD = {
  tipo: "llm",
  descricao:
    "O LLM identifica quais dos 11 valores-notícia clássicos estão presentes no texto e a evidência textual correspondente. Não infere gatekeeping — essa análise é feita cruzando valores com quem foi selecionado.",
  prompt: `Analise a notícia abaixo e identifique quais valores-notícia estão presentes no texto.

Use exclusivamente os seguintes critérios:

- atualidade: o acontecimento é recente ou está relacionado a algo que está acontecendo no momento?
- proximidade: o acontecimento possui proximidade geográfica, social ou cultural com o público?
- importância: o acontecimento possui relevância institucional ou social?
- impacto: o acontecimento pode produzir consequências relevantes para pessoas, grupos ou instituições?
- conflito: há disputa, oposição, crítica, acusação ou divergência entre participantes?
- proeminência: envolve pessoas ou instituições de elevada relevância pública?
- novidade: apresenta algo novo, recente ou uma mudança em relação ao que existia anteriormente?
- curiosidade: apresenta algum elemento que desperta curiosidade ou interesse por ser incomum?
- dramaticidade: apresenta elementos de tensão, gravidade ou forte carga emocional?
- surpresa: apresenta algo inesperado ou contrário às expectativas?
- raridade: apresenta um acontecimento incomum ou excepcional?

Para cada critério, responda:
- "presente": true ou false
- "evidencia": trecho curto da notícia que justifica a classificação. Use null quando estiver ausente.

Não infira informações que não estejam na notícia.
Não considere a importância do acontecimento apenas porque ele ocorreu em uma audiência pública.
Não considere um critério presente apenas porque ele poderia ser aplicado ao acontecimento. Deve existir evidência no texto.

Retorne exclusivamente JSON válido, sem explicações adicionais.

Formato: { "atualidade": { "presente": true, "evidencia": "..." }, ... }

NOTÍCIA:
{{NOTICIA}}`,
  parametros: { temperature: 0, response_format: "json_object" },
  origem: "scripts/extract_valores_noticia.py",
} as const;
