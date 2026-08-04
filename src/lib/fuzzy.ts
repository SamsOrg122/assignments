/**
 * Subsequence fuzzy matching with a small scoring model.
 *
 * The palette lives or dies on this feeling instant and ranking sensibly:
 * "ntb" should find "New table" above "Font: bold". Contiguous runs, matches at
 * word starts, and prefix matches all score higher; gaps cost.
 */

export interface FuzzyResult {
  score: number;
  /** Indices of matched characters, for highlighting. */
  matches: number[];
}

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (!query) return { score: 0, matches: [] };

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring is always the strongest signal.
  const direct = t.indexOf(q);
  if (direct !== -1) {
    const matches = Array.from({ length: q.length }, (_, i) => direct + i);
    let score = 120 - direct;
    if (direct === 0) score += 40;
    else if (/[\s\-_/]/.test(t[direct - 1])) score += 24;
    return { score, matches };
  }

  const matches: number[] = [];
  let score = 0;
  let ti = 0;
  let run = 0;

  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    let found = -1;
    while (ti < t.length) {
      if (t[ti] === c) {
        found = ti;
        break;
      }
      ti++;
    }
    if (found === -1) return null;

    matches.push(found);
    const atWordStart = found === 0 || /[\s\-_/.]/.test(t[found - 1]);
    if (atWordStart) score += 14;
    if (run > 0 && matches[matches.length - 2] === found - 1) {
      run++;
      score += 8 + run;
    } else {
      run = 1;
      score -= Math.min(found, 8); // distance penalty, capped
    }
    ti = found + 1;
  }

  // Prefer shorter targets when scores are otherwise close.
  score -= Math.floor(t.length / 12);
  return { score, matches };
}

/** Split a string into matched / unmatched segments for rendering. */
export function segments(
  text: string,
  matches: number[],
): Array<{ text: string; hit: boolean }> {
  if (!matches.length) return [{ text, hit: false }];
  const set = new Set(matches);
  const out: Array<{ text: string; hit: boolean }> = [];
  let buf = "";
  let hit = set.has(0);
  for (let i = 0; i < text.length; i++) {
    const h = set.has(i);
    if (h !== hit) {
      if (buf) out.push({ text: buf, hit });
      buf = "";
      hit = h;
    }
    buf += text[i];
  }
  if (buf) out.push({ text: buf, hit });
  return out;
}
