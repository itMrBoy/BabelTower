import { describe, it, expect } from 'vitest';
import { jaroWinkler } from '../../../src/domain/conflict/jaro-winkler';

describe('Jaro-Winkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('hello', 'hello')).toBe(1);
  });

  it('returns 0 for empty strings', () => {
    expect(jaroWinkler('', 'hello')).toBe(0);
    expect(jaroWinkler('hello', '')).toBe(0);
    expect(jaroWinkler('', '')).toBe(1); // both empty = identical
  });

  it('returns moderate similarity for single-character different strings', () => {
    const score = jaroWinkler('登录', '登陆');
    // Only 1 of 2 chars match → Jaro base ≈ 0.67, Winkler bump → ~0.70
    expect(score).toBeGreaterThanOrEqual(0.65);
    expect(score).toBeLessThan(0.8);
  });

  it('returns lower similarity for different strings', () => {
    const score = jaroWinkler('登录', '退出');
    expect(score).toBeLessThan(0.8);
  });

  it('handles Chinese text', () => {
    const score = jaroWinkler('用户名', '用户名');
    expect(score).toBe(1);
  });

  it('handles similarity between related phrases', () => {
    const score = jaroWinkler('用户名称', '用户名');
    expect(score).toBeGreaterThan(0.85);
  });

  it('handles strings with common prefix (Winkler boost)', () => {
    const score = jaroWinkler('discount', 'discounts');
    expect(score).toBeGreaterThan(0.9);
  });
});
