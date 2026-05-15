import { describe, it, expect } from 'vitest';
import { exportToProperties } from '../../../src/domain/exporter/properties-exporter';
import { parseProperties } from '../../../src/domain/parser/properties-parser';
import { StandardI18nEntry } from '../../../src/domain/standard-i18n/types';

describe('Properties Exporter', () => {
  it('round-trips parsed .properties content', () => {
    const input = 'title=首页\nsubtitle=欢迎';
    const doc = parseProperties(input);
    const output = exportToProperties(doc);

    expect(output).toBe(input + '\n');
  });

  it('outputs key=value format', () => {
    const entries: StandardI18nEntry[] = [
      {
        key: 'title',
        keyPath: ['title'],
        sourceValue: '首页',
        translatedValue: null,
        locale: 'zh-CN',
        status: 'NORMAL',
      },
    ];

    const output = exportToProperties({
      entries,
      locale: 'zh-CN',
      sourceFormat: 'properties',
      sourceName: 'test.properties',
    });

    expect(output).toBe('title=首页\n');
  });

  it('writes leading comments from metadata', () => {
    const entries: StandardI18nEntry[] = [
      {
        key: 'title',
        keyPath: ['title'],
        sourceValue: '首页',
        translatedValue: null,
        locale: 'zh-CN',
        status: 'NORMAL',
        metadata: { comment: 'Page title' },
      },
    ];

    const output = exportToProperties({
      entries,
      locale: 'zh-CN',
      sourceFormat: 'properties',
      sourceName: 'test.properties',
    });

    expect(output).toBe('# Page title\ntitle=首页\n');
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

    const output = exportToProperties(
      {
        entries,
        locale: 'en',
        sourceFormat: 'properties',
        sourceName: 'test.properties',
      },
      { dictionaryPriority: true },
    );

    expect(output).toBe('title=Home\n');
  });

  it('handles special character escaping', () => {
    const entries: StandardI18nEntry[] = [
      {
        key: 'text',
        keyPath: ['text'],
        sourceValue: 'line1\nline2\tindented',
        translatedValue: null,
        locale: 'en',
        status: 'NORMAL',
      },
    ];

    const output = exportToProperties({
      entries,
      locale: 'en',
      sourceFormat: 'properties',
      sourceName: 'test.properties',
    });

    expect(output).toContain('\\n');
    expect(output).toContain('\\t');
  });
});
