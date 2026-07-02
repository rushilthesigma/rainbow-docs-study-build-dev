// Export a note to a PDF that renders its markdown, instead of dumping the raw
// source. Notes are stored as GFM markdown (TipTap + tiptap-markdown): headings,
// bold/italic/strike, ordered/unordered/task lists, inline code, code blocks,
// blockquotes, tables, links and LaTeX math ($...$). We parse that into an mdast
// tree with the SAME extensions the on-screen renderer uses (remark-gfm +
// remark-math), then lay it out as real, selectable text with jsPDF — crisp and
// lightweight, no rasterization.
//
// Coordinate convention: `cursor.y` is the TOP of the next line to draw. jsPDF
// places text on a baseline, so every text call draws at `y + size`. Boxes
// (code, tables, quote bars) draw from `y` downward, which keeps the geometry
// simple.

const PAGE_MARGIN = 48;
const BODY_SIZE = 11;
const LINE_GAP = 4.5; // extra leading added to the font size for body text

const COL_TITLE = [22, 22, 26];
const COL_HEAD = [28, 28, 34];
const COL_BODY = [45, 45, 50];
const COL_MUTED = [122, 122, 130];
const COL_LINK = [37, 99, 235];
const COL_CODE = [72, 72, 92];
const COL_RULE = [223, 223, 228];
const COL_CODE_BG = [244, 244, 247];
const COL_TABLE_HEAD_BG = [239, 239, 243];
const COL_TABLE_BORDER = [219, 219, 225];
const COL_QUOTE_BAR = [200, 200, 208];

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function safeFilename(value) {
  const name = cleanText(value)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return `${name || 'Untitled note'}.pdf`;
}

function loadJsPdf(mod) {
  return mod.jsPDF || mod.default?.jsPDF || mod.default;
}

// Plain-text of a node's subtree (used for table cells).
function nodeText(node) {
  if (node == null) return '';
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('');
  return '';
}

// Parse markdown with the same GFM + math flavor as the note editor. Extensions
// are imported lazily so they stay out of the main app bundle.
async function parseMarkdown(md) {
  const [fromMd, mmGfm, mdGfm, mmMath, mdMath] = await Promise.all([
    import('mdast-util-from-markdown'),
    import('micromark-extension-gfm'),
    import('mdast-util-gfm'),
    import('micromark-extension-math'),
    import('mdast-util-math'),
  ]);
  return fromMd.fromMarkdown(md, {
    extensions: [mmGfm.gfm(), mmMath.math()],
    mdastExtensions: [mdGfm.gfmFromMarkdown(), mdMath.mathFromMarkdown()],
  });
}

