'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Italic,
  Lock,
  Redo2,
  Trash2,
  Undo2,
  Unlock,
} from 'lucide-react';
import { ReactNode } from 'react';
import { Brand, Doc, El, Fill, FONT_CHOICES } from '@/lib/design/doc';
import { useT } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { ColorField } from './color-field';

export interface ToolbarActions {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  duplicate: () => void;
  remove: () => void;
  toFront: () => void;
  forward: () => void;
  backward: () => void;
  toBack: () => void;
  toggleLock: () => void;
}

function IconButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border text-slate-700 disabled:opacity-40 ${
        active ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white hover:bg-surface'
      }`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />;

/** The controls for whatever is selected, like Canva's bar above the page. With nothing selected it shows the page colour. */
export function Toolbar({
  el,
  count,
  doc,
  brand,
  canEdit,
  update,
  setBackground,
  actions,
}: {
  el: El | null;
  count: number;
  doc: Doc;
  brand: Brand;
  canEdit: boolean;
  update: (patch: Partial<El>) => void;
  setBackground: (f: Fill) => void;
  actions: ToolbarActions;
}) {
  const t = useT();
  const off = !canEdit;

  return (
    <div className="flex min-h-[3.25rem] flex-wrap items-center gap-1.5 rounded-xl border border-line bg-white p-2">
      <IconButton label={t('dx.undo')} onClick={actions.undo} disabled={off || !actions.canUndo}>
        <Undo2 size={16} />
      </IconButton>
      <IconButton label={t('dx.redo')} onClick={actions.redo} disabled={off || !actions.canRedo}>
        <Redo2 size={16} />
      </IconButton>
      <Sep />

      {!el && count === 0 && (
        <ColorField
          label={t('dx.pageBg')}
          value={doc.background}
          brand={brand}
          onChange={(v) => v && setBackground(v)}
        />
      )}

      {el?.type === 'text' && (
        <>
          <select
            aria-label={t('dx.font')}
            className="input !h-9 !w-auto !py-0 text-sm"
            disabled={off}
            value={el.font}
            onChange={(e) => update({ font: e.target.value })}
          >
            {FONT_CHOICES.map((f) => (
              <option key={f} value={f}>
                {f === 'heading' ? t('dx.font.heading') : f === 'body' ? t('dx.font.body') : f}
              </option>
            ))}
          </select>
          <input
            aria-label={t('dx.fontSize')}
            type="number"
            min={8}
            max={500}
            disabled={off}
            value={Math.round(el.size)}
            onChange={(e) =>
              update({ size: Math.min(500, Math.max(8, Number(e.target.value) || 8)) })
            }
            className="input !h-9 !w-[4.5rem] !py-0 text-sm"
          />
          <ColorField
            label={t('dx.color')}
            value={el.color}
            brand={brand}
            onChange={(v) => v && update({ color: v })}
          />
          <IconButton
            label={t('dx.bold')}
            active={el.bold}
            disabled={off}
            onClick={() => update({ bold: !el.bold })}
          >
            <Bold size={16} />
          </IconButton>
          <IconButton
            label={t('dx.italic')}
            active={el.italic}
            disabled={off}
            onClick={() => update({ italic: !el.italic })}
          >
            <Italic size={16} />
          </IconButton>
          <IconButton
            label={t('dx.upper')}
            active={el.uppercase}
            disabled={off}
            onClick={() => update({ uppercase: !el.uppercase })}
          >
            <span className="text-xs font-bold">AA</span>
          </IconButton>
          <IconButton
            label={t('dx.alignLeft')}
            active={el.align === 'left'}
            disabled={off}
            onClick={() => update({ align: 'left' })}
          >
            <AlignLeft size={16} />
          </IconButton>
          <IconButton
            label={t('dx.alignCenter')}
            active={el.align === 'center'}
            disabled={off}
            onClick={() => update({ align: 'center' })}
          >
            <AlignCenter size={16} />
          </IconButton>
          <IconButton
            label={t('dx.alignRight')}
            active={el.align === 'right'}
            disabled={off}
            onClick={() => update({ align: 'right' })}
          >
            <AlignRight size={16} />
          </IconButton>
          <ColorField
            label={t('dx.boxColour')}
            value={el.box}
            brand={brand}
            allowNone
            onChange={(v) =>
              update({
                box: v,
                padding: v && el.padding === 0 ? Math.round(el.size * 0.5) : v ? el.padding : 0,
                boxRadius: v && el.boxRadius === 0 ? Math.round(el.size * 0.7) : el.boxRadius,
              })
            }
          />
        </>
      )}

      {el?.type === 'shape' && (
        <>
          <ColorField
            label={t('dx.fill')}
            value={el.fill}
            brand={brand}
            onChange={(v) => v && update({ fill: v })}
          />
          {el.shape === 'rect' && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              {t('dx.radius')}
              <input
                type="range"
                min={0}
                max={Math.round(Math.min(el.w, el.h) / 2)}
                disabled={off}
                value={Math.min(el.radius, Math.round(Math.min(el.w, el.h) / 2))}
                onChange={(e) => update({ radius: Number(e.target.value) })}
                className="w-24"
              />
            </label>
          )}
        </>
      )}

      {el?.type === 'image' && (
        <>
          <IconButton
            label={el.fit === 'cover' ? t('dx.fit.contain') : t('dx.fit.cover')}
            disabled={off}
            onClick={() => update({ fit: el.fit === 'cover' ? 'contain' : 'cover' })}
          >
            <span className="text-[11px] font-bold">
              {el.fit === 'cover' ? t('dx.fit.cover') : t('dx.fit.contain')}
            </span>
          </IconButton>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            {t('dx.radius')}
            <input
              type="range"
              min={0}
              max={Math.round(Math.min(el.w, el.h) / 2)}
              disabled={off}
              value={Math.min(el.radius, Math.round(Math.min(el.w, el.h) / 2))}
              onChange={(e) => update({ radius: Number(e.target.value) })}
              className="w-24"
            />
          </label>
        </>
      )}

      {el && (
        <>
          <Sep />
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            {t('dx.opacity')}
            <input
              type="range"
              min={0}
              max={100}
              disabled={off}
              value={Math.round(el.opacity * 100)}
              onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
              className="w-20"
            />
          </label>
          <IconButton label={t('dx.toFront')} disabled={off} onClick={actions.toFront}>
            <ChevronsUp size={16} />
          </IconButton>
          <IconButton label={t('dx.forward')} disabled={off} onClick={actions.forward}>
            <ArrowUp size={16} />
          </IconButton>
          <IconButton label={t('dx.backward')} disabled={off} onClick={actions.backward}>
            <ArrowDown size={16} />
          </IconButton>
          <IconButton label={t('dx.toBack')} disabled={off} onClick={actions.toBack}>
            <ChevronsDown size={16} />
          </IconButton>
          <IconButton
            label={el.locked ? t('dx.unlock') : t('dx.lock')}
            active={!!el.locked}
            disabled={off}
            onClick={actions.toggleLock}
          >
            {el.locked ? <Lock size={16} /> : <Unlock size={16} />}
          </IconButton>
        </>
      )}
      {count > 0 && (
        <>
          <IconButton label={t('dx.duplicate')} disabled={off} onClick={actions.duplicate}>
            <Copy size={16} />
          </IconButton>
          <IconButton label={t('dx.delete')} disabled={off} onClick={actions.remove}>
            <Trash2 size={16} />
          </IconButton>
        </>
      )}
      {count > 1 && (
        <span className="ms-1 text-xs font-semibold text-slate-500">
          {t('dx.selectedN', { n: count })}
        </span>
      )}
    </div>
  );
}

export type { MessageKey };
