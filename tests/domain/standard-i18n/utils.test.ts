import { describe, it, expect } from 'vitest';
import { flatten, unflatten } from '../../../src/domain/standard-i18n/utils';

describe('flatten', () => {
  it('flattens a simple object', () => {
    const result = flatten({ a: '1', b: '2' });
    expect(result.get('a')).toBe('1');
    expect(result.get('b')).toBe('2');
    expect(result.size).toBe(2);
  });

  it('flattens a nested object', () => {
    const result = flatten({ a: { b: { c: 'deep' } } });
    expect(result.get('a.b.c')).toBe('deep');
  });

  it('returns null for non-string values', () => {
    const result = flatten({ num: 42, bool: true, nil: null, arr: [1, 2] });
    expect(result.get('num')).toBeNull();
    expect(result.get('bool')).toBeNull();
    expect(result.get('nil')).toBeNull();
    expect(result.get('arr')).toBeNull();
  });

  it('preserves string leaf values through nested objects', () => {
    const result = flatten({
      str: 'keep',
      obj: { inner: 'also-keep' },
    });
    expect(result.get('str')).toBe('keep');
    expect(result.get('obj.inner')).toBe('also-keep');
  });
});

describe('unflatten', () => {
  it('restores a nested object from flat map', () => {
    const flat = new Map<string, string | null>([
      ['a.b.c', 'deep'],
      ['x', 'single'],
    ]);
    const result = unflatten(flat);
    expect(result).toEqual({
      a: { b: { c: 'deep' } },
      x: 'single',
    });
  });

  it('skips null values', () => {
    const flat = new Map<string, string | null>([['a', null], ['b', 'keep']]);
    const result = unflatten(flat);
    expect(result).toEqual({ b: 'keep' });
  });
});

describe('flatten + unflatten round-trip', () => {
  it('round-trips a complex nested object', () => {
    const original = {
      header: {
        title: '首页',
        subtitle: '欢迎',
      },
      footer: {
        copyright: '版权所有',
        links: {
          about: '关于我们',
          contact: '联系我们',
        },
      },
    };

    const flat = flatten(original);
    const restored = unflatten(flat);
    expect(restored).toEqual(original);
  });
});
