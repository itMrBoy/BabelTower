import { describe, it, expect } from 'vitest';
import { parseProperties } from '../../../src/domain/parser/properties-parser';

describe('Properties Parser', () => {
  it('parses key=value format', () => {
    const input = 'title=首页\nsubtitle=欢迎';
    const doc = parseProperties(input, { locale: 'zh-CN', sourceName: 'test.properties' });

    expect(doc.entries).toHaveLength(2);
    expect(doc.locale).toBe('zh-CN');
    expect(doc.sourceFormat).toBe('properties');
    expect(doc.entries[0]).toMatchObject({
      key: 'title',
      keyPath: ['title'],
      sourceValue: '首页',
      status: 'NORMAL',
    });
  });

  it('parses key:value format', () => {
    const input = 'title: 首页\nsubtitle: 欢迎';
    const doc = parseProperties(input);

    expect(doc.entries).toHaveLength(2);
    expect(doc.entries[0].sourceValue).toBe('首页');
    expect(doc.entries[1].sourceValue).toBe('欢迎');
  });

  it('handles Unicode escape sequences', () => {
    const input = 'title=中文';
    const doc = parseProperties(input);

    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0].sourceValue).toBe('中文');
  });

  it('handles multi-line values with backslash continuation', () => {
    const input = 'description=这是一条\\\n很长的\\\n消息';
    const doc = parseProperties(input);

    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0].sourceValue).toBe('这是一条很长的消息');
  });

  it('skips comment lines and empty lines', () => {
    const input = '# This is a comment\n! Another comment\n\nkey1=value1\n\nkey2=value2';
    const doc = parseProperties(input);

    expect(doc.entries).toHaveLength(2);
    expect(doc.entries[0].key).toBe('key1');
    expect(doc.entries[1].key).toBe('key2');
  });

  it('preserves comment metadata on adjacent entries', () => {
    const input = '# Title of the page\ntitle=首页\n# Subtitle\nsubtitle=欢迎';
    const doc = parseProperties(input);

    expect(doc.entries[0].metadata?.comment).toBe('Title of the page');
    expect(doc.entries[1].metadata?.comment).toBe('Subtitle');
  });

  it('detects duplicate keys and marks them DUPLICATED_KEY', () => {
    const input = 'key=first\nkey=second';
    const doc = parseProperties(input);

    // The last value should win
    const keyEntries = doc.entries.filter((e) => e.key === 'key');
    expect(keyEntries).toHaveLength(2);
    expect(keyEntries[0].status).toBe('DUPLICATED_KEY');
    expect(keyEntries[0].sourceValue).toBe('second'); // last wins
    expect(keyEntries[1].sourceValue).toBe('second');
  });

  it('handles keys with dots as literal keyPath', () => {
    const input = 'header.title=首页';
    const doc = parseProperties(input);
    const entry = doc.entries[0];
    expect(entry.key).toBe('header.title');
    expect(entry.keyPath).toEqual(['header', 'title']);
  });

  it('handles empty file', () => {
    const doc = parseProperties('');
    expect(doc.entries).toHaveLength(0);
  });

  it('handles file with only comments', () => {
    const doc = parseProperties('# just a comment\n! another one');
    expect(doc.entries).toHaveLength(0);
  });

  it('preserves trailing whitespace in values after initial trim', () => {
    const input = 'key=  value with spaces  ';
    const doc = parseProperties(input);
    expect(doc.entries[0].sourceValue).toBe('value with spaces');
  });
});
