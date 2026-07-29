export interface DictExample {
  sentence: string;
  translation: string;
  source?: string;
}

export interface DictPhrase {
  phrase: string;
  translation?: string;
}

// Shape of a dictionary lookup result, mirroring `DictEntry` in
// src-tauri/src/dictionary.rs (serialized as camelCase).
export interface DictEntry {
  word: string;
  phonetic: string;
  usPhonetic?: string;
  ukPhonetic?: string;
  usAudio?: string;
  ukAudio?: string;
  /** English definition (may contain "\n"-separated senses). */
  definition: string;
  /** Chinese translation (may contain "\n"-separated senses). */
  translation: string;
  pos: string;
  tag: string;
  /** ECDICT exchange field, e.g. "p:ran/d:run/i:running/3:runs". */
  exchange: string;
  collins: number;
  oxford: number;
  found: boolean;
  /** Original query when resolved via lemmatization (e.g. "running"). */
  lemmatizedFrom: string | null;
  examples?: DictExample[];
  phrases?: DictPhrase[];
}

