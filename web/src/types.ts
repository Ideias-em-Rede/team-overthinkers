export interface MateriaIndex {
  id: number;
  titulo: string;
  subtitulo: string;
  assunto: string;
  data: string;
  hora: string;
  num_envolvidos: number;
  num_opinioes: number;
  cargos: string[];
}

export interface Envolvido {
  nome: string;
  cargo: string;
  opinioes: string[];
}

export interface MateriaDetail {
  id: number;
  titulo: string;
  subtitulo: string;
  data: string;
  hora: string;
  assunto: string;
  corpo: string;
  materia_raw: string;
  transcricao: string;
  envolvidos: Envolvido[];
}

// --- Extraído da transcrição (regex/script) -----------------------------

export interface ParticipanteTranscricaoDetalhe {
  nome: string;
  genero: string;
  partido: string | null;
  estado: string | null;
  falas: string[];
}

export interface TranscricaoParticipantesFile {
  id: number;
  participantes: ParticipanteTranscricaoDetalhe[];
}

export interface DistribuicaoBucket {
  participantes: number;
  falas: number;
  palavras: number;
}

export interface ResumoTranscricaoEntry {
  resumo: {
    quantidade_participantes: number;
    genero: { masculino: number; feminino: number };
    partidos: Record<string, DistribuicaoBucket>;
    estados: Record<string, DistribuicaoBucket>;
  };
  participantes: {
    nome: string;
    genero: string;
    partido: string | null;
    estado: string | null;
    quantidade_falas: number;
    quantidade_palavras: number;
  }[];
}

export type ResumoTranscricaoMap = Record<string, ResumoTranscricaoEntry>;

export interface TemaEntry {
  tema: string;
  assunto: string;
  quantidade_total_participantes: number;
  quantidade_mulheres: number;
  porcentagem_mulheres: number;
}
export type TemasMap = Record<string, TemaEntry>;

// --- Extraído da matéria (LLM DeepSeek-V3) ------------------------------

export interface EnvolvidoMateria {
  nome: string;
  mencoes: number;
  posicao_no_texto: string;
  opinioes: string[];
  quantidade_opinioes: number;
}

export interface MateriaEnvolvidosEntry {
  id: number;
  assunto: string;
  envolvidos: EnvolvidoMateria[];
}

export interface ValorNoticia {
  presente: boolean;
  evidencia: string | null;
}
export type ValoresNoticiaMap = Record<string, ValorNoticia>;

export interface ValoresNoticiaFile {
  id: number;
  source?: string;
  generator?: string | null;
  modelo: string;
  valores_noticia: ValoresNoticiaMap;
}

// --- Panorama do corpus humano (estatísticas + testes) ------------------

export interface PanoramaMatching {
  total_registros_fala: number;
  pessoas_canonicas_distintas: number;
  total_envolvidos_em_noticias: number;
  envolvidos_sem_correspondencia_no_transcript: number;
  pct_envolvidos_sem_correspondencia: number;
}

export interface AchadoSelecao {
  hipotese_testada: string;
  n_total: number;
  n_cobertos: number;
  taxa_cobertura: number;
  ic95_taxa_cobertura: [number, number];
  mediana_palavras_cobertos: number;
  mediana_palavras_nao_cobertos: number;
  p_valor: number;
  hipotese_sustentada_a_5pct: boolean;
  estatistica_descritiva_adicional: {
    descricao: string;
    audiencias_com_2plus_cobertos: number;
    coincidencia_top_falante_top_citado: number;
    pct_coincidencia: number;
  };
}

export interface AchadoSilenciamentoMulheres {
  hipotese_testada: string;
  n_total: number;
  n_homens: number;
  n_mulheres: number;
  taxa_cobertura_homens: number;
  taxa_cobertura_mulheres: number;
  chi2_bruto: number;
  p_valor_chi2_bruto: number;
  coef_is_mulher: number;
  odds_ratio_is_mulher: number;
  ic95_odds_ratio_is_mulher: [number, number];
  p_valor: number;
  hipotese_sustentada_a_5pct: boolean;
}

export interface AchadoViesPartidario {
  hipotese_testada: string;
  n_deputados: number;
  partidos_analisados_n15plus: string[];
  tabela_cobertura_por_partido: Record<
    string,
    { n: number; cobertos: number; taxa_cobertura: number }
  >;
  chi2: number;
  dof: number;
  p_valor: number;
  hipotese_sustentada_a_5pct: boolean;
  post_hoc: {
    descricao: string;
    partido_maior_cobertura: { partido: string; taxa: number; n: number };
    partido_menor_cobertura: { partido: string; taxa: number; n: number };
  };
}

export interface AchadoPopulacaoUf {
  hipotese_testada: string;
  n_deputados_com_uf: number;
  n_ufs_analisadas: number;
  coef_log_populacao_uf: number;
  p_valor: number;
  hipotese_sustentada_a_5pct: boolean;
  odds_ratio_log_populacao_uf: number;
  ic95_odds_ratio: [number, number];
  classificacao: string;
  tabela_cobertura_por_uf: Record<
    string,
    { populacao: number; n: number; pct_cobertura: number }
  >;
  observacao: string;
}

export interface PanoramaFile {
  matching: PanoramaMatching;
  achado_1_filtro_de_selecao: AchadoSelecao;
  achado_2_silenciamento_mulheres: AchadoSilenciamentoMulheres;
  achado_3_vies_partidario: AchadoViesPartidario;
  achado_4_populacao_uf: AchadoPopulacaoUf;
}

// --- Valores-notícia agregados por matéria ------------------------------

export type ValoresPorMateriaMap = Record<string, string[]>;

// --- Gatekeepers (audiência × cobertura na matéria) ---------------------

export interface GatekeeperRow {
  hearing_id: number;
  nome_canon: string;
  nome_key: string;
  genero: string;
  partido: string | null;
  estado: string | null;
  quantidade_falas: number;
  quantidade_palavras: number;
  covered: boolean;
  mencoes: number;
  quantidade_opinioes: number;
  posicao_no_texto: string | null;
}

// --- Matéria gerada por LLM (a partir da transcrição) -------------------

export interface MateriaLlmFile {
  id: number;
  generator?: string;
  modelo: string;
  temperature: number;
  prompt: string;
  materia_llm: string;
}

// --- Tipos legados usados por componentes que ainda serão migrados ------

export interface ParticipanteTranscricao {
  nome: string;
  partido_estado: string | null;
  trechos: number;
  palavras: number;
}

export interface ParticipantesTranscricaoFile {
  id: number;
  metodo: "regex";
  regex_padrao: string;
  descricao: string;
  cobertura: {
    chars_totais: number;
    chars_capturados: number;
    proporcao: number;
  };
  totais: {
    num_participantes: number;
    num_trechos: number;
    num_palavras: number;
  };
  participantes: ParticipanteTranscricao[];
}

export interface ParticipanteMateria {
  nome: string;
  cargo: string | null;
  mencoes: number;
  citacoes_diretas: string[];
}

export interface ParticipantesMateriaFile {
  id: number;
  metodo: "llm";
  modelo: string;
  descricao: string;
  totais: {
    num_participantes: number;
    num_citacoes_diretas: number;
  };
  participantes: ParticipanteMateria[];
}
