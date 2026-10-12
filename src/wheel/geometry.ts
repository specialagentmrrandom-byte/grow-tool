/**
 * Geometry of the journal wheel: one slot per day around a circle, starting at
 * 12 o'clock and running clockwise, with a gap at the top for the lane names.
 * An outer rim (the periods / phases) and concentric lanes share that axis.
 */

export interface WheelGeometryOptions {
    /** viewBox size, default 400 */
    size?: number;
    /** degrees left free at the top for lane names, default 44 */
    gapDeg?: number;
    rimWidth?: number;
    rimGap?: number;
    hubRadius?: number;
    laneGap?: number;
}

export interface WheelLaneGeometry {
    id: string;
    inner: number;
    outer: number;
    mid: number;
}

export interface WheelLayout {
    size: number;
    c: number;
    gapDeg: number;
    count: number;
    step: number;
    rim: { inner: number; outer: number };
    hub: number;
    lanes: WheelLaneGeometry[];
}

/** What sits under a point: a lane id, 'rim', 'hub' or nothing; and the day slot (null in the gap). */
export interface WheelHit {
    lane: string | null;
    index: number | null;
}

const DEFAULTS: Required<WheelGeometryOptions> = {
    size: 400,
    gapDeg: 44,
    rimWidth: 24,
    rimGap: 6,
    hubRadius: 58,
    laneGap: 4,
};

/** Lanes are listed outside → inside. */
export function wheelLayout(count: number, laneIds: string[], options: WheelGeometryOptions = {}): WheelLayout {
    const o = { ...DEFAULTS, ...options };
    if (!Number.isInteger(count) || count < 1) throw new RangeError(`wheelLayout(): count must be a positive integer, got ${count}`);
    const c = o.size / 2;
    const rimOuter = c - 4;
    const rimInner = rimOuter - o.rimWidth;
    const lanesOuter = rimInner - o.rimGap;
    const lanesInner = o.hubRadius + 8;
    const n = laneIds.length;
    const band = n ? (lanesOuter - lanesInner - o.laneGap * (n - 1)) / n : 0;
    return {
        size: o.size,
        c,
        gapDeg: o.gapDeg,
        count,
        step: (360 - o.gapDeg) / count,
        rim: { inner: rimInner, outer: rimOuter },
        hub: o.hubRadius,
        lanes: laneIds.map((id, i) => {
            const outer = lanesOuter - i * (band + o.laneGap);
            const inner = outer - band;
            return { id, inner: round(inner), outer: round(outer), mid: round((inner + outer) / 2) };
        }),
    };
}

/** Angle of the start edge of slot `i` (i may equal count for the end edge). */
export function slotEdge(layout: WheelLayout, i: number): number {
    return layout.gapDeg / 2 + i * layout.step;
}

/** Angle of the centre of slot `i`. */
export function slotAngle(layout: WheelLayout, i: number): number {
    return slotEdge(layout, i + 0.5);
}

/** Point on a circle; 0° is 12 o'clock, clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)) };
}

/** Which lane and slot sit under a point in viewBox coordinates. */
export function wheelHit(layout: WheelLayout, x: number, y: number): WheelHit {
    const r = Math.hypot(x - layout.c, y - layout.c);
    const index = angleToIndex(layout, x, y);
    if (r <= layout.hub) return { lane: 'hub', index: null };
    if (r > layout.rim.outer + 8) return { lane: null, index: null };
    if (r >= layout.rim.inner - 2) return { lane: 'rim', index };
    const lane = layout.lanes.find((l) => r >= l.inner - 2 && r <= l.outer + 2);
    return { lane: lane ? lane.id : null, index };
}

/** Day slot at the angle of a point, whatever its distance (null in the gap). */
export function angleToIndex(layout: WheelLayout, x: number, y: number): number | null {
    let deg = (Math.atan2(y - layout.c, x - layout.c) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    if (deg < layout.gapDeg / 2 || deg > 360 - layout.gapDeg / 2) return null;
    return Math.min(layout.count - 1, Math.max(0, Math.floor((deg - layout.gapDeg / 2) / layout.step)));
}

/** Pointer position → viewBox coordinates of the wheel's <svg> (square viewBox, centred). */
export function clientToWheel(svg: Element, layout: WheelLayout, clientX: number, clientY: number): { x: number; y: number } {
    const box = svg.getBoundingClientRect();
    const side = Math.min(box.width, box.height) || 1;
    const scale = layout.size / side;
    return {
        x: (clientX - box.left - (box.width - side) / 2) * scale,
        y: (clientY - box.top - (box.height - side) / 2) * scale,
    };
}

export function round(v: number): number {
    return Math.round(v * 100) / 100;
}
