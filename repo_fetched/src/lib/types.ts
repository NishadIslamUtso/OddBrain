// src/lib/types.ts
//
// Shared shapes for the CosmoCode Earth Analog Finder.

/** The 13 parameter keys, in display order. */
export type ParameterKey =
  | 'temperature'
  | 'tempRange'
  | 'radiation'
  | 'slope'
  | 'soil'
  | 'pressure'
  | 'daylight'
  | 'precipitation'
  | 'humidity'
  | 'dust'
  | 'isolation'
  | 'elevation'
  | 'aqueous';

/** One Earth analog site. */
export interface Site {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  values: Record<ParameterKey, number>;
  /** 0..1. How much of the site's data we have. Set per site in sites.json. */
  completeness: number;
  /** 0.7 to 1.0. How well the gridded climate data resolves the site (see docs/PROVENANCE.md). */
  resolutionTier: number;
  /** Keys into Config.sources. */
  sources: string[];

  // Site photos. Both fields are optional and the UI checks for them.
  //
  // They are empty today on purpose. The first version filled them with
  // random landscape placeholders, which showed scenery that is not the
  // real sites, which is worse than no photo for a science demo.
  // photos removed - placeholders showed wrong landscapes; real NASA/Wikimedia photos with attribution go back here
  imageUrl?: string;
  imageCredit?: string;
}

/** How a parameter's value was obtained. Shown per row in the detail panel. */
export type ParameterSource = 'measured' | 'derived' | 'estimated';

/** One measured axis, for example mean temperature in degrees Celsius. */
export interface Parameter {
  key: ParameterKey;
  label: string;
  unit: string;
  description: string;
  source: ParameterSource;
  sourceNote: string;
}

/**
 * Axes that no site in the dataset can score on at all, for example radiation:
 * Earth's atmosphere shields the surface, so every site is more than one
 * tolerance band from the lunar dose rate.
 *
 * These are excluded from the weighted mean and reported separately. Averaging
 * them in would only scale every score down by a constant, which hides the
 * finding instead of showing it.
 */
export interface StructuralMismatch {
  keys: ParameterKey[];
  labels: string[];
  /** Weight removed from the mean because it is unreachable. */
  weight: number;
  /** Weight the score is actually computed over. */
  scorableWeight: number;
}

/** What a profile wants on one axis, and how much that axis counts. */
export interface Target {
  target: number;
  tolerance: number;
  weight: number;
}

/** A scoring profile: Moon base, Mars base, or one you build yourself. */
export interface Profile {
  id: string;
  name: string;
  description: string;
  targets: Record<ParameterKey, Target>;
}

/** A partial change to one target or tolerance. */
export interface TargetOverride {
  target?: number;
  tolerance?: number;
}

/** A starting point for the custom profile builder. */
export interface Preset {
  id: string;
  name: string;
  description: string;
  weights: Record<ParameterKey, number>;
  /** Some presets move a target as well as the weights. */
  targets?: Partial<Record<ParameterKey, TargetOverride>>;
}

/** The contents of src/data/config.json. */
export interface Config {
  parameters: Parameter[];
  profiles: Record<string, Profile>;
  presets: Preset[];
  sources: Record<string, string>;
}

/** One row of the per-parameter breakdown shown in the detail panel. */
export interface BreakdownRow {
  key: ParameterKey;
  label: string;
  unit: string;
  value: number;
  target: number;
  tolerance: number;
  weight: number;
  similarity: number;
  contribution: number;
}

/** A site after scoring: the number, the confidence, and the working. */
export interface ScoredSite {
  site: Site;
  score: number;
  confidence: number;
  breakdown: BreakdownRow[];
  /** The same object for every row in a ranking. */
  structural: StructuralMismatch;
}
