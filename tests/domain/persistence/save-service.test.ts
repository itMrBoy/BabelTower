import { describe, it, expect } from 'vitest';
import {
  validateDocument,
  generateDiff,
  saveDocument,
  exportDocument,
  applyResolutions,
} from '../../../src/domain/persistence/save-service';
import { StandardI18nDocument, StandardI18nEntry } from '../../../src/domain/standard-i18n/types';

function makeDoc(
  entries: Partial<StandardI18nEntry>[],
  overrides: Partial<StandardI18nDocument> = {},
): StandardI18nDocument {
  return {
    entries: entries.map((e, i) => ({
      key: `key${i}`,
      keyPath: [`key${i}`],
      sourceValue: 'val',
      translatedValue: null,
      locale: 'en',
      status: 'NORMAL' as const,
      ...e,
    })),
    locale: 'en',
    sourceFormat: 'json' as const,
    sourceName: 'test.json',
    ...overrides,
  };
}

describe('validateDocument', () => {
  it('passes a valid document', () => {
    const doc = makeDoc([{ key: 'a', sourceValue: 'val' }]);
    const result = validateDocument(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails on empty entries', () => {
    const doc = makeDoc([]);
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('entries');
  });

  it('fails on entries with empty key', () => {
    const doc = makeDoc([{ key: '' }]);
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('key'))).toBe(true);
  });

  it('fails on entries with null sourceValue and null translatedValue', () => {
    const doc = makeDoc([{ key: 'a', sourceValue: null, translatedValue: null }]);
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
  });

  it('detects inconsistent keyPath lengths for same key', () => {
    // Two entries same dot-key but different keyPath lengths
    const doc: StandardI18nDocument = {
      entries: [
        { key: 'a.b', keyPath: ['a', 'b'], sourceValue: 'v1', translatedValue: null, locale: 'en', status: 'NORMAL' },
        { key: 'a.b', keyPath: ['a.b'], sourceValue: 'v2', translatedValue: null, locale: 'en', status: 'NORMAL' },
      ],
      locale: 'en',
      sourceFormat: 'json',
      sourceName: 'test.json',
    };
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
  });
});

describe('generateDiff', () => {
  function entry(key: string, sourceValue: string | null, translatedValue: string | null = null): StandardI18nEntry {
    return { key, keyPath: key.split('.'), sourceValue, translatedValue, locale: 'en', status: 'NORMAL' };
  }

  it('generates blocking patches when Chinese matches but English differs', () => {
    const result = generateDiff(
      [entry('title', '首页', 'Homepage')],
      [entry('title', '首页', 'Home Page')],
    );
    expect(result.summary.hasBlocking).toBe(true);
    expect(result.patches).toHaveLength(1);
  });

  it('generates warning patches for similar Chinese', () => {
    const result = generateDiff(
      [entry('key', '用户名称', 'Name')],
      [entry('key', '用户名', 'Name')],
    );
    expect(result.summary.warning).toHaveLength(1);
  });

  it('returns empty patches for no conflicts', () => {
    const result = generateDiff(
      [entry('newKey', '新值', 'New')],
      [entry('existingKey', '旧值', 'Old')],
    );
    expect(result.summary.blocking).toHaveLength(0);
    expect(result.summary.warning).toHaveLength(0);
    expect(result.patches).toHaveLength(0);
  });
});

describe('saveDocument', () => {
  const validDoc = makeDoc([{ key: 'a', sourceValue: 'val' }]);

  it('saves a valid document without conflicts', () => {
    const result = saveDocument(validDoc);
    expect(result.snapshot.status).toBe('SAVED');
    expect(result.dictionaryUpdated).toBe(false);
  });

  it('fails validation and returns FAILED snapshot', () => {
    const emptyDoc = makeDoc([]);
    const result = saveDocument(emptyDoc);
    expect(result.snapshot.status).toBe('FAILED');
  });

  it('generates diff when existing dictionary is provided', () => {
    const existing = [{
      key: 'a',
      keyPath: ['a'],
      sourceValue: 'val',
      translatedValue: 'Old',
      locale: 'en',
      status: 'NORMAL' as const,
    }];
    const doc = makeDoc([{ key: 'a', sourceValue: 'val', translatedValue: 'New' }]);
    const result = saveDocument(doc, { existingDictionary: existing });
    expect(result.diffResult).toBeDefined();
    expect(result.diffResult!.summary.hasBlocking).toBe(true);
  });
});

describe('exportDocument', () => {
  it('exports JSON document', () => {
    const doc = makeDoc([{ key: 'a', sourceValue: 'val', keyPath: ['a'] }]);
    const result = exportDocument(doc);
    expect(result['test.json']).toBeDefined();
    expect(result['test.json']).toContain('"a"');
  });

  it('exports properties document', () => {
    const doc = makeDoc(
      [{ key: 'a', sourceValue: 'val', keyPath: ['a'] }],
      { sourceFormat: 'properties', sourceName: 'test.properties' },
    );
    const result = exportDocument(doc);
    expect(result['test.properties']).toBeDefined();
    expect(result['test.properties']).toContain('a=val');
  });

  it('generates dictionary-priority export when dictionary provided', () => {
    const doc = makeDoc([{ key: 'a', sourceValue: '中文', translatedValue: null }]);
    const dict = makeDoc([{ key: 'a', sourceValue: '中文', translatedValue: 'English' }]);

    // We need entries with translatedValue for dictionary priority to work
    const docWithDict = makeDoc(
      [{ key: 'a', sourceValue: '中文', translatedValue: 'English', keyPath: ['a'] }],
    );
    const result = exportDocument(docWithDict, dict);
    const dictFile = Object.keys(result).find((k) => k.includes('dictionary'));
    expect(dictFile).toBeDefined();
  });
});

describe('applyResolutions', () => {
  function entry(key: string, sourceValue: string | null, translatedValue: string | null = null): StandardI18nEntry {
    return { key, keyPath: key.split('.'), sourceValue, translatedValue, locale: 'en', status: 'NORMAL' };
  }

  it('KEEP_EXISTING keeps the dictionary value', () => {
    const result = applyResolutions(
      [entry('title', '首页', 'New')],
      [entry('title', '首页', 'Existing')],
      { title: 'KEEP_EXISTING' },
    );
    expect(result[0].translatedValue).toBe('Existing');
  });

  it('UPDATE_DICTIONARY uses the new value', () => {
    const result = applyResolutions(
      [entry('title', '首页', 'New')],
      [entry('title', '首页', 'Existing')],
      { title: 'UPDATE_DICTIONARY' },
    );
    expect(result[0].translatedValue).toBe('New');
  });

  it('IGNORE_SIMILAR keeps the existing value', () => {
    const result = applyResolutions(
      [entry('title', '首页', 'New')],
      [entry('title', '首页', 'Existing')],
      { title: 'IGNORE_SIMILAR' },
    );
    expect(result[0].translatedValue).toBe('Existing');
  });

  it('does not modify entries without a resolution', () => {
    const result = applyResolutions(
      [entry('title', '首页', 'New')],
      [entry('title', '首页', 'Existing')],
      {},
    );
    expect(result[0].translatedValue).toBe('New');
  });
});
