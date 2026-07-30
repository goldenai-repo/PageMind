// Legacy (non-Unicode) encodings to try when a .txt file isn't valid UTF-8.
// Order doesn't matter — the best-scoring result wins. windows-1252 is the
// catch-all for Western text; the rest cover the common CJK cases.
const LEGACY_ENCODINGS = [
  "gb18030", // Simplified Chinese (superset of GBK/GB2312)
  "big5", // Traditional Chinese
  "shift_jis", // Japanese
  "euc-kr", // Korean
  "windows-1252", // Western European
] as const;

// Scoring only needs a representative slice, not the whole (possibly large) file.
const SAMPLE_BYTES = 65_536;

/**
 * Rewards characters that indicate a correct decode (CJK ideographs, kana,
 * hangul) and penalizes ones that indicate a wrong one (the U+FFFD
 * replacement character, C0/C1 control codes, private-use area).
 */
function scoreText(text: string): number {
  let score = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0xfffd) score -= 10;
    else if (c >= 0x4e00 && c <= 0x9fff) score += 2; // CJK unified ideographs
    else if (c >= 0x3040 && c <= 0x30ff) score += 2; // hiragana + katakana
    else if (c >= 0xac00 && c <= 0xd7a3) score += 2; // hangul syllables
    else if (c >= 0x3000 && c <= 0x303f) score += 1; // CJK symbols & punctuation
    else if (c >= 0xff01 && c <= 0xff5e) score += 1; // fullwidth ASCII/punctuation
    // Half-width katakana (U+FF61–FF9F) is deliberately neutral: it's the
    // signature of a wrong Shift-JIS decode of non-Japanese bytes.
    else if (c < 0x09 || (c >= 0x0e && c <= 0x1f)) score -= 5; // control codes
    else if (c >= 0xe000 && c <= 0xf8ff) score -= 5; // private use area
  }
  return score;
}

/**
 * Decodes .txt bytes to a string, detecting the character encoding rather than
 * assuming UTF-8. Non-UTF-8 files (e.g. GBK-encoded Chinese) would otherwise
 * render as mojibake. Honors a BOM, prefers valid UTF-8, and falls back to the
 * best-scoring legacy encoding.
 */
export function decodeText(buffer: ArrayBuffer): string {
  const u8 = new Uint8Array(buffer);

  // Byte order marks are unambiguous — trust them.
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer);
  }
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer);
  }

  // Valid UTF-8 (this also covers plain ASCII) — the common case.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Not UTF-8; fall through to legacy detection.
  }

  const sample = u8.subarray(0, SAMPLE_BYTES);
  let bestEnc = "windows-1252";
  let bestScore = -Infinity;
  for (const enc of LEGACY_ENCODINGS) {
    let text: string;
    try {
      text = new TextDecoder(enc).decode(sample);
    } catch {
      continue; // label unsupported in this runtime
    }
    const score = scoreText(text);
    if (score > bestScore) {
      bestScore = score;
      bestEnc = enc;
    }
  }
  return new TextDecoder(bestEnc).decode(buffer);
}
