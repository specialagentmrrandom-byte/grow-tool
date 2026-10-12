export interface InkOptions {
  id?: string;
  seed?: number;
  scale?: number;
  hatchId?: string;
  hatchColor?: string;
  hatchAngle?: number;
  hatchGap?: number;
}
export declare function inkDefs(options?: InkOptions): string;
export declare function inkSprite(options?: InkOptions): string;
export declare function installInk(doc?: Document, options?: InkOptions): void;
export declare function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number };
export declare function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string;
export declare function labelArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string;
export declare function ringSegmentPath(cx: number, cy: number, rInner: number, rOuter: number, startDeg: number, endDeg: number): string;
export declare function valueToAngle(value: number, min: number, max: number, startDeg?: number, spanDeg?: number): number;
export declare function roman(n: number): string;
export declare function formatNumber(value: number, decimals?: number, options?: { sign?: boolean }): string;
