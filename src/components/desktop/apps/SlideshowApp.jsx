import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Presentation, Plus, Trash2, ArrowLeft, ChevronLeft, ChevronRight,
  Sparkles, Loader2, Image as ImageIcon, Save, Check,
  Type, MousePointer, AlignLeft, AlignCenter, AlignRight,
  ChevronUp, ChevronDown, Palette, FileText,
  Square, Circle as CircleIcon, Play, Pause, PanelLeft, PanelRight,
  LayoutGrid, Eye, ZoomIn, ZoomOut, X as XIcon,
  Volume2, VolumeX, Headphones, Zap, SlidersHorizontal, Download,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import {
  listSlideshows, getSlideshow, deleteSlideshow,
  generateSlideshow, generateSlideImage, createSlideshow, updateSlideshow,
} from '../../../api/slideshows';
import LoadingSpinner from '../../shared/LoadingSpinner';
import { useAuth } from '../../../context/AuthContext';
import { useWindowManager } from '../../../context/WindowManagerContext';

// ─────────────────────────────────────────────────────────────────────────────
// THEMES  (only the slide canvas uses these — UI chrome stays glass)
//
// Each theme is a full design token set: surface stack (bg → surface → border),
// text stack (text → muted → faint), and a TWO-color accent pair so layouts
// that want a secondary highlight (numbered chips, compare panels) can lean on
// it. Font pairs are passed through so headlines vs body get distinct fonts —
// the editorial pairing (Playfair display + Inter body) is what gives a slide
// the "Google Slides — Streamline template" feel.
// ─────────────────────────────────────────────────────────────────────────────
const FONT_PAIRS = {
  editorial: { head: '"Fraunces", "Playfair Display", Georgia, serif',     body: '"Inter", system-ui, sans-serif',           letter: '-0.02em' },
  modern:    { head: '"Space Grotesk", "Inter", system-ui, sans-serif',    body: '"Inter", system-ui, sans-serif',           letter: '-0.025em' },
  humanist:  { head: '"Lora", "Source Serif 4", Georgia, serif',           body: '"Inter", system-ui, sans-serif',           letter: '-0.01em' },
  geometric: { head: '"Manrope", "Inter", system-ui, sans-serif',          body: '"Manrope", "Inter", system-ui, sans-serif', letter: '-0.03em' },
};

const THEMES = {
  // ── Light (Google Slides defaults are light — these match that energy) ──
  newsprint: { name: 'Newsprint', mode: 'light', bg: '#fbf7f0', surface: '#f3ece0', border: '#d8cbb1', text: '#1a1a1a', muted: '#5b5443', faint: '#a8a08c', accent: '#9b1c1c', accent2: '#1a3a5c', font: 'editorial' },
  ink:       { name: 'Ink',       mode: 'light', bg: '#ffffff', surface: '#f4f4f5', border: '#e4e4e7', text: '#0a0a0a', muted: '#52525b', faint: '#a1a1aa', accent: '#2563eb', accent2: '#0f172a', font: 'modern'    },
  mono:      { name: 'Mono',      mode: 'light', bg: '#f5f5f4', surface: '#e7e5e4', border: '#d6d3d1', text: '#1c1917', muted: '#57534e', faint: '#a8a29e', accent: '#1c1917', accent2: '#78716c', font: 'geometric' },
  sun:       { name: 'Sun',       mode: 'light', bg: '#fef9e7', surface: '#fef3c7', border: '#facc15', text: '#1f1300', muted: '#78350f', faint: '#a16207', accent: '#d97706', accent2: '#b45309', font: 'humanist'  },
  sage:      { name: 'Sage',      mode: 'light', bg: '#f3f7f2', surface: '#e0ebe0', border: '#a7c4a3', text: '#0e1f0e', muted: '#3f5b3d', faint: '#6b8e69', accent: '#15803d', accent2: '#0e3d20', font: 'humanist'  },
  rose:      { name: 'Rose',      mode: 'light', bg: '#fdf2f8', surface: '#fce7f3', border: '#f9a8d4', text: '#3a0e2c', muted: '#831843', faint: '#be185d', accent: '#be185d', accent2: '#831843', font: 'editorial' },

  // ── Dark (still high-contrast — text is white, not muted) ───────────────
  midnight:  { name: 'Midnight',  mode: 'dark',  bg: '#0a0a16', surface: '#13132a', border: '#2a2a4a', text: '#ffffff', muted: '#a5b4fc', faint: '#6b7280', accent: '#a78bfa', accent2: '#7c3aed', font: 'modern'    },
  slate:     { name: 'Slate',     mode: 'dark',  bg: '#0f172a', surface: '#1e293b', border: '#334155', text: '#f8fafc', muted: '#cbd5e1', faint: '#64748b', accent: '#38bdf8', accent2: '#0ea5e9', font: 'geometric' },
  ocean:     { name: 'Ocean',     mode: 'dark',  bg: '#02132f', surface: '#0a2547', border: '#1e3a5f', text: '#f0f9ff', muted: '#7dd3fc', faint: '#38bdf8', accent: '#22d3ee', accent2: '#0891b2', font: 'modern'    },
  forest:    { name: 'Forest',    mode: 'dark',  bg: '#06140e', surface: '#0e2419', border: '#1e3d2c', text: '#f0fdf4', muted: '#86efac', faint: '#4ade80', accent: '#4ade80', accent2: '#16a34a', font: 'humanist'  },
  plum:      { name: 'Plum',      mode: 'dark',  bg: '#1a0b1d', surface: '#2d1230', border: '#4a2050', text: '#fdf4ff', muted: '#e9d5ff', faint: '#c084fc', accent: '#f0abfc', accent2: '#c026d3', font: 'editorial' },
  coral:     { name: 'Coral',     mode: 'dark',  bg: '#1a0808', surface: '#2a0d0d', border: '#4a1818', text: '#fff7ed', muted: '#fed7aa', faint: '#fb923c', accent: '#fb7185', accent2: '#f43f5e', font: 'editorial' },
};

// Map AI-emitted palette/font hints onto the renderer's theme keys.
const PALETTE_TO_THEME = {
  ink:'ink', newsprint:'newsprint', ocean:'ocean', forest:'forest', plum:'plum',
  coral:'coral', mono:'mono', sun:'sun', midnight:'midnight', slate:'slate',
  rose:'rose', sage:'sage',
};

// Resolve the font pair for a theme — falls back to editorial if a deck has
// stored a custom font hint that overrides the theme default.
function fontFor(themeKey, fontHint) {
  const t = THEMES[themeKey] || THEMES.ink;
  const key = (fontHint && FONT_PAIRS[fontHint]) ? fontHint : (t.font || 'modern');
  return FONT_PAIRS[key];
}

// Inject Google Fonts once. The link sits in <head> so it survives unmounts
// and we don't pay the network cost twice. Idempotent.
function ensureFontsLoaded() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('slideshow-fonts')) return;
  const link = document.createElement('link');
  link.id = 'slideshow-fonts';
  link.rel = 'stylesheet';
  // Inter is already in the page; we add the display + alt body fonts here.
  link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Playfair+Display:wght@500;700;900&family=Lora:wght@500;600;700&family=Space+Grotesk:wght@500;600;700&family=Manrope:wght@500;600;700;800&display=swap';
  document.head.appendChild(link);
}

// ── Font auto-scaler: shrinks font proportionally for long text ──────────
// Used for hero titles that might span 4 to 14 words — we want big when short
// and merely large when long. Aggressive floor of 44% so an outlier doesn't
// produce an unreadable 8pt slide.
function fitFontSize(text = '', base, threshold = 20) {
  const n = String(text || '').length;
  if (n <= threshold) return base;
  return Math.max(Math.round(base * (threshold / n)), Math.round(base * 0.44));
}

// ── Split body prose into two roughly-equal halves for two-col layout ────
function splitBody(body = '') {
  const sents = (body.match(/[^.!?]+[.!?]+\s*/g) || [body]).map(s => s.trim()).filter(Boolean);
  if (sents.length <= 1) {
    const mid = Math.floor(body.length / 2);
    const space = body.lastIndexOf(' ', mid);
    return [body.slice(0, space || mid), body.slice(space ? space + 1 : mid)];
  }
  const half = Math.ceil(sents.length / 2);
  return [sents.slice(0, half).join(' '), sents.slice(half).join(' ')];
}

