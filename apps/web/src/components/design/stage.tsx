'use client';

import { RotateCw } from 'lucide-react';
import { RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Brand, Doc, El, FORMATS, resolveFill, TextEl } from '@/lib/design/doc';
import {
  contains,
  Guide,
  Handle,
  handleVector,
  HANDLES,
  hitTest,
  Point,
  resizeBox,
  rotationFor,
  snapMove,
} from '@/lib/design/geometry';
import { ensureDocFonts, fontStack, renderDoc, textHeight } from '@/lib/design/render';
import { isRtl } from '@/lib/design/doc';

const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

/** Changing any of these on a text element changes how tall it is. */
export const withTextHeight = (e: TextEl, brand: Brand): TextEl => ({
  ...e,
  h: textHeight(e, brand),
});

export interface StageProps {
  doc: Doc;
  brand: Brand;
  images: Map<string, HTMLImageElement>;
  logo: HTMLImageElement | null;
  selected: string[];
  onSelect: (ids: string[]) => void;
  editingId: string | null;
  onEditing: (id: string | null) => void;
  onBegin: () => void;
  onLive: (doc: Doc) => void;
  onEnd: () => void;
  canEdit: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/** The page, with everything on it, and the frames and handles to move, resize and rotate. */
export function Stage(props: StageProps) {
  const { doc, brand, images, logo, selected, editingId, canEdit, canvasRef } = props;
  const { w: DW, h: DH } = FORMATS[doc.format];
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 800, h: 640 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const docRef = useRef(doc);
  docRef.current = doc;
  const propsRef = useRef(props);
  propsRef.current = props;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () =>
      setAvail({
        w: Math.max(240, el.clientWidth - 8),
        h: Math.max(320, Math.round(window.innerHeight * 0.7)),
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const scale = Math.min(avail.w / DW, avail.h / DH, 1);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Draw the page. Fonts are awaited so the first draw is not in a fallback font; the latest request wins.
  const drawToken = useRef(0);
  useEffect(() => {
    const token = ++drawToken.current;
    const draw = () => {
      if (token !== drawToken.current || !canvasRef.current) return;
      renderDoc(canvasRef.current, doc, brand, {
        images,
        logo,
        hideId: editingId,
        placeholders: true,
      });
    };
    draw();
    ensureDocFonts(doc, brand).then(draw);
  }, [doc, brand, images, logo, editingId, canvasRef]);

  const toDoc = (e: { clientX: number; clientY: number }): Point => {
    const r = stageRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / scaleRef.current,
      y: (e.clientY - r.top) / scaleRef.current,
    };
  };

  /** Follows the pointer until it is released. */
  const track = (move: (ev: PointerEvent) => void, up: () => void) => {
    const onMove = (ev: PointerEvent) => move(ev);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      up();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const replaceEls = (changed: El[]) => {
    const byId = new Map(changed.map((e) => [e.id, e]));
    propsRef.current.onLive({
      ...docRef.current,
      elements: docRef.current.elements.map((e) => byId.get(e.id) ?? e),
    });
  };

  function startMove(ev: React.PointerEvent, ids: string[]) {
    const start = docRef.current.elements.filter((e) => ids.includes(e.id) && !e.locked);
    if (start.length === 0) return;
    const origin = toDoc(ev);
    let began = false;
    const others = docRef.current.elements
      .filter((e) => !ids.includes(e.id))
      .map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }));
    track(
      (m) => {
        const p = toDoc(m);
        let dx = p.x - origin.x;
        let dy = p.y - origin.y;
        if (!began && Math.hypot(dx, dy) * scaleRef.current < 3) return;
        if (!began) {
          began = true;
          propsRef.current.onBegin();
        }
        const minX = Math.min(...start.map((e) => e.x));
        const minY = Math.min(...start.map((e) => e.y));
        const maxX = Math.max(...start.map((e) => e.x + e.w));
        const maxY = Math.max(...start.map((e) => e.y + e.h));
        const snap = snapMove(
          { x: minX + dx, y: minY + dy, w: maxX - minX, h: maxY - minY },
          others,
          { w: DW, h: DH },
          8 / scaleRef.current,
        );
        if (!m.altKey) {
          dx += snap.dx;
          dy += snap.dy;
          setGuides(snap.guides);
        } else setGuides([]);
        replaceEls(start.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }) as El));
      },
      () => {
        setGuides([]);
        if (began) propsRef.current.onEnd();
      },
    );
  }

  function startResize(ev: React.PointerEvent, el: El, handle: Handle) {
    ev.stopPropagation();
    ev.preventDefault();
    if (el.locked) return;
    propsRef.current.onBegin();
    const v = handleVector(handle);
    track(
      (m) => {
        const p = toDoc(m);
        if (el.type === 'text') {
          const keep = v.x !== 0 && v.y !== 0;
          const box = resizeBox(el, handle, p, keep);
          let next: TextEl = { ...el, x: box.x, y: el.y, w: Math.max(40, box.w) };
          if (keep) {
            const size = Math.min(500, Math.max(8, Math.round(el.size * (box.w / el.w))));
            next = {
              ...next,
              size,
              padding: el.padding * (size / el.size),
              boxRadius: el.boxRadius * (size / el.size),
            };
          }
          next = withTextHeight(next, propsRef.current.brand);
          if (el.rotation === 0) {
            if (keep && v.y < 0) next.y = el.y + el.h - next.h;
            else next.y = el.y;
          }
          replaceEls([next]);
          return;
        }
        const keep = el.type === 'image' || el.type === 'logo' ? !m.altKey : m.shiftKey;
        const box = resizeBox(el, handle, p, keep && v.x !== 0 && v.y !== 0);
        replaceEls([{ ...el, ...box } as El]);
      },
      () => propsRef.current.onEnd(),
    );
  }

  function startRotate(ev: React.PointerEvent, el: El) {
    ev.stopPropagation();
    ev.preventDefault();
    if (el.locked) return;
    propsRef.current.onBegin();
    track(
      (m) => replaceEls([{ ...el, rotation: rotationFor(el, toDoc(m), m.shiftKey) } as El]),
      () => propsRef.current.onEnd(),
    );
  }

  function onPointerDown(ev: React.PointerEvent) {
    if (!canEdit || ev.button !== 0) return;
    if (editingId) return; // the text box handles its own pointer
    const p = toDoc(ev);
    const hit = hitTest(docRef.current.elements, p);
    if (!hit) {
      props.onSelect([]);
      return;
    }
    let ids = selected;
    if (ev.shiftKey) {
      ids = selected.includes(hit.id)
        ? selected.filter((i) => i !== hit.id)
        : [...selected, hit.id];
      props.onSelect(ids);
      return;
    }
    if (!selected.includes(hit.id)) {
      ids = [hit.id];
      props.onSelect(ids);
    }
    startMove(ev, ids);
  }

  function onDoubleClick(ev: React.MouseEvent) {
    if (!canEdit) return;
    const hit = hitTest(docRef.current.elements, toDoc(ev));
    if (hit && hit.type === 'text' && !hit.locked) {
      props.onSelect([hit.id]);
      props.onEditing(hit.id);
    }
  }

  const single = selected.length === 1 ? doc.elements.find((e) => e.id === selected[0]) : undefined;
  const editing = editingId
    ? (doc.elements.find((e) => e.id === editingId) as TextEl | undefined)
    : undefined;

  const frame = (e: El, withHandles: boolean) => {
    const handles = HANDLES.filter((h) => (e.type === 'text' ? handleVector(h).x !== 0 : true));
    return (
      <div
        key={e.id}
        className="pointer-events-none absolute"
        style={{
          left: e.x * scale,
          top: e.y * scale,
          width: e.w * scale,
          height: e.h * scale,
          transform: `rotate(${e.rotation}deg)`,
          transformOrigin: '50% 50%',
          outline: `2px solid ${e.locked ? '#94a3b8' : '#2563eb'}`,
          outlineOffset: 0,
        }}
      >
        {withHandles && !e.locked && canEdit && (
          <>
            {handles.map((h) => {
              const v = handleVector(h);
              return (
                <span
                  key={h}
                  role="presentation"
                  onPointerDown={(ev) => startResize(ev, e, h)}
                  className="pointer-events-auto absolute h-3 w-3 rounded-[3px] border-2 border-blue-600 bg-white"
                  style={{
                    left: `${(v.x + 1) * 50}%`,
                    top: `${(v.y + 1) * 50}%`,
                    transform: 'translate(-50%, -50%)',
                    cursor: CURSORS[h],
                    touchAction: 'none',
                  }}
                />
              );
            })}
            <span
              role="presentation"
              onPointerDown={(ev) => startRotate(ev, e)}
              className="pointer-events-auto absolute flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow"
              style={{
                left: '50%',
                top: -34,
                transform: 'translateX(-50%)',
                cursor: 'grab',
                touchAction: 'none',
              }}
            >
              <RotateCw size={13} aria-hidden />
            </span>
          </>
        )}
      </div>
    );
  };

  const editor = useMemo(() => {
    if (!editing) return null;
    const rtl = isRtl(editing.text);
    return { rtl, family: fontStack(editing.font, brand, rtl) };
  }, [editing, brand]);

  // Stop editing when the page is clicked elsewhere, or the element disappears.
  useEffect(() => {
    if (editingId && !editing) props.onEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, editing]);

  return (
    <div ref={wrapRef} className="flex w-full justify-center">
      <div
        ref={stageRef}
        className="relative select-none overflow-visible shadow-md"
        style={{ width: DW * scale, height: DH * scale, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          role="img"
          aria-label="Design"
          style={{ cursor: canEdit ? 'default' : 'not-allowed' }}
        />
        <div className="pointer-events-none absolute inset-0 overflow-visible">
          {canEdit &&
            doc.elements
              .filter((e) => selected.includes(e.id) && e.id !== editingId)
              .map((e) => frame(e, selected.length === 1))}
          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <span
                key={i}
                className="absolute top-0 h-full w-px bg-fuchsia-500"
                style={{ left: g.at * scale }}
              />
            ) : (
              <span
                key={i}
                className="absolute left-0 h-px w-full bg-fuchsia-500"
                style={{ top: g.at * scale }}
              />
            ),
          )}
          {editing && editor && (
            <textarea
              autoFocus
              value={editing.text}
              dir="auto"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const next = withTextHeight({ ...editing, text: e.target.value }, brand);
                replaceEls([next]);
              }}
              onBlur={() => props.onEditing(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') props.onEditing(null);
                e.stopPropagation();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
              style={{
                left: editing.x * scale,
                top: editing.y * scale,
                width: editing.w * scale,
                height: editing.h * scale,
                transform: `rotate(${editing.rotation}deg)`,
                transformOrigin: '50% 50%',
                padding: editing.padding * scale,
                fontFamily: editor.family,
                fontSize: editing.size * scale,
                fontWeight: editing.bold ? 700 : 500,
                fontStyle: editing.italic ? 'italic' : 'normal',
                lineHeight: editing.lineHeight,
                letterSpacing: editor.rtl ? 0 : editing.letterSpacing * scale,
                textAlign: editing.align,
                textTransform: editing.uppercase ? 'uppercase' : 'none',
                color: resolveFill(editing.color, brand),
                background: editing.box ? resolveFill(editing.box, brand) : 'transparent',
                borderRadius: editing.boxRadius * scale,
                caretColor: resolveFill(editing.color, brand),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export { contains };
