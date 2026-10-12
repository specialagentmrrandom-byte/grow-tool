export type ThemeName = 'paper' | 'dark';
export type ColorName = 'paper' | 'paper-glow' | 'paper-shade' | 'paper-grain' | 'paper-vignette' | 'ground' | 'ink' | 'ink-line' | 'on-ink' | 'shade' | 'shade-strong' | 'rust' | 'ochre' | 'amber' | 'ochre-ink' | 'moss' | 'moss-ink' | 'olive' | 'leaf' | 'sap' | 'verdigris' | 'plum' | 'sepia' | 'slate';
export type SemanticName = 'text' | 'accent' | 'attention' | 'today' | 'ok' | 'ok-ink' | 'auto' | 'progress' | 'highlight';
export type AlphaName = 'ink-strong' | 'ink-soft' | 'ink-muted' | 'ink-faint' | 'line-strong' | 'line' | 'rule' | 'rule-soft' | 'track' | 'wash';
export type VariantName = 'tide' | 'compass' | 'grow' | 'atelier' | 'launchpad';
export type PaletteName = 'grow' | 'iso' | 'tide' | 'compass' | 'atelier' | 'launchpad';

export declare const tokens: {
  readonly prefix: string;
  readonly themes: Readonly<Record<ThemeName, Readonly<Record<ColorName, string>>>>;
  readonly variants: Readonly<Record<VariantName, Readonly<Record<ThemeName, Readonly<Record<ColorName, string>>>>>>;
  readonly alpha: Readonly<Record<AlphaName, number>>;
  readonly semantic: Readonly<Record<SemanticName, ColorName>>;
  readonly font: Readonly<Record<string, string>>;
  readonly text: Readonly<Record<string, string>>;
  readonly tracking: Readonly<Record<string, string>>;
  readonly leading: Readonly<Record<string, string>>;
  readonly space: Readonly<Record<string, string>>;
  readonly radius: Readonly<Record<string, string>>;
  readonly size: Readonly<Record<string, string>>;
  readonly hatch: Readonly<Record<string, string>>;
  readonly pens: Readonly<Record<VariantName | 'default', Readonly<VariantPenSettings>>>;
  readonly wheelHatches: Readonly<Record<VariantName | 'default', Readonly<VariantWheelHatch>>>;
  readonly motion: Readonly<Record<string, string>>;
  readonly palettes: Readonly<Record<PaletteName, Readonly<Record<string, string>>>>;
};

/** createPen() settings (same shape as PenSettings in @rafime/codex/pen). */
export interface VariantPenSettings {
  hatch: 'diagonal' | 'cross' | 'stipple' | 'scribble' | 'engrave' | 'contour' | 'hachure' | 'waves' | 'mixed';
  tremble: 'steady' | 'quill' | 'sketch' | 'tremor' | 'brush' | 'dry' | 'mixed';
  amount: number; density: number; angle: number; seed: number;
}
/** How @rafime/wheel hatches periods (same shape as its WheelHatch option). */
export interface VariantWheelHatch { hatch: VariantPenSettings['hatch']; density: number; angle: number; amount: number; seed: number; rim: 'current' | 'all'; tremble: VariantPenSettings['tremble'] | 'filter' }
/** The wheel hatching of a variant; no argument → the default look. */
export declare function variantWheelHatch(variant?: VariantName): VariantWheelHatch;
/** The pen a variant draws with; no argument → the default look. */
export declare function variantPen(variant?: VariantName): VariantPenSettings;
export declare function cssVar(name: string): string;
export declare function color(name: ColorName | SemanticName | AlphaName, theme?: ThemeName, variant?: VariantName): string;
export declare function paletteColor(palette: PaletteName, role: string, theme?: ThemeName, variant?: VariantName): string;