// Build a title text element where ONE word/phrase ("accent") is colored in
// the theme's accent hue. Works by splitting the text on the first match,
// emitting a single text element with a styled span. We model the highlight
// by returning a {parts: [{text, color}]} payload that RenderElement renders.
function styledTitle(text, accent, baseColor, accentColor) {
  if (!accent || !text) return { text, parts: null };
  const idx = text.toLowerCase().indexOf(String(accent).toLowerCase());
  if (idx < 0) return { text, parts: null };
  const before = text.slice(0, idx);
  const match  = text.slice(idx, idx + accent.length);
  const after  = text.slice(idx + accent.length);
  return {
    text,
    parts: [
      { text: before, color: baseColor },
      { text: match,  color: accentColor },
      { text: after,  color: baseColor },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT → ELEMENTS converter  (14 layout archetypes)
//
// Each layout returns an array of absolute-positioned `text` and `shape`
// elements (% coordinates 0–100). The renderer is dumb on purpose — all the
// design IQ lives here. New layouts: agenda, bullets, cards, numbered,
// compare, bigText. Existing ones rewritten with proper editorial typography
// (display font for titles, body font for prose), generous whitespace, and a
// single accent-color highlight per slide.
// ─────────────────────────────────────────────────────────────────────────────
function slideToElements(slide, themeKey, fontHint, image) {
  const t = THEMES[themeKey] || THEMES.ink;
  const f = fontFor(themeKey, fontHint);
  const isLight = t.mode === 'light';
  const id = s => `${slide.id}-${s}`;

  // helpers
  const R = (sid, x, y, w, h, color, opts = {}) =>
    ({ id: id(sid), kind: 'shape', shape: opts.shape || 'rect', x, y, w, h, color, sharp: opts.sharp ?? true, radius: opts.radius, gradient: opts.gradient });

  // Parse **bold** markers in text into a parts array for inline bold rendering.
  // Returns undefined if there are no markers (plain text path is faster).
  function parseBold(text, color) {
    if (!text || !text.includes('**')) return undefined;
    const parts = [];
    let last = 0;
    const rx = /\*\*([^*]+)\*\*/g;
    let m;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) parts.push({ text: text.slice(last, m.index), fontWeight: '400', color });
      parts.push({ text: m[1], fontWeight: '700', color });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last), fontWeight: '400', color });
    return parts.length > 1 ? parts : undefined;
  }

  // Clean **markers** from plain text (used when parts aren't supported, e.g. titles).
  const stripBold = (text) => (text || '').replace(/\*\*([^*]+)\*\*/g, '$1');

  const T = (sid, x, y, w, h, text, opts = {}) => {
    const cleanText = stripBold(text);
    const color = opts.color ?? t.text;
    const parts = opts.parts ?? parseBold(text, color);
    return { id: id(sid), kind: 'text', x, y, w, h,
      text: cleanText,
      fontSize: opts.fontSize ?? 20, fontWeight: opts.fontWeight ?? '400',
      color, align: opts.align ?? 'left',
      italic: opts.italic ?? false, fontFamily: opts.fontFamily ?? f.body,
      letterSpacing: opts.letterSpacing, lineHeight: opts.lineHeight, parts };
  };
  // Image element — renders an <img> with object-fit:cover by default. Used by
  // image-forward layouts (imageHero/imageRight/imageLeft/imageFull) and as an
  // optional accent on title/section slides.
  const I = (sid, x, y, w, h, src, opts = {}) =>
    ({ id: id(sid), kind: 'image', x, y, w, h, src,
       fit: opts.fit || 'cover', radius: opts.radius, opacity: opts.opacity });

  // Display headline preset — display font, tight letter-spacing.
  const HEAD = { fontFamily: f.head, fontWeight: '700', letterSpacing: f.letter, lineHeight: 1.05, color: t.text };
  const SUB  = { fontFamily: f.body, fontWeight: '400', color: t.muted, lineHeight: 1.45 };
  const EYEBROW_TEXT = (slide.eyebrow || '').toUpperCase();

  // Title with accent-word highlight (used by content/hero/title/etc).
  const titleStyled = styledTitle(slide.title || '', slide.accent, t.text, t.accent);

  switch (slide.layout) {

    // ─── 1. TITLE ──────────────────────────────────────────────────────────
    // Magazine-cover composition: huge bottom-left display title, eyebrow
    // floating top-left, decorative oversized numeral on the right hand
    // side, optional image as a top-band hero strip. No more sparse middle.
    case 'title': {
      const els = [];
      // Decorative geometry: a giant numeric "01" lives in the bottom-right
      // as faded accent — a magazine-style anchor that fills empty space.
      const decoColor = isLight ? t.accent + '14' : t.accent + '22';
      // Base background structure — accent bar + side surface band.
      els.push(R('topBar', 0, 0, 100, 0.5, t.accent));
      if (image) {
        // Image lives across the top half as a hero strip.
        els.push(I('hero', 0, 0, 100, 42, image, { fit: 'cover' }));
        // Bottom of image fades into the deck color so the title block reads.
        els.push(R('fade', 0, 32, 100, 12, 'transparent',
          { gradient: `linear-gradient(to bottom, transparent 0%, ${t.bg} 100%)` }));
      }
      // Eyebrow ALWAYS shows — fall back to "PRESENTATION" so the slide
      // never feels nameless.
      els.push(T('eye', 7, image ? 49 : 14, 60, 5,
        EYEBROW_TEXT || 'PRESENTATION',
        { fontSize: 12, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.28em' }));
      // Title — anchored at the BOTTOM-LEFT of the slide, big serif/display.
      // Fills 80% of the width with a generous size that auto-shrinks.
      els.push(T('title', 7, image ? 54 : 22, 86, image ? 34 : 38,
        slide.title || 'Untitled',
        { ...HEAD, fontSize: fitFontSize(slide.title, image ? 72 : 92, 26),
          align: 'left', parts: titleStyled.parts, lineHeight: 1.02 }));
      // Accent rule directly under the title.
      els.push(R('rule', 7, image ? 88 : 64, 7, 0.5, t.accent));
      // Subtitle right under the rule — no big gap.
      if (slide.subtitle) {
        els.push(T('sub', 7, image ? 91 : 67, 70, image ? 7 : 12,
          slide.subtitle,
          { ...SUB, fontSize: 19, color: t.text, align: 'left', lineHeight: 1.4, fontWeight: '400' }));
      }
      // Bottom-right decorative numeral — only on text-only covers,
      // and only when there's enough room (no image).
      if (!image) {
        els.push(T('decoNum', 70, 50, 28, 50, '01',
          { fontFamily: f.head, fontSize: 280, fontWeight: '900', color: decoColor,
            align: 'right', lineHeight: 0.85, letterSpacing: '-0.05em' }));
      }
      // Bottom-left meta line — small, monospace-feeling, like a colophon.
      const meta = (slide.meta || 'A presentation deck').toUpperCase();
      if (!image) {
        els.push(T('meta', 7, 92, 60, 4, meta,
          { fontSize: 10, fontWeight: '600', color: t.faint, align: 'left', letterSpacing: '0.22em' }));
      }
      return els;
    }
    case '__legacy_title_unused': {
      // (kept here so the diff is reviewable; never reached)
      const els = [];
      if (image) {
        // Image takes the right 40%, full height. A thin accent rule
        // separates it from the type column.
        els.push(I('hero', 60, 0, 40, 100, image, { fit: 'cover' }));
        els.push(R('sep', 60, 0, 0.4, 100, t.accent));
        // Eyebrow + title sit in the left 56%, top-left aligned.
        if (EYEBROW_TEXT) {
          els.push(T('eye', 6, 22, 50, 6, EYEBROW_TEXT,
            { fontSize: 14, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.18em' }));
        }
        els.push(T('title', 6, EYEBROW_TEXT ? 30 : 26, 52, 36,
          slide.title || 'Untitled',
          { ...HEAD, fontSize: fitFontSize(slide.title, 64, 22), align: 'left', parts: titleStyled.parts }));
        els.push(R('rule', 6, 70, 10, 0.5, t.accent));
        if (slide.subtitle) {
          els.push(T('sub', 6, 74, 52, 18, slide.subtitle,
            { ...SUB, fontSize: 19, lineHeight: 1.45 }));
        }
        return els;
      }
      // No image — keep the original centered cover.
      if (isLight) {
        els.push(R('side', 86, 0, 14, 100, t.surface));
        els.push(R('sideBar', 86, 0, 0.6, 100, t.accent));
      } else {
        els.push(R('topRibbon', 0, 0, 100, 0.6, t.accent));
        els.push(R('cornerSq', 86, 8, 6, 10, t.accent, { radius: '4px', sharp: false }));
      }
      // Eyebrow kicker
      if (EYEBROW_TEXT) {
        els.push(T('eye', 8, 18, 84, 6, EYEBROW_TEXT,
          { fontSize: 14, fontWeight: '700', color: t.accent, align: 'center', letterSpacing: '0.18em' }));
      }
      // Title
      els.push(T('title', 8, EYEBROW_TEXT ? 28 : 22, 84, 36,
        slide.title || 'Untitled',
        { ...HEAD, fontSize: fitFontSize(slide.title, 76, 22), align: 'center', parts: titleStyled.parts }));
      // Centered rule
      els.push(R('rule', 44, 67, 12, 0.4, t.accent));
      // Subtitle
      if (slide.subtitle) {
        els.push(T('sub', 12, 71, 76, 14,
          slide.subtitle,
          { ...SUB, fontSize: 22, align: 'center', lineHeight: 1.4 }));
      }
      return els;
    }

    // ─── 2. AGENDA ─────────────────────────────────────────────────────────
    // Numbered list of sections. Each row has a big accent number on the
    // left, the section label, and a short body clause to its right. The
    // visual is a vertical scan of where the deck is going.
    case 'agenda': {
      const items = (slide.items || []).slice(0, 6);
      const els = [];
      els.push(T('eye', 6, 7, 88, 5, EYEBROW_TEXT || 'AGENDA',
        { fontSize: 13, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.18em' }));
      els.push(T('title', 6, 13, 88, 14, slide.title || 'What we will cover',
        { ...HEAD, fontSize: 48, align: 'left' }));
      els.push(R('rule', 6, 30, 88, 0.4, t.border));
      // Compute row geometry — spread items between y=33 and y=92.
      const rowTop = 34;
      const rowBot = 93;
      const n = Math.max(1, items.length);
      const rowH = (rowBot - rowTop) / n;
      items.forEach((it, i) => {
        const y = rowTop + i * rowH;
        els.push(T(`num-${i}`, 6, y + rowH * 0.18, 8, rowH * 0.7,
          String(i + 1).padStart(2, '0'),
          { fontFamily: f.head, fontSize: 32, fontWeight: '700', color: t.accent, align: 'left', lineHeight: 1 }));
        els.push(T(`label-${i}`, 16, y + rowH * 0.15, 38, rowH * 0.45,
          it.label || '',
          { fontFamily: f.head, fontSize: 22, fontWeight: '600', color: t.text, align: 'left', lineHeight: 1.2 }));
        els.push(T(`body-${i}`, 56, y + rowH * 0.18, 38, rowH * 0.7,
          it.body || '',
          { ...SUB, fontSize: 16, lineHeight: 1.4 }));
        if (i < items.length - 1) {
          els.push(R(`sep-${i}`, 6, y + rowH - 0.5, 88, 0.2, t.border));
        }
      });
      return els;
    }

    // ─── 3. SECTION ────────────────────────────────────────────────────────
    // Chapter-break with a strong color block. Big eyebrow ("PART 02"),
    // big title, optional subtitle, and a left vertical slab in the accent.
    case 'section': {
      const els = [];
      // Accent color slab fills the left third.
      els.push(R('slab', 0, 0, 38, 100, t.accent));
      els.push(R('mid',  38, 0, 1, 100, t.accent2 || t.accent));
      // Eyebrow on slab — high contrast against accent
      const slabText = isLight ? '#ffffff' : '#0a0a0a';
      els.push(T('eye', 4, 12, 30, 6, EYEBROW_TEXT || 'SECTION',
        { fontSize: 13, fontWeight: '700', color: slabText, align: 'left', letterSpacing: '0.22em' }));
      const sectionNum = (slide.eyebrow || '').match(/\d+/)?.[0]?.padStart(2, '0') || '01';
      els.push(T('num', 4, 80, 30, 14,
        slide.title ? sectionNum : '',
        { fontFamily: f.head, fontSize: 90, fontWeight: '700', color: slabText, align: 'left', lineHeight: 1 }));
      // Title on the right side
      els.push(T('title', 42, 30, 54, 36,
        slide.title || 'Section',
        { ...HEAD, fontSize: fitFontSize(slide.title, 60, 24), align: 'left' }));
      els.push(R('rule', 42, 70, 14, 0.4, t.accent));
      if (slide.subtitle) {
        els.push(T('sub', 42, 74, 54, 18,
          slide.subtitle,
          { ...SUB, fontSize: 18, lineHeight: 1.45 }));
      }
      return els;
    }

    // ─── 4. HERO ───────────────────────────────────────────────────────────
    // Big editorial declaration. One line, accent word colored, breathing
    // whitespace top and bottom, decorative quote-mark in the corner.
    case 'hero': {
      const els = [];
      els.push(R('topBar', 0, 0, 100, 0.4, t.accent));
      // Decorative oversized symbol in the corner — only on dark themes,
      // looks too noisy on light surfaces.
      if (!isLight) {
        els.push(T('mark', 4, -2, 18, 30, '"',
          { fontFamily: f.head, fontSize: 200, fontWeight: '900', color: t.accent + '22', align: 'left' }));
      }
      // Hero text gets a much higher floor and a less aggressive shrink — a
      // 40-char declaration deserves to FILL the slide, not look polite.
      els.push(T('title', 6, 28, 88, 48,
        slide.title || '',
        { ...HEAD, fontSize: fitFontSize(slide.title, 92, 30), align: 'center', parts: titleStyled.parts, lineHeight: 1.08 }));
      els.push(R('rule', 46, 82, 8, 0.5, t.accent));
      return els;
    }

    // ─── 5. CONTENT ────────────────────────────────────────────────────────
    // Workhorse: title + 2–3 prose sentences. Title left-aligned with an
    // accent underbar. Body in the body font at full readable contrast (NOT
    // muted — that was the readability problem in the previous version).
    case 'content': {
      const els = [];
      if (EYEBROW_TEXT) {
        els.push(T('eye', 6, 8, 88, 5, EYEBROW_TEXT,
          { fontSize: 12, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.18em' }));
      }
      els.push(T('title', 6, EYEBROW_TEXT ? 14 : 10, 88, 20,
        slide.title || '',
        { ...HEAD, fontSize: fitFontSize(slide.title, 48, 24), align: 'left', parts: titleStyled.parts }));
      els.push(R('bar', 6, EYEBROW_TEXT ? 35 : 31, 9, 0.6, t.accent));
      els.push(T('body', 6, EYEBROW_TEXT ? 40 : 38, 80, 56,
        slide.body || '',
        { fontFamily: f.body, fontSize: 22, fontWeight: '400', color: t.text, align: 'left', lineHeight: 1.55 }));
      return els;
    }

    // ─── 6. BULLETS ────────────────────────────────────────────────────────
    // Title + 3-5 short parallel items, each prefixed with a small dot in
    // the accent color. Plenty of leading between rows so the eye scans.
    case 'bullets': {
      const items = slide.bullets || [];
      const els = [];
      els.push(T('title', 6, 9, 88, 18, slide.title || '',
        { ...HEAD, fontSize: 44, align: 'left' }));
      els.push(R('bar', 6, 30, 9, 0.6, t.accent));
      const top = 36;
      const bot = 92;
      const n = Math.max(1, items.length);
      const rowH = (bot - top) / n;
      items.forEach((b, i) => {
        const y = top + i * rowH;
        // Accent dot
        els.push(R(`dot-${i}`, 7, y + rowH * 0.32, 1.2, 1.2, t.accent, { shape: 'circle', sharp: false }));
        els.push(T(`b-${i}`, 11, y, 84, rowH * 0.9, b,
          { fontFamily: f.body, fontSize: 22, fontWeight: '500', color: t.text, align: 'left', lineHeight: 1.35 }));
      });
      return els;
    }

    // ─── 7. CARDS ──────────────────────────────────────────────────────────
    // Three side-by-side cards. Each card has a label header in accent color
    // and a short body underneath. Cards have surface bg, subtle border, and
    // soft shadow for depth.
    case 'cards': {
      const items = (slide.items || []).slice(0, 4);
      const n = Math.max(1, items.length);
      const els = [];
      els.push(T('title', 6, 9, 88, 16, slide.title || '',
        { ...HEAD, fontSize: 40, align: 'left' }));
      els.push(R('bar', 6, 28, 9, 0.6, t.accent));
      // Card geometry — 6% gutter on each side of the row, 3% between cards.
      const gutter = 6;
      const innerGap = 2.5;
      const cardsTop = 36;
      const cardsH = 56;
      const totalW = 100 - gutter * 2;
      const cardW = (totalW - innerGap * (n - 1)) / n;
      items.forEach((it, i) => {
        const x = gutter + i * (cardW + innerGap);
        // Card surface
        els.push(R(`card-${i}`, x, cardsTop, cardW, cardsH, t.surface, { sharp: false, radius: '12px' }));
        // Top accent stripe — radius matches card corners so it doesn't bleed past the rounded top.
        els.push(R(`stripe-${i}`, x, cardsTop, cardW, 0.7, t.accent, { sharp: false, radius: '12px 12px 0 0' }));
        // Number badge
        els.push(T(`num-${i}`, x + 3, cardsTop + 4, cardW - 6, 6, String(i + 1).padStart(2, '0'),
          { fontFamily: f.head, fontSize: 14, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.1em' }));
        // Label
        els.push(T(`label-${i}`, x + 3, cardsTop + 12, cardW - 6, 12, it.label || '',
          { fontFamily: f.head, fontSize: 24, fontWeight: '700', color: t.text, align: 'left', lineHeight: 1.15 }));
        // Body
        els.push(T(`body-${i}`, x + 3, cardsTop + 26, cardW - 6, cardsH - 30, it.body || '',
          { fontFamily: f.body, fontSize: 16, fontWeight: '400', color: t.muted, align: 'left', lineHeight: 1.5 }));
      });
      return els;
    }

    // ─── 8. NUMBERED ───────────────────────────────────────────────────────
    // Vertical numbered steps with a left rail. Each step has a numbered
    // chip, a short label, and a short body. Best for sequences/processes.
    case 'numbered': {
      const items = (slide.items || []).slice(0, 5);
      const n = Math.max(1, items.length);
      const els = [];
      els.push(T('title', 6, 8, 88, 16, slide.title || '',
        { ...HEAD, fontSize: 40, align: 'left' }));
      els.push(R('bar', 6, 27, 9, 0.6, t.accent));
      const top = 32;
      const bot = 94;
      const rowH = (bot - top) / n;
      // Left vertical rail connecting chips
      els.push(R('rail', 9, top + rowH * 0.5, 0.25, (n - 1) * rowH, t.border));
      items.forEach((it, i) => {
        const y = top + i * rowH;
        const cy = y + rowH * 0.18;
        // Numbered chip — circle in accent color
        els.push(R(`chip-${i}`, 7, cy, 4.5, 8, t.accent, { shape: 'circle', sharp: false }));
        const chipText = isLight ? '#ffffff' : '#0a0a0a';
        els.push(T(`chipN-${i}`, 7, cy, 4.5, 8, String(i + 1),
          { fontFamily: f.head, fontSize: 20, fontWeight: '700', color: chipText, align: 'center', lineHeight: 1.4 }));
        // Label
        els.push(T(`label-${i}`, 14, cy, 80, rowH * 0.45, it.label || '',
          { fontFamily: f.head, fontSize: 20, fontWeight: '600', color: t.text, align: 'left', lineHeight: 1.2 }));
        // Body
        els.push(T(`body-${i}`, 14, cy + rowH * 0.36, 80, rowH * 0.55, it.body || '',
          { fontFamily: f.body, fontSize: 15, fontWeight: '400', color: t.muted, align: 'left', lineHeight: 1.4 }));
      });
      return els;
    }

    // ─── 9. COMPARE ────────────────────────────────────────────────────────
    // Two-pane side-by-side (Before/After, Myth/Reality). Each pane has its
    // own surface tint and a label header in a different color so the
    // contrast is immediate.
    case 'compare': {
      const items = (slide.items || []).slice(0, 2);
      const els = [];
      els.push(T('title', 6, 8, 88, 14, slide.title || '',
        { ...HEAD, fontSize: 40, align: 'left' }));
      els.push(R('bar', 6, 26, 9, 0.6, t.accent));
      // Two panels — left in muted surface, right in accent-tinted surface.
      const top = 32;
      const h = 62;
      const gutter = 6;
      const gap = 4;
      const w = (100 - gutter * 2 - gap) / 2;
      // Left card — neutral surface, dimmer label color.
      els.push(R('lcard', gutter, top, w, h, t.surface, { sharp: false, radius: '12px' }));
      els.push(R('lstripe', gutter, top, w, 0.5, t.faint));
      els.push(T('llabel', gutter + 3, top + 5, w - 6, 8, (items[0]?.label || 'Before').toUpperCase(),
        { fontFamily: f.head, fontSize: 14, fontWeight: '700', color: t.faint, align: 'left', letterSpacing: '0.18em' }));
      els.push(T('lbody', gutter + 3, top + 16, w - 6, h - 20, items[0]?.body || '',
        { fontFamily: f.body, fontSize: 22, fontWeight: '500', color: t.text, align: 'left', lineHeight: 1.4 }));
      // Right card — accent-tinted bg so it reads as distinct from the left.
      const rx = gutter + w + gap;
      const rCardGradient = `linear-gradient(135deg, ${t.surface} 0%, ${t.accent + (t.mode === 'light' ? '18' : '22')} 100%)`;
      els.push(R('rcard', rx, top, w, h, t.surface, { sharp: false, radius: '12px', gradient: rCardGradient }));
      els.push(R('rstripe', rx, top, w, 0.5, t.accent));
      els.push(T('rlabel', rx + 3, top + 5, w - 6, 8, (items[1]?.label || 'After').toUpperCase(),
        { fontFamily: f.head, fontSize: 14, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.18em' }));
      els.push(T('rbody', rx + 3, top + 16, w - 6, h - 20, items[1]?.body || '',
        { fontFamily: f.body, fontSize: 22, fontWeight: '600', color: t.text, align: 'left', lineHeight: 1.4 }));
      return els;
    }

    // ─── 10. STAT ──────────────────────────────────────────────────────────
    // One huge figure, label above, context sentence below. The figure
    // itself uses the display font and the accent color; everything else
    // recedes.
    case 'stat': {
      const figure = slide.body || slide.title || '—';
      const els = [];
      els.push(T('label', 8, 14, 84, 8,
        (slide.title || 'Statistic').toUpperCase(),
        { fontFamily: f.body, fontSize: 14, fontWeight: '700', color: t.muted, align: 'center', letterSpacing: '0.22em' }));
      els.push(T('num', 4, 26, 92, 50,
        figure,
        { fontFamily: f.head, fontSize: fitFontSize(figure, 168, 6), fontWeight: '900',
          color: t.accent, align: 'center', lineHeight: 1, letterSpacing: '-0.04em' }));
      els.push(R('rule', 44, 78, 12, 0.5, t.border));
      if (slide.subtitle) {
        els.push(T('ctx', 12, 82, 76, 12, slide.subtitle,
          { fontFamily: f.body, fontSize: 18, fontWeight: '400', color: t.muted, align: 'center', lineHeight: 1.5 }));
      }
      return els;
    }

    // ─── 11. QUOTE ─────────────────────────────────────────────────────────
    // Editorial-grade pull quote in the display font. Italic, generous
    // leading. Big decorative quote mark behind the text. Attribution below.
    case 'quote': {
      const els = [];
      els.push(T('mark', 4, -4, 18, 32, '"',
        { fontFamily: f.head, fontSize: 240, fontWeight: '900',
          color: t.accent + (isLight ? '22' : '30'), align: 'left', lineHeight: 1 }));
      els.push(R('lb', 8, 28, 0.4, 50, t.accent));
      const q = slide.title || '';
      els.push(T('quote', 12, 24, 80, 56, q,
        { fontFamily: f.head, fontSize: fitFontSize(q, 36, 70), fontWeight: '500',
          color: t.text, align: 'left', italic: true, lineHeight: 1.25 }));
      if (slide.subtitle) {
        els.push(T('attr', 12, 84, 80, 8, `— ${slide.subtitle}`,
          { fontFamily: f.body, fontSize: 16, fontWeight: '600', color: t.accent, align: 'left', letterSpacing: '0.06em' }));
      }
      return els;
    }

    // ─── 12. SPLIT ─────────────────────────────────────────────────────────
    // Text on the left, accent panel on the right. The right panel has the
    // accent color as a tinted surface with a single eyebrow word — works
    // well as a "this is the new concept" slide.
    case 'split': {
      const els = [];
      // Right panel — accent-tinted surface
      els.push(R('rp', 56, 0, 44, 100, t.surface));
      els.push(R('rt', 56, 0, 44, 0.6, t.accent));
      // Big number/symbol on the right panel
      els.push(T('rsym', 60, 28, 36, 44,
        slide.eyebrow || (slide.title || '?').slice(0, 1).toUpperCase(),
        { fontFamily: f.head, fontSize: 120, fontWeight: '900', color: t.accent + (isLight ? '40' : '60'), align: 'center', lineHeight: 1 }));
      // Left side
      if (EYEBROW_TEXT) {
        els.push(T('eye', 6, 12, 46, 5, EYEBROW_TEXT,
          { fontSize: 12, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.18em' }));
      }
      els.push(T('title', 6, EYEBROW_TEXT ? 18 : 14, 46, 26, slide.title || '',
        { ...HEAD, fontSize: fitFontSize(slide.title, 40, 22), align: 'left', parts: titleStyled.parts }));
      els.push(R('bar', 6, EYEBROW_TEXT ? 47 : 43, 9, 0.6, t.accent));
      els.push(T('body', 6, EYEBROW_TEXT ? 52 : 48, 46, 44,
        slide.body || slide.subtitle || '',
        { fontFamily: f.body, fontSize: 19, fontWeight: '400', color: t.text, align: 'left', lineHeight: 1.5 }));
      return els;
    }

    // ─── 13. TWO-COLUMN ───────────────────────────────────────────────────
    case 'twoCol': {
      const [left, right] = splitBody(slide.body || slide.subtitle || '');
      return [
        T('title', 6, 8, 88, 18, slide.title || '',
          { ...HEAD, fontSize: 40, align: 'left' }),
        R('rule', 6, 28, 88, 0.4, t.border),
        R('div',  50, 32, 0.25, 60, t.border),
        T('left', 6, 32, 41, 60, left,
          { fontFamily: f.body, fontSize: 18, fontWeight: '400', color: t.text, align: 'left', lineHeight: 1.55 }),
        T('right', 53, 32, 41, 60, right,
          { fontFamily: f.body, fontSize: 18, fontWeight: '400', color: t.text, align: 'left', lineHeight: 1.55 }),
      ];
    }

    // ─── 15. IMAGE HERO ────────────────────────────────────────────────────
    // Full-bleed image with the title overlaid in the bottom-left, on a
    // dark gradient veil. Used when an image is the slide's main statement.
    case 'imageHero': {
      const els = [];
      if (image) {
        els.push(I('bg', 0, 0, 100, 100, image, { fit: 'cover' }));
        // Bottom dark gradient — keeps the title legible regardless of
        // the underlying image's tonality.
        els.push(R('veil', 0, 40, 100, 60, 'transparent',
          { gradient: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 80%, rgba(0,0,0,0.85) 100%)' }));
      } else {
        els.push(R('bg', 0, 0, 100, 100, t.surface));
      }
      // Eyebrow + title: use white over an image, theme colors otherwise.
      const overlayText = image ? '#ffffff' : t.text;
      const overlayAccent = image ? '#ffffff' : t.accent;
      if (EYEBROW_TEXT) {
        els.push(T('eye', 6, 70, 88, 5, EYEBROW_TEXT,
          { fontSize: 13, fontWeight: '700', color: overlayAccent, align: 'left', letterSpacing: '0.2em' }));
      }
      els.push(T('title', 6, EYEBROW_TEXT ? 76 : 70, 88, 22,
        slide.title || '',
        { ...HEAD, color: overlayText, fontSize: fitFontSize(slide.title, 56, 28), align: 'left' }));
      if (slide.subtitle) {
        els.push(T('sub', 6, 90, 88, 8, slide.subtitle,
          { fontFamily: f.body, fontSize: 16, fontWeight: '500', color: '#e5e7eb', align: 'left' }));
      }
      els.push(R('topBar', 0, 0, 100, 0.4, t.accent));
      return els;
    }

    // ─── 16. IMAGE RIGHT ───────────────────────────────────────────────────
    // Text on the left, image fills the right 45%. Classic teaching layout.
    case 'imageRight': {
      const els = [];
      if (image) {
        els.push(I('img', 55, 0, 45, 100, image, { fit: 'cover' }));
        els.push(R('sep', 55, 0, 0.4, 100, t.accent));
      } else {
        els.push(R('panel', 55, 0, 45, 100, t.surface));
      }
      if (EYEBROW_TEXT) {
        els.push(T('eye', 6, 10, 46, 5, EYEBROW_TEXT,
          { fontSize: 12, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.18em' }));
      }
      els.push(T('title', 6, EYEBROW_TEXT ? 16 : 12, 46, 24,
        slide.title || '',
        { ...HEAD, fontSize: fitFontSize(slide.title, 40, 22), align: 'left', parts: titleStyled.parts }));
      els.push(R('bar', 6, EYEBROW_TEXT ? 42 : 38, 9, 0.6, t.accent));
      els.push(T('body', 6, EYEBROW_TEXT ? 47 : 43, 46, 48,
        slide.body || slide.subtitle || '',
        { fontFamily: f.body, fontSize: 18, fontWeight: '400', color: t.text, align: 'left', lineHeight: 1.5 }));
      return els;
    }

    // ─── 17. IMAGE LEFT ────────────────────────────────────────────────────
    case 'imageLeft': {
      const els = [];
      if (image) {
        els.push(I('img', 0, 0, 45, 100, image, { fit: 'cover' }));
        els.push(R('sep', 45, 0, 0.4, 100, t.accent));
      } else {
        els.push(R('panel', 0, 0, 45, 100, t.surface));
      }
      if (EYEBROW_TEXT) {
        els.push(T('eye', 50, 10, 46, 5, EYEBROW_TEXT,
          { fontSize: 12, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.18em' }));
      }
      els.push(T('title', 50, EYEBROW_TEXT ? 16 : 12, 46, 24,
        slide.title || '',
        { ...HEAD, fontSize: fitFontSize(slide.title, 40, 22), align: 'left', parts: titleStyled.parts }));
      els.push(R('bar', 50, EYEBROW_TEXT ? 42 : 38, 9, 0.6, t.accent));
      els.push(T('body', 50, EYEBROW_TEXT ? 47 : 43, 46, 48,
        slide.body || slide.subtitle || '',
        { fontFamily: f.body, fontSize: 18, fontWeight: '400', color: t.text, align: 'left', lineHeight: 1.5 }));
      return els;
    }

    // ─── 18. IMAGE FULL ────────────────────────────────────────────────────
    // Edge-to-edge image with a small caption block bottom-left.
    case 'imageFull': {
      const els = [];
      if (image) {
        els.push(I('img', 0, 0, 100, 100, image, { fit: 'cover' }));
        // Subtle bottom gradient for caption legibility.
        els.push(R('veil', 0, 70, 100, 30, 'transparent',
          { gradient: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)' }));
      } else {
        els.push(R('bg', 0, 0, 100, 100, t.surface));
      }
      // Caption block — pill-shaped surface in the corner. Colors adapt to image presence.
      const capBg    = image ? 'rgba(0,0,0,0.55)' : t.surface;
      const capLabel = image ? '#cbd5e1' : t.muted;
      const capText  = image ? '#ffffff' : t.text;
      els.push(R('cap', 6, 86, 60, 9, capBg, { sharp: false, radius: '8px' }));
      els.push(T('captionLabel', 8, 87, 56, 4, (slide.eyebrow || 'CAPTION').toUpperCase(),
        { fontSize: 10, fontWeight: '700', color: capLabel, align: 'left', letterSpacing: '0.2em' }));
      els.push(T('caption', 8, 90, 56, 5, slide.title || '',
        { fontFamily: f.head, fontSize: 16, fontWeight: '600', color: capText, align: 'left' }));
      return els;
    }

    // ─── 14. BIG TEXT ──────────────────────────────────────────────────────
    // One short paragraph that needs to breathe. Generous padding, larger
    // body font, drop-cap-ish accent on the first letter via the eyebrow.
    case 'bigText': {
      const els = [];
      if (EYEBROW_TEXT) {
        els.push(T('eye', 10, 16, 80, 5, EYEBROW_TEXT,
          { fontSize: 13, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.2em' }));
      }
      els.push(T('title', 10, EYEBROW_TEXT ? 22 : 18, 80, 14, slide.title || '',
        { ...HEAD, fontSize: 36, align: 'left' }));
      els.push(R('bar', 10, EYEBROW_TEXT ? 39 : 35, 9, 0.5, t.accent));
      els.push(T('body', 10, EYEBROW_TEXT ? 44 : 40, 80, 50,
        slide.body || '',
        { fontFamily: f.head, fontSize: 28, fontWeight: '500', color: t.text, align: 'left', lineHeight: 1.4 }));
      return els;
    }

    // ─── 15. SUMMARY ───────────────────────────────────────────────────────
    case 'summary':
    default: {
      // Treat any unknown layout the same way — a clean title + bullet/prose
      // recap. Better than a black canvas.
      const items = slide.bullets && slide.bullets.length ? slide.bullets : null;
      const els = [];
      els.push(T('eye', 6, 8, 88, 5, EYEBROW_TEXT || 'KEY TAKEAWAYS',
        { fontSize: 13, fontWeight: '700', color: t.accent, align: 'left', letterSpacing: '0.2em' }));
      els.push(T('title', 6, 14, 88, 18, slide.title || 'Summary',
        { ...HEAD, fontSize: 48, align: 'left' }));
      els.push(R('rule', 6, 36, 88, 0.4, t.border));
      if (items) {
        const top = 42;
        const bot = 92;
        const n = items.length;
        const rowH = (bot - top) / n;
        items.forEach((b, i) => {
          const y = top + i * rowH;
          els.push(T(`bn-${i}`, 6, y + rowH * 0.18, 6, rowH * 0.7,
            String(i + 1).padStart(2, '0'),
            { fontFamily: f.head, fontSize: 22, fontWeight: '700', color: t.accent, align: 'left', lineHeight: 1.2 }));
          els.push(T(`b-${i}`, 13, y + rowH * 0.18, 81, rowH * 0.7, b,
            { fontFamily: f.body, fontSize: 19, fontWeight: '500', color: t.text, align: 'left', lineHeight: 1.35 }));
        });
      } else {
        els.push(T('body', 6, 42, 88, 50, slide.body || '',
          { fontFamily: f.body, fontSize: 22, fontWeight: '400', color: t.text, align: 'left', lineHeight: 1.55 }));
      }
      return els;
    }
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO NARRATION
// NotebookLM-style: each slide has a `notes` field that doubles as a
// spoken narration script. The hook owns the SpeechSynthesis lifecycle —
// canceling on slide change, restarting fresh, and auto-advancing on end.
// We pick the highest-quality voice available (system "Premium"/"Enhanced"
// English voices are way better than the default robot) and tune rate +
// pitch for a podcast-host feel.
// ─────────────────────────────────────────────────────────────────────────────
function pickBestVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices?.length) return null;
  const en = voices.filter(v => /^en/i.test(v.lang));
  // Premium / enhanced macOS voices first.
  const preferred = [
    'Samantha (Premium)', 'Samantha (Enhanced)',
    'Ava (Premium)', 'Ava (Enhanced)',
    'Allison (Premium)', 'Allison (Enhanced)',
    'Evan (Premium)', 'Evan (Enhanced)',
    'Google US English', 'Microsoft Aria Online',
    'Samantha', 'Karen', 'Daniel', 'Alex',
  ];
  for (const name of preferred) {
    const v = en.find(x => x.name === name);
    if (v) return v;
  }
  return en[0] || voices[0];
}

function buildNarrationText(slide) {
  if (!slide) return '';
  // Prefer the LLM-written narration script. Falls back to a synthesized
  // read of the slide so silence never happens.
  if (slide.notes && String(slide.notes).trim().length > 8) {
    return stripMarks(slide.notes);
  }
  const parts = [];
  if (slide.eyebrow) parts.push(slide.eyebrow + '.');
  if (slide.title) parts.push(slide.title + '.');
  if (slide.subtitle) parts.push(slide.subtitle);
  if (slide.body) parts.push(slide.body);
  if (Array.isArray(slide.bullets) && slide.bullets.length) {
    parts.push(slide.bullets.join('. '));
  }
  if (Array.isArray(slide.items) && slide.items.length) {
    parts.push(slide.items.map(it => `${it.label}. ${it.body}`).join(' '));
  }
  return stripMarks(parts.filter(Boolean).join(' '));
}

// Strip the **bold** markdown markers out of narration so the TTS engine
// doesn't read "asterisk asterisk" out loud.
function stripMarks(s = '') {
  return String(s).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
}

// Hook: manages a single SpeechSynthesisUtterance for the current slide.
// Cancels speech whenever slide changes or audio is toggled off. Triggers
// onEnd when the narration finishes — the consumer can use that to auto-
// advance the deck for a NotebookLM-style listen-through.
function useSlideNarration({ enabled, slide, onEnd }) {
  const utterRef = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  // Re-run on every slide change while enabled. We cancel any prior
  // utterance before starting a new one so the audio swaps cleanly.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    // Always cancel — clears stale queue regardless of enabled state.
    synth.cancel();
    setSpeaking(false);
    if (!enabled || !slide) return;
    const text = buildNarrationText(slide);
    if (!text) { onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1.0;
    u.volume = 1.0;
    const v = pickBestVoice();
    if (v) u.voice = v;
    u.onstart = () => setSpeaking(true);
    u.onend = () => { setSpeaking(false); onEnd?.(); };
    u.onerror = () => { setSpeaking(false); };
    utterRef.current = u;
    // Some browsers (Chrome) need voices to load asynchronously — try
    // immediately, but also retry if voices weren't ready yet.
    const start = () => synth.speak(u);
    if (synth.getVoices().length === 0) {
      const handler = () => { synth.onvoiceschanged = null; start(); };
      synth.onvoiceschanged = handler;
      // Fallback in case the event never fires.
      setTimeout(start, 250);
    } else {
      start();
    }
    return () => { synth.cancel(); };
  }, [enabled, slide?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cleanup on unmount — important if the user closes play mode mid-speech.
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch {} }, []);
  return { speaking };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
// Named exports so layout helpers + tokens are reusable from a test harness
// (e.g. a preview playground that renders a representative deck without going
// through auth + the desktop window manager).
export { THEMES, FONT_PAIRS, slideToElements, RenderElement, ensureFontsLoaded };

export default function SlideshowApp() {
  // ── User preferences ─────────────────────────────────────────────────────
  const { user } = useAuth();
  // ── WindowManager maximize gate ───────────────────────────────────────
  const wm = useWindowManager();
  const myWindow = Object.values(wm.state.windows).find(w => w.appId === 'slides');
  const isMaximized = myWindow?.isMaximized ?? false;
  const imageGenEnabledPref = user?.data?.preferences?.slideshowImageGen ?? false;
  const [imageGenEnabled, setImageGenEnabled] = useState(imageGenEnabledPref);

  // ── App state ─────────────────────────────────────────────────────────────
  const [betaAcknowledged, setBetaAcknowledged] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }
  const [view, setView] = useState('gallery');
  const [decks, setDecks] = useState([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [deck, setDeck] = useState(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [theme, setTheme] = useState('midnight');
  const [fontHint, setFontHint] = useState(null);
  const [navDir, setNavDir] = useState(1);

  const [slideElementsMap, setSlideElementsMap] = useState({});
  const [slideImages, setSlideImages] = useState({});
  const [generatingImages, setGeneratingImages] = useState(new Set());
  const [imgProgress, setImgProgress] = useState({ total: 0, done: 0, active: false });
  const [slideKey, setSlideKey] = useState(0);

  // Gallery open animation state: null | { phase: 'start'|'expand', rect }
  const [openAnim, setOpenAnim] = useState(null);
  const galleryRef = useRef(null);

  // Load editorial display fonts the moment the slideshow app mounts.
  useEffect(() => { ensureFontsLoaded(); }, []);

  useEffect(() => {
    listSlideshows()
      .then(d => setDecks(d.slideshows || []))
      .catch(() => {})
      .finally(() => setLoadingDecks(false));
  }, []);

  // When a deck loads, pick its preferred theme + font pair from the LLM
  // hints. The user can still override via the theme picker.
  useEffect(() => {
    if (!deck) return;
    const themeKey = PALETTE_TO_THEME[deck.palette] || 'midnight';
    setTheme(THEMES[themeKey] ? themeKey : 'midnight');
    if (deck.font && FONT_PAIRS[deck.font]) setFontHint(deck.font);
    else setFontHint(null);
  }, [deck?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build elements map when deck/theme/font/images change. The image map is
  // fed in so layouts that opt-in (title, imageHero, imageRight, etc.) can
  // place the image as a real visual element instead of a background wash.
  useEffect(() => {
    if (!deck) return;
    const map = {};
    for (const s of deck.slides || []) {
      map[s.id] = slideToElements(s, theme, fontHint, slideImages[s.id]);
    }
    setSlideElementsMap(map);
  }, [deck, theme, fontHint, slideImages]);

  // Bump the slide transition key whenever the visible slide changes.
  useEffect(() => { setSlideKey(k => k + 1); }, [slideIdx, deck?.id]);

  // Auto-generate images for all slides after deck is loaded
  async function autoGenerateImages(d) {
    const slides = d.slides || [];
    setImgProgress({ total: slides.length, done: 0, active: true });
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const prompt = s.imagePrompt || `${d.topic}: ${s.title}${s.body ? '. ' + s.body.slice(0, 120) : ''}`;
      setGeneratingImages(prev => new Set(prev).add(s.id));
      try {
        const res = await generateSlideImage({ prompt });
        if (res.imageDataUrl) {
          setSlideImages(prev => ({ ...prev, [s.id]: res.imageDataUrl }));
        }
      } catch {}
      setGeneratingImages(prev => { const n = new Set(prev); n.delete(s.id); return n; });
      setImgProgress({ total: slides.length, done: i + 1, active: i + 1 < slides.length });
    }
    setImgProgress(p => ({ ...p, active: false }));
  }

  function startOpen(id, viewportRect) {
    let relRect = { top: '30%', left: '25%', width: '50%', height: '50%' };
    if (viewportRect && galleryRef.current) {
      const cr = galleryRef.current.getBoundingClientRect();
      relRect = {
        top: viewportRect.top - cr.top,
        left: viewportRect.left - cr.left,
        width: viewportRect.width,
        height: viewportRect.height,
      };
    }
    setOpenAnim({ phase: 'start', rect: relRect });
    getSlideshow(id).then(d => {
      setDeck(d.slideshow);
      setSlideIdx(0);
      setSlideImages({});
    }).catch(() => {});
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setOpenAnim(a => a ? { ...a, phase: 'expand' } : null);
    }));
    setTimeout(() => {
      setView('present');
      setOpenAnim(null);
      if (myWindow && !isMaximized) wm.maximizeWindow(myWindow.id);
    }, 440);
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    setConfirmDialog({
      message: 'Delete this slideshow? This cannot be undone.',
      onConfirm: async () => {
        await deleteSlideshow(id);
        setDecks(prev => prev.filter(d => d.id !== id));
      },
    });
  }

  function updateElements(slideId, elements) {
    setSlideElementsMap(prev => ({ ...prev, [slideId]: elements }));
  }

  const totalSlides = deck?.slides?.length || 0;
  const slide = deck?.slides?.[slideIdx];
  const currentElements = slide ? (slideElementsMap[slide.id] || []) : [];
  const currentImage = slide ? slideImages[slide.id] : null;
  const isGenImg = slide ? generatingImages.has(slide.id) : false;

  const nav = useCallback((dir) => {
    setNavDir(dir);
    setSlideIdx(i => clamp(i + dir, 0, totalSlides - 1));
  }, [totalSlides]);

  useEffect(() => {
    if (view !== 'present') return;
    function onKey(e) {
      // Ignore key events when typing into a form field (textarea, input,
      // or contenteditable) so the format panel inputs stay usable.
      const tag = (e.target?.tagName || '').toLowerCase();
      const editable = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (editable) return;

      // Keynote-style shortcuts.
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'Enter' || e.key.toLowerCase() === 'n')) {
        // Cmd/Ctrl + N or Cmd/Ctrl + Enter: add slide. Routed through
        // window event so KeynoteWorkspace can handle (it owns deck mutation).
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('keynote:addSlide'));
        return;
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('keynote:duplicateSlide'));
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('keynote:play'));
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { nav(1); return; }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp'   || e.key === 'PageUp')   { nav(-1); return; }
      if (e.key === 'Escape') { setView('gallery'); setDeck(null); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, nav]);

  // ── Views ─────────────────────────────────────────────────────────────────
  const t = THEMES[theme] || THEMES.midnight;

  if (view === 'gallery') {
    return (
      <div ref={galleryRef} className="h-full flex flex-col relative overflow-hidden">
        <Gallery
          decks={decks}
          loading={loadingDecks}
          onOpen={startOpen}
          onDelete={handleDelete}
          onNew={() => setView('generate')}
          onManual={() => setView('manual')}
        />

        {/* Full-screen beta notice — shown every time the app opens */}
        {!betaAcknowledged && (
          <div className="absolute inset-0 z-50 flex items-end justify-center pb-10 bg-black/70 backdrop-blur-md">
            <div className="mx-4 w-full max-w-sm bg-[#1c1c1e] border border-white/[0.10] rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-6 pt-6 pb-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[9px] font-bold tracking-widest uppercase text-white/55 bg-white/[0.08] border border-white/[0.14] px-2 py-0.5 rounded-full">Beta</span>
                </div>
                <h2 className="text-[17px] font-semibold text-white/90 leading-snug mb-2">Slideshows is in early beta</h2>
                <p className="text-[13px] text-white/45 leading-relaxed">
                  Expect bugs, missing features, and rough edges. Things may break or behave unexpectedly. We're actively improving it — thanks for testing.
                </p>
              </div>
              <div className="px-6 pb-6">
                <button
                  onClick={() => setBetaAcknowledged(true)}
                  className="w-full py-3 rounded-xl bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.14] text-white/85 font-semibold text-[14px] transition-all"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm dialog */}
        {confirmDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-xs bg-[#1c1c1e] border border-white/[0.10] rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-5 pt-5 pb-4">
                <p className="text-[13px] text-white/75 leading-relaxed">{confirmDialog.message}</p>
              </div>
              <div className="flex border-t border-white/[0.07]">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 py-3 text-[13px] text-white/45 hover:text-white/70 hover:bg-white/[0.04] transition-colors border-r border-white/[0.07]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                  className="flex-1 py-3 text-[13px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/[0.06] font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {openAnim && (
          <div style={{
            position: 'absolute',
            zIndex: 50,
            background: '#1a1a1a',
            pointerEvents: 'none',
            borderRadius: openAnim.phase === 'expand' ? '0px' : '14px',
            transition: openAnim.phase === 'expand'
              ? 'top 400ms cubic-bezier(0.4,0,0.2,1), left 400ms cubic-bezier(0.4,0,0.2,1), width 400ms cubic-bezier(0.4,0,0.2,1), height 400ms cubic-bezier(0.4,0,0.2,1), border-radius 400ms ease'
              : 'none',
            top:    openAnim.phase === 'expand' ? 0 : openAnim.rect.top,
            left:   openAnim.phase === 'expand' ? 0 : openAnim.rect.left,
            width:  openAnim.phase === 'expand' ? '100%' : openAnim.rect.width,
            height: openAnim.phase === 'expand' ? '100%' : openAnim.rect.height,
          }} />
        )}
      </div>
    );
  }

  if (view === 'manual') {
    return (
      <div className="h-full flex flex-col bg-[#1c1c1e]">
        <ManualCreateForm
          onBack={() => setView('gallery')}
          onCreate={(d) => {
            const fs = d.slides?.[0];
            setDecks(prev => [{ id: d.id, title: d.title, topic: d.topic, slideCount: (d.slides || []).length, createdAt: d.createdAt, palette: d.palette, font: d.font, firstSlide: fs ? { id: fs.id, layout: fs.layout, elements: fs.elements, background: fs.background, title: fs.title, body: fs.body, accent: fs.accent, eyebrow: fs.eyebrow, subtitle: fs.subtitle, bullets: fs.bullets, items: fs.items, imageDataUrl: fs.imageDataUrl || null, html: fs.html || '' } : null }, ...prev]);
            setDeck(d);
            setSlideIdx(0);
            setSlideImages({});
            setView('present');
          }}
        />
      </div>
    );
  }

  if (view === 'generate') {
    return (
      <div className="h-full overflow-y-auto overflow-x-hidden bg-[#1c1c1e] flex flex-col">
        <GenerateForm
          onBack={() => setView('gallery')}
          onCreate={(d) => {
            const fs = d.slides?.[0];
            setDecks(prev => [{ id: d.id, title: d.title, topic: d.topic, slideCount: (d.slides || []).length, createdAt: d.createdAt, palette: d.palette, font: d.font, firstSlide: fs ? { id: fs.id, layout: fs.layout, elements: fs.elements, background: fs.background, title: fs.title, body: fs.body, accent: fs.accent, eyebrow: fs.eyebrow, subtitle: fs.subtitle, bullets: fs.bullets, items: fs.items, imageDataUrl: fs.imageDataUrl || null, html: fs.html || '' } : null }, ...prev]);
            setDeck(d);
            setSlideIdx(0);
            setSlideImages({});
            setView('present');
            if (imageGenEnabled) setTimeout(() => autoGenerateImages(d), 500);
          }}
        />
      </div>
    );
  }

  // ── Keynote-style edit/present view ───────────────────────────────────────
  // (state lives here so the top toolbar + format panel can drive it)
  return (
    <KeynoteWorkspace
      deck={deck}
      setDeck={setDeck}
      slide={slide}
      slideIdx={slideIdx}
      setSlideIdx={setSlideIdx}
      totalSlides={totalSlides}
      currentElements={currentElements}
      currentImage={currentImage}
      isGenImg={isGenImg}
      slideImages={slideImages}
      generatingImages={generatingImages}
      slideElementsMap={slideElementsMap}
      updateElements={updateElements}
      theme={theme}
      setTheme={(k) => {
        setTheme(k);
        setFontHint(null);
        if (deck) {
          const newFont = THEMES[k]?.font || 'modern';
          // Update gallery list + loaded deck so thumbnail re-renders immediately
          setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, palette: k, font: newFont } : d));
          setDeck(prev => prev ? { ...prev, palette: k, font: newFont } : prev);
          updateSlideshow(deck.id, { palette: k, font: newFont }).catch(e => console.error('[palette save]', e));
        }
      }}
      fontHint={fontHint}
      setFontHint={(f) => {
        setFontHint(f);
        if (deck) {
          setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, font: f } : d));
          setDeck(prev => prev ? { ...prev, font: f } : prev);
          updateSlideshow(deck.id, { font: f }).catch(e => console.error('[font save]', e));
        }
      }}
      t={t}
      imageGenEnabled={imageGenEnabled}
      onToggleImageGen={() => setImageGenEnabled(v => !v)}
      imgProgress={imgProgress}
      slideKey={slideKey}
      navDir={navDir}
      onBack={() => { setView('gallery'); setDeck(null); }}
      onNav={nav}
      onGenerateImageForCurrent={async () => {
        if (!slide) return;
        const prompt = slide.imagePrompt || `${deck?.topic || ''}: ${slide.title || ''}${slide.body ? '. ' + slide.body.slice(0, 120) : ''}`;
        setGeneratingImages(prev => new Set(prev).add(slide.id));
        try {
          const res = await generateSlideImage({ prompt });
          if (res.imageDataUrl) setSlideImages(prev => ({ ...prev, [slide.id]: res.imageDataUrl }));
          else console.warn('[slideshow] image gen returned no data', res);
        } catch (e) {
          console.error('[slideshow] image gen failed:', e);
        }
        setGeneratingImages(prev => { const n = new Set(prev); n.delete(slide.id); return n; });
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYNOTE WORKSPACE
// Layout: top toolbar (icon-with-label buttons) · left thumbnail rail ·
// center editable canvas · right format inspector. Toggling Format/View
// hides the side panels. Play enters a fullscreen presentation overlay.
// ─────────────────────────────────────────────────────────────────────────────
const SLIDE_LAYOUT_OPTIONS = [
  ['title', 'Title'],
  ['content', 'Title & Body'],
  ['bullets', 'Title & Bullets'],
  ['hero', 'Hero'],
  ['section', 'Section'],
  ['agenda', 'Agenda'],
  ['cards', 'Cards'],
  ['numbered', 'Numbered'],
  ['compare', 'Compare'],
  ['stat', 'Stat'],
  ['quote', 'Quote'],
  ['split', 'Split'],
  ['twoCol', 'Two Column'],
  ['imageHero', 'Image Hero'],
  ['imageRight', 'Image Right'],
  ['imageLeft', 'Image Left'],
  ['imageFull', 'Image Full'],
  ['bigText', 'Big Text'],
  ['summary', 'Summary'],
];

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

async function exportToPdf(deck) {
  const { jsPDF } = await import('jspdf');
  const t = THEMES[deck.palette] || THEMES.ink;
  const W = 10, H = 5.625; // 16:9 inches
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [W, H] });

  const bg = hexToRgb(t.bg), tx = hexToRgb(t.text), mt = hexToRgb(t.muted), ac = hexToRgb(t.accent);

  deck.slides.forEach((slide, i) => {
    if (i > 0) pdf.addPage([W, H], 'landscape');

    pdf.setFillColor(...bg); pdf.rect(0, 0, W, H, 'F');
    pdf.setFillColor(...ac); pdf.rect(0.4, 0.28, 0.9, 0.04, 'F');

    let y = 0.65;

    if (slide.eyebrow) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...mt);
      pdf.text(slide.eyebrow.toUpperCase(), 0.4, y); y += 0.32;
    }

    const isTitle = ['title','hero'].includes(slide.layout);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(isTitle ? 34 : 24); pdf.setTextColor(...tx);
    const titleLines = pdf.splitTextToSize(slide.title || '', W - 0.8);
    pdf.text(titleLines, 0.4, y);
    y += titleLines.length * (isTitle ? 0.56 : 0.42) + 0.18;

    if (slide.subtitle) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(isTitle ? 15 : 12); pdf.setTextColor(...mt);
      const subLines = pdf.splitTextToSize(slide.subtitle, W - 0.8);
      pdf.text(subLines, 0.4, y); y += subLines.length * 0.32 + 0.18;
    }

    if (slide.bullets?.length) {
      pdf.setFontSize(11.5); pdf.setTextColor(...tx);
      slide.bullets.slice(0, 8).forEach(b => {
        if (y > H - 0.5) return;
        pdf.setFillColor(...ac); pdf.circle(0.36, y - 0.065, 0.038, 'F');
        pdf.setFont('helvetica', 'normal');
        const bl = pdf.splitTextToSize(b.replace(/\*\*/g,''), W - 0.95);
        pdf.text(bl[0], 0.5, y); y += 0.38;
      });
    } else if (slide.body) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11.5); pdf.setTextColor(...tx);
      const bLines = pdf.splitTextToSize(slide.body.replace(/\*\*/g,''), W - 0.8);
      pdf.text(bLines.slice(0, 10), 0.4, y);
    }

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...mt);
    pdf.text(`${i+1} / ${deck.slides.length}`, W - 0.3, H - 0.22, { align: 'right' });
  });

  pdf.save(`${deck.title || 'Presentation'}.pdf`);
}

async function exportToPptx(deck) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';
  const t = THEMES[deck.palette] || THEMES.ink;
  const bg = t.bg.replace('#',''), tx = t.text.replace('#','');
  const mt = t.muted.replace('#',''), ac = t.accent.replace('#','');
  const W = 13.333, H = 7.5;

  for (const [i, slide] of deck.slides.entries()) {
    const ps = pres.addSlide();
    ps.background = { color: bg };

    // accent bar
    ps.addShape(pres.ShapeType.rect, { x:0.5, y:0.38, w:1.1, h:0.055, fill:{ color:ac }, line:{ color:ac } });

    let y = 0.75;
    if (slide.eyebrow) {
      ps.addText(slide.eyebrow.toUpperCase(), { x:0.5, y, w:W-1, h:0.4, fontSize:9, color:mt, fontFace:'Helvetica', charSpacing:1.5 });
      y += 0.45;
    }

    const isTitle = ['title','hero'].includes(slide.layout);
    if (slide.title) {
      ps.addText(slide.title, { x:0.5, y, w:W-1, h: isTitle ? 2.8 : 2.1,
        fontSize: isTitle ? 44 : 30, color:tx, fontFace:'Helvetica', bold:true, valign:'top', wrap:true });
      y += isTitle ? 3.0 : 2.3;
    }

    if (slide.subtitle) {
      ps.addText(slide.subtitle, { x:0.5, y, w:W-1, h:1.1,
        fontSize: isTitle ? 18 : 14, color:mt, fontFace:'Helvetica', valign:'top', wrap:true });
      y += 1.2;
    }

    if (slide.bullets?.length) {
      const rows = slide.bullets.slice(0,8).map(b => ({
        text: b.replace(/\*\*/g,''),
        options: { bullet:{ code:'25CF', color:ac, indent:12 }, color:tx },
      }));
      ps.addText(rows, { x:0.5, y, w:W-1, h:H-y-0.6, fontSize:14, fontFace:'Helvetica', valign:'top', wrap:true, lineSpacingMultiple:1.35 });
    } else if (slide.body) {
      ps.addText(slide.body.replace(/\*\*/g,''), { x:0.5, y, w:W-1, h:H-y-0.6,
        fontSize:14, color:tx, fontFace:'Helvetica', valign:'top', wrap:true, lineSpacingMultiple:1.35 });
    } else if (slide.items?.length) {
      slide.items.slice(0,4).forEach((item,idx) => {
        const col = idx%2, row = Math.floor(idx/2);
        const ix = 0.5 + col*(W/2-0.2), iy = y + row*2.0;
        ps.addText(item.label, { x:ix, y:iy, w:W/2-0.7, h:0.45, fontSize:13, color:ac, fontFace:'Helvetica', bold:true });
        ps.addText(item.body, { x:ix, y:iy+0.5, w:W/2-0.7, h:1.4, fontSize:11, color:tx, fontFace:'Helvetica', wrap:true });
      });
    }

    ps.addText(`${i+1} / ${deck.slides.length}`, { x:W-1.2, y:H-0.45, w:1.0, h:0.3, fontSize:9, color:mt, align:'right' });
  }

  await pres.writeFile({ fileName:`${deck.title || 'Presentation'}.pptx` });
}

function KeynoteWorkspace(props) {
  const {
    deck, setDeck, slide, slideIdx, setSlideIdx, totalSlides,
    currentElements, currentImage, isGenImg,
    slideImages, generatingImages, slideElementsMap, updateElements,
    theme, setTheme, t, imageGenEnabled, onToggleImageGen, imgProgress,
    slideKey, navDir, onBack, onNav, onGenerateImageForCurrent,
    fontHint, setFontHint,
  } = props;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [formatOpen, setFormatOpen] = useState(true);
  const [playMode, setPlayMode] = useState(false);
  const [zoom, setZoom] = useState(75);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const deckRef = useRef(deck);
  useEffect(() => { deckRef.current = deck; }, [deck]);

  const savedTimerRef = useRef(null);
  async function doSave(deckToSave) {
    const d = deckToSave ?? deckRef.current;
    if (!d) return;
    setSaving(true);
    try {
      await updateSlideshow(d.id, { slides: d.slides });
      setSavedAt(new Date());
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      console.error('[slide save]', e);
    }
    setSaving(false);
  }

  // Autosave every 3 minutes.
  useEffect(() => {
    const id = setInterval(() => doSave(), 3 * 60 * 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Append a fresh slide right after the current one and jump to it.
  function addSlide() {
    if (!deck) return;
    const newSlide = {
      id: `slide-${Date.now()}`,
      layout: 'content',
      title: 'New Slide',
      body: '',
      subtitle: '',
      eyebrow: '',
      bullets: [],
      items: [],
      notes: '',
    };
    const slides = [...(deck.slides || [])];
    const insertAt = Math.min(slideIdx + 1, slides.length);
    slides.splice(insertAt, 0, newSlide);
    const updated = { ...deck, slides };
    setDeck(updated);
    setSlideIdx(insertAt);
  }

  function deleteCurrentSlide() {
    if (!deck || (deck.slides || []).length <= 1) return;
    const slides = (deck.slides || []).filter((_, i) => i !== slideIdx);
    setDeck({ ...deck, slides });
    setSlideIdx(i => Math.max(0, Math.min(i, slides.length - 1)));
  }

  function duplicateCurrentSlide() {
    if (!deck || !slide) return;
    const copy = { ...slide, id: `slide-${Date.now()}` };
    const slides = [...deck.slides];
    slides.splice(slideIdx + 1, 0, copy);
    setDeck({ ...deck, slides });
    setSlideIdx(slideIdx + 1);
  }

  function changeLayout(newLayout) {
    if (!deck || !slide) return;
    const slides = deck.slides.map((s, i) => i === slideIdx ? { ...s, layout: newLayout } : s);
    setDeck({ ...deck, slides });
  }

  function updateSlideField(field, value) {
    if (!deck || !slide) return;
    const slides = deck.slides.map((s, i) => i === slideIdx ? { ...s, [field]: value } : s);
    setDeck({ ...deck, slides });
  }

  // Insert a freeform text element at the canvas centre.
  function addText() {
    if (!slide) return;
    const newEl = {
      id: `${slide.id}-custom-${Date.now()}`,
      kind: 'text',
      x: 30, y: 42, w: 40, h: 12,
      text: 'Double-click to edit',
      fontSize: 28, fontWeight: '600',
      color: t.text, align: 'center',
      fontFamily: FONT_PAIRS.modern.body,
    };
    updateElements(slide.id, [...currentElements, newEl]);
  }

  // Insert a freeform shape element.
  function addShape(shape = 'rect') {
    if (!slide) return;
    const newEl = {
      id: `${slide.id}-shape-${Date.now()}`,
      kind: 'shape',
      shape,
      x: 38, y: 38, w: 24, h: 24,
      color: t.accent,
      sharp: shape === 'rect' ? false : true,
      radius: shape === 'rect' ? '12px' : undefined,
    };
    updateElements(slide.id, [...currentElements, newEl]);
  }

  async function insertAIImage(prompt) {
    if (!slide || !prompt?.trim()) return;
    try {
      const res = await generateSlideImage({ prompt: prompt.trim() });
      if (res.imageDataUrl) {
        updateElements(slide.id, [...currentElements, {
          id: `${slide.id}-aiimg-${Date.now()}`,
          kind: 'image', x: 12, y: 8, w: 76, h: 84,
          src: res.imageDataUrl, fit: 'contain',
        }]);
      }
    } catch (e) {
      console.error('[ai image]', e);
    }
  }

  const [exporting, setExporting] = useState(null); // 'pdf' | 'pptx' | null
  async function doExport(format) {
    if (exporting || !deck) return;
    setExporting(format);
    try {
      if (format === 'pdf') await exportToPdf(deck);
      else await exportToPptx(deck);
    } catch (e) { console.error('Export error:', e); }
    finally { setExporting(null); }
  }

  const [improving, setImproving] = useState(false);
  async function improveSlideWithAI() {
    if (!slide || improving) return;
    setImproving(true);
    try {
      const res = await fetch('/api/slideshows/improve-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('covalent-token')}` },
        body: JSON.stringify({
          topic: deck?.topic || slide.title,
          slide: { layout: slide.layout, title: slide.title, body: slide.body, bullets: slide.bullets, items: slide.items, eyebrow: slide.eyebrow, subtitle: slide.subtitle },
        }),
      });
      const d = await res.json();
      if (d.slide) {
        setDeck(prev => {
          const slides = (prev.slides || []).map((s, i) => i === slideIdx ? { ...s, ...d.slide } : s);
          return { ...prev, slides };
        });
      }
    } catch (e) {
      console.error('[improve]', e);
    }
    setImproving(false);
  }

  // Keyboard shortcuts — listen for both window key events (Esc, Space in
  // play mode) and the custom events dispatched by the app-level handler.
  useEffect(() => {
    function onPlayKey(e) {
      if (!playMode) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'Escape') { setPlayMode(false); return; }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { onNav(1); return; }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { onNav(-1); return; }
    }
    function onAddSlide() { addSlide(); }
    function onDuplicate() { duplicateCurrentSlide(); }
    function onPlay() { setPlayMode(true); }
    window.addEventListener('keydown', onPlayKey);
    window.addEventListener('keynote:addSlide', onAddSlide);
    window.addEventListener('keynote:duplicateSlide', onDuplicate);
    window.addEventListener('keynote:play', onPlay);
    return () => {
      window.removeEventListener('keydown', onPlayKey);
      window.removeEventListener('keynote:addSlide', onAddSlide);
      window.removeEventListener('keynote:duplicateSlide', onDuplicate);
      window.removeEventListener('keynote:play', onPlay);
    };
  }, [playMode, onNav, deck, slideIdx, slide]);

  return (
    <div className="h-full flex flex-col bg-[#1a1a1a]">
      <KeynoteTopBar
        deckTitle={deck?.title}
        zoom={zoom}
        setZoom={setZoom}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        formatOpen={formatOpen}
        setFormatOpen={setFormatOpen}
        onAddSlide={addSlide}
        onPlay={() => setPlayMode(true)}
        onAddText={addText}
        onAddShape={addShape}
        onAddMedia={onGenerateImageForCurrent}
        onInsertAIImage={insertAIImage}
        aiImgDefaultPrompt={(slide?.imagePrompt || `${deck?.topic || ''}: ${slide?.title || ''}`).trim()}
        imageGenEnabled={imageGenEnabled}
        isGenImg={isGenImg}
        onImprove={improveSlideWithAI}
        improving={improving}
        onBack={onBack}
        onSave={() => doSave()}
        saving={saving}
        savedAt={savedAt}
        onExport={doExport}
        exporting={exporting}
      />

      {/* Image generation progress strip — slim, glanceable. */}
      {imgProgress.active && (
        <div className="flex-shrink-0 px-4 py-1.5 flex items-center gap-3 border-b border-white/[0.06] bg-[#1a1a1a]">
          <Loader2 size={11} className="animate-spin flex-shrink-0 text-indigo-400" />
          <div className="flex-1 rounded-full overflow-hidden h-1 bg-white/[0.10]">
            <div className="h-full rounded-full bg-white transition-all duration-500"
              style={{ width: `${(imgProgress.done / imgProgress.total) * 100}%` }} />
          </div>
          <span className="text-[10px] tabular-nums flex-shrink-0 text-white/35">
            Generating images {imgProgress.done}/{imgProgress.total}
          </span>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {sidebarOpen && (
          <SlideThumbnailRail
            deck={deck}
            slideIdx={slideIdx}
            onGoto={setSlideIdx}
            onDelete={deleteCurrentSlide}
            onDeleteAt={(idx) => {
              if (!deck || (deck.slides || []).length <= 1) return;
              const slides = (deck.slides || []).filter((_, i) => i !== idx);
              setDeck({ ...deck, slides });
              setSlideIdx(i => Math.max(0, Math.min(i, slides.length - 1)));
            }}
            onReorder={(from, to) => {
              if (!deck || from === to) return;
              const slides = [...(deck.slides || [])];
              const [moved] = slides.splice(from, 1);
              slides.splice(to, 0, moved);
              setDeck({ ...deck, slides });
              setSlideIdx(to);
            }}
            slideImages={slideImages}
            generatingImages={generatingImages}
            theme={theme}
            slideElementsMap={slideElementsMap}
          />
        )}

        <div className="flex-1 flex flex-col items-center justify-center min-w-0 overflow-auto bg-[#1a1a1a] px-6 py-6">
          {slide && (
            <SlideEditor
              key={slide.id}
              slide={slide}
              elements={currentElements}
              image={currentImage}
              isGenImg={isGenImg}
              t={t}
              imageGenEnabled={imageGenEnabled}
              zoom={zoom}
              onChange={(els) => updateElements(slide.id, els)}
              onFieldChange={updateSlideField}
              onGenImage={onGenerateImageForCurrent}
            />
          )}
          {/* Speaker notes — directly under the canvas. */}
          {slide?.notes && (
            <div className="w-full max-w-[1100px] mt-4 px-1">
              <p className="text-[10px] uppercase tracking-[0.14em] mb-0.5 text-white/25">Presenter Notes</p>
              <p className="text-xs leading-relaxed text-white/55">{slide.notes}</p>
            </div>
          )}
        </div>

        {formatOpen && (
          <FormatPanel
            slide={slide}
            theme={theme}
            setTheme={setTheme}
            fontHint={fontHint}
            setFontHint={setFontHint}
            changeLayout={changeLayout}
            updateSlideField={updateSlideField}
            t={t}
            imageGenEnabled={imageGenEnabled}
            onToggleImageGen={onToggleImageGen}
          />
        )}
      </div>

      {playMode && slide && (
        <PlayMode
          slide={slide}
          slideIdx={slideIdx}
          totalSlides={totalSlides}
          elements={currentElements}
          image={currentImage}
          t={t}
          deckTitle={deck?.title}
          onExit={() => setPlayMode(false)}
          onNav={onNav}
          slideKey={slideKey}
          navDir={navDir}
        />
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYNOTE TOP BAR — labelled icon buttons in groups separated by dividers.
// ─────────────────────────────────────────────────────────────────────────────
function KeynoteTopBar(props) {
  const {
    deckTitle, zoom, setZoom, sidebarOpen, setSidebarOpen,
    formatOpen, setFormatOpen, onAddSlide, onPlay,
    onAddText, onAddShape, onAddMedia, onInsertAIImage, aiImgDefaultPrompt,
    imageGenEnabled, isGenImg, onBack,
    onImprove, improving,
    onSave, saving, savedAt,
    onExport, exporting,
  } = props;
  const [insertOpen, setInsertOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);
  useEffect(() => {
    if (!exportOpen) return;
    function onDown(e) { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [exportOpen]);
  const [aiImgOpen, setAiImgOpen] = useState(false);
  const [aiImgPrompt, setAiImgPrompt] = useState('');
  const [aiImgLoading, setAiImgLoading] = useState(false);
  const insertRef = useRef(null);
  useEffect(() => {
    if (!insertOpen) { setAiImgOpen(false); }
  }, [insertOpen]);
  useEffect(() => {
    if (!insertOpen) return;
    function onDown(e) { if (insertRef.current && !insertRef.current.contains(e.target)) setInsertOpen(false); }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [insertOpen]);

  async function handleAIImageGenerate() {
    if (!aiImgPrompt.trim() || aiImgLoading) return;
    setAiImgLoading(true);
    await onInsertAIImage(aiImgPrompt);
    setAiImgLoading(false);
    setInsertOpen(false);
    setAiImgOpen(false);
  }

  return (
    <div className="flex-shrink-0 border-b border-white/[0.08] bg-[#222]">
      <div className="flex items-stretch h-16 px-3 gap-1">
        <ToolbarButton icon={<ArrowLeft size={18} />} label="Exit" onClick={onBack} />

        <div className="w-px bg-white/10 my-3" />

        <ToolbarButton
          icon={sidebarOpen ? <PanelLeft size={18} /> : <Eye size={18} />}
          label="View"
          onClick={() => setSidebarOpen(s => !s)}
          active={sidebarOpen}
        />
        <div className="flex flex-col items-center justify-center px-2 min-w-[64px]">
          <div className="flex items-center gap-1">
            <button
              className="text-white/55 hover:text-white/90 disabled:opacity-30"
              disabled={zoom <= 25}
              onClick={() => setZoom(z => Math.max(25, z - 25))}
            >
              <ZoomOut size={13} />
            </button>
            <span className="text-[12px] font-medium text-white/85 tabular-nums w-9 text-center">{zoom}%</span>
            <button
              className="text-white/55 hover:text-white/90 disabled:opacity-30"
              disabled={zoom >= 200}
              onClick={() => setZoom(z => Math.min(200, z + 25))}
            >
              <ZoomIn size={13} />
            </button>
          </div>
          <span className="text-[10px] text-white/40 mt-0.5">Zoom</span>
        </div>
        <ToolbarButton icon={<Plus size={18} />} label="Add Slide" onClick={onAddSlide} />
        <ToolbarButton
          icon={<Play size={18} className="fill-current" />}
          label="Play"
          onClick={onPlay}
        />

        <div className="w-px bg-white/10 my-3" />

        {/* Insert dropdown */}
        <div ref={insertRef} className="relative flex items-center">
          <button
            onClick={() => setInsertOpen(o => !o)}
            className={`flex flex-col items-center justify-center px-3 min-w-[60px] rounded-md transition-colors ${insertOpen ? 'bg-white/[0.10] text-white/95' : 'text-white/60 hover:text-white/90 hover:bg-white/[0.06]'}`}
          >
            <Plus size={18} />
            <span className="text-[10px] mt-0.5">Insert</span>
          </button>
          {insertOpen && (
            <div className="absolute top-full left-0 mt-1 w-44 rounded-xl bg-[#2a2a2a] border border-white/[0.10] shadow-2xl z-50 py-1.5 overflow-hidden">
              <p className="text-[9px] uppercase tracking-widest text-white/25 px-3 pt-1 pb-1.5">Elements</p>
              {[
                { label: 'Text Box', icon: <Type size={13} />, action: () => { onAddText(); setInsertOpen(false); } },
                { label: 'Rectangle', icon: <Square size={13} />, action: () => { onAddShape('rect'); setInsertOpen(false); } },
                { label: 'Circle', icon: <CircleIcon size={13} />, action: () => { onAddShape('circle'); setInsertOpen(false); } },
                { label: 'Pill Shape', icon: <Square size={13} className="rounded-full" />, action: () => { onAddShape('pill'); setInsertOpen(false); } },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.07] hover:text-white/90 transition-colors text-left">
                  <span className="text-white/40">{item.icon}</span>
                  {item.label}
                </button>
              ))}
              <div className="my-1.5 border-t border-white/[0.07]" />
              <p className="text-[9px] uppercase tracking-widest text-white/25 px-3 pt-0.5 pb-1.5">Media</p>
              <button
                onClick={() => { if (!aiImgOpen) { setAiImgPrompt(aiImgDefaultPrompt || ''); } setAiImgOpen(o => !o); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors text-left ${aiImgOpen ? 'bg-white/[0.07] text-white/90' : 'text-white/70 hover:bg-white/[0.07] hover:text-white/90'}`}
              >
                <span className="text-white/40"><Sparkles size={13} /></span>
                AI Image
                <span className="ml-auto text-white/25">{aiImgOpen ? '▲' : '▼'}</span>
              </button>
              {aiImgOpen && (
                <div className="px-3 pb-2 pt-1 space-y-2 border-t border-white/[0.06]">
                  <textarea
                    value={aiImgPrompt}
                    onChange={e => setAiImgPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAIImageGenerate(); if (e.key === 'Escape') setInsertOpen(false); }}
                    autoFocus
                    rows={2}
                    placeholder="Describe the image…"
                    className="w-full px-2.5 py-2 rounded-lg bg-white/[0.06] border border-white/[0.10] text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/[0.22] resize-none leading-relaxed transition-colors"
                  />
                  <button
                    onClick={handleAIImageGenerate}
                    disabled={aiImgLoading || !aiImgPrompt.trim()}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-[11px] text-white/80 font-medium transition-all disabled:opacity-40"
                  >
                    {aiImgLoading ? <><Loader2 size={11} className="animate-spin" /> Generating…</> : <><Sparkles size={11} /> Generate</>}
                  </button>
                </div>
              )}
              <button onClick={() => setInsertOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.07] hover:text-white/90 transition-colors text-left">
                <span className="text-white/40"><ImageIcon size={13} /></span>
                Paste Image <span className="ml-auto text-[10px] text-white/25">⌘V</span>
              </button>
            </div>
          )}
        </div>

        {/* Centre title — flexes to fill remaining space. */}
        <div className="flex-1 flex items-center justify-center px-4 min-w-0">
          <span className="text-[13px] font-semibold text-white/85 truncate">{deckTitle || 'Untitled'}</span>
        </div>

        <div className="w-px bg-white/10 my-3" />

        {/* Improve with AI */}
        <button
          onClick={onImprove}
          disabled={improving}
          className="flex flex-col items-center justify-center px-3 min-w-[60px] rounded-md transition-colors text-white/60 hover:text-white/90 hover:bg-white/[0.06] disabled:opacity-50"
        >
          {improving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          <span className="text-[10px] mt-0.5">{improving ? 'Improving…' : 'Improve'}</span>
        </button>


        {/* Save button with status indicator */}
        <button
          onClick={onSave}
          disabled={saving}
          className="flex flex-col items-center justify-center px-3 min-w-[60px] rounded-md transition-colors text-white/60 hover:text-white/90 hover:bg-white/[0.06] disabled:opacity-50"
        >
          {saving
            ? <Loader2 size={18} className="animate-spin" />
            : savedAt
              ? <Check size={18} className="text-green-400" />
              : <Save size={18} />}
          <span className="text-[10px] mt-0.5">
            {saving ? 'Saving…' : savedAt ? 'Saved' : 'Save'}
          </span>
        </button>

        {/* Export dropdown */}
        <div ref={exportRef} className="relative flex items-center">
          <button
            onClick={() => setExportOpen(o => !o)}
            disabled={!!exporting}
            className={`flex flex-col items-center justify-center px-3 min-w-[60px] rounded-md transition-colors disabled:opacity-40 ${exportOpen ? 'bg-white/[0.10] text-white/95' : 'text-white/60 hover:text-white/90 hover:bg-white/[0.06]'}`}
          >
            {exporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            <span className="text-[10px] mt-0.5">{exporting ? (exporting === 'pdf' ? 'PDF…' : 'PPTX…') : 'Export'}</span>
          </button>
          {exportOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-40 rounded-xl bg-[#2a2a2a] border border-white/[0.10] shadow-2xl z-50 py-1.5 overflow-hidden">
              <p className="text-[9px] uppercase tracking-widest text-white/25 px-3 pt-1 pb-1.5">Export as</p>
              {[
                { label: 'PDF', sub: '.pdf file', fmt: 'pdf' },
                { label: 'PowerPoint', sub: '.pptx file', fmt: 'pptx' },
              ].map(({ label, sub, fmt }) => (
                <button key={fmt}
                  onClick={() => { setExportOpen(false); onExport(fmt); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.07] transition-colors"
                >
                  <Download size={12} className="text-white/35 shrink-0" />
                  <div>
                    <p className="text-[12px] text-white/80 font-medium leading-none">{label}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <ToolbarButton
          icon={<PanelRight size={18} />}
          label="Format"
          onClick={() => setFormatOpen(s => !s)}
          active={formatOpen}
        />
      </div>
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, active, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center px-3 min-w-[60px] rounded-md transition-colors ${
        active
          ? 'bg-white/[0.10] text-white/95'
          : 'text-white/65 hover:text-white/95 hover:bg-white/[0.05]'
      } disabled:opacity-30 disabled:hover:bg-transparent`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <span className="text-[10px] mt-0.5 leading-none">{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE THUMBNAIL RAIL — vertical numbered list, Keynote style.
// ─────────────────────────────────────────────────────────────────────────────
function SlideThumbnailRail({ deck, slideIdx, onGoto, onDelete, onDeleteAt, onReorder, slideImages, generatingImages, theme, slideElementsMap }) {
  const t = THEMES[theme] || THEMES.midnight;
  const totalSlides = (deck?.slides || []).length;
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);

  function handleDragStart(e, i) {
    setDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  }
  function handleDragOver(e, i) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIdx(i);
  }
  function handleDrop(e, i) {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== i) onReorder?.(dragIdx, i);
    setDragIdx(null); setDropIdx(null);
  }
  function handleDragEnd() { setDragIdx(null); setDropIdx(null); }

  return (
    <div className="flex-shrink-0 w-[180px] border-r border-white/[0.08] bg-[#1f1f1f] flex flex-col">
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-2">
        {(deck?.slides || []).map((s, i) => {
          const isActive = i === slideIdx;
          const isGen = generatingImages.has(s.id);
          const isDragging = dragIdx === i;
          const isDropTarget = dropIdx === i && dragIdx !== null && dragIdx !== i;
          return (
            <div
              key={s.id}
              draggable
              onDragStart={e => handleDragStart(e, i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={e => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
              className={`flex items-start gap-2 group transition-opacity ${isDragging ? 'opacity-30' : 'opacity-100'}`}
            >
              <span className={`text-[10px] tabular-nums w-4 text-right pt-2 flex-shrink-0 ${isActive ? 'text-white/90' : 'text-white/35'}`}>
                {i + 1}
              </span>
              <div className={`flex-1 relative rounded-md transition-all ${isDropTarget ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-[#1f1f1f]' : ''}`}>
                <button
                  onClick={() => onGoto(i)}
                  className={`w-full aspect-video rounded-md overflow-hidden border-2 transition-all relative block ${
                    isActive ? 'border-blue-500' : 'border-transparent hover:border-white/20'
                  }`}
                  style={{ background: t.bg }}
                >
                  <ThumbnailPreview elements={slideElementsMap?.[s.id] || []} image={slideImages[s.id]} t={t} />
                  {isGen && (
                    <div className="absolute inset-0 bg-black/40 grid place-items-center">
                      <Loader2 size={14} className="animate-spin text-white/70" />
                    </div>
                  )}
                </button>
                {totalSlides > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteAt?.(i); }}
                    className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white/50 hover:text-rose-400 hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete slide"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex-shrink-0 border-t border-white/[0.06] p-2">
        <span className="text-[10px] text-white/35 px-1">{totalSlides} slides</span>
      </div>
    </div>
  );
}

// Scaled-down faithful render of a slide — same element pipeline as the main canvas.
function ThumbnailPreview({ elements, image, t }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.14);
  const isLight = t.mode === 'light';
  const layoutHasImage = elements.some(el => el.kind === 'image');

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setScale((entries[0].contentRect.width || 140) / 1000);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" style={{ background: t.bg }}>
      {image && !layoutHasImage && (
        <>
          <img src={image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: isLight ? 0.08 : 0.14, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: isLight ? `linear-gradient(105deg, ${t.bg} 55%, ${t.bg}cc 100%)` : `linear-gradient(105deg, ${t.bg}f5 50%, ${t.bg}99 100%)` }} />
        </>
      )}
      <div style={{ width: '1000px', height: `${Math.round(1000 * 9 / 16)}px`, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
        {elements.map(el => <RenderElement key={el.id} el={el} />)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT PANEL — Keynote-style right inspector. Slide layout · appearance ·
// background · theme. Edits apply to the current slide.
// ─────────────────────────────────────────────────────────────────────────────
function FormatPanel({ slide, theme, setTheme, fontHint, setFontHint, changeLayout, updateSlideField, t, imageGenEnabled, onToggleImageGen }) {
  return (
    <div className="flex-shrink-0 w-[240px] border-l border-white/[0.08] bg-[#222] overflow-y-auto">
      <div className="px-3 py-2 border-b border-white/[0.06] text-center">
        <span className="text-[11px] font-semibold text-white/85">Slide</span>
      </div>

      {/* Slide Layout (templates) — visual grid of all available layouts. */}
      <div className="p-3 border-b border-white/[0.06]">
        <label className="block text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2">Templates</label>
        <div className="grid grid-cols-3 gap-1.5">
          {SLIDE_LAYOUT_OPTIONS.map(([k, label]) => {
            const isActive = slide?.layout === k;
            return (
              <button
                key={k}
                onClick={() => changeLayout(k)}
                title={label}
                className={`group flex flex-col items-stretch gap-1 rounded-md p-1 transition-colors ${
                  isActive ? 'bg-white/[0.10]' : 'hover:bg-white/[0.06]'
                }`}
              >
                <div
                  className={`aspect-video rounded border-2 transition-colors overflow-hidden`}
                  style={{
                    background: t.bg,
                    borderColor: isActive ? '#3b82f6' : 'rgba(255,255,255,0.10)',
                  }}
                >
                  <LayoutMiniPreview layout={k} t={t} />
                </div>
                <span className={`text-[8px] text-center truncate leading-none ${
                  isActive ? 'text-white/95' : 'text-white/55 group-hover:text-white/75'
                }`}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content — text fields for the slide's structured content */}
      <div className="p-3 border-b border-white/[0.06]">
        <label className="block text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2.5">Content</label>
        <div className="space-y-2.5">
          <div>
            <span className="block text-[9px] text-white/30 mb-1 uppercase tracking-wider">Title</span>
            <textarea
              value={slide?.title || ''}
              placeholder="Slide title"
              onChange={(e) => updateSlideField('title', e.target.value)}
              rows={2}
              className="w-full px-2.5 py-2 rounded-lg bg-white/[0.06] border border-white/[0.10] text-[13px] font-medium text-white/90 placeholder:text-white/25 outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-colors resize-none leading-snug"
            />
          </div>
          <div>
            <span className="block text-[9px] text-white/30 mb-1 uppercase tracking-wider">Body</span>
            <textarea
              value={slide?.body || ''}
              placeholder="Body text"
              onChange={(e) => updateSlideField('body', e.target.value)}
              rows={4}
              className="w-full px-2.5 py-2 rounded-lg bg-white/[0.06] border border-white/[0.10] text-[12px] text-white/80 placeholder:text-white/25 outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-colors resize-none leading-relaxed"
            />
          </div>
          {(slide?.subtitle !== undefined) && (
            <div>
              <span className="block text-[9px] text-white/30 mb-1 uppercase tracking-wider">Subtitle</span>
              <textarea
                value={slide?.subtitle || ''}
                placeholder="Subtitle / caption"
                onChange={(e) => updateSlideField('subtitle', e.target.value)}
                rows={2}
                className="w-full px-2.5 py-2 rounded-lg bg-white/[0.06] border border-white/[0.10] text-[12px] text-white/80 placeholder:text-white/25 outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-colors resize-none leading-snug"
              />
            </div>
          )}
        </div>
      </div>

      {/* Theme — color palette swatches */}
      <div className="p-3 border-b border-white/[0.06]">
        <label className="block text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2">Color Theme</label>
        <div className="grid grid-cols-6 gap-1.5">
          {Object.entries(THEMES).map(([k, th]) => (
            <button
              key={k}
              onClick={() => setTheme(k)}
              title={th.name}
              className="aspect-square rounded-md border-2 transition-all hover:scale-110"
              style={{
                background: th.bg,
                borderColor: theme === k ? th.accent : 'rgba(255,255,255,0.08)',
              }}
            />
          ))}
        </div>
        <div className="mt-2 text-[10px] text-white/55 text-center">{THEMES[theme]?.name}</div>
      </div>

      {/* Font — pick the typeface pair */}
      <div className="p-3 border-b border-white/[0.06]">
        <label className="block text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2">Font</label>
        <div className="space-y-1">
          {Object.entries(FONT_PAIRS).map(([k, fp]) => {
            const active = (fontHint || THEMES[theme]?.font || 'modern') === k;
            const labels = { editorial: 'Editorial', modern: 'Modern', humanist: 'Humanist', geometric: 'Geometric' };
            const subLabels = { editorial: 'Fraunces · Inter', modern: 'Space Grotesk · Inter', humanist: 'Lora · Inter', geometric: 'Manrope · Manrope' };
            return (
              <button key={k} onClick={() => setFontHint(k)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border transition-colors ${active ? 'bg-white/[0.10] border-white/[0.18] text-white/90' : 'border-white/[0.07] text-white/50 hover:bg-white/[0.05] hover:text-white/75'}`}>
                <span className="text-[12px] font-semibold" style={{ fontFamily: fp.head }}>{labels[k]}</span>
                <span className="text-[9px] text-white/30">{subLabels[k]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes editor */}
      <div className="p-3 border-b border-white/[0.06]">
        <label className="block text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2">Presenter Notes</label>
        <textarea
          value={slide?.notes || ''}
          placeholder="Notes for the presenter…"
          onChange={(e) => updateSlideField('notes', e.target.value)}
          rows={4}
          className="w-full px-2 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.10] text-[12px] text-white/75 placeholder:text-white/25 outline-none focus:border-white/30 transition-colors resize-none"
        />
      </div>

      {/* Settings */}
      <div className="p-3">
        <label className="block text-[10px] uppercase tracking-[0.14em] text-white/40 mb-2.5">Settings</label>
        <button
          onClick={onToggleImageGen}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors border-white/[0.08] hover:bg-white/[0.04]"
        >
          <div className="text-left">
            <p className="text-[12px] text-white/75 font-medium">AI Image Generation</p>
            <p className="text-[10px] text-white/30 mt-0.5">Auto-generate images for slides</p>
          </div>
          {/* Toggle pill */}
          <div className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${imageGenEnabled ? 'bg-blue-500' : 'bg-white/[0.12]'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${imageGenEnabled ? 'left-4' : 'left-0.5'}`} />
          </div>
        </button>
      </div>
    </div>
  );
}

// Tiny abstract preview of a layout for the templates grid. Just blocks +
// strips that approximate the layout's visual shape — too small for full
// rendering but enough to recognise.
function LayoutMiniPreview({ layout, t }) {
  const accent = t.accent || '#888';
  const text = t.text || '#fff';
  const muted = t.muted || '#aaa';
  const bar = (color, w, h, x, y) => (
    <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, background: color, borderRadius: 1 }} />
  );
  const map = {
    title:      [bar(accent, 100, 4, 0, 0), bar(text, 50, 12, 8, 60), bar(muted, 30, 4, 8, 78)],
    content:    [bar(text, 60, 8, 8, 18), bar(accent, 12, 2, 8, 30), bar(muted, 75, 4, 8, 40), bar(muted, 70, 4, 8, 50), bar(muted, 65, 4, 8, 60)],
    bullets:    [bar(text, 50, 8, 8, 12), bar(accent, 4, 4, 8, 36), bar(muted, 50, 3, 16, 38), bar(accent, 4, 4, 8, 50), bar(muted, 50, 3, 16, 52), bar(accent, 4, 4, 8, 64), bar(muted, 50, 3, 16, 66)],
    hero:       [bar(text, 80, 18, 10, 38)],
    section:    [bar(accent, 35, 100, 0, 0), bar(text, 40, 14, 45, 40)],
    agenda:     [bar(text, 50, 8, 8, 12), bar(muted, 80, 2, 8, 30), bar(accent, 6, 4, 8, 38), bar(muted, 60, 3, 18, 40), bar(accent, 6, 4, 8, 52), bar(muted, 55, 3, 18, 54), bar(accent, 6, 4, 8, 66), bar(muted, 50, 3, 18, 68)],
    cards:      [bar(text, 40, 6, 8, 12), bar(accent, 25, 60, 8, 28), bar(accent, 25, 60, 38, 28), bar(accent, 25, 60, 68, 28)],
    numbered:   [bar(text, 40, 6, 8, 12), bar(accent, 6, 6, 8, 30), bar(muted, 60, 3, 18, 32), bar(accent, 6, 6, 8, 48), bar(muted, 55, 3, 18, 50), bar(accent, 6, 6, 8, 66), bar(muted, 50, 3, 18, 68)],
    compare:    [bar(text, 40, 6, 8, 10), bar(muted, 38, 60, 8, 28), bar(accent, 38, 60, 54, 28)],
    stat:       [bar(muted, 30, 4, 35, 18), bar(accent, 60, 30, 20, 32), bar(muted, 40, 4, 30, 70)],
    quote:      [bar(accent, 4, 6, 8, 18), bar(text, 70, 18, 16, 30), bar(accent, 25, 3, 16, 64)],
    split:      [bar(text, 40, 14, 8, 30), bar(accent, 38, 100, 56, 0)],
    twoCol:     [bar(text, 50, 6, 8, 12), bar(muted, 35, 50, 8, 28), bar(muted, 35, 50, 56, 28)],
    imageHero:  [bar(muted, 100, 70, 0, 0), bar(text, 60, 8, 8, 78)],
    imageRight: [bar(text, 35, 8, 8, 22), bar(muted, 25, 3, 8, 38), bar(muted, 28, 3, 8, 48), bar(accent, 40, 100, 55, 0)],
    imageLeft:  [bar(accent, 40, 100, 0, 0), bar(text, 35, 8, 50, 22), bar(muted, 25, 3, 50, 38), bar(muted, 28, 3, 50, 48)],
    imageFull:  [bar(muted, 100, 100, 0, 0), bar(accent, 40, 8, 8, 80)],
    bigText:    [bar(accent, 12, 3, 10, 18), bar(text, 80, 50, 10, 28)],
    summary:    [bar(text, 50, 8, 8, 12), bar(accent, 4, 4, 8, 36), bar(muted, 50, 3, 16, 38), bar(accent, 4, 4, 8, 50), bar(muted, 50, 3, 16, 52)],
  };
  return <div className="relative w-full h-full">{(map[layout] || map.content).map((el, i) => React.cloneElement(el, { key: i }))}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAY MODE — fullscreen presentation overlay with slide-only chrome.
// ─────────────────────────────────────────────────────────────────────────────
function PlayMode({ slide, slideIdx, totalSlides, elements, image, t, deckTitle, onExit, onNav, slideKey, navDir }) {
  // Narration state. "Listen" toggles audio on/off. Auto-advance is on by
  // default once the user enables Listen — the deck plays itself like a
  // NotebookLM video overview.
  const [listen, setListen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const isLast = slideIdx === totalSlides - 1;
  // When narration ends, advance to the next slide if not at the end and
  // the user has auto-advance on. We delay slightly so the audio doesn't
  // bleed into the next slide's startup.
  const onNarrationEnd = useCallback(() => {
    if (!listen || !autoAdvance) return;
    if (isLast) return;
    const t = setTimeout(() => onNav(1), 600);
    return () => clearTimeout(t);
  }, [listen, autoAdvance, isLast, onNav]);
  const { speaking } = useSlideNarration({ enabled: listen, slide, onEnd: onNarrationEnd });
  return (
    <div className="fixed inset-0 z-[10000] bg-black flex items-center justify-center" style={{ background: t.bg }}>
      <div className="w-full h-full flex items-center justify-center p-8">
        <SlideView
          key={slideKey}
          slide={slide}
          elements={elements}
          image={image}
          isGenImg={false}
          t={t}
          slideIdx={slideIdx}
          totalSlides={totalSlides}
          deckTitle={deckTitle}
          navDir={navDir}
        />
      </div>
      {/* Top-right Listen pill — NotebookLM-style "Audio Overview" affordance. */}
      <div className="absolute top-6 right-6 flex items-center gap-2">
        {listen && (
          <button
            onClick={() => setAutoAdvance(a => !a)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors backdrop-blur border ${
              autoAdvance
                ? 'bg-white/15 border-white/25 text-white/90'
                : 'bg-black/40 border-white/10 text-white/60'
            }`}
            title="Auto-advance slides when narration ends"
          >
            Auto-advance {autoAdvance ? 'on' : 'off'}
          </button>
        )}
        <button
          onClick={() => setListen(l => !l)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] font-semibold transition-all backdrop-blur border ${
            listen
              ? 'bg-white text-black border-white shadow-lg'
              : 'bg-black/60 text-white/85 border-white/15 hover:bg-black/80'
          }`}
          title={listen ? 'Stop narration' : 'Play narration'}
        >
          {listen
            ? <><Volume2 size={13} className={speaking ? 'animate-pulse' : ''} /> {speaking ? 'Narrating' : 'Listening'}</>
            : <><Headphones size={13} /> Listen</>
          }
        </button>
      </div>
      {/* Floating controls — fade up on hover. */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-full bg-black/70 backdrop-blur border border-white/10">
        <button onClick={() => onNav(-1)} disabled={slideIdx === 0}
          className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-25">
          <ChevronLeft size={16} />
        </button>
        <span className="text-[11px] text-white/70 tabular-nums px-2">{slideIdx + 1} / {totalSlides}</span>
        <button onClick={() => onNav(1)} disabled={slideIdx === totalSlides - 1}
          className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-25">
          <ChevronRight size={16} />
        </button>
        <div className="w-px h-4 bg-white/15 mx-1" />
        <button onClick={onExit} className="p-2 rounded-full text-white/70 hover:text-rose-400 hover:bg-white/10" title="Exit (Esc)">
          <XIcon size={16} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE VIEW (presentation mode — read-only, uses theme colors)
//
// Adds three things over the previous version:
// (1) Fade + slight-rise transition when the visible slide changes — driven
//     by re-mounting the component via a `key` prop in the parent.
// (2) Slide-number HUD in the bottom-right corner, Google-Slides-style.
// (3) Light-theme-correct image overlay — the previous overlay used the
//     theme's bg color which on a light theme produced a washed-out white
//     wall. We pick a gradient direction that works for both modes.
// ─────────────────────────────────────────────────────────────────────────────
// Scaled bespoke HTML renderer. The server hands us a self-contained
// HTML+CSS fragment designed at 1280×720 reference; we drop it into a
// fixed-size box and scale-transform it to fit the parent. This is the
// premium render path — each slide is hand-designed by the LLM rather
// than assembled from templates.
function BespokeHtmlSlide({ html, image, containerW, t }) {
  // Substitute the {{IMAGE}} placeholder with the actual image URL. If no
  // image yet, leave a transparent 1×1 PNG so <img> tags don't 404.
  const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const resolved = useMemo(() => {
    if (!html) return '';
    return String(html).replace(/\{\{IMAGE\}\}/g, image || TRANSPARENT_PIXEL);
  }, [html, image]);
  const scale = containerW / 1280;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: t.bg }}>
      <div
        style={{
          width: '1280px',
          height: '720px',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
        dangerouslySetInnerHTML={{ __html: resolved }}
      />
    </div>
  );
}

function SlideView({ slide, elements, image, isGenImg, t, slideIdx, totalSlides, deckTitle, navDir = 1 }) {
  const [shown, setShown] = useState(false);
  const [containerW, setContainerW] = useState(1000);
  const wrapRef = useRef(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width || 1000);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const isLight = t.mode === 'light';
  const layoutHasImage = elements.some(el => el.kind === 'image');
  const useBespoke = !!(slide?.html && String(slide.html).length > 50);
  const initialTransform = navDir >= 0
    ? 'translateX(56px) scale(0.96)'
    : 'translateX(-56px) scale(0.96)';
  const wrapperStyle = {
    aspectRatio: '16/9',
    maxWidth: '1280px',
    maxHeight: '100%',
    background: t.bg,
    border: isLight ? `1px solid ${t.border}` : '1px solid rgba(255,255,255,0.06)',
    boxShadow: isLight
      ? '0 24px 60px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.08)'
      : '0 30px 80px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
    transform: shown ? 'translateX(0) scale(1)' : initialTransform,
    opacity: shown ? 1 : 0,
    transition: 'opacity 360ms ease, transform 360ms cubic-bezier(0.25,0.46,0.45,0.94)',
  };
  return (
    <div ref={wrapRef} className="relative rounded-2xl overflow-hidden w-full" style={wrapperStyle}>
      {/* Background image only used by template renderer — bespoke HTML
          handles its own image composition. */}
      {!useBespoke && image && !layoutHasImage && (
        <>
          <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: isLight ? 0.08 : 0.14 }} />
          <div
            className="absolute inset-0"
            style={{
              background: isLight
                ? `linear-gradient(105deg, ${t.bg} 55%, ${t.bg}cc 100%)`
                : `linear-gradient(105deg, ${t.bg}f5 50%, ${t.bg}99 100%)`,
            }}
          />
        </>
      )}
      {useBespoke ? (
        <BespokeHtmlSlide html={slide.html} image={image} containerW={containerW} t={t} />
      ) : (
        <div className="absolute inset-0 overflow-hidden">
          <div style={{ width: '1000px', height: `${Math.round(1000 * 9 / 16)}px`, transform: `scale(${containerW / 1000})`, transformOrigin: 'top left' }}>
            {elements.map(el => <RenderElement key={el.id} el={el} />)}
          </div>
        </div>
      )}
      {isGenImg && !image && (
        <div className="absolute top-3 right-3 z-20">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: t.surface + 'dd', border: `1px solid ${t.border}` }}>
            <Loader2 size={11} className="animate-spin" style={{ color: t.accent }} />
            <span className="text-[10px]" style={{ color: t.muted }}>Generating image…</span>
          </div>
        </div>
      )}
      {Number.isFinite(slideIdx) && totalSlides > 0 && (
        <div
          className="absolute bottom-3 right-4 flex items-center gap-2 text-[10px] font-medium tabular-nums tracking-wide pointer-events-none z-30"
          style={{ color: t.faint, mixBlendMode: layoutHasImage ? 'difference' : 'normal' }}
        >
          {deckTitle && (
            <>
              <span className="opacity-70 truncate max-w-[200px]">{deckTitle}</span>
              <span className="opacity-40">·</span>
            </>
          )}
          <span>{slideIdx + 1} / {totalSlides}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE EDITOR (edit mode — canvas uses theme colors, toolbar is glass)
// ─────────────────────────────────────────────────────────────────────────────
function SlideEditor({ slide, elements, image, isGenImg, t, imageGenEnabled, onChange, onFieldChange, onGenImage, zoom = 100 }) {
  // Determines if an element id corresponds to a structured slide field.
  // Element ids are `${slide.id}-${field}` e.g. `abc-title`, `abc-body`.
  function fieldOf(elId) {
    if (!slide) return null;
    const suffix = elId.slice((slide.id + '-').length);
    return ['title', 'body', 'subtitle', 'eyebrow', 'notes'].includes(suffix) ? suffix : null;
  }
  const canvasRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const dragRef = useRef(null);
  const lastGestureWasDrag = useRef(false);
  const [scale, setScale] = useState(1);
  const activeTextareaRef = useRef(null);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const fontMenuRef = useRef(null);
  useEffect(() => {
    if (!fontMenuOpen) return;
    function onDown(e) { if (fontMenuRef.current && !fontMenuRef.current.contains(e.target)) setFontMenuOpen(false); }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [fontMenuOpen]);

  // Paste image from clipboard → add as image element on the slide.
  useEffect(() => {
    function onPaste(e) {
      if (editing) return;
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find(it => it.type.startsWith('image/'));
      if (!imgItem) return;
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target.result;
        const img = new Image();
        img.onload = () => {
          const imgAspect = img.naturalWidth / img.naturalHeight;
          // Slide is 16:9; coords are % of each axis independently.
          // To preserve pixel aspect: h% = w% * (imgH/imgW) * (16/9)
          const slideAspect = 16 / 9;
          let w = 60;
          let h = w * (1 / imgAspect) * slideAspect;
          // Clamp so neither axis exceeds 85%
          if (h > 85) { h = 85; w = h * imgAspect * (1 / slideAspect); }
          if (w > 85) { w = 85; h = w * (1 / imgAspect) * slideAspect; }
          w = Math.round(w * 10) / 10;
          h = Math.round(h * 10) / 10;
          const x = Math.round(((100 - w) / 2) * 10) / 10;
          const y = Math.round(((100 - h) / 2) * 10) / 10;
          const newEl = {
            id: `${slide?.id}-img-${Date.now()}`,
            kind: 'image', x, y, w, h,
            src, fit: 'contain',
          };
          onChange([...elements, newEl]);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editing, elements, onChange, slide?.id]);

  useEffect(() => {
    const update = () => {
      if (canvasRef.current) setScale(canvasRef.current.offsetWidth / 1000);
    };
    update();
    const ro = new ResizeObserver(update);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  function pct(e) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  function startDrag(e, elId) {
    e.stopPropagation();
    // Save + exit text edit when clicking a different element.
    if (activeTextareaRef.current && editing !== elId) {
      activeTextareaRef.current.blur();
    }
    const pos = pct(e);
    const el = elements.find(x => x.id === elId);
    if (!el) return;
    lastGestureWasDrag.current = false;
    setSelected(elId);
    dragRef.current = { type: 'move', elId, sx: pos.x, sy: pos.y, ex: el.x, ey: el.y, startCX: e.clientX, startCY: e.clientY };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startResize(e, elId, handle) {
    e.preventDefault();
    e.stopPropagation();
    const pos = pct(e);
    const el = elements.find(x => x.id === elId);
    if (!el) return;
    dragRef.current = { type: 'resize', handle, elId, sx: pos.x, sy: pos.y, ex: el.x, ey: el.y, ew: el.w, eh: el.h };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const onMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    // Only start moving after a 4px threshold to distinguish click from drag.
    if (!lastGestureWasDrag.current) {
      if (Math.abs(e.clientX - d.startCX) < 4 && Math.abs(e.clientY - d.startCY) < 4) return;
      lastGestureWasDrag.current = true;
    }
    const pos = pct(e);
    const dx = pos.x - d.sx;
    const dy = pos.y - d.sy;
    onChange(elements.map(el => {
      if (el.id !== d.elId) return el;
      if (d.type === 'move') {
        return { ...el, x: clamp(d.ex + dx, 0, 97 - el.w), y: clamp(d.ey + dy, 0, 97 - el.h) };
      }
      if (d.type === 'resize') {
        let { ex, ey, ew, eh } = d;
        if (d.handle.includes('e')) ew = clamp(d.ew + dx, 5, 100 - ex);
        if (d.handle.includes('s')) eh = clamp(d.eh + dy, 3, 100 - ey);
        if (d.handle.includes('w')) { const nw = clamp(d.ew - dx, 5, 100); ex = d.ex + (d.ew - nw); ew = nw; }
        if (d.handle.includes('n')) { const nh = clamp(d.eh - dy, 3, 100); ey = d.ey + (d.eh - nh); eh = nh; }
        return { ...el, x: ex, y: ey, w: ew, h: eh };
      }
      return el;
    }));
  }, [elements, onChange]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  // Delete/Backspace removes the selected element when not editing text.
  useEffect(() => {
    function onKey(e) {
      if (editing) return;
      if (!selected) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onChange(elements.filter(el => el.id !== selected));
        setSelected(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, editing, elements, onChange]);

  function deleteSelected() {
    if (!selected) return;
    onChange(elements.filter(el => el.id !== selected));
    setSelected(null);
  }

  function updateEl(id, patch) {
    onChange(elements.map(el => el.id === id ? { ...el, ...patch } : el));
  }

  function applyFontSize(newSize) {
    if (!selected) return;
    const selEl = elements.find(e => e.id === selected);
    if (!selEl) return;
    const ta = activeTextareaRef.current;
    if (editing === selected && ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const text = ta.value;
      if (start !== end) {
        const baseSize = selEl.fontSize || 24;
        const existingParts = Array.isArray(selEl.parts) && selEl.parts.length ? selEl.parts : [{ text, fontSize: baseSize }];
        // Rebuild parts by splitting at selection boundaries within the plain text
        const parts = [];
        let pos = 0;
        for (const p of existingParts) {
          const pStart = pos;
          const pEnd = pos + p.text.length;
          const pSize = p.fontSize || baseSize;
          if (pEnd <= start || pStart >= end) {
            // Completely outside selection — keep as is
            parts.push({ ...p });
          } else {
            // Overlaps with selection
            const pre = p.text.slice(0, Math.max(0, start - pStart));
            const sel = p.text.slice(Math.max(0, start - pStart), Math.min(p.text.length, end - pStart));
            const post = p.text.slice(Math.min(p.text.length, end - pStart));
            if (pre) parts.push({ ...p, text: pre, fontSize: pSize });
            if (sel) parts.push({ ...p, text: sel, fontSize: newSize });
            if (post) parts.push({ ...p, text: post, fontSize: pSize });
          }
          pos = pEnd;
        }
        // Merge adjacent parts with same fontSize
        const merged = [];
        for (const p of parts) {
          const prev = merged[merged.length - 1];
          if (prev && prev.fontSize === p.fontSize && prev.color === p.color) {
            prev.text += p.text;
          } else {
            merged.push({ ...p });
          }
        }
        onChange(elements.map(el => el.id === selected ? { ...el, parts: merged } : el));
        return;
      }
    }
    onChange(elements.map(el => el.id === selected ? { ...el, fontSize: newSize, parts: [] } : el));
  }

  const selEl = elements.find(e => e.id === selected);
  const baseW = 1100;
  // Explicit zoomed width: canvas grows independent of parent width, parent scrolls.
  const targetW = Math.round(baseW * (zoom / 100));
  const targetH = Math.round(targetW * 9 / 16);

  return (
    <div className="flex flex-col items-center gap-2 m-auto">
      {/* Contextual selection toolbar — only appears when an element is selected. */}
      <div className="flex items-center gap-2 flex-shrink-0 h-7 px-1" style={{ width: `${targetW}px`, maxWidth: '100%' }}>
        {selected && selEl?.kind === 'text' && (
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.06] border border-white/[0.10]">
            {/* Font size — onMouseDown with preventDefault keeps textarea focused so
                we can read selectionStart/End for partial-text font size changes. */}
            <div className="flex items-center gap-1">
              <button
                onMouseDown={(e) => { e.preventDefault(); applyFontSize(Math.max(10, (selEl.fontSize || 24) - 4)); }}
                className="p-1 rounded hover:bg-white/[0.07] text-white/45 hover:text-white/90"
              >
                <ChevronDown size={12} />
              </button>
              <span className="text-xs tabular-nums w-6 text-center text-white/85">{selEl.fontSize}</span>
              <button
                onMouseDown={(e) => { e.preventDefault(); applyFontSize(Math.min(200, (selEl.fontSize || 24) + 4)); }}
                className="p-1 rounded hover:bg-white/[0.07] text-white/45 hover:text-white/90"
              >
                <ChevronUp size={12} />
              </button>
            </div>
            <div className="h-3 w-px bg-white/[0.15]" />
            {/* Font family — custom dropdown */}
            {(() => {
              const FONTS = [
                { label: 'Inter',        value: '"Inter", system-ui, sans-serif' },
                { label: 'Fraunces',     value: '"Fraunces", "Playfair Display", Georgia, serif' },
                { label: 'Playfair',     value: '"Playfair Display", Georgia, serif' },
                { label: 'Lora',         value: '"Lora", "Source Serif 4", Georgia, serif' },
                { label: 'Space Grotesk',value: '"Space Grotesk", "Inter", system-ui, sans-serif' },
                { label: 'Manrope',      value: '"Manrope", "Inter", system-ui, sans-serif' },
              ];
              const current = FONTS.find(f => f.value === selEl.fontFamily) || FONTS[0];
              return (
                <div ref={fontMenuRef} className="relative">
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); setFontMenuOpen(o => !o); }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-white/75 border border-white/[0.12] hover:border-white/25 hover:text-white/90 transition-colors"
                    style={{ fontFamily: current.value, minWidth: 80 }}
                  >
                    <span className="truncate">{current.label}</span>
                    <ChevronDown size={10} className="shrink-0 text-white/40" />
                  </button>
                  {fontMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 z-50 rounded-lg overflow-hidden border border-white/[0.12] shadow-2xl" style={{ background: 'rgba(22,22,28,0.97)', minWidth: 140 }}>
                      {FONTS.map(f => (
                        <button
                          key={f.value}
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); updateEl(selected, { fontFamily: f.value }); setFontMenuOpen(false); }}
                          className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors ${f.value === selEl.fontFamily ? 'text-white bg-white/[0.10]' : 'text-white/65 hover:text-white hover:bg-white/[0.06]'}`}
                          style={{ fontFamily: f.value }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="h-3 w-px bg-white/[0.15]" />
            {/* Align */}
            {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, Icon]) => (
              <button
                key={a}
                onClick={() => updateEl(selected, { align: a })}
                className={`p-1 rounded transition-colors ${
                  selEl.align === a
                    ? 'bg-white/[0.15] text-white/95'
                    : 'text-white/45 hover:text-white/85 hover:bg-white/[0.07]'
                }`}
              >
                <Icon size={12} />
              </button>
            ))}
            {/* Bold */}
            <button
              onClick={() => updateEl(selected, { fontWeight: selEl.fontWeight === '700' ? '400' : '700' })}
              className={`px-1.5 py-0.5 rounded text-xs font-bold transition-colors ${
                selEl.fontWeight === '700'
                  ? 'bg-white/[0.15] text-white/95'
                  : 'text-white/45 hover:text-white/85 hover:bg-white/[0.07]'
              }`}
            >
              B
            </button>
            {/* Text color */}
            <label
              className="flex flex-col items-center justify-center gap-[2px] px-1.5 py-[3px] rounded cursor-pointer hover:bg-white/[0.07] transition-colors select-none"
              onMouseDown={e => e.stopPropagation()}
              title="Text color"
            >
              <span className="text-[11px] font-black leading-none" style={{ color: selEl.color || '#ffffff', textShadow: '0 0 6px rgba(0,0,0,0.5)' }}>A</span>
              <div className="w-[14px] h-[3px] rounded-full" style={{ background: selEl.color || '#ffffff' }} />
              <input
                type="color"
                value={selEl.color || '#ffffff'}
                onChange={e => updateEl(selected, { color: e.target.value })}
                style={{ display: 'none' }}
              />
            </label>
            <div className="h-3 w-px bg-white/[0.15]" />
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-rose-400/80 hover:text-rose-400 transition-colors hover:bg-rose-900/20"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
        {selected && selEl?.kind === 'shape' && (
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.06] border border-white/[0.10]">
            <span className="text-[10px] text-white/55 uppercase tracking-wider">Shape</span>
            <input
              type="color"
              value={selEl.color || '#ffffff'}
              onChange={(e) => updateEl(selected, { color: e.target.value })}
              className="w-5 h-5 rounded cursor-pointer bg-transparent border border-white/15"
            />
            <div className="h-3 w-px bg-white/[0.15]" />
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-rose-400/80 hover:text-rose-400 transition-colors hover:bg-rose-900/20"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Canvas — theme colors apply here. Zoom drives an explicit pixel
          size so the parent can scroll when the canvas exceeds the viewport. */}
      <div
        ref={canvasRef}
        className="relative rounded-md overflow-hidden shadow-2xl cursor-default flex-shrink-0"
        style={{ width: `${targetW}px`, height: `${targetH}px`, background: t.bg }}
        onPointerDown={(e) => {
          if (e.target === canvasRef.current) {
            if (activeTextareaRef.current) activeTextareaRef.current.blur();
            setSelected(null);
            setEditing(null);
          }
        }}
      >
        {image && (
          <>
            <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${t.bg}ee 55%, ${t.bg}88 100%)` }} />
          </>
        )}

        {elements.map(el => (
          el.kind === 'shape' ? (
            <div
              key={el.id}
              onPointerDown={e => startDrag(e, el.id)}
              style={{
                position: 'absolute',
                left: `${el.x}%`, top: `${el.y}%`,
                width: `${el.w}%`, height: `${el.h}%`,
                cursor: 'move',
                outline: selected === el.id ? '2px solid #3b82f6' : '2px solid transparent',
                zIndex: selected === el.id ? 5 : 1,
              }}
            >
              <div
                style={{
                  width: '100%', height: '100%',
                  background: el.gradient || el.color || '#ffffff22',
                  borderRadius: el.radius || (el.shape === 'circle' ? '50%' : el.shape === 'pill' ? '9999px' : el.sharp ? '0' : '4px'),
                  pointerEvents: 'none',
                }}
              />
              {selected === el.id && ['nw','ne','se','sw','n','e','s','w'].map(h => (
                <ResizeHandle key={h} handle={h} color="#3b82f6"
                  onPointerDown={e => startResize(e, el.id, h)} />
              ))}
            </div>
          ) : el.kind === 'image' ? (
            <div
              key={el.id}
              onPointerDown={e => startDrag(e, el.id)}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: `${el.x}%`, top: `${el.y}%`,
                width: `${el.w}%`, height: `${el.h}%`,
                cursor: 'move',
                outline: selected === el.id ? '2px solid #3b82f6' : '2px solid transparent',
                borderRadius: el.radius || 0,
                overflow: 'hidden',
                zIndex: selected === el.id ? 5 : 1,
              }}
            >
              <img
                src={el.src} alt=""
                style={{ width: '100%', height: '100%', objectFit: el.fit || 'cover', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
              />
              {selected === el.id && ['nw','ne','se','sw','n','e','s','w'].map(h => (
                <ResizeHandle key={h} handle={h} color="#3b82f6" onPointerDown={e => startResize(e, el.id, h)} />
              ))}
              {selected === el.id && (
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onChange(elements.filter(x => x.id !== el.id)); setSelected(null); }}
                  style={{ position: 'absolute', top: 6, right: 6, zIndex: 30 }}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white/80 hover:bg-rose-500/80 hover:text-white transition-colors"
                >
                  <XIcon size={11} />
                </button>
              )}
            </div>
          ) : editing === el.id ? (
            <textarea
              key={el.id}
              autoFocus
              ref={activeTextareaRef}
              defaultValue={el.text}
              onFocus={e => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
              onBlur={e => {
                const text = e.target.value;
                const field = fieldOf(el.id);
                if (field && onFieldChange) onFieldChange(field, text);
                else updateEl(el.id, { text });
                activeTextareaRef.current = null;
                setEditing(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); }
              }}
              style={{
                position: 'absolute',
                left: `${el.x}%`, top: `${el.y}%`,
                width: `${el.w}%`, height: `${el.h}%`,
                fontFamily: el.fontFamily || 'Inter, system-ui, sans-serif',
                fontSize: `${(el.fontSize || 24) * scale}px`,
                fontWeight: el.fontWeight || '400',
                fontStyle: el.italic ? 'italic' : 'normal',
                color: el.color || t.text,
                textAlign: el.align || 'left',
                lineHeight: el.lineHeight ?? 1.3,
                whiteSpace: 'pre-wrap',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                padding: 0,
                margin: 0,
                overflow: 'hidden',
                cursor: 'text',
                zIndex: 10,
              }}
            />
          ) : (
            <div
              key={el.id}
              onPointerDown={e => startDrag(e, el.id)}
              onClick={e => {
                e.stopPropagation();
                if (lastGestureWasDrag.current) { lastGestureWasDrag.current = false; }
              }}
              onDoubleClick={e => { e.stopPropagation(); setEditing(el.id); }}
              style={{
                position: 'absolute',
                left: `${el.x}%`, top: `${el.y}%`,
                width: `${el.w}%`, height: `${el.h}%`,
                cursor: 'move',
                userSelect: 'none',
                outline: selected === el.id ? '2px solid #3b82f6' : '2px solid transparent',
                borderRadius: '3px',
                zIndex: selected === el.id ? 5 : 1,
              }}
            >
              <div
                style={{
                  fontFamily: el.fontFamily || 'Inter, system-ui, sans-serif',
                  fontSize: `${(el.fontSize || 24) * scale}px`,
                  fontWeight: el.fontWeight || '400',
                  fontStyle: el.italic ? 'italic' : 'normal',
                  color: el.color || t.text,
                  textAlign: el.align || 'left',
                  lineHeight: el.lineHeight ?? 1.3,
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {Array.isArray(el.parts) && el.parts.length
                  ? el.parts.map((p, i) => (
                      <span key={i} style={{
                        color: p.color || undefined,
                        fontSize: p.fontSize ? `${p.fontSize * scale}px` : undefined,
                        fontWeight: p.fontWeight || undefined,
                        fontStyle: p.italic ? 'italic' : undefined,
                      }}>{p.text}</span>
                    ))
                  : el.text}
              </div>
              {selected === el.id && ['nw','ne','se','sw','n','e','s','w'].map(h => (
                <ResizeHandle key={h} handle={h} color="#3b82f6"
                  onPointerDown={e => startResize(e, el.id, h)} />
              ))}
            </div>
          )
        ))}
      </div>
    </div>
  );
}

function ResizeHandle({ handle, color, onPointerDown }) {
  const pos = {
    nw: { top: '-5px', left: '-5px' },
    n:  { top: '-5px', left: 'calc(50% - 5px)' },
    ne: { top: '-5px', right: '-5px' },
    e:  { top: 'calc(50% - 5px)', right: '-5px' },
    se: { bottom: '-5px', right: '-5px' },
    s:  { bottom: '-5px', left: 'calc(50% - 5px)' },
    sw: { bottom: '-5px', left: '-5px' },
    w:  { top: 'calc(50% - 5px)', left: '-5px' },
  }[handle];
  const cursors = { nw:'nw-resize', n:'n-resize', ne:'ne-resize', e:'e-resize', se:'se-resize', s:'s-resize', sw:'sw-resize', w:'w-resize' };
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute', width: '10px', height: '10px',
        borderRadius: '50%', background: color, border: '2px solid white',
        cursor: cursors[handle], zIndex: 20, ...pos,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER ELEMENT (shared between view and editor)
// Supports: text (with fontFamily, letterSpacing, lineHeight, optional `parts`
// array for multi-color title spans), shape (rect / circle / pill, custom
// radius). Sizing uses percentage units so the entire slide scales with its
// container — no fixed-pixel layout math.
// ─────────────────────────────────────────────────────────────────────────────
function RenderElement({ el }) {
  if (el.kind === 'image') {
    return (
      <img
        src={el.src}
        alt=""
        style={{
          position: 'absolute',
          left: `${el.x}%`, top: `${el.y}%`,
          width: `${el.w}%`, height: `${el.h}%`,
          objectFit: el.fit || 'cover',
          borderRadius: el.radius || 0,
          opacity: el.opacity ?? 1,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />
    );
  }
  if (el.kind === 'shape') {
    let r;
    if (el.radius) r = el.radius;
    else if (el.sharp) r = '0';
    else if (el.shape === 'circle') r = '50%';
    else if (el.shape === 'pill') r = '9999px';
    else r = '4px';
    return (
      <div style={{
        position: 'absolute',
        left: `${el.x}%`, top: `${el.y}%`,
        width: `${el.w}%`, height: `${el.h}%`,
        background: el.gradient || el.color || '#ffffff22',
        borderRadius: r,
        pointerEvents: 'none',
      }} />
    );
  }
  // Text — supports multi-color spans via `parts`.
  const baseStyle = {
    position: 'absolute',
    left: `${el.x}%`, top: `${el.y}%`,
    width: `${el.w}%`, height: `${el.h}%`,
    fontFamily: el.fontFamily || 'Inter, system-ui, sans-serif',
    fontSize: `${el.fontSize || 24}px`,
    fontWeight: el.fontWeight || '400',
    fontStyle: el.italic ? 'italic' : 'normal',
    color: el.color || '#ffffff',
    textAlign: el.align || 'left',
    lineHeight: el.lineHeight ?? 1.3,
    letterSpacing: el.letterSpacing,
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    pointerEvents: 'none',
  };
  if (Array.isArray(el.parts) && el.parts.length) {
    return (
      <div style={baseStyle}>
        {el.parts.map((p, i) => (
          <span key={i} style={{
            color: p.color || undefined,
            fontSize: p.fontSize ? `${p.fontSize}px` : undefined,
            fontWeight: p.fontWeight || undefined,
            fontStyle: p.italic ? 'italic' : undefined,
          }}>{p.text}</span>
        ))}
      </div>
    );
  }
  return <div style={baseStyle}>{el.text}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI SLIDE  — renders a real scaled-down version of the first slide
// ─────────────────────────────────────────────────────────────────────────────
function MiniSlide({ deck }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.28);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setScale((e.contentRect.width || 280) / 1000);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const themeKey = PALETTE_TO_THEME[deck.palette] || 'midnight';
  const t = THEMES[themeKey] || THEMES.midnight;
  // Use firstSlide from server, or synthesize a minimal title slide so the
  // renderer always has something — no glow fallback needed.
  const slide = deck.firstSlide ?? { id: deck.id + '-ph', layout: 'title', title: deck.title };
  const img = slide.imageDataUrl || null;
  const useBespoke = !!(slide?.html && String(slide.html).length > 50);
  const elements = useMemo(
    () => slideToElements(slide, themeKey, deck.font, img),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck.id, deck.firstSlide, themeKey, deck.font]
  );

  // Substitute {{IMAGE}} for bespoke thumbnails (or transparent 1px if missing).
  const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const resolvedHtml = useBespoke
    ? String(slide.html).replace(/\{\{IMAGE\}\}/g, img || TRANSPARENT_PIXEL)
    : '';

  return (
    <div ref={wrapRef} style={{ aspectRatio: '16/9', background: t.bg, position: 'relative', overflow: 'hidden' }}>
      {useBespoke ? (
        <div
          style={{ width: '1280px', height: '720px', transform: `scale(${(scale * 1000) / 1280})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: resolvedHtml }}
        />
      ) : (
        <div style={{ width: '1000px', height: '562.5px', transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
          {elements.map(el => <RenderElement key={el.id} el={el} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GALLERY CARD  — Keynote-style thumbnail card
// ─────────────────────────────────────────────────────────────────────────────
function GalleryCard({ deck, onOpen, onDelete }) {
  const cardRef = useRef(null);
  return (
    <div ref={cardRef} className="group cursor-pointer select-none"
      onClick={() => {
        const rect = cardRef.current?.getBoundingClientRect() ?? null;
        onOpen(deck.id, rect);
      }}
    >
      <div className="rounded-xl overflow-hidden border border-white/[0.09] group-hover:border-blue-400/50 mb-[7px] transition-all duration-200"
        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
        <MiniSlide deck={deck} />
      </div>
      <div className="px-0.5 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white/80 truncate leading-snug">{deck.title}</p>
          <p className="text-[10px] text-white/32 mt-0.5">{deck.slideCount} slide{deck.slideCount !== 1 ? 's' : ''}{deck.createdAt ? ` · ${new Date(deck.createdAt).toLocaleDateString()}` : ''}</p>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete(deck.id, e); }}
          className="shrink-0 w-5 h-5 mt-0.5 rounded grid place-items-center text-white/0 group-hover:text-white/35 hover:!text-rose-400 hover:!bg-rose-900/25 transition-all">
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GALLERY  — Keynote-style presentation library
// ─────────────────────────────────────────────────────────────────────────────
function Gallery({ decks, loading, onOpen, onDelete, onNew, onManual }) {
  return (
    <div className="h-full flex flex-col bg-[#1c1c1e]">
      {/* Keynote-style toolbar */}
      <div className="flex items-center px-5 h-11 border-b border-white/[0.07] bg-[#242424] shrink-0">
        <Presentation size={14} className="text-white/35 mr-2.5" />
        <h1 className="text-[13px] font-semibold text-white/75 tracking-tight">Slideshows</h1>
        <span className="ml-2 text-[9px] font-bold tracking-widest uppercase text-white/55 bg-white/[0.08] border border-white/[0.14] px-1.5 py-0.5 rounded-full">Beta</span>
        {decks.length > 0 && (
          <span className="ml-2 text-[11px] text-white/28">{decks.length}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onManual}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.07] text-white/50 hover:text-white/75 text-[11.5px] font-medium transition-colors">
            <LayoutGrid size={11} /> From template
          </button>
          <button onClick={onNew}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-white/80 text-[11.5px] font-semibold transition-colors">
            <Sparkles size={11} /> Generate
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size={22} />
        </div>
      )}

      {!loading && decks.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] grid place-items-center mb-4">
            <Presentation size={26} className="text-white/20" />
          </div>
          <p className="text-[14px] font-semibold text-white/50 mb-1.5">No presentations yet</p>
          <p className="text-[12px] text-white/25 mb-6 max-w-[220px] leading-relaxed">
            Generate a deck with AI or start from a template.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onManual}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.08] text-white/55 text-[12px] font-medium transition-colors">
              <LayoutGrid size={13} /> From template
            </button>
            <button onClick={onNew}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.09] hover:bg-white/[0.15] border border-white/[0.11] text-white/75 text-[12px] font-semibold transition-colors">
              <Sparkles size={13} /> Generate with AI
            </button>
          </div>
        </div>
      )}

      {!loading && decks.length > 0 && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-6">
            {decks.map(d => (
              <GalleryCard key={d.id} deck={d} onOpen={onOpen} onDelete={onDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL CREATE FORM  (start from a template, no AI)
// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'blank',      label: 'Blank',       desc: 'Empty deck — start from scratch',          icon: '□' },
  { id: 'pitch',      label: 'Pitch Deck',  desc: 'Problem, solution, market, traction',      icon: '◈' },
  { id: 'lesson',     label: 'Lesson',      desc: 'Objective, vocabulary, activity, quiz',    icon: '◇' },
  { id: 'bookreport', label: 'Book Report', desc: 'Summary, themes, characters, opinion',     icon: '◉' },
  { id: 'project',    label: 'Project',     desc: 'Overview, timeline, roles, next steps',    icon: '◑' },
  { id: 'class',      label: 'Class Pres.', desc: 'Title, agenda, content, takeaways',        icon: '◐' },
];

function ManualCreateForm({ onBack, onCreate }) {
  const [title,    setTitle]    = useState('');
  const [template, setTemplate] = useState('blank');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleCreate() {
    if (!title.trim() || loading) return;
    setLoading(true); setError('');
    try {
      const d = await createSlideshow({ title: title.trim(), template });
      if (d.slideshow) {
        onCreate(d.slideshow);
      } else {
        setError(d.error || 'Failed to create slideshow');
        setLoading(false);
      }
    } catch (e) {
      setError(e.message || 'Failed to create slideshow');
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-5 h-11 border-b border-white/[0.07] bg-[#242424] shrink-0">
        <button onClick={onBack} disabled={loading} className="flex items-center gap-1.5 text-[12px] text-white/45 hover:text-white/70 transition-colors disabled:opacity-30">
          <ArrowLeft size={13} /> Back
        </button>
        <h1 className="text-[13px] font-semibold text-white/75 tracking-tight mx-auto">From Template</h1>
        <div className="w-16" />
      </div>
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-white/[0.07] border border-white/[0.09] grid place-items-center">
          <LayoutGrid size={16} className="text-white/55" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-white/90">Start from Template</h2>
          <p className="text-xs text-white/35">Pick a structure, add your title, then edit freely</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-1.5">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="My Presentation"
            disabled={loading}
            autoFocus
            className="w-full px-3.5 py-2.5 rounded-xl border border-white/[0.09] bg-white/[0.04] text-white/88 placeholder:text-white/22 text-sm outline-none focus:border-white/[0.20] transition-colors disabled:opacity-40"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2">Template</label>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => setTemplate(tmpl.id)}
                disabled={loading}
                className={`text-left px-3.5 py-3 rounded-xl border transition-all disabled:opacity-40 ${
                  template === tmpl.id
                    ? 'bg-white/[0.10] border-white/[0.25] text-white/90'
                    : 'bg-white/[0.03] border-white/[0.07] text-white/55 hover:bg-white/[0.07] hover:border-white/[0.14]'
                }`}
              >
                <div className="text-[15px] mb-1 leading-none">{tmpl.icon}</div>
                <div className="text-xs font-semibold mb-0.5">{tmpl.label}</div>
                <div className="text-[10px] text-white/30 leading-snug">{tmpl.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={!title.trim() || loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.14] text-white/85 font-semibold text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          {loading ? 'Creating…' : 'Create Slideshow'}
        </button>
      </div>
      </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE FORM
// ─────────────────────────────────────────────────────────────────────────────
const GEN_TEMPLATES = [
  { id: 'none',       label: 'Auto',        desc: 'AI picks the best structure' },
  { id: 'pitch',      label: 'Pitch Deck',  desc: 'Problem → solution → market → ask' },
  { id: 'lesson',     label: 'Lesson',      desc: 'Objective → concept → activity → quiz' },
  { id: 'bookreport', label: 'Book Report', desc: 'Summary → themes → characters → verdict' },
  { id: 'project',    label: 'Project',     desc: 'Overview → timeline → roles → next steps' },
  { id: 'essay',      label: 'Essay',       desc: 'Thesis → arguments → evidence → conclusion' },
  { id: 'research',   label: 'Research',    desc: 'Question → method → findings → discussion' },
  { id: 'how-to',     label: 'How-To',      desc: 'Goal → prerequisites → steps → recap' },
];

// Theme swatches for the generation screen picker — bg, title color, accent, muted
const GEN_THEMES = [
  { id: 'midnight', name: 'Midnight',  bg: '#0a0a16', title: '#ffffff', accent: '#a78bfa', muted: '#6b7280' },
  { id: 'slate',    name: 'Slate',     bg: '#0f172a', title: '#f8fafc', accent: '#38bdf8', muted: '#64748b' },
  { id: 'ocean',    name: 'Ocean',     bg: '#02132f', title: '#f0f9ff', accent: '#22d3ee', muted: '#38bdf8' },
  { id: 'forest',   name: 'Forest',    bg: '#06140e', title: '#f0fdf4', accent: '#4ade80', muted: '#4ade80' },
  { id: 'plum',     name: 'Plum',      bg: '#1a0b1d', title: '#fdf4ff', accent: '#f0abfc', muted: '#c084fc' },
  { id: 'coral',    name: 'Coral',     bg: '#1a0808', title: '#fff7ed', accent: '#fb7185', muted: '#fb923c' },
  { id: 'ink',      name: 'Ink',       bg: '#ffffff', title: '#0a0a0a', accent: '#2563eb', muted: '#52525b' },
  { id: 'newsprint',name: 'Newsprint', bg: '#fbf7f0', title: '#1a1a1a', accent: '#9b1c1c', muted: '#5b5443' },
  { id: 'mono',     name: 'Mono',      bg: '#f5f5f4', title: '#1c1917', accent: '#1c1917', muted: '#57534e' },
  { id: 'sun',      name: 'Sun',       bg: '#fef9e7', title: '#1f1300', accent: '#d97706', muted: '#78350f' },
  { id: 'sage',     name: 'Sage',      bg: '#f3f7f2', title: '#0e1f0e', accent: '#15803d', muted: '#3f5b3d' },
  { id: 'rose',     name: 'Rose',      bg: '#fdf2f8', title: '#3a0e2c', accent: '#be185d', muted: '#831843' },
];

function ThemeSwatch({ theme, selected, onClick, disabled }) {
  const isLight = ['ink','newsprint','mono','sun','sage','rose'].includes(theme.id);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-xl overflow-hidden transition-all shrink-0 disabled:opacity-40 ${selected ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#1a1a1a]' : 'hover:scale-[1.03]'}`}
      style={{ width: 88, height: 60, background: theme.bg }}
      title={theme.name}
    >
      {/* fake slide lines */}
      <div style={{ position: 'absolute', left: 8, top: 10, right: 8 }}>
        <div style={{ height: 6, width: '65%', borderRadius: 3, background: theme.title, opacity: 0.9 }} />
        <div style={{ height: 3, width: '45%', borderRadius: 2, marginTop: 4, background: theme.muted, opacity: 0.55 }} />
        <div style={{ height: 2, width: '80%', borderRadius: 2, marginTop: 8, background: theme.muted, opacity: 0.3 }} />
        <div style={{ height: 2, width: '65%', borderRadius: 2, marginTop: 3, background: theme.muted, opacity: 0.3 }} />
      </div>
      {/* accent bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: theme.accent }} />
      {/* selected checkmark */}
      {selected && (
        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white flex items-center justify-center">
          <Check size={10} className="text-black" />
        </div>
      )}
    </button>
  );
}

function GenerateForm({ onBack, onCreate }) {
  const [mode,       setMode]      = useState('flash'); // 'flash' | 'advanced'
  const [topic,      setTopic]     = useState('');
  const [slideCount, setCount]     = useState(8);
  const [difficulty, setDiff]      = useState('intermediate');
  const [template,   setTemplate]  = useState('none');
  const [palette]   = useState('');   // always let AI choose
  const [customInfo, setCustomInfo] = useState('');
  const [sourceFiles, setSourceFiles] = useState([]); // [{ name, content }]
  const [loading,    setLoading]   = useState(false);
  const [progress,   setProgress]  = useState(0);
  const [statusMsg,  setStatusMsg] = useState('');
  const [error,      setError]     = useState('');
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver]   = useState(false);

  function readFileAsText(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = e => resolve({ name: file.name, content: e.target.result });
      reader.onerror = () => resolve({ name: file.name, content: '' });
      reader.readAsText(file);
    });
  }

  async function handleFiles(files) {
    const supported = Array.from(files).filter(f =>
      f.type === 'text/plain' || f.name.endsWith('.md') || f.name.endsWith('.txt') || f.name.endsWith('.csv')
    );
    const read = await Promise.all(supported.map(readFileAsText));
    setSourceFiles(prev => [...prev, ...read].slice(0, 5));
  }

  async function handleGenerate() {
    if (!topic.trim() || loading) return;
    setLoading(true); setError(''); setProgress(0); setStatusMsg('Starting…');
    const combinedSource = sourceFiles.map(f => `[${f.name}]\n${f.content}`).join('\n\n---\n\n').trim();
    try {
      await generateSlideshow(
        {
          topic: topic.trim(), slideCount, difficulty,
          template: template !== 'none' ? template : undefined,
          customInfo: customInfo.trim() || undefined,
          sourceText: combinedSource || undefined,
          palette: palette || undefined,
        },
        {
          onProgress: ({ phase, pct }) => { setStatusMsg(phase); setProgress(pct); },
          onDone: (slideshow) => { setProgress(100); setStatusMsg('Done!'); setTimeout(() => onCreate(slideshow), 350); },
          onError: (msg) => { setError(msg || 'Generation failed'); setLoading(false); },
        }
      );
    } catch (e) {
      setError(e.message || 'Generation failed'); setLoading(false);
    }
  }

  const COUNTS = [5, 6, 8, 10, 12, 15];
  const DIFFS  = [['beginner','Beginner','Intro-level, simple vocabulary'], ['intermediate','Intermediate','Balanced depth and detail'], ['advanced','Advanced','Expert-level, dense content']];

  return (
    <div className="h-full flex flex-col bg-[#161616]">
      {/* Header */}
      <div className="flex items-center px-5 h-12 border-b border-white/[0.07] bg-[#1e1e1e] shrink-0">
        <button onClick={onBack} disabled={loading} className="flex items-center gap-1.5 text-[12px] text-white/45 hover:text-white/70 transition-colors disabled:opacity-30">
          <ArrowLeft size={13} /> Back
        </button>
        {/* Mode tabs */}
        <div className="mx-auto flex items-center gap-0.5 bg-white/[0.05] rounded-lg p-0.5">
          <button
            onClick={() => setMode('flash')}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-semibold transition-all disabled:opacity-40 ${mode === 'flash' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'text-white/35 hover:text-white/60'}`}
          >
            <Zap size={11} /> Flash
          </button>
          <button
            onClick={() => setMode('advanced')}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-semibold transition-all disabled:opacity-40 ${mode === 'advanced' ? 'bg-white/[0.10] text-white/85 border border-white/[0.14]' : 'text-white/35 hover:text-white/60'}`}
          >
            <SlidersHorizontal size={11} /> Advanced
          </button>
        </div>
        <div className="w-16" />
      </div>

      {/* ── FLASH MODE ─────────────────────────────────────────────────────── */}
      {mode === 'flash' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-md">
            <div className="text-center mb-7">
              <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 grid place-items-center mx-auto mb-4">
                <Zap size={24} className="text-yellow-400" />
              </div>
              <p className="text-[13px] text-white/45 leading-relaxed">Type a topic — AI picks the best structure,<br />length, and style automatically.</p>
            </div>
            <input
              value={topic} onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="e.g. The French Revolution, Photosynthesis, Q3 Sales…"
              disabled={loading} autoFocus
              className="w-full px-4 py-3.5 rounded-xl border border-white/[0.12] bg-white/[0.06] text-white/90 placeholder:text-white/22 text-[15px] outline-none focus:border-yellow-500/40 focus:bg-white/[0.08] transition-all disabled:opacity-40"
            />
            <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-white/22">
              <span>8 slides</span><span>·</span><span>Intermediate depth</span><span>·</span><span>Auto structure</span>
            </div>
          </div>
        </div>
      )}

      {/* ── ADVANCED MODE ──────────────────────────────────────────────────── */}
      {mode === 'advanced' && (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 pt-7 pb-4 space-y-7">

          {/* 1. Topic */}
          <div>
            <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2">Topic</label>
            <input
              value={topic} onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              placeholder="e.g. The French Revolution, Photosynthesis, Q3 Sales Review…"
              disabled={loading} autoFocus
              className="w-full px-4 py-3 rounded-xl border border-white/[0.10] bg-white/[0.05] text-white/90 placeholder:text-white/20 text-[15px] outline-none focus:border-white/[0.25] focus:bg-white/[0.07] transition-all disabled:opacity-40"
            />
          </div>

          {/* 2. Structure */}
          <div>
            <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2">Structure</label>
            <div className="grid grid-cols-2 gap-2">
              {GEN_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplate(t.id)} disabled={loading}
                  className={`text-left px-3.5 py-2.5 rounded-xl border transition-all disabled:opacity-40 ${template === t.id ? 'bg-white/[0.10] border-white/[0.22] text-white/92' : 'bg-white/[0.03] border-white/[0.07] text-white/50 hover:bg-white/[0.06] hover:border-white/[0.14]'}`}>
                  <p className="text-[12px] font-semibold leading-none mb-1">{t.label}</p>
                  <p className="text-[10px] text-white/32 leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Slides + Detail Level side by side */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2">Slides</label>
              <div className="flex flex-wrap gap-2">
                {COUNTS.map(n => (
                  <button key={n} onClick={() => setCount(n)} disabled={loading}
                    className={`w-10 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${slideCount === n ? 'bg-white/[0.13] border-white/[0.24] text-white/92' : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.07]'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2">Detail Level</label>
              <div className="flex flex-col gap-1.5">
                {DIFFS.map(([v, l, desc]) => (
                  <button key={v} onClick={() => setDiff(v)} disabled={loading}
                    className={`text-left px-3 py-2 rounded-lg border transition-colors disabled:opacity-40 ${difficulty === v ? 'bg-white/[0.10] border-white/[0.22] text-white/92' : 'bg-white/[0.03] border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.06]'}`}>
                    <p className="text-[11px] font-semibold leading-none">{l}</p>
                    <p className="text-[10px] text-white/28 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Source material */}
          <div>
            <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2">
              Source Material <span className="normal-case font-normal tracking-normal text-white/20">— optional · .txt .md .csv</span>
            </label>
            <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.csv,text/plain"
              className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              className={`rounded-xl border border-dashed transition-colors cursor-pointer px-4 py-4 text-center ${dragOver ? 'border-white/40 bg-white/[0.07]' : 'border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.20]'}`}
            >
              <p className="text-[12px] text-white/35">Drop files here or <span className="text-white/55 underline underline-offset-2">browse</span></p>
              <p className="text-[10px] text-white/20 mt-0.5">AI will use your documents as the primary source of facts and structure</p>
            </div>
            {sourceFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sourceFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.07] border border-white/[0.10] text-[11px] text-white/65">
                    <FileText size={10} className="text-white/35 shrink-0" />
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <button onClick={e => { e.stopPropagation(); setSourceFiles(prev => prev.filter((_, j) => j !== i)); }}
                      className="text-white/30 hover:text-rose-400 transition-colors ml-0.5">
                      <XIcon size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6. Additional context */}
          <div>
            <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2">
              Notes <span className="normal-case font-normal tracking-normal text-white/20">— optional</span>
            </label>
            <textarea
              value={customInfo} onChange={e => setCustomInfo(e.target.value)}
              placeholder="Audience, key points to cover, things to avoid, tone, specific examples…"
              disabled={loading} rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl border border-white/[0.09] bg-white/[0.04] text-white/88 placeholder:text-white/18 text-sm outline-none focus:border-white/[0.20] transition-colors disabled:opacity-40 resize-none leading-relaxed"
            />
          </div>

        </div>
      </div>
      )} {/* end advanced mode */}

      {/* Sticky CTA footer */}
      <div className="shrink-0 border-t border-white/[0.07] bg-[#1a1a1a] px-6 py-4">
        {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}
        <button onClick={handleGenerate} disabled={loading || !topic.trim()}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-35 border ${
            mode === 'flash'
              ? 'bg-yellow-500/15 hover:bg-yellow-500/25 border-yellow-500/30 text-yellow-200 hover:text-yellow-100'
              : 'bg-white/[0.12] hover:bg-white/[0.18] border-white/[0.20] text-white/90 hover:text-white'
          }`}
          style={{ boxShadow: loading || !topic.trim() ? 'none' : mode === 'flash' ? '0 2px 16px rgba(234,179,8,0.12)' : '0 2px 12px rgba(255,255,255,0.06)' }}>
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
            : mode === 'flash'
              ? <><Zap size={15} /> Flash Generate</>
              : <><Sparkles size={15} /> Generate Presentation</>
          }
        </button>

        {!loading && !topic.trim() && (
          <p className="text-center text-[10px] text-white/20 mt-2">Enter a topic above to get started</p>
        )}

        {loading && (
          <div className="mt-3 space-y-1.5">
            <div className="w-full rounded-full h-[3px] bg-white/[0.07] overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ease-out ${mode === 'flash' ? 'bg-yellow-400/80' : 'bg-white/80'}`} style={{ width: `${progress}%` }} />
            </div>
            <p className="text-center text-[10px] text-white/30">{statusMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
