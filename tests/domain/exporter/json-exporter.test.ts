import { describe, it, expect } from 'vitest';
import { exportToJson } from '../../../src/domain/exporter/json-exporter';
import { parseJson } from '../../../src/domain/parser/json-parser';
import { StandardI18nEntry } from '../../../src/domain/standard-i18n/types';

describe('JSON Exporter', () => {
  it('round-trips a parsed JSON file back to identical structure', () => {
    const original = { title: '首页', desc: '描述' };
    const doc = parseJson(original);
    const output = exportToJson(doc);
    const reparsed = JSON.parse(output);

    expect(reparsed).toEqual(original);
  });

  it('builds nested structure from keyPath entries', () => {
    const entries: StandardI18nEntry[] = [
      {
        key: 'header.title',
        keyPath: ['header', 'title'],
        sourceValue: '首页',
        translatedValue: null,
        locale: 'zh-CN',
        status: 'NORMAL',
      },
      {
        key: 'header.subtitle',
        keyPath: ['header', 'subtitle'],
        sourceValue: '欢迎',
        translatedValue: null,
        locale: 'zh-CN',
        status: 'NORMAL',
      },
    ];

    const output = exportToJson({
      entries,
      locale: 'zh-CN',
      sourceFormat: 'json',
      sourceName: 'test.json',
    });

    const obj = JSON.parse(output);
    expect(obj).toEqual({
      header: {
        title: '首页',
        subtitle: '欢迎',
      },
    });
  });

  it('skips null sourceValue entries', () => {
    const entries: StandardI18nEntry[] = [
      {
        key: 'valid',
        keyPath: ['valid'],
        sourceValue: 'keep',
        translatedValue: null,
        locale: 'en',
        status: 'NORMAL',
      },
      {
        key: 'invalid',
        keyPath: ['invalid'],
        sourceValue: null,
        translatedValue: null,
        locale: 'en',
        status: 'UNSUPPORTED_VALUE',
      },
    ];

    const output = exportToJson({
      entries,
      locale: 'en',
      sourceFormat: 'json',
      sourceName: 'test.json',
    });

    const obj = JSON.parse(output);
    expect(obj).toEqual({ valid: 'keep' });
    expect(obj).not.toHaveProperty('invalid');
  });

  it('applies dictionary priority when enabled', () => {
    const entries: StandardI18nEntry[] = [
      {
        key: 'title',
        keyPath: ['title'],
        sourceValue: '首页',
        translatedValue: 'Home',
        locale: 'en',
        status: 'NORMAL',
      },
    ];

    const output = exportToJson(
      {
        entries,
        locale: 'en',
        sourceFormat: 'json',
        sourceName: 'test.json',
      },
      { dictionaryPriority: true },
    );

    const obj = JSON.parse(output);
    expect(obj.title).toBe('Home');
  });

  it('preserves order from entries', () => {
    const entries: StandardI18nEntry[] = [
      {
        key: 'z',
        keyPath: ['z'],
        sourceValue: 'last in order',
        translatedValue: null,
        locale: 'en',
        status: 'NORMAL',
      },
      {
        key: 'a',
        keyPath: ['a'],
        sourceValue: 'first',
        translatedValue: null,
        locale: 'en',
        status: 'NORMAL',
      },
    ];

    const output = exportToJson({
      entries,
      locale: 'en',
      sourceFormat: 'json',
      sourceName: 'test.json',
    });

    // JSON.stringify preserves insertion order
    const keys = Object.keys(JSON.parse(output));
    expect(keys).toEqual(['z', 'a']);
  });
});
