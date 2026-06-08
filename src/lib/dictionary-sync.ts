import { chineseHash, normalizeText } from "@/lib/standard";
import type { PreviewRow } from "@/domain/standard-i18n/types";

/** 单个待同步字典候选(中英文均已 trim)。 */
export interface DictionaryCandidate {
  hash: string;
  chineseText: string;
  englishText: string;
}

export interface PreClassifyResult {
  /** hash -> 候选,已去重(保留首次出现)。 */
  candidates: Map<string, DictionaryCandidate>;
  /** 空值 + 同批重复,直接计入 skipped。 */
  skipped: number;
}

/**
 * 阶段一:无 DB 预处理。
 * 口径对齐原 save 循环:空 source/translated -> skipped;同批 hash 重复 -> skipped。
 * hash 计算移出事务,缩短事务窗口。
 */
export function preClassifyRows(rows: PreviewRow[]): PreClassifyResult {
  const candidates = new Map<string, DictionaryCandidate>();
  let skipped = 0;
  for (const row of rows) {
    const chineseText = row.sourceValue?.trim();
    const englishText = row.translatedValue?.trim();
    if (!chineseText || !englishText) {
      skipped++;
      continue;
    }
    const hash = chineseHash(chineseText);
    if (candidates.has(hash)) {
      skipped++;
      continue;
    }
    candidates.set(hash, { hash, chineseText, englishText });
  }
  return { candidates, skipped };
}

export interface SplitResult {
  creates: DictionaryCandidate[];
  updates: { candidate: DictionaryCandidate; previousEnglish: string }[];
  skippedSameEnglish: number;
}

/**
 * 阶段二:已知 DB 中已存在条目后,把候选切成 creates / updates / skipped。
 * existing 为 chineseHash -> { englishText }(来自一次批量 findMany)。
 * 英文相同(normalize 后)即 skipped,与原 save 的 sameNormalizedText 判定一致。
 */
export function splitCandidates(
  candidates: Map<string, DictionaryCandidate>,
  existing: Map<string, { englishText: string }>,
): SplitResult {
  const creates: DictionaryCandidate[] = [];
  const updates: SplitResult["updates"] = [];
  let skippedSameEnglish = 0;

  for (const candidate of candidates.values()) {
    const hit = existing.get(candidate.hash);
    if (!hit) {
      creates.push(candidate);
      continue;
    }
    if (normalizeText(hit.englishText) === normalizeText(candidate.englishText)) {
      skippedSameEnglish++;
      continue;
    }
    updates.push({ candidate, previousEnglish: hit.englishText });
  }
  return { creates, updates, skippedSameEnglish };
}
