// Messages between the page and the search worker.

/** One letter of a shape query: a sketch of it, or the glyph of the example font. */
export interface SearchPart {
  /** The character, or '' for a sketch compared with all characters (then the only part). */
  ch: string;
  /** Sketch points (from shape.js sketchPoints). */
  pts?: Uint8Array;
  /** The font whose glyph is the query for this character. */
  fontIndex?: number;
}

export interface SearchRequest {
  id: number;
  parts: SearchPart[];
  /** Indices of the fonts to search. */
  allowed: number[];
  /** Fonts without real lowercase letters (skipped for lowercase characters). */
  noLower?: number[];
  limit: number;
}

export interface SearchHit {
  index: number;
  /** Lower is better: weighted per-letter ranks (drawings 80%, example glyphs 20%; a sole group gets 100%), or chamfer plus stroke-end distance for an all-character search. */
  score: number;
  /** The character that matched, in a search over all characters. */
  ch?: string;
  /** The skeletons of the font for the query letters (one, in a search over all characters), as stored (shape.js decodeLines). */
  skeletons: Uint8Array[];
}

export interface SearchResponse {
  id: number;
  /** Characters whose font query had no AI features and used the skeleton distance instead. */
  usedChamfer: string[];
  total: number;
  results: SearchHit[];
}