export async function exportNoteAsPdf(note) {
  const jspdfMod = await import('jspdf');
  const jsPDF = loadJsPdf(jspdfMod);
  if (typeof jsPDF !== 'function') throw new Error('jsPDF failed to load');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentLeft = PAGE_MARGIN;
  const contentRight = pageWidth - PAGE_MARGIN;
  const cursor = { y: PAGE_MARGIN };

  pdf.setLineWidth(0.5);

  // --- low-level helpers ---------------------------------------------------

  function ensure(height) {
    if (cursor.y + height <= pageHeight - PAGE_MARGIN) return;
    pdf.addPage();
    cursor.y = PAGE_MARGIN;
  }

  function setFontFor(style, size) {
    if (style.code || style.math) {
      pdf.setFont('courier', 'normal');
    } else {
      const b = !!style.bold;
      const i = !!style.italic;
      pdf.setFont('helvetica', b && i ? 'bolditalic' : b ? 'bold' : i ? 'italic' : 'normal');
    }
    pdf.setFontSize(size);
  }

  function setColorFor(style, baseColor) {
    if (style.link) pdf.setTextColor(...COL_LINK);
    else if (style.code) pdf.setTextColor(...COL_CODE);
    else pdf.setTextColor(...(baseColor || COL_BODY));
  }

  // --- inline runs ---------------------------------------------------------

  // Flatten phrasing content into styled runs. `style` accumulates bold /
  // italic / code / link / strike as we descend.
  function collectRuns(node, style, runs) {
    switch (node.type) {
      case 'text':
        runs.push({ text: node.value, ...style });
        break;
      case 'strong':
        (node.children || []).forEach(c => collectRuns(c, { ...style, bold: true }, runs));
        break;
      case 'emphasis':
        (node.children || []).forEach(c => collectRuns(c, { ...style, italic: true }, runs));
        break;
      case 'delete':
        (node.children || []).forEach(c => collectRuns(c, { ...style, strike: true }, runs));
        break;
      case 'inlineCode':
        runs.push({ text: node.value, ...style, code: true });
        break;
      case 'link':
        (node.children || []).forEach(c => collectRuns(c, { ...style, link: node.url }, runs));
        break;
      case 'inlineMath':
        runs.push({ text: node.value, ...style, math: true, italic: true });
        break;
      case 'image':
        runs.push({ text: node.alt ? `[${node.alt}]` : '[image]', ...style, italic: true });
        break;
      case 'break':
        runs.push({ hardbreak: true, ...style });
        break;
      case 'html': {
        const raw = String(node.value || '');
        if (/^<br\s*\/?>$/i.test(raw.trim())) { runs.push({ hardbreak: true, ...style }); break; }
        const stripped = raw.replace(/<[^>]*>/g, '');
        if (stripped) runs.push({ text: stripped, ...style });
        break;
      }
      default:
        if (Array.isArray(node.children)) node.children.forEach(c => collectRuns(c, style, runs));
        else if (typeof node.value === 'string') runs.push({ text: node.value, ...style });
    }
  }

  // Lay styled runs out with word wrapping, switching font/color per run.
  function renderRuns(runs, { size = BODY_SIZE, left, right, baseColor = COL_BODY }) {
    const lineHeight = size + LINE_GAP;

    // Build a flat token stream: words, spaces, and hard breaks.
    const tokens = [];
    for (const r of runs) {
      if (r.hardbreak) { tokens.push({ br: true }); continue; }
      for (const part of String(r.text || '').split(/(\s+)/)) {
        if (part === '') continue;
        if (/^\s+$/.test(part)) tokens.push({ space: true, style: r });
        else tokens.push({ word: part, style: r });
      }
    }
    if (tokens.length === 0) return;

    ensure(lineHeight);
    let x = left;
    let lineHasContent = false;

    const newline = () => { cursor.y += lineHeight; ensure(lineHeight); x = left; lineHasContent = false; };

    const drawWord = (word, style) => {
      setFontFor(style, size);
      const w = pdf.getTextWidth(word);
      if (lineHasContent && x + w > right) newline();
      setFontFor(style, size);
      setColorFor(style, baseColor);
      const by = cursor.y + size;
      pdf.text(word, x, by);
      if (style.link) pdf.link(x, cursor.y, w, size, { url: style.link });
      if (style.strike) {
        pdf.setDrawColor(...(style.code ? COL_CODE : baseColor));
        pdf.setLineWidth(0.6);
        pdf.line(x, by - size * 0.3, x + w, by - size * 0.3);
        pdf.setLineWidth(0.5);
      }
      x += w;
      lineHasContent = true;
    };

    for (const t of tokens) {
      if (t.br) { newline(); continue; }
      if (t.space) {
        if (lineHasContent) { setFontFor(t.style, size); x += pdf.getTextWidth(' '); }
        continue;
      }
      setFontFor(t.style, size);
      // Break a word that can't fit on a line by itself (long URLs, etc.).
      if (pdf.getTextWidth(t.word) > right - left) {
        for (const piece of pdf.splitTextToSize(t.word, right - left)) drawWord(piece, t.style);
      } else {
        drawWord(t.word, t.style);
      }
    }
    cursor.y += lineHeight; // drop below the final line
  }

  function renderPhrasing(children, env, { size = BODY_SIZE, baseColor = COL_BODY, force = {} } = {}) {
    const runs = [];
    (children || []).forEach(c => collectRuns(c, { ...force }, runs));
    renderRuns(runs, { size, left: env.left, right: contentRight, baseColor });
  }

  // --- block renderers -----------------------------------------------------

  function renderHeading(node, env) {
    const size = node.depth <= 1 ? 17 : node.depth === 2 ? 14 : 12;
    cursor.y += node.depth <= 1 ? 12 : node.depth === 2 ? 9 : 7;
    renderPhrasing(node.children, env, { size, baseColor: COL_HEAD, force: { bold: true } });
    cursor.y += 3;
  }

  function renderParagraph(node, env) {
    renderPhrasing(node.children, env, { baseColor: env.color || COL_BODY });
    cursor.y += 4;
  }

  function drawMarker(node, x, ordered, index) {
    const size = BODY_SIZE;
    if (node.checked === true || node.checked === false) {
      const s = size * 0.82;
      const top = cursor.y + size * 0.18;
      pdf.setDrawColor(...COL_MUTED);
      pdf.setLineWidth(0.7);
      pdf.rect(x, top, s, s);
      if (node.checked) {
        pdf.setDrawColor(...COL_BODY);
        pdf.setLineWidth(1.1);
        pdf.line(x + s * 0.2, top + s * 0.52, x + s * 0.42, top + s * 0.74);
        pdf.line(x + s * 0.42, top + s * 0.74, x + s * 0.8, top + s * 0.26);
      }
      pdf.setLineWidth(0.5);
    } else if (ordered) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(size);
      pdf.setTextColor(...COL_BODY);
      pdf.text(`${index}.`, x, cursor.y + size);
    } else {
      pdf.setFillColor(...COL_BODY);
      pdf.circle(x + 2.4, cursor.y + size * 0.66, 1.4, 'F');
    }
  }

  function renderList(node, env) {
    const INDENT = 17;
    const ordered = !!node.ordered;
    let index = Number.isFinite(node.start) ? node.start : 1;
    for (const item of node.children || []) {
      if (item.type !== 'listItem') continue;
      ensure(BODY_SIZE + LINE_GAP);
      drawMarker(item, env.left, ordered, index);
      index += 1;
      renderBlocks(item.children || [], { ...env, left: env.left + INDENT });
      cursor.y += 2;
    }
  }

  function renderBlockquote(node, env) {
    const startPage = pdf.getNumberOfPages();
    cursor.y += 2;
    const barTop = cursor.y;
    renderBlocks(node.children || [], { ...env, left: env.left + 14, color: COL_MUTED });
    if (pdf.getNumberOfPages() === startPage) {
      pdf.setDrawColor(...COL_QUOTE_BAR);
      pdf.setLineWidth(2);
      pdf.line(env.left + 3, barTop, env.left + 3, cursor.y - 2);
      pdf.setLineWidth(0.5);
    }
    cursor.y += 4;
  }

  function renderCodeBlock(node, env) {
    const size = 9.5;
    const lh = 13;
    const padX = 8;
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(size);
    const wrapped = [];
    for (const line of String(node.value || '').replace(/\t/g, '  ').split('\n')) {
      const parts = pdf.splitTextToSize(line.length ? line : ' ', contentRight - env.left - padX * 2);
      wrapped.push(...parts);
    }
    cursor.y += 4;
    for (const line of wrapped) {
      ensure(lh);
      pdf.setFillColor(...COL_CODE_BG);
      pdf.rect(env.left, cursor.y, contentRight - env.left, lh, 'F');
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(size);
      pdf.setTextColor(...COL_CODE);
      pdf.text(line, env.left + padX, cursor.y + size + (lh - size) / 2 - 1.5);
      cursor.y += lh;
    }
    cursor.y += 6;
  }

  function renderMathBlock(node, env) {
    const size = 10.5;
    const lh = 15;
    const padX = 6;
    cursor.y += 4;
    for (const line of String(node.value || '').split('\n')) {
      ensure(lh);
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(size);
      pdf.setTextColor(...COL_MUTED);
      pdf.text(line || ' ', env.left + padX, cursor.y + size + (lh - size) / 2 - 1.5);
      cursor.y += lh;
    }
    cursor.y += 6;
  }

  function renderThematicBreak(env) {
    cursor.y += 7;
    ensure(4);
    pdf.setDrawColor(...COL_RULE);
    pdf.line(env.left, cursor.y, contentRight, cursor.y);
    cursor.y += 9;
  }

  function renderHtmlBlock(node, env) {
    const text = String(node.value || '').replace(/<[^>]*>/g, '').trim();
    if (text) renderRuns([{ text }], { left: env.left, right: contentRight, baseColor: env.color || COL_BODY });
  }

  function renderTable(node, env) {
    const rows = (node.children || []).filter(r => r.type === 'tableRow');
    if (!rows.length) return;
    const cols = Math.max(...rows.map(r => (r.children || []).length));
    if (!cols) return;
    const tableWidth = contentRight - env.left;
    const colW = tableWidth / cols;
    const size = 9.5;
    const lh = 12.5;
    const padX = 5;
    const padY = 4;
    const aligns = node.align || [];

    cursor.y += 4;
    rows.forEach((row, ri) => {
      const isHeader = ri === 0;
      pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
      pdf.setFontSize(size);
      const cells = row.children || [];
      const wrapped = [];
      let maxLines = 1;
      for (let c = 0; c < cols; c++) {
        const text = cells[c] ? nodeText(cells[c]).replace(/\n/g, ' ').trim() : '';
        const lines = pdf.splitTextToSize(text || ' ', colW - padX * 2);
        wrapped.push(lines);
        maxLines = Math.max(maxLines, lines.length);
      }
      const rowH = maxLines * lh + padY * 2;
      ensure(rowH);
      const top = cursor.y;
      if (isHeader) {
        pdf.setFillColor(...COL_TABLE_HEAD_BG);
        pdf.rect(env.left, top, tableWidth, rowH, 'F');
      }
      pdf.setDrawColor(...COL_TABLE_BORDER);
      for (let c = 0; c < cols; c++) {
        const cx = env.left + c * colW;
        pdf.rect(cx, top, colW, rowH);
        pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
        pdf.setFontSize(size);
        pdf.setTextColor(...(isHeader ? COL_HEAD : COL_BODY));
        const align = aligns[c] || 'left';
        wrapped[c].forEach((line, li) => {
          const by = top + padY + size + li * lh - 1;
          if (align === 'center') pdf.text(line, cx + colW / 2, by, { align: 'center' });
          else if (align === 'right') pdf.text(line, cx + colW - padX, by, { align: 'right' });
          else pdf.text(line, cx + padX, by);
        });
      }
      cursor.y = top + rowH;
    });
    cursor.y += 6;
  }

  function renderBlocks(nodes, env) {
    for (const node of nodes || []) {
      switch (node.type) {
        case 'heading': renderHeading(node, env); break;
        case 'paragraph': renderParagraph(node, env); break;
        case 'list': renderList(node, env); break;
        case 'blockquote': renderBlockquote(node, env); break;
        case 'code': renderCodeBlock(node, env); break;
        case 'math': renderMathBlock(node, env); break;
        case 'thematicBreak': renderThematicBreak(env); break;
        case 'table': renderTable(node, env); break;
        case 'html': renderHtmlBlock(node, env); break;
        case 'definition':
        case 'footnoteDefinition':
          break;
        default:
          if (Array.isArray(node.children)) renderBlocks(node.children, env);
          else if (typeof node.value === 'string') renderRuns([{ text: node.value }], { left: env.left, right: contentRight });
      }
    }
  }

  async function renderMarkdown(md, env) {
    const text = cleanText(md);
    if (!text) {
      renderRuns([{ text: 'No content yet.', italic: true }], { left: env.left, right: contentRight, baseColor: COL_MUTED });
      return;
    }
    let tree = null;
    try {
      tree = await parseMarkdown(text);
    } catch {
      // Parsing failed — fall back to rendering the raw text as paragraphs.
      for (const para of text.split(/\n{2,}/)) {
        renderRuns([{ text: para.replace(/\n/g, ' ') }], { left: env.left, right: contentRight });
        cursor.y += 4;
      }
      return;
    }
    renderBlocks(tree.children || [], env);
  }

  function sectionLabel(text, env) {
    cursor.y += 10;
    ensure(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...COL_MUTED);
    pdf.text(String(text || '').toUpperCase(), env.left, cursor.y + 9);
    cursor.y += 16;
  }

  // --- document assembly ---------------------------------------------------

  const env = { left: contentLeft };
  const title = cleanText(note?.title) || 'Untitled note';
  const updatedAt = note?.updatedAt || note?.createdAt;
  const subtitle = [
    note?.type === 'cornell' ? 'Cornell note' : 'Note',
    updatedAt ? new Date(updatedAt).toLocaleDateString() : '',
  ].filter(Boolean).join(' · ');

  pdf.setProperties({ title, subject: 'Covalent AI note' });

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(...COL_TITLE);
  for (const line of pdf.splitTextToSize(title, contentRight - contentLeft)) {
    ensure(28);
    pdf.text(line, contentLeft, cursor.y + 22);
    cursor.y += 28;
  }

  // Subtitle
  if (subtitle) {
    cursor.y += 2;
    ensure(16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...COL_MUTED);
    pdf.text(subtitle, contentLeft, cursor.y + 9);
    cursor.y += 14;
  }

  // Divider
  cursor.y += 4;
  ensure(4);
  pdf.setDrawColor(...COL_RULE);
  pdf.line(contentLeft, cursor.y, contentRight, cursor.y);
  cursor.y += 12;

  if (note?.type === 'cornell') {
    const cues = Array.isArray(note.cues) && note.cues.length > 0
      ? note.cues.map(cue => `- ${cue}`).join('\n')
      : '';
    sectionLabel('Cues', env);
    await renderMarkdown(cues, env);
    sectionLabel('Notes', env);
    await renderMarkdown(note.mainNotes, env);
    sectionLabel('Summary', env);
    await renderMarkdown(note.summary, env);
  } else {
    await renderMarkdown(note?.mainNotes, env);
  }

  pdf.save(safeFilename(title));
}
