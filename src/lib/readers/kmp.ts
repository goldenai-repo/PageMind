/**
 * Knuth–Morris–Pratt string search. Used to find TXT chapter heading
 * prefixes without scanning with overlapping regexes.
 */
export function buildLps(pattern: string): number[] {
  const lps = new Array<number>(pattern.length).fill(0);
  let len = 0;
  let i = 1;
  while (i < pattern.length) {
    if (pattern[i] === pattern[len]) {
      lps[i++] = ++len;
    } else if (len > 0) {
      len = lps[len - 1];
    } else {
      lps[i++] = 0;
    }
  }
  return lps;
}

/** All start indexes of `pattern` in `text` (including overlaps via LPS). */
export function kmpSearchAll(text: string, pattern: string): number[] {
  if (!pattern) return [];
  const lps = buildLps(pattern);
  const hits: number[] = [];
  let i = 0;
  let j = 0;
  while (i < text.length) {
    if (text[i] === pattern[j]) {
      i++;
      j++;
      if (j === pattern.length) {
        hits.push(i - j);
        j = lps[j - 1];
      }
    } else if (j > 0) {
      j = lps[j - 1];
    } else {
      i++;
    }
  }
  return hits;
}
