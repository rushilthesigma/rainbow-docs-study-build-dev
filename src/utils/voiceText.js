// Voice helpers — turn assistant markdown into clean, speakable prose and
// chop a growing stream buffer into sentences so text-to-speech can start
// talking before the full answer has arrived.
//
// The AI replies in markdown (with code fences, LaTeX, bullet lists, links).
// Read verbatim, a TTS voice says "asterisk asterisk" and spells out URLs,
// which sounds awful. speakableText() strips all of that down to the words a
// person would actually say out loud.

// A handful of LaTeX commands worth pronouncing as words instead of dropping.
const LATEX_WORDS = {
  times: ' times ', cdot: ' times ', div: ' divided by ', pm: ' plus or minus ',
  leq: ' less than or equal to ', geq: ' greater than or equal to ',
  neq: ' not equal to ', approx: ' approximately ', infty: ' infinity ',
  rightarrow: ' goes to ', to: ' to ', sum: ' the sum of ', int: ' the integral of ',
  sqrt: ' square root of ', pi: ' pi ', theta: ' theta ', alpha: ' alpha ',
  beta: ' beta ', gamma: ' gamma ', delta: ' delta ', lambda: ' lambda ',
  mu: ' mu ', sigma: ' sigma ', omega: ' omega ',
};

export function speakableText(md = '') {
  let t = String(md || '');

  // Fenced code blocks: reading code aloud is noise, so summarize them away.
  t = t.replace(/```[\s\S]*?```/g, ' (code shown on screen) ');
  // Inline code → keep the inner text.
  t = t.replace(/`([^`]+)`/g, '$1');

  // Images ![alt](url) → alt text only.
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Links [text](url) → spoken label only, drop the URL.
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Bare URLs → drop entirely.
  t = t.replace(/\bhttps?:\/\/\S+/g, '');

  // Block LaTeX $$…$$ / \[…\] and inline $…$ / \(…\): strip the delimiters,
  // keep the math text for the command pass below.
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ');
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, ' $1 ');
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, ' $1 ');
  t = t.replace(/\$([^$\n]+)\$/g, ' $1 ');
  // \frac{a}{b} → "a over b".
  t = t.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1 over $2 ');
  // Named LaTeX commands → words (or dropped if unknown).
  t = t.replace(/\\([a-zA-Z]+)/g, (_, name) => LATEX_WORDS[name] ?? ' ');
  // Leftover math braces / carets / underscores.
  t = t.replace(/[{}]/g, ' ').replace(/\^/g, ' to the power ').replace(/_/g, ' ');

  // Headings, blockquote markers, list bullets, table pipes.
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  t = t.replace(/^\s{0,3}>\s?/gm, '');
  t = t.replace(/^\s*[-*+]\s+/gm, '');
  t = t.replace(/^\s*\d+[.)]\s+/gm, '');
  t = t.replace(/^\s*\|.*$/gm, (m) => m.replace(/\|/g, ' ').replace(/[-:]{2,}/g, ' '));
  // Horizontal rules.
  t = t.replace(/^\s*([-*_])\1{2,}\s*$/gm, ' ');

  // Emphasis markers (after lists so leading * bullets are already gone).
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');
  t = t.replace(/(\*|_)(.*?)\1/g, '$2');
  t = t.replace(/~~(.*?)~~/g, '$1');

  // Emoji + pictographs — they make TTS stumble or announce "smiling face".
  t = t.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,
    '',
  );

  // Collapse blank lines into sentence breaks, then squeeze whitespace.
  t = t.replace(/\n{2,}/g, '. ').replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ');
  // Tidy doubled punctuation left behind by the substitutions above.
  t = t.replace(/\s+([.,!?;:])/g, '$1').replace(/([.!?])\1{2,}/g, '$1');
  return t.trim();
}

// Pull every COMPLETE sentence out of a growing buffer, leaving the trailing
// incomplete fragment behind. A sentence ends at . ! ? (plus trailing quotes/
// brackets) followed by whitespace, OR at a newline (so list items and
// paragraph breaks flush without waiting for punctuation).
//
// Returns [sentences[], remainder]. Feed `remainder` back in next time, or
// flush it manually once the stream is done.
export function extractSentences(buffer = '') {
  const text = String(buffer || '');
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '.' || c === '!' || c === '?') {
      // Skip over trailing punctuation / closing quotes (e.g. ?!" or .)
      let j = i + 1;
      while (j < text.length && /["'”’)\]\.!?]/.test(text[j])) j++;
      // Complete only if followed by whitespace — guards against splitting
      // "3.14" or "U.S." mid-token while the rest is still streaming.
      if (j < text.length && /\s/.test(text[j])) {
        out.push(text.slice(start, j).trim());
        start = j;
        i = j - 1;
      }
    } else if (c === '\n') {
      if (i > start) out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return [out.filter(Boolean), text.slice(start)];
}
