// Three-way line merge for co-edited note text.
//
// merge3(base, ours, theirs):
//   base   — the last server-confirmed document both edits started from
//   ours   — the local unsaved document
//   theirs — the newer server document (someone else saved first)
//
// Regions only one side touched merge cleanly, so two people editing
// different sections keep both edits. A region BOTH sides changed keeps
// OURS — the same last-write-wins the feature always had, but scoped to the
// conflicting region instead of the whole document.
//
// Documents over MAX_LINES fall back to ours wholesale: the LCS table is
// O(n*m) and a pathological paste shouldn't freeze the editor over a save
// conflict.
const MAX_LINES = 2000;

// Longest-common-subsequence match map: baseIndex -> otherIndex.
function lcsMatches(a, b) {
  const n = a.length, m = b.length;
  // dp[i][j] = LCS length of a[i..] vs b[j..]
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const map = new Map();
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { map.set(i, j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
}

export function merge3(base, ours, theirs) {
  if (ours === theirs || base === theirs) return ours;
  if (base === ours) return theirs;

  const b = base.split('\n');
  const o = ours.split('\n');
  const t = theirs.split('\n');
  if (b.length > MAX_LINES || o.length > MAX_LINES || t.length > MAX_LINES) return ours;

  const mo = lcsMatches(b, o);
  const mt = lcsMatches(b, t);

  const out = [];
  // Cursor per document; advance region-by-region between lines of base that
  // survived unchanged into BOTH sides (the sync anchors).
  let bi = 0, oi = 0, ti = 0;
  const flushRegion = (bEnd, oEnd, tEnd) => {
    // JSON, not join('\n'): joining conflates an EMPTY region with a region
    // of one blank line, which mis-merges blank-line insertions/deletions.
    const bReg = JSON.stringify(b.slice(bi, bEnd));
    const oReg = JSON.stringify(o.slice(oi, oEnd));
    const tReg = JSON.stringify(t.slice(ti, tEnd));
    let take;
    if (oReg === bReg) take = t.slice(ti, tEnd);        // only they changed it
    else if (tReg === bReg || tReg === oReg) take = o.slice(oi, oEnd); // only we did (or same edit)
    else take = o.slice(oi, oEnd);                      // true conflict: ours wins
    out.push(...take);
    bi = bEnd; oi = oEnd; ti = tEnd;
  };

  for (let k = 0; k < b.length; k++) {
    if (!mo.has(k) || !mt.has(k)) continue; // base line dropped on a side — part of a changed region
    flushRegion(k, mo.get(k), mt.get(k));
    out.push(b[k]); // the anchor line itself, identical everywhere
    bi = k + 1; oi = mo.get(k) + 1; ti = mt.get(k) + 1;
  }
  flushRegion(b.length, o.length, t.length);
  return out.join('\n');
}
