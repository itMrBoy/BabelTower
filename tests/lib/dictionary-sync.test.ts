import { describe, expect, it } from 'vitest';
import largeFixture from '../fixtures/large-1000-rows.json';
import { preClassifyRows, splitCandidates } from '../../src/lib/dictionary-sync';
import { chineseHash } from '../../src/lib/standard';
import type { PreviewRow } from '../../src/domain/standard-i18n/types';

function row(partial: Partial<PreviewRow> & Pick<PreviewRow, 'key' | 'sourceValue' | 'translatedValue'>): PreviewRow {
  return {
    keyPath: [partial.key],
    status: 'NORMAL',
    ...partial,
  };
}

describe('preClassifyRows', () => {
  it('skips rows with empty source or translated value', () => {
    const rows = [
      row({ key: 'a', sourceValue: '  ', translatedValue: 'Home' }),
      row({ key: 'b', sourceValue: '首页', translatedValue: '   ' }),
      row({ key: 'c', sourceValue: null, translatedValue: 'X' }),
      row({ key: 'd', sourceValue: '设置', translatedValue: null }),
    ];
    const result = preClassifyRows(rows);
    expect(result.candidates.size).toBe(0);
    expect(result.skipped).toBe(4);
  });

  it('dedups rows that hash to the same chinese (keeps first occurrence)', () => {
    const rows = [
      row({ key: 'a', sourceValue: '首页', translatedValue: 'Home' }),
      row({ key: 'b', sourceValue: '首页', translatedValue: 'HomePage' }), // 同中文 -> 同 hash -> skip
    ];
    const result = preClassifyRows(rows);
    expect(result.candidates.size).toBe(1);
    expect(result.skipped).toBe(1);
    const candidate = result.candidates.get(chineseHash('首页'));
    expect(candidate?.englishText).toBe('Home'); // 保留首次出现
  });

  it('trims source and translated before storing candidate', () => {
    const rows = [row({ key: 'a', sourceValue: ' 首页 ', translatedValue: ' Home ' })];
    const candidate = preClassifyRows(rows).candidates.get(chineseHash('首页'));
    expect(candidate?.chineseText).toBe('首页');
    expect(candidate?.englishText).toBe('Home');
  });
});

describe('splitCandidates', () => {
  const candidates = preClassifyRows([
    row({ key: 'a', sourceValue: '首页', translatedValue: 'Home' }),
    row({ key: 'b', sourceValue: '设置', translatedValue: 'Settings' }),
    row({ key: 'c', sourceValue: '退出', translatedValue: 'Logout' }),
  ]).candidates;

  it('classifies new entries as creates', () => {
    const result = splitCandidates(candidates, new Map());
    expect(result.creates).toHaveLength(3);
    expect(result.updates).toHaveLength(0);
    expect(result.skippedSameEnglish).toBe(0);
  });

  it('skips entries whose english already matches (normalize-insensitive)', () => {
    const existing = new Map([
      [chineseHash('首页'), { englishText: 'Home' }],
      [chineseHash('设置'), { englishText: '  Settings  ' }], // normalize 后相同
    ]);
    const result = splitCandidates(candidates, existing);
    expect(result.skippedSameEnglish).toBe(2);
    expect(result.creates).toHaveLength(1); // 退出
    expect(result.creates[0].chineseText).toBe('退出');
  });

  it('classifies entries with different english as updates with previousEnglish', () => {
    const existing = new Map([[chineseHash('首页'), { englishText: 'Index' }]]);
    const result = splitCandidates(candidates, existing);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].candidate.chineseText).toBe('首页');
    expect(result.updates[0].candidate.englishText).toBe('Home');
    expect(result.updates[0].previousEnglish).toBe('Index');
    expect(result.creates).toHaveLength(2); // 设置 / 退出
  });
});

describe('large fixture invariant', () => {
  it('keeps candidates + skipped === total rows for 1000-row input', () => {
    const fixture = largeFixture as { entries: { key: string; zh: string; en: string }[] };
    const rows: PreviewRow[] = fixture.entries.map((entry) =>
      row({ key: entry.key, sourceValue: entry.zh, translatedValue: entry.en }),
    );
    expect(rows.length).toBe(1000);
    const result = preClassifyRows(rows);
    expect(result.candidates.size + result.skipped).toBe(rows.length);
  });
});
