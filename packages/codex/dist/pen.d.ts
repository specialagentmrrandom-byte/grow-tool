export type HatchStyle = 'diagonal' | 'cross' | 'stipple' | 'scribble' | 'engrave' | 'contour' | 'hachure' | 'waves' | 'mixed';
export type TrembleStyle = 'steady' | 'quill' | 'sketch' | 'tremor' | 'brush' | 'dry' | 'mixed';
export interface PenSettings { hatch: HatchStyle; tremble: TrembleStyle; amount: number; density: number; angle: number; seed: number }
export interface Pen {
  readonly settings: PenSettings;
  readonly active: boolean;
  readonly boiling: boolean;
  set(patch: Partial<PenSettings>): Pen;
  activate(on: boolean): Pen;
  boil(on: boolean): Pen;
  rescan(): void;
  redraw(): void;
  destroy(): void;
}
export declare const HATCH_STYLES: readonly HatchStyle[];
export declare const TREMBLE_STYLES: readonly TrembleStyle[];
export declare const PEN_DEFAULTS: Readonly<PenSettings>;
export declare const PEN_SELECTOR: string;
export declare function cleanPen(o?: Partial<Record<keyof PenSettings, unknown>>): PenSettings;
export declare function hatchGap(density: number): number;
export declare function hatchSvg(style: HatchStyle, w: number, h: number, o?: { seed?: number; density?: number; angle?: number; amount?: number }): string;
export declare function strokeSvg(style: TrembleStyle, points: [number, number][], o?: { seed?: number; amount?: number; closed?: boolean; dashed?: boolean }): string;
export declare function outlineSvg(style: TrembleStyle, w: number, h: number, o?: { seed?: number; amount?: number; dashed?: boolean }): string;
export declare function createPen(root: HTMLElement, settings?: Partial<PenSettings>, options?: { selector?: string; active?: boolean; /** an app's own raised elements: the pen draws their hatched shadow only */ shadows?: string }): Pen;
export declare function rng(seed: number): () => number;
export declare function hash(a: number, b: number): number;
