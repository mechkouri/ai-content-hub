'use client';

import {
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Lock,
  Shapes,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthImage } from '@/components/auth-image';
import { Stage, withTextHeight } from '@/components/design/stage';
import { Toolbar } from '@/components/design/toolbar';
import { useHistory } from '@/components/design/use-history';
import {
  AnyContent,
  apiBlob,
  apiFetch,
  ApiError,
  BrandKit,
  canUploadMedia,
  ContentDetail,
  ContentSummary,
  MediaAsset,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import {
  Brand,
  cloneDoc,
  DEFAULT_BRAND,
  DesignFormat,
  Doc,
  El,
  emptyDoc,
  FORMAT_IDS,
  FORMATS,
  isRtl,
  makeImage,
  makeLogo,
  makeShape,
  makeText,
  MAX_ELEMENTS,
  newId,
  readableOn,
  resizeDoc,
  resolveFill,
  TextEl,
} from '@/lib/design/doc';
import { ensureDocFonts, renderDoc, textHeight } from '@/lib/design/render';
import {
  BUILT_IN,
  buildBuiltIn,
  builtInName,
  builtInTexts,
  CATEGORIES,
  SavedTemplate,
  TemplateCategory,
} from '@/lib/design/templates';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

type Tab = 'templates' | 'elements' | 'photos' | 'layers';

const firstLine = (s: unknown, max: number) => {
  const line = String(s ?? '')
    .split('\n')[0]
    .trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

/** The words a post gives a design, and the picture shape that suits its network. */
function fromContent(kind: string, c: AnyContent) {
  const x = c as Record<string, any>;
  if (kind === 'ARTICLE') {
    return {
      headline: firstLine(x.h1, 110),
      subline: firstLine(x.excerpt, 140),
      cta: '',
      format: 'landscape' as DesignFormat,
    };
  }
  const main = kind === 'INSTAGRAM' ? x.caption : x.postText;
  return {
    headline: firstLine(main, 110),
    subline: '',
    cta: firstLine(x.cta, 40),
    format: (kind === 'INSTAGRAM' ? 'square' : 'landscape') as DesignFormat,
  };
}

async function loadImage(orgId: string, assetId: string): Promise<HTMLImageElement> {
  const blob = await apiBlob(`/organizations/${orgId}/media/${assetId}/content`);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image'));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/** A small picture of a design. */
function Thumb({
  doc,
  brand,
  images,
  logo,
}: {
  doc: Doc;
  brand: Brand;
  images: Map<string, HTMLImageElement>;
  logo: HTMLImageElement | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const draw = () => live && ref.current && renderDoc(ref.current, doc, brand, { images, logo });
    draw();
    ensureDocFonts(doc, brand).then(draw);
    return () => {
      live = false;
    };
  }, [doc, brand, images, logo]);
  return <canvas ref={ref} className="max-h-full max-w-full object-contain" aria-hidden />;
}

const TEXT_AFFECTING = [
  'text',
  'size',
  'w',
  'font',
  'bold',
  'italic',
  'uppercase',
  'lineHeight',
  'letterSpacing',
  'padding',
] as const;

export default function DesignStudioPage() {
  const { currentOrgId, currentRole, memberships } = useApp();
  const { t } = useI18n();
  const canSave = canUploadMedia(currentRole);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const history = useHistory<Doc>(emptyDoc('square'));
  const doc = history.value;
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('templates');
  const [filter, setFilter] = useState<TemplateCategory | 'all' | 'mine'>('all');

  const [kit, setKit] = useState<BrandKit | null>(null);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [contents, setContents] = useState<ContentSummary[]>([]);
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [contentId, setContentId] = useState('');
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [fontTick, setFontTick] = useState(0);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<TemplateCategory>('other');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attachedTo, setAttachedTo] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const orgName =
    memberships.find((m) => m.organizationId === currentOrgId)?.organization.name ?? '';

  const brand: Brand = useMemo(
    () => ({
      primary: kit?.primaryColor ?? DEFAULT_BRAND.primary,
      secondary: kit?.secondaryColor ?? DEFAULT_BRAND.secondary,
      accent: kit?.accentColor ?? DEFAULT_BRAND.accent,
      headingFont: kit?.headingFont ?? DEFAULT_BRAND.headingFont,
      bodyFont: kit?.bodyFont ?? DEFAULT_BRAND.bodyFont,
    }),
    [kit],
  );

  // ----- data
  useEffect(() => {
    if (!currentOrgId) return;
    const base = `/organizations/${currentOrgId}`;
    apiFetch<BrandKit>(`${base}/brand-kits/active`)
      .then(setKit)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 404)) setError(describeError(e));
        setKit(null);
      });
    apiFetch<MediaAsset[]>(`${base}/media`)
      .then(setMedia)
      .catch(() => setMedia([]));
    apiFetch<ContentSummary[]>(`${base}/content`)
      .then(setContents)
      .catch(() => setContents([]));
    apiFetch<SavedTemplate[]>(`${base}/design-templates`)
      .then(setSaved)
      .catch(() => setSaved([]));
  }, [currentOrgId]);

  const logoId = kit?.mainLogoId || kit?.altLogoId || '';
  useEffect(() => {
    setLogo(null);
    if (!currentOrgId || !logoId) return;
    let live = true;
    loadImage(currentOrgId, logoId)
      .then((i) => live && setLogo(i))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [currentOrgId, logoId]);

  // Pictures used by the page are loaded once and kept.
  const neededIds = useMemo(
    () => [...new Set(doc.elements.flatMap((e) => (e.type === 'image' ? [e.assetId] : [])))],
    [doc.elements],
  );
  useEffect(() => {
    if (!currentOrgId) return;
    const missing = neededIds.filter((id) => !images.has(id));
    if (missing.length === 0) return;
    let live = true;
    Promise.all(
      missing.map((id) =>
        loadImage(currentOrgId, id)
          .then((img) => [id, img] as const)
          .catch(() => null),
      ),
    ).then((got) => {
      if (!live) return;
      setImages((prev) => {
        const next = new Map(prev);
        for (const g of got) if (g) next.set(g[0], g[1]);
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, [currentOrgId, neededIds, images]);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts)
      document.fonts.ready.then(() => setFontTick((n) => n + 1)).catch(() => undefined);
  }, []);

  // ----- editing helpers
  const lastEdit = useRef({ key: '', at: 0 });
  /** One undo step per burst of the same kind of change (typing in a number box, dragging a slider). */
  const commitCoalesced = (key: string, next: Doc) => {
    const now = Date.now();
    if (lastEdit.current.key === key && now - lastEdit.current.at < 700) history.live(next);
    else history.commit(next);
    lastEdit.current = { key, at: now };
  };
  const apply = (fn: (d: Doc) => Doc) => history.commit(fn(history.ref.current));

  const selectedEls = doc.elements.filter((e) => selected.includes(e.id));
  const single = selectedEls.length === 1 ? selectedEls[0] : null;

  function updateSelected(patch: Partial<El>) {
    const keys = Object.keys(patch);
    const d = history.ref.current;
    const next: Doc = {
      ...d,
      elements: d.elements.map((e) => {
        if (!selected.includes(e.id)) return e;
        let merged = { ...e, ...patch } as El;
        if (
          merged.type === 'text' &&
          keys.some((k) => (TEXT_AFFECTING as readonly string[]).includes(k))
        ) {
          merged = withTextHeight(merged, brand);
        }
        return merged;
      }),
    };
    commitCoalesced(`${selected.join(',')}:${keys.join(',')}`, next);
  }

  const inkOnPage = () => {
    const bg = resolveFill(history.ref.current.background, brand);
    return readableOn(bg) === '#ffffff' ? 'white' : 'dark';
  };

  function addElement(el: El, startEditing = false) {
    const d = history.ref.current;
    if (d.elements.length >= MAX_ELEMENTS) {
      setError(t('dx.tooMany', { n: MAX_ELEMENTS }));
      return;
    }
    history.commit({ ...d, elements: [...d.elements, el] });
    setSelected([el.id]);
    if (startEditing) {
      history.begin();
      setEditing(el.id);
    }
    setNotice('');
  }

  function addText(kind: 'heading' | 'sub' | 'body' | 'button') {
    const { w: W, h: H } = FORMATS[history.ref.current.format];
    const base = Math.min(W, H);
    const sample = t(`dx.sample.${kind}` as MessageKey);
    const common = {
      x: 0,
      y: 0,
      color: inkOnPage() as string,
      align: (isRtl(sample) ? 'right' : 'left') as TextEl['align'],
    };
    const el: TextEl =
      kind === 'heading'
        ? makeText({
            ...common,
            text: sample,
            size: Math.round(base * 0.09),
            w: Math.round(W * 0.7),
          })
        : kind === 'sub'
          ? makeText({
              ...common,
              text: sample,
              font: 'body',
              bold: false,
              size: Math.round(base * 0.045),
              w: Math.round(W * 0.7),
            })
          : kind === 'body'
            ? makeText({
                ...common,
                text: sample,
                font: 'body',
                bold: false,
                size: Math.round(base * 0.032),
                w: Math.round(W * 0.6),
              })
            : makeText({
                text: sample,
                font: 'body',
                size: Math.round(base * 0.034),
                color: 'dark',
                align: 'center',
                box: 'accent',
                padding: Math.round(base * 0.028),
                boxRadius: 999,
                w: Math.round(base * 0.34),
                lineHeight: 1.1,
              });
    const sized = withTextHeight(el, brand);
    sized.x = Math.round((W - sized.w) / 2);
    sized.y = Math.round((H - sized.h) / 2);
    addElement(sized, true);
  }

  function addShape(kind: 'rect' | 'rounded' | 'circle' | 'line' | 'fade') {
    const { w: W, h: H } = FORMATS[history.ref.current.format];
    const s = Math.round(Math.min(W, H) * 0.4);
    const el =
      kind === 'line'
        ? makeShape({
            w: Math.round(W * 0.4),
            h: 8,
            fill: 'accent',
            x: Math.round(W * 0.3),
            y: Math.round(H / 2),
          })
        : kind === 'fade'
          ? makeShape({
              shape: 'gradient',
              fill: 'dark',
              x: 0,
              y: Math.round(H * 0.4),
              w: W,
              h: Math.round(H * 0.6),
              opacity: 0.8,
            })
          : makeShape({
              shape: kind === 'circle' ? 'ellipse' : 'rect',
              radius: kind === 'rounded' ? Math.round(s * 0.15) : 0,
              w: s,
              h: s,
              x: Math.round((W - s) / 2),
              y: Math.round((H - s) / 2),
            });
    addElement(el);
  }

  function addLogo() {
    const { w: W, h: H } = FORMATS[history.ref.current.format];
    const s = Math.round(Math.min(W, H) * 0.18);
    addElement(makeLogo({ w: s, h: s, x: Math.round((W - s) / 2), y: Math.round((H - s) / 2) }));
  }

  async function addPhoto(asset: MediaAsset, asBackground: boolean) {
    if (!currentOrgId) return;
    setError('');
    try {
      let img = images.get(asset.id);
      if (!img) {
        img = await loadImage(currentOrgId, asset.id);
        const loaded = img;
        setImages((prev) => new Map(prev).set(asset.id, loaded));
      }
      const { w: W, h: H } = FORMATS[history.ref.current.format];
      let el;
      if (asBackground) {
        el = makeImage(asset.id, { x: 0, y: 0, w: W, h: H, fit: 'cover' });
      } else {
        const k = Math.min((W * 0.7) / img.naturalWidth, (H * 0.7) / img.naturalHeight);
        const w = Math.round(img.naturalWidth * k);
        const h = Math.round(img.naturalHeight * k);
        el = makeImage(asset.id, { w, h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) });
      }
      const d = history.ref.current;
      if (d.elements.length >= MAX_ELEMENTS) return setError(t('dx.tooMany', { n: MAX_ELEMENTS }));
      history.commit({
        ...d,
        elements: asBackground ? [el, ...d.elements] : [...d.elements, el],
      });
      setSelected([el.id]);
    } catch {
      setError(t('dz.imageFailed'));
    }
  }

  async function uploadPhoto(file: File) {
    if (!currentOrgId) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const asset = await apiFetch<MediaAsset>(`/organizations/${currentOrgId}/media`, {
        method: 'POST',
        body: form,
      });
      setMedia((m) => [asset, ...m]);
      await addPhoto(asset, false);
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  const removeSelected = useCallback(() => {
    const ids = selected;
    if (ids.length === 0) return;
    apply((d) => ({ ...d, elements: d.elements.filter((e) => !ids.includes(e.id)) }));
    setSelected([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function duplicateSelected() {
    const d = history.ref.current;
    const copies = d.elements
      .filter((e) => selected.includes(e.id))
      .map((e) => ({ ...e, id: newId(), x: e.x + 30, y: e.y + 30, locked: false }) as El);
    if (copies.length === 0 || d.elements.length + copies.length > MAX_ELEMENTS) return;
    history.commit({ ...d, elements: [...d.elements, ...copies] });
    setSelected(copies.map((c) => c.id));
  }

  function reorder(mode: 'front' | 'forward' | 'backward' | 'back') {
    apply((d) => {
      const els = [...d.elements];
      const ids = els.filter((e) => selected.includes(e.id));
      if (mode === 'front')
        return { ...d, elements: [...els.filter((e) => !selected.includes(e.id)), ...ids] };
      if (mode === 'back')
        return { ...d, elements: [...ids, ...els.filter((e) => !selected.includes(e.id))] };
      const step = mode === 'forward' ? 1 : -1;
      const order = step > 0 ? [...els.keys()].reverse() : [...els.keys()];
      for (const i of order) {
        if (!selected.includes(els[i].id)) continue;
        const j = i + step;
        if (j < 0 || j >= els.length || selected.includes(els[j].id)) continue;
        [els[i], els[j]] = [els[j], els[i]];
      }
      return { ...d, elements: els };
    });
  }

  function toggleLock() {
    apply((d) => ({
      ...d,
      elements: d.elements.map((e) => (selected.includes(e.id) ? { ...e, locked: !e.locked } : e)),
    }));
  }

  function changeFormat(format: DesignFormat) {
    const d = history.ref.current;
    if (format === d.format) return;
    const resized = resizeDoc(d, format);
    resized.elements = resized.elements.map((e) =>
      e.type === 'text' ? withTextHeight(e, brand) : e,
    );
    history.commit(resized);
  }

  // ----- templates
  const builtInDocs = useMemo(
    () => {
      void fontTick;
      return BUILT_IN.map((b) => ({
        b,
        doc: buildBuiltIn(b, builtInTexts(b, t), brand),
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, brand, fontTick],
  );

  function applyDoc(next: Doc) {
    setSelected([]);
    setEditing(null);
    setNotice('');
    setAttachedTo('');
    history.commit(next);
  }

  async function pickContent(id: string) {
    setContentId(id);
    setNotice('');
    setAttachedTo('');
    if (!id || !currentOrgId) return;
    try {
      const d = await apiFetch<ContentDetail>(`/organizations/${currentOrgId}/content/${id}`);
      const s = fromContent(d.piece.kind, d.piece.content);
      const cur = history.ref.current;
      if (cur.format !== s.format) changeFormat(s.format);
      // Fill the words of the current design: the biggest text is the title, a boxed capitals label is the
      // tag, another boxed text is the button, and a smaller plain text is the second line.
      const texts = history.ref.current.elements.filter((e): e is TextEl => e.type === 'text');
      if (texts.length === 0) return;
      const head = [...texts].sort((a, b) => b.size - a.size)[0];
      const label = texts.find((e) => e.box && e.uppercase);
      const button = texts.find((e) => e.box && !e.uppercase);
      const second = texts.find((e) => !e.box && e.id !== head.id);
      const set = new Map<string, string>();
      if (s.headline) set.set(head.id, s.headline);
      if (button && s.cta) set.set(button.id, s.cta);
      if (second && s.subline) set.set(second.id, s.subline);
      if (label) void label;
      const d2 = history.ref.current;
      history.commit({
        ...d2,
        elements: d2.elements.map((e) =>
          e.type === 'text' && set.has(e.id)
            ? withTextHeight({ ...e, text: set.get(e.id)! }, brand)
            : e,
        ),
      });
    } catch (e) {
      setError(describeError(e));
    }
  }

  // ----- export, save, attach
  const exportBlob = useCallback(async (): Promise<Blob> => {
    const d = history.ref.current;
    await ensureDocFonts(d, brand);
    const canvas = document.createElement('canvas');
    renderDoc(canvas, d, brand, { images, logo });
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export'))), 'image/jpeg', 0.92),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, images, logo]);

  const fileName = () => `design-${doc.format}-${Date.now().toString(36)}.jpg`;

  async function download() {
    setError('');
    try {
      const blob = await exportBlob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      setError(t('dz.exportFailed'));
    }
  }

  async function saveImage(attach: boolean) {
    if (!currentOrgId) return;
    setBusy(true);
    setError('');
    setNotice('');
    setAttachedTo('');
    try {
      const blob = await exportBlob();
      const form = new FormData();
      form.append('file', new File([blob], fileName(), { type: 'image/jpeg' }));
      const asset = await apiFetch<MediaAsset>(`/organizations/${currentOrgId}/media`, {
        method: 'POST',
        body: form,
      });
      setMedia((m) => [asset, ...m]);
      if (attach && contentId) {
        const base = `/organizations/${currentOrgId}/content/${contentId}/images`;
        await apiFetch(base, { method: 'POST', body: JSON.stringify({ assetId: asset.id }) });
        const alt = doc.elements
          .filter((e): e is TextEl => e.type === 'text' && !e.box)
          .sort((a, b) => b.size - a.size)[0]?.text;
        if (alt?.trim()) {
          await apiFetch(`${base}/${asset.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ altText: alt.trim().slice(0, 200) }),
          }).catch(() => undefined);
        }
        setNotice(t('dz.attached'));
        setAttachedTo(contentId);
      } else setNotice(t('dz.saved'));
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  }

  async function saveTemplate() {
    if (!currentOrgId || tplName.trim().length < 2) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await apiFetch<SavedTemplate>(
        `/organizations/${currentOrgId}/design-templates`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: tplName.trim(),
            category: tplCategory,
            spec: cloneDoc(doc),
          }),
        },
      );
      setSaved((s) => [created, ...s]);
      setTplName('');
      setNotice(t('dz.templateSaved'));
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  }

  async function deleteTemplate(tpl: SavedTemplate) {
    if (!currentOrgId || !confirm(t('dz.confirmDelete', { name: tpl.name }))) return;
    try {
      await apiFetch(`/organizations/${currentOrgId}/design-templates/${tpl.id}`, {
        method: 'DELETE',
      });
      setSaved((s) => s.filter((x) => x.id !== tpl.id));
    } catch (e) {
      setError(describeError(e));
    }
  }

  // ----- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        setSelected([]);
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      } else if (mod && e.key.toLowerCase() === 'd' && selected.length) {
        e.preventDefault();
        duplicateSelected();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === 'Escape') setSelected([]);
      else if (e.key.startsWith('Arrow') && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const d = history.ref.current;
        commitCoalesced('nudge', {
          ...d,
          elements: d.elements.map((x) =>
            selected.includes(x.id) && !x.locked ? { ...x, x: x.x + dx, y: x.y + dy } : x,
          ),
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, removeSelected]);

  // ----- screen
  const { w: W, h: H } = FORMATS[doc.format];
  const showBuiltIn = filter !== 'mine';
  const builtInShown = builtInDocs.filter(({ b }) => filter === 'all' || b.category === filter);
  const savedShown = saved.filter(
    (s) => filter === 'all' || filter === 'mine' || s.category === filter,
  );
  const cats = ['all', ...CATEGORIES.filter((c) => c !== 'other'), 'mine'] as const;

  const tabButton = (id: Tab, icon: ReactNode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold ${
        tab === id ? 'bg-brand-soft text-brand' : 'text-slate-600 hover:bg-surface'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const tplCard = (
    key: string,
    name: string,
    category: TemplateCategory,
    d: Doc,
    onDelete?: () => void,
  ) => (
    <li key={key} className="group relative">
      <button
        type="button"
        onClick={() => applyDoc(cloneDoc(d))}
        className="block w-full overflow-hidden rounded-xl border border-line text-start transition hover:border-brand hover:shadow-sm"
      >
        <span className="flex aspect-[4/3] items-center justify-center bg-surface-sub p-2">
          <Thumb doc={d} brand={brand} images={images} logo={logo} />
        </span>
        <span className="block p-2">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block text-[11px] text-muted">
            {t(`dz.cat.${category}` as MessageKey)} · {t(`dz.fmt.${d.format}` as MessageKey)}
          </span>
        </span>
      </button>
      {onDelete && canSave && (
        <button
          type="button"
          onClick={onDelete}
          className="btn-danger btn-sm absolute end-2 top-2 opacity-0 focus:opacity-100 group-hover:opacity-100"
          aria-label={t('media.deleteLabel', { name })}
        >
          <Trash2 size={13} aria-hidden />
        </button>
      )}
    </li>
  );

  const layerName = (e: El) =>
    e.type === 'text'
      ? firstLine(e.text, 28) || t('dx.layer.text')
      : e.type === 'shape'
        ? t('dx.layer.shape')
        : e.type === 'image'
          ? t('dx.layer.image')
          : t('dx.layer.logo');

  return (
    <div className="space-y-3">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold leading-tight">
            {t('nav.designStudio')}
          </h1>
          <p className="text-sm text-muted">{t('dz.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input !w-auto"
            aria-label={t('dz.format')}
            value={doc.format}
            onChange={(e) => changeFormat(e.target.value as DesignFormat)}
          >
            {FORMAT_IDS.map((id) => (
              <option key={id} value={id}>
                {t(`dz.fmt.${id}` as MessageKey)} · {FORMATS[id].w}×{FORMATS[id].h}
              </option>
            ))}
          </select>
          <button className="btn-ghost" onClick={download} disabled={busy}>
            {t('dz.download')}
          </button>
          {canSave && (
            <button className="btn-ghost" onClick={() => saveImage(false)} disabled={busy}>
              {busy ? t('det.saving') : t('dz.saveLibrary')}
            </button>
          )}
          {canSave && contentId && (
            <button className="btn-primary" onClick={() => saveImage(true)} disabled={busy}>
              {t('dz.saveAttach')}
            </button>
          )}
        </div>
        {!kit && (
          <p className="w-full rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
            {t('dz.noKit')}
          </p>
        )}
        {error && (
          <p className="w-full rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
            {error}
          </p>
        )}
        {notice && (
          <p className="w-full rounded-lg border border-green-200 bg-ok-soft p-3 text-sm text-ok-ink">
            {notice}{' '}
            {attachedTo && (
              <Link href={`/studio/${attachedTo}`} className="font-semibold underline">
                {t('dz.openPost')}
              </Link>
            )}
          </p>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        <aside className="card flex max-h-[80vh] min-h-[420px] flex-col overflow-hidden">
          <div className="flex gap-1 border-b border-line p-2">
            {tabButton(
              'templates',
              <LayoutTemplate size={18} aria-hidden />,
              t('dx.tab.templates'),
            )}
            {tabButton('elements', <Shapes size={18} aria-hidden />, t('dx.tab.elements'))}
            {tabButton('photos', <ImageIcon size={18} aria-hidden />, t('dx.tab.photos'))}
            {tabButton('layers', <Layers size={18} aria-hidden />, t('dx.tab.layers'))}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {tab === 'templates' && (
              <>
                <label className="block text-sm">
                  <span className="font-semibold">{t('dz.fromContent')}</span>
                  <select
                    className="input mt-1"
                    value={contentId}
                    onChange={(e) => pickContent(e.target.value)}
                  >
                    <option value="">{t('dz.noContent')}</option>
                    {contents.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title.slice(0, 70)}
                      </option>
                    ))}
                  </select>
                </label>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="tablist"
                  aria-label={t('dz.templates')}
                >
                  {cats.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="tab"
                      aria-selected={filter === c}
                      onClick={() => setFilter(c)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        filter === c
                          ? 'bg-brand text-white'
                          : 'bg-slate-200/70 text-slate-700 hover:bg-slate-300/70'
                      }`}
                    >
                      {c === 'all'
                        ? t('dz.all')
                        : c === 'mine'
                          ? `${t('dz.mine')}${saved.length ? ` (${saved.length})` : ''}`
                          : t(`dz.cat.${c}` as MessageKey)}
                    </button>
                  ))}
                </div>
                {filter === 'mine' && savedShown.length === 0 && (
                  <p className="text-sm text-muted">{t('dz.noMine')}</p>
                )}
                <ul className="grid grid-cols-2 gap-2.5">
                  {savedShown.map((s) =>
                    tplCard(s.id, s.name, s.category, s.spec, () => deleteTemplate(s)),
                  )}
                  {showBuiltIn &&
                    builtInShown.map(({ b, doc: d }) =>
                      tplCard(b.id, builtInName(b, t), b.category, d),
                    )}
                </ul>
              </>
            )}

            {tab === 'elements' && (
              <>
                <section className="space-y-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Type size={15} aria-hidden /> {t('dx.text')}
                  </h2>
                  <button
                    className="btn-ghost w-full !justify-start !text-lg font-bold"
                    onClick={() => addText('heading')}
                  >
                    {t('dx.heading')}
                  </button>
                  <button
                    className="btn-ghost w-full !justify-start"
                    onClick={() => addText('sub')}
                  >
                    {t('dx.subheading')}
                  </button>
                  <button
                    className="btn-ghost w-full !justify-start text-sm"
                    onClick={() => addText('body')}
                  >
                    {t('dx.body')}
                  </button>
                  <button
                    className="btn-ghost w-full !justify-start"
                    onClick={() => addText('button')}
                  >
                    {t('dx.button')}
                  </button>
                </section>
                <section className="space-y-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Shapes size={15} aria-hidden /> {t('dx.shapes')}
                  </h2>
                  <div className="grid grid-cols-3 gap-2">
                    {(['rect', 'rounded', 'circle', 'line', 'fade'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-line p-2 text-[11px] font-semibold hover:border-brand"
                        onClick={() => addShape(k)}
                      >
                        <span
                          className="block bg-slate-400"
                          style={{
                            width: k === 'line' ? 40 : 32,
                            height: k === 'line' ? 4 : 32,
                            borderRadius: k === 'circle' ? 999 : k === 'rounded' ? 8 : 0,
                            background:
                              k === 'fade' ? 'linear-gradient(#cbd5e1, #0f172a)' : undefined,
                          }}
                        />
                        {t(`dx.shape.${k}` as MessageKey)}
                      </button>
                    ))}
                  </div>
                </section>
                <button className="btn-ghost w-full" onClick={addLogo}>
                  {t('dx.addLogo')}
                </button>
                <p className="text-xs text-muted">{t('dx.tip')}</p>
              </>
            )}

            {tab === 'photos' && (
              <>
                {canSave && (
                  <>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
                    />
                    <button
                      className="btn-ghost w-full"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                    >
                      <Upload size={15} aria-hidden /> {t('dx.upload')}
                    </button>
                  </>
                )}
                {media.length === 0 ? (
                  <p className="text-sm text-muted">{t('dx.noPhotos')}</p>
                ) : (
                  <ul className="grid grid-cols-2 gap-2">
                    {media.map((m) => (
                      <li
                        key={m.id}
                        className="group relative overflow-hidden rounded-lg border border-line"
                      >
                        <button
                          type="button"
                          className="block w-full"
                          title={m.filename}
                          onClick={() => addPhoto(m, false)}
                        >
                          <AuthImage
                            orgId={currentOrgId!}
                            assetId={m.id}
                            alt={m.filename}
                            className="h-24 w-full bg-slate-50 object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm absolute inset-x-1 bottom-1 bg-white/90 opacity-0 focus:opacity-100 group-hover:opacity-100"
                          onClick={() => addPhoto(m, true)}
                        >
                          {t('dx.asBackground')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {tab === 'layers' && (
              <>
                {doc.elements.length === 0 && (
                  <p className="text-sm text-muted">{t('dx.noLayers')}</p>
                )}
                <ul className="space-y-1">
                  {[...doc.elements].reverse().map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setSelected([e.id])}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-start text-sm ${
                          selected.includes(e.id)
                            ? 'border-brand bg-brand-soft'
                            : 'border-line hover:bg-surface'
                        }`}
                      >
                        <span className="w-12 shrink-0 text-[10px] font-bold uppercase text-slate-400">
                          {e.type === 'text'
                            ? 'T'
                            : e.type === 'shape'
                              ? '▭'
                              : e.type === 'image'
                                ? '🖼'
                                : '◎'}
                        </span>
                        <span className="min-w-0 flex-1 truncate" dir="auto">
                          {layerName(e)}
                        </span>
                        {e.locked && <Lock size={13} aria-hidden className="text-slate-400" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {tab === 'templates' && canSave && (
            <div className="space-y-2 border-t border-line bg-surface p-3">
              <p className="text-sm font-semibold">{t('dz.saveTemplate')}</p>
              <p className="text-xs text-muted">{t('dz.saveTemplateHint')}</p>
              <div className="flex gap-2">
                <input
                  className="input"
                  maxLength={80}
                  placeholder={t('dz.templateName')}
                  aria-label={t('dz.templateName')}
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                />
                <select
                  className="input !w-auto"
                  value={tplCategory}
                  aria-label={t('dz.category')}
                  onChange={(e) => setTplCategory(e.target.value as TemplateCategory)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`dz.cat.${c}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || tplName.trim().length < 2 || doc.elements.length === 0}
                onClick={saveTemplate}
              >
                {t('dz.saveTemplateBtn')}
              </button>
            </div>
          )}
        </aside>

        <section className="min-w-0 space-y-3">
          <Toolbar
            el={single}
            count={selected.length}
            doc={doc}
            brand={brand}
            canEdit
            update={updateSelected}
            setBackground={(f) =>
              commitCoalesced('page-bg', { ...history.ref.current, background: f })
            }
            actions={{
              undo: () => {
                history.undo();
                setSelected([]);
              },
              redo: () => {
                history.redo();
                setSelected([]);
              },
              canUndo: history.canUndo,
              canRedo: history.canRedo,
              duplicate: duplicateSelected,
              remove: removeSelected,
              toFront: () => reorder('front'),
              forward: () => reorder('forward'),
              backward: () => reorder('backward'),
              toBack: () => reorder('back'),
              toggleLock,
            }}
          />
          <div className="relative rounded-xl bg-surface-sub p-4">
            <Stage
              doc={doc}
              brand={brand}
              images={images}
              logo={logo}
              selected={selected}
              onSelect={setSelected}
              editingId={editingId}
              onEditing={(id) => {
                if (id && !editingId) history.begin();
                if (!id && editingId) history.end();
                setEditing(id);
              }}
              onBegin={history.begin}
              onLive={history.live}
              onEnd={history.end}
              canEdit
              canvasRef={canvasRef}
            />
            {doc.elements.length === 0 && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-8 text-center text-sm font-semibold text-white/90 drop-shadow">
                {t('dx.blank')}
              </p>
            )}
            <p className="mt-2 text-center text-xs text-muted">
              {W}×{H} · {t('dz.hint')}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
