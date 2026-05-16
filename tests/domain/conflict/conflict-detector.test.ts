import { describe, it, expect } from 'vitest';
import { detectConflicts } from '../../../src/domain/conflict/conflict-detector';
import { StandardI18nEntry } from '../../../src/domain/standard-i18n/types';

function makeEntry(
  key: string,
  sourceValue: string | null,
  translatedValue: string | null = null,
): StandardI18nEntry {
  return {
    key,
    keyPath: key.split('.'),
    sourceValue,
    translatedValue,
    locale: 'en',
    status: 'NORMAL',
  };
}

describe('Conflict Detector', () => {
  it('detects blocking conflict when Chinese matches exactly but English differs', () => {
    const newEntries = [makeEntry('title', '首页', 'Homepage')];
    const existing = [makeEntry('title', '首页', 'Home Page')];

    const result = detectConflicts(newEntries, existing);

    expect(result.hasBlocking).toBe(true);
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0]).toMatchObject({
      key: 'title',
      chineseValue: '首页',
      existingEnglish: 'Home Page',
      newEnglish: 'Homepage',
      level: 'blocking',
    });
    expect(result.warning).toHaveLength(0);
  });

  it('skips (info) when Chinese and English are both identical', () => {
    const newEntries = [makeEntry('title', '首页', 'Home')];
    const existing = [makeEntry('title', '首页', 'Home')];

    const result = detectConflicts(newEntries, existing);

    expect(result.hasBlocking).toBe(false);
    expect(result.blocking).toHaveLength(0);
    expect(result.warning).toHaveLength(0);
    expect(result.info).toHaveLength(1);
  });

  it('detects warning when Chinese is similar (Jaro-Winkler >= 0.9)', () => {
    const newEntries = [makeEntry('username', '用户名称', 'Username')];
    const existing = [makeEntry('username', '用户名', 'Username')];

    const result = detectConflicts(newEntries, existing);

    expect(result.blocking).toHaveLength(0);
    expect(result.warning).toHaveLength(1);
    expect(result.warning[0].level).toBe('warning');
    expect(result.warning[0].similarity).toBeGreaterThanOrEqual(0.9);
  });

  it('ignores entries that exist only in new or only in existing', () => {
    const newEntries = [makeEntry('newKey', '新值', 'New')];
    const existing = [makeEntry('oldKey', '旧值', 'Old')];

    const result = detectConflicts(newEntries, existing);

    expect(result.blocking).toHaveLength(0);
    expect(result.warning).toHaveLength(0);
    expect(result.info).toHaveLength(0);
  });

  it('normalizes text before comparison (NFKC, trim, whitespace collapse)', () => {
    // Full-width vs half-width (NFKC normalizes)
    const newEntries = [makeEntry('title', '您好', 'Hello')];
    const existing = [makeEntry('title', '您好 ', 'Hi')]; // trailing space

    const result = detectConflicts(newEntries, existing);

    // After normalization, both should match exactly, and English differs → blocking
    expect(result.hasBlocking).toBe(true);
    expect(result.blocking).toHaveLength(1);
  });

  it('multiple conflicts with mixed levels', () => {
    const newEntries = [
      makeEntry('title', '首页', 'Homepage'),
      makeEntry('username', '用户名称', 'Username'),
      makeEntry('desc', '描述', 'Description'),
    ];
    const existing = [
      makeEntry('title', '首页', 'Home Page'), // blocking: exact Chinese, diff English
      makeEntry('username', '用户名', 'Username'), // warning: similar Chinese
      makeEntry('desc', '描述', 'Description'), // info: identical
    ];

    const result = detectConflicts(newEntries, existing);

    expect(result.blocking).toHaveLength(1);
    expect(result.warning).toHaveLength(1);
    expect(result.info).toHaveLength(1);
    expect(result.blocking[0].key).toBe('title');
    expect(result.warning[0].key).toBe('username');
    expect(result.info[0].key).toBe('desc');
  });

  it('handles empty entries', () => {
    const result = detectConflicts([], [makeEntry('key', 'val')]);
    expect(result.blocking).toHaveLength(0);
    expect(result.warning).toHaveLength(0);
    expect(result.info).toHaveLength(0);
  });

  it('uses custom similarity threshold', () => {
    const newEntries = [makeEntry('key', '用户名称', 'Value')];
    const existing = [makeEntry('key', '用户名', 'Value')];

    // With high threshold, they won't match as warning
    const result = detectConflicts(newEntries, existing, { similarityThreshold: 0.99 });
    expect(result.warning).toHaveLength(0);
    expect(result.blocking).toHaveLength(0);

    // With low threshold, they will
    const result2 = detectConflicts(newEntries, existing, { similarityThreshold: 0.8 });
    expect(result2.warning).toHaveLength(1);
  });
});
