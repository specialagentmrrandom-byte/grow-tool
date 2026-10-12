export interface ThemeColors { color: Record<string, string>; pigment: Record<string, string> }
export interface VariantFont { display: string; text: string; adjust?: string }
export interface VariantPen { hatch?: string; tremble?: string; amount?: number; density?: number; angle?: number; seed?: number; width?: number; lift?: number; liftSm?: number; wheel?: { hatch?: string; density?: number; angle?: number; amount?: number; rim?: 'current' | 'all'; tremble?: string } }
export interface Variant { $description?: string; paper: ThemeColors; dark: ThemeColors; font?: VariantFont; pen?: VariantPen }
export type Tokens = Record<string, any>;
export declare function strip<T extends object>(obj: T): T;
export declare function block(selector: string, entries: [string, string][], indent?: string): string;
export declare function colorEntries(tokens: Tokens, theme: ThemeColors): [string, string][];
export declare function assertComplete(tokens: Tokens, theme: { paper: ThemeColors; dark: ThemeColors }, label: string): void;
export declare function themeBlocks(tokens: Tokens, paper: ThemeColors, dark: ThemeColors): string[];
export declare function ref(tokens: Tokens, path: string): string;
export declare function themeScopes(tokens: Tokens): string;
export declare function derivedEntries(tokens: Tokens): [string, string][];
export declare function staticEntries(tokens: Tokens, overrides?: Record<string, string>): [string, string][];
export declare function tokensCss(tokens: Tokens, options?: { banner?: string; paper?: ThemeColors; dark?: ThemeColors; scale?: Record<string, string>; labels?: Partial<Record<'paper' | 'dark' | 'media', string>> }): string;
export declare function fontEntries(tokens: Tokens, font: VariantFont): [string, string][];
export declare function variantPen(tokens: Tokens, name?: string): Record<string, string | number>;
export declare function variantWheelHatch(tokens: Tokens, name?: string): Record<string, string | number>;
export declare function penEntries(tokens: Tokens, pen: VariantPen): [string, string][];
export declare function variantCss(tokens: Tokens, name: string, variant: Variant, options?: { banner?: string }): string;
export declare const LATIN: string;
export declare const LATIN_EXT: string;
export declare function typefaceFiles(name: string): { file: string; style: 'normal' | 'italic'; range: string }[];
export declare function fontFaceCss(tokens: Tokens, name: string, src?: (file: string) => string): string;
export declare function hexToRgb(hex: string): [number, number, number];
export declare function contrast(a: string, b: string): number;
