import { kmpSearchAll } from "./kmp";

/**
 * TXT 目录 is built with Knuth–Morris–Pratt:
 * 1. KMP locates chapter markers (第 / Chapter / 楔子 / …).
 * 2. From each hit, the rest of that line is the chapter name.
 * 3. Duplicate labels (a front 目录 listing + the real chapter) keep the later hit.
 */
const KMP_MARKERS = [
  "【第",
  "第",
  "Chapter ",
  "CHAPTER ",
  "chapter ",
  "Chapter\t",
  "CHAPTER\t",
  "chapter\t",
  "Chapter\u3000",
  "CHAPTER\u3000",
  "chapter\u3000",
  "Chapter",
  "CHAPTER",
  "chapter",
  "### ",
  "## ",
  "# ",
  "序章",
  "楔子",
  "尾声",
  "终章",
  "前言",
  "后记",
  "Prologue",
  "Epilogue",
] as const;

const CN_FROM_DI =
  /^(?:正文[\s\u3000]*)?第[\s\u3000]*([0-9０-９零〇一二三四五六七八九十百千万两]+)[\s\u3000]*([章节回篇部卷集])(?:[\s\u3000]*[.:：、.．—–\-]+[\s\u3000]*|[\s\u3000]+)?(.*)$/;
const EN_FROM_CHAPTER =
  /^(chapter)[\s\u3000]*(\d+|[ivxlcdm]+)\b(?:[\s\u3000]*[.:：、.．—–\-]+[\s\u3000]*|[\s\u3000]+)?(.*)$/i;
const MD_FROM_HASH = /^(#{1,3})[\s\u3000]+(.+)$/;
const STANDALONE =
  /^(序章|楔子|尾声|终章|前言|后记|prologue|epilogue)(?:[\s\u3000]*[.:：、.．—–\-]+[\s\u3000]*|[\s\u3000]+)?(.*)$/i;

const MAX_HEADING_LEN = 120;
const MAX_CHAPTERS = 400;

export type TxtChapterHit = {
  /** Char offset of the KMP hit in the original text. */
  start: number;
  label: string;
};

function lineEnd(text: string, index: number): number {
  let end = index;
  while (end < text.length && text[end] !== "\n" && text[end] !== "\r") {
    end++;
  }
  return end;
}

function lineStart(text: string, index: number): number {
  let start = index;
  while (start > 0 && text[start - 1] !== "\n" && text[start - 1] !== "\r") {
    start--;
  }
  return start;
}

function cleanName(raw: string): string {
  return raw
    .replace(/[【\[]/g, "")
    .replace(/[】\]]/g, "")
    .replace(/[\s\u3000]+/g, " ")
    .trim();
}

function parseFromKmpHit(
  text: string,
  hit: number,
  marker: string,
): TxtChapterHit | null {
  const line0 = lineStart(text, hit);
  const end = lineEnd(text, hit);
  if (end - line0 > MAX_HEADING_LEN) return null;

  let start = line0;
  while (
    start < end &&
    (text[start] === " " ||
      text[start] === "\t" ||
      text[start] === "\u3000")
  ) {
    start++;
  }

  // Match the whole heading line so prefixes like「正文 第一回」still count.
  const slice =
    marker === "【第"
      ? text.slice(hit + 1, end)
      : text.slice(start, end);
  if (!slice || slice.length > MAX_HEADING_LEN) return null;

  const line = cleanName(slice);

  const cn = line.match(CN_FROM_DI);
  if (cn) {
    const name = cleanName(cn[3] ?? "");
    const markerLabel = `第${cn[1]}${cn[2]}`;
    return { start, label: name ? `${markerLabel} ${name}` : markerLabel };
  }

  const en = line.match(EN_FROM_CHAPTER);
  if (en) {
    const name = cleanName(en[3] ?? "");
    const markerLabel = `${en[1]} ${en[2]}`;
    return { start, label: name ? `${markerLabel} ${name}` : markerLabel };
  }

  const md = slice.match(MD_FROM_HASH);
  if (md) {
    const name = cleanName(md[2] ?? "");
    return name ? { start, label: name } : null;
  }

  const extra = line.match(STANDALONE);
  if (extra && extra[1]) {
    const name = cleanName(extra[2] ?? "");
    const markerLabel = extra[1];
    return { start, label: name ? `${markerLabel} ${name}` : markerLabel };
  }

  return null;
}

function normalizeLabel(label: string): string {
  return label.replace(/[\s\u3000]+/g, " ").trim().toLowerCase();
}

/**
 * Split a TXT book into 目录 entries using KMP marker search.
 * Returns [] only when KMP finds no real headings (not a size-based fake TOC).
 */
export function detectTxtChapters(text: string): TxtChapterHit[] {
  const byStart = new Map<number, TxtChapterHit>();

  for (const marker of KMP_MARKERS) {
    for (const hit of kmpSearchAll(text, marker)) {
      if (byStart.has(hit) || byStart.has(hit + 1)) continue;
      const parsed = parseFromKmpHit(text, hit, marker);
      if (!parsed) continue;
      byStart.set(parsed.start, parsed);
    }
  }

  const hits = [...byStart.values()].sort((a, b) => a.start - b.start);

  // Front 目录 often repeats later chapter titles — keep the later (body) hit.
  const lastByLabel = new Map<string, TxtChapterHit>();
  for (const hit of hits) {
    lastByLabel.set(normalizeLabel(hit.label), hit);
  }
  const unique = [...lastByLabel.values()].sort((a, b) => a.start - b.start);

  if (unique.length === 0 || unique.length > MAX_CHAPTERS) return [];
  return unique;
}
