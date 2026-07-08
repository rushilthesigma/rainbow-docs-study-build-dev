// Clue Lab - n-gram clue analysis for quiz bowl question sets.
// Analysis approach adapted from Quizolytics (Saptak625, MIT). Two pieces:
//   1. dedupeTexts()      - MinHash + LSH near-duplicate detection, so the
//                           same tossup appearing across packets (with tiny
//                           formatting diffs) only counts once.
//   2. analyzeQuestions() - finds the most informative unigrams, bigrams,
//                           trigrams and quadgrams across the set, ranked
//                           by PMI (pointwise mutual information) with a
//                           frequency floor, after stripping stopwords and
//                           generic quiz bowl phrasing ("this novel", "for
//                           10 points"). What survives is the actual clue
//                           vocabulary for the answer line.

// ===== MinHash / LSH near-duplicate detection =====

const SHINGLE_SIZE = 3;
const NUM_HASHES = 32;
const JACCARD_THRESHOLD = 0.75;

function shingles(s, k = SHINGLE_SIZE) {
  const out = new Set();
  for (let i = 0; i + k <= s.length; i++) out.add(s.slice(i, i + k));
  return out;
}

// FNV-1a 32-bit. Two independent base hashes per shingle, combined as
// h1 + i*h2 to simulate NUM_HASHES hash functions (standard double
// hashing - same MinHash guarantees as the original's SHA-256-per-seed,
// several orders of magnitude cheaper).
function fnv1a(str, seed) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function minhashSignature(shingleSet) {
  const sig = new Array(NUM_HASHES).fill(0xffffffff);
  for (const sh of shingleSet) {
    const h1 = fnv1a(sh, 0);
    const h2 = fnv1a(sh, 0x9e3779b9) | 1;
    for (let i = 0; i < NUM_HASHES; i++) {
      const h = (h1 + Math.imul(i, h2)) >>> 0;
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

// Returns { keptIndices, removedCount }. One band per hash row (the
// original's 32 bands x 1 row): any pair sharing a minhash value becomes
// a candidate, then exact Jaccard >= 0.75 on shingle sets confirms.
export function dedupeTexts(texts) {
  const n = texts.length;
  const shingleSets = texts.map(t => shingles(String(t || '').toLowerCase()));
  const sigs = shingleSets.map(minhashSignature);

  const candidates = new Set();
  for (let band = 0; band < NUM_HASHES; band++) {
    const bucket = new Map();
    for (let i = 0; i < n; i++) {
      const key = sigs[i][band];
      const arr = bucket.get(key);
      if (arr) arr.push(i);
      else bucket.set(key, [i]);
    }
    for (const arr of bucket.values()) {
      if (arr.length < 2) continue;
      for (let a = 0; a < arr.length; a++)
        for (let b = a + 1; b < arr.length; b++)
          candidates.add(arr[a] * n + arr[b]);
    }
  }

  const removed = new Set();
  for (const key of candidates) {
    const i = Math.floor(key / n);
    const j = key % n;
    if (removed.has(j) || removed.has(i)) continue;
    if (jaccard(shingleSets[i], shingleSets[j]) >= JACCARD_THRESHOLD) removed.add(j);
  }

  const keptIndices = [];
  for (let i = 0; i < n; i++) if (!removed.has(i)) keptIndices.push(i);
  return { keptIndices, removedCount: removed.size };
}

// ===== N-gram / PMI clue analysis =====

const STOPWORDS = new Set([
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', "you're", "you've", "you'll", "you'd", 'your', 'yours',
  'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she',
  "she's", 'her', 'hers', 'herself', 'it', "it's", 'its',
  'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'this', 'that', "that'll",
  'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does',
  'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or',
  'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for',
  'with', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'to', 'from',
  'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't',
  'can', 'will', 'just', 'don', "don't", 'should', "should've",
  'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren',
  "aren't", 'couldn', "couldn't", 'didn', "didn't", 'doesn',
  "doesn't", 'hadn', "hadn't", 'hasn', "hasn't", 'haven',
  "haven't", 'isn', "isn't", 'ma', 'mightn', "mightn't", 'mustn',
  "mustn't", 'needn', "needn't", 'shan', "shan't", 'shouldn',
  "shouldn't", 'wasn', "wasn't", 'weren', "weren't", 'won',
  "won't", 'wouldn', "wouldn't",
]);

// Generic quiz bowl phrasing - words that appear in nearly every tossup
// regardless of topic, so they carry no clue value.
const QB_KEYWORDS = new Set([
  'title', 'character', 'points', 'work', 'novel', 'poem',
  'book', 'name', 'story', 'man', 'one', 'narrator', 'novella',
  'author', 'another', 'found', 'comes', 'come', 'called',
  'poet', 'speaker', 'like', 'opens', 'includes', 'piece',
  'begins', 'use', 'used', 'features', 'played', 'within',
  'written', 'composer', 'protagonist', 'also', 'writer',
  'argues', 'argued', 'brought', 'claims', 'discussed', 'part',
  'ftp',
]);

function tokenize(texts) {
  let text = texts.join(' ');
  text = text.replace(/[.!?,:;/\-\s]+/g, ' ');
  text = text.replace(/[\\|@#“”*$&~%()"']/g, '');
  return text.toLowerCase().split(' ').filter(Boolean);
}

function badWord(w, otherWords) {
  return w.length < 3 || STOPWORDS.has(w) || QB_KEYWORDS.has(w) ||
    otherWords.some(o => o.includes(w));
}

// Top n-grams by PMI among those appearing at least minCount times.
// PMI = log2( P(ngram) / prod(P(word_i)) ), matching NLTK's collocation
// measures - it rewards words that co-occur far more than chance.
function topNgrams(words, wordFreq, n, minCount, otherWords, limit = 50) {
  const counts = new Map();
  for (let i = 0; i + n <= words.length; i++) {
    let ok = true;
    for (let j = i; j < i + n; j++) {
      if (badWord(words[j], otherWords)) { ok = false; break; }
    }
    if (!ok) continue;
    const gram = words.slice(i, i + n).join(' ');
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  const N = words.length;
  const scored = [];
  for (const [gram, c] of counts) {
    if (c < minCount) continue;
    const parts = gram.split(' ');
    let denomLog = 0;
    for (const p of parts) denomLog += Math.log2(wordFreq.get(p) / N);
    const pmi = Math.log2(c / N) - denomLog;
    scored.push([gram, pmi]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, limit).map(([gram]) => gram);
}

function topUnigrams(words, num, otherWords) {
  const freq = new Map();
  for (const w of words) {
    if (badWord(w, otherWords)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, num)
    .map(([w]) => w);
}

// The original's "automatic" mode: start with a floor of 2 occurrences
// and raise the required frequency until the result list fits maxResults.
function autoSolve(fn, numQuestions, maxResults) {
  let frequency = 2 / numQuestions;
  let results = fn(Math.max(2, Math.round(numQuestions * frequency)));
  while (results.length > maxResults) {
    frequency += 0.02;
    results = fn(Math.max(2, Math.round(numQuestions * frequency)));
  }
  return results;
}

// texts: array of question strings (already deduped).
// Returns { unigrams, bigrams, trigrams, quadgrams }, most informative
// first. Higher-order grams are computed first and their vocabulary is
// excluded from lower orders, so "orient express" doesn't also surface
// "orient" and "express" separately.
export function analyzeQuestions(texts, { maxResults = 15 } = {}) {
  const numQuestions = texts.length;
  if (!numQuestions) return { unigrams: [], bigrams: [], trigrams: [], quadgrams: [] };

  const words = tokenize(texts);
  const wordFreq = new Map();
  for (const w of words) wordFreq.set(w, (wordFreq.get(w) || 0) + 1);

  const quadgrams = autoSolve(
    min => topNgrams(words, wordFreq, 4, min, []), numQuestions, maxResults);
  const trigrams = autoSolve(
    min => topNgrams(words, wordFreq, 3, min, quadgrams), numQuestions, maxResults);
  const bigrams = autoSolve(
    min => topNgrams(words, wordFreq, 2, min, [...quadgrams, ...trigrams]), numQuestions, maxResults);
  const unigrams = topUnigrams(words, maxResults, [...quadgrams, ...trigrams, ...bigrams]);

  return { unigrams, bigrams, trigrams, quadgrams };
}
