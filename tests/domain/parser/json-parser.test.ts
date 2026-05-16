import { describe, it, expect } from 'vitest';
import { parseJson } from '../../../src/domain/parser/json-parser';

describe('JSON Parser', () => {
  it('parses a simple flat JSON object', () => {
    const input = JSON.stringify({ title: '你好', description: '世界' });
    const doc = parseJson(input, { locale: 'zh-CN', sourceName: 'test.json' });

    expect(doc.entries).toHaveLength(2);
    expect(doc.locale).toBe('zh-CN');
    expect(doc.sourceFormat).toBe('json');
    expect(doc.sourceName).toBe('test.json');
    expect(doc.entries[0]).toMatchObject({
      key: 'title',
      keyPath: ['title'],
      sourceValue: '你好',
      status: 'NORMAL',
    });
  });

  it('parses nested JSON objects with dot-notation key paths', () => {
    const input = JSON.stringify({
      header: { title: '首页', subtitle: '欢迎' },
      footer: { copyright: '版权所有' },
    });
    const doc = parseJson(input);

    expect(doc.entries).toHaveLength(3);
    expect(doc.entries[0]).toMatchObject({
      key: 'header.title',
      keyPath: ['header', 'title'],
      sourceValue: '首页',
      status: 'NORMAL',
    });
    expect(doc.entries[1]).toMatchObject({
      key: 'header.subtitle',
      keyPath: ['header', 'subtitle'],
      sourceValue: '欢迎',
    });
    expect(doc.entries[2]).toMatchObject({
      key: 'footer.copyright',
      keyPath: ['footer', 'copyright'],
      sourceValue: '版权所有',
    });
  });

  it('marks non-string values as UNSUPPORTED_VALUE', () => {
    const input = JSON.stringify({
      count: 42,
      active: true,
      empty: null,
      items: [1, 2, 3],
    });
    const doc = parseJson(input);

    expect(doc.entries).toHaveLength(4);
    for (const entry of doc.entries) {
      expect(entry.status).toBe('UNSUPPORTED_VALUE');
      expect(entry.sourceValue).toBeNull();
    }
  });

  it('handles deeply nested objects', () => {
    const input = JSON.stringify({
      a: { b: { c: { d: { e: 'deep' } } } },
    });
    const doc = parseJson(input);

    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]).toMatchObject({
      key: 'a.b.c.d.e',
      keyPath: ['a', 'b', 'c', 'd', 'e'],
      sourceValue: 'deep',
      status: 'NORMAL',
    });
  });

  it('handles keys containing dots', () => {
    const input = JSON.stringify({ 'a.b': 'value' });
    const doc = parseJson(input);

    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]).toMatchObject({
      key: 'a.b',
      keyPath: ['a.b'],
      sourceValue: 'value',
    });
  });

  it('accepts a pre-parsed object', () => {
    const obj = { greeting: '你好' };
    const doc = parseJson(obj, { locale: 'zh' });

    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0].sourceValue).toBe('你好');
  });

  it('tracks source locations when given a raw string', () => {
    const input = JSON.stringify({ hello: 'world' }, null, 2);
    const doc = parseJson(input);

    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0].sourceLocation).toBeDefined();
    expect(doc.entries[0].sourceLocation!.line).toBeGreaterThanOrEqual(1);
  });

  it('preserves entry order from the source object', () => {
    const input = JSON.stringify({ z: 'last', a: 'first', m: 'middle' });
    const doc = parseJson(input);

    expect(doc.entries[0].key).toBe('z');
    expect(doc.entries[1].key).toBe('a');
    expect(doc.entries[2].key).toBe('m');
  });

  it('handles empty object', () => {
    const doc = parseJson('{}');
    expect(doc.entries).toHaveLength(0);
  });
});
