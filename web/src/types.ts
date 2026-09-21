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

export interface MateriaLlmFile {
  id: number;
  generator?: string;
  modelo: string;
  temperature: number;
  prompt: string;
  materia_llm: string;
}

export interface ValorNoticia {
  presente: boolean;
  evidencia: string | null;
}

export type ValoresNoticiaMap = Record<string, ValorNoticia>;

export interface ValoresNoticiaFile {
  id: number;
  modelo: string;
  valores_noticia: ValoresNoticiaMap;
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
