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
