// The maths behind dragging, resizing and rotating elements on the page.
import { El } from './doc';

export interface Point {
  x: number;
  y: number;
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const VEC: Record<Handle, Point> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};
export const handleVector = (h: Handle) => VEC[h];

export const MIN_SIZE = 12;

const rad = (deg: number) => (deg * Math.PI) / 180;

export const centerOf = (e: Pick<El, 'x' | 'y' | 'w' | 'h'>): Point => ({
  x: e.x + e.w / 2,
  y: e.y + e.h / 2,
});

/** Rotates a point around the origin. */
export function rotate(p: Point, degrees: number): Point {
  const a = rad(degrees);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** A page point in the element's own (unrotated) coordinates, with the origin at its centre. */
export function toLocal(p: Point, e: El): Point {
  const c = centerOf(e);
  return rotate({ x: p.x - c.x, y: p.y - c.y }, -e.rotation);
}

export function contains(e: El, p: Point): boolean {
  const l = toLocal(p, e);
  return Math.abs(l.x) <= e.w / 2 && Math.abs(l.y) <= e.h / 2;
}

/** The top-most element under the point, or null. */
export function hitTest(elements: El[], p: Point): El | null {
  for (let i = elements.length - 1; i >= 0; i--) if (contains(elements[i], p)) return elements[i];
  return null;
}

/** Where a handle sits on the page. */
export function handlePoint(e: El, h: Handle, offset = 0): Point {
  const v = VEC[h];
  const local = { x: (v.x * (e.w + offset * 2)) / 2, y: (v.y * (e.h + offset * 2)) / 2 };
  const r = rotate(local, e.rotation);
  const c = centerOf(e);
  return { x: c.x + r.x, y: c.y + r.y };
}

/** The point of the rotation handle, a little above the top edge. */
export function rotateHandlePoint(e: El, distance: number): Point {
  const r = rotate({ x: 0, y: -e.h / 2 - distance }, e.rotation);
  const c = centerOf(e);
  return { x: c.x + r.x, y: c.y + r.y };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The new box when a handle is dragged to `pointer`. The opposite side or corner stays where it is, even for a
 * rotated element. `keepRatio` scales a corner proportionally.
 */
export function resizeBox(e: El, handle: Handle, pointer: Point, keepRatio: boolean): Box {
  const v = VEC[handle];
  const c = centerOf(e);
  const anchorLocal = { x: (-v.x * e.w) / 2, y: (-v.y * e.h) / 2 };
  const anchorOffset = rotate(anchorLocal, e.rotation);
  const anchor = { x: c.x + anchorOffset.x, y: c.y + anchorOffset.y };
  const d = rotate({ x: pointer.x - anchor.x, y: pointer.y - anchor.y }, -e.rotation);

  let w = v.x !== 0 ? Math.max(MIN_SIZE, d.x * v.x) : e.w;
  let h = v.y !== 0 ? Math.max(MIN_SIZE, d.y * v.y) : e.h;
  if (keepRatio && v.x !== 0 && v.y !== 0) {
    const s = Math.max(w / e.w, h / e.h);
    w = Math.max(MIN_SIZE, e.w * s);
    h = Math.max(MIN_SIZE, e.h * s);
  }
  const centreLocal = { x: (v.x * w) / 2, y: (v.y * h) / 2 };
  const co = rotate(centreLocal, e.rotation);
  const nc = { x: anchor.x + co.x, y: anchor.y + co.y };
  return { x: nc.x - w / 2, y: nc.y - h / 2, w, h };
}

/** The rotation, in degrees, that points the element's top at the pointer. Snaps near the usual angles. */
export function rotationFor(e: El, pointer: Point, snap: boolean): number {
  const c = centerOf(e);
  let deg = (Math.atan2(pointer.y - c.y, pointer.x - c.x) * 180) / Math.PI + 90;
  deg = (((deg % 360) + 540) % 360) - 180; // -180..180
  const step = snap ? 15 : 45;
  const nearest = Math.round(deg / step) * step;
  if (snap || Math.abs(deg - nearest) < 3) deg = nearest;
  return Math.round(deg * 10) / 10;
}

export interface Guide {
  axis: 'x' | 'y';
  at: number;
}

/**
 * Pulls a moving box onto the page edges, the page centre and the edges and centres of the other elements,
 * when it comes within `threshold`. Returns the correction to apply and the guide lines to show.
 */
export function snapMove(
  box: Box,
  others: Box[],
  page: { w: number; h: number },
  threshold: number,
): { dx: number; dy: number; guides: Guide[] } {
  const xs = [0, page.w / 2, page.w];
  const ys = [0, page.h / 2, page.h];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const mine = {
    x: [box.x, box.x + box.w / 2, box.x + box.w],
    y: [box.y, box.y + box.h / 2, box.y + box.h],
  };
  const best = (own: number[], targets: number[]) => {
    let pick: { d: number; at: number } | null = null;
    for (const a of own)
      for (const t of targets) {
        const d = t - a;
        if (Math.abs(d) <= threshold && (!pick || Math.abs(d) < Math.abs(pick.d)))
          pick = { d, at: t };
      }
    return pick;
  };
  const bx = best(mine.x, xs);
  const by = best(mine.y, ys);
  const guides: Guide[] = [];
  if (bx) guides.push({ axis: 'x', at: bx.at });
  if (by) guides.push({ axis: 'y', at: by.at });
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, guides };
}
