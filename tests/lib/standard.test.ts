import { describe, expect, it } from 'vitest';
import { parseProperties } from '../../src/domain/parser/properties-parser';
import { buildPreviewRows, rowsToDocument } from '../../src/lib/standard';

describe('rowsToDocument', () => {
  it('preserves base entry metadata while applying preview row values', () => {
    const base = parseProperties('# Page title\ntitle=首页', {
      sourceName: 'zh-cn.properties',
      locale: 'zh-CN',
    });
    const rows = buildPreviewRows(base).map((row) => ({
      ...row,
      translatedValue: 'Home',
    }));

    const restored = rowsToDocument(rows, base);

    expect(restored.entries[0].metadata?.comment).toBe('Page title');
    expect(restored.entries[0].translatedValue).toBe('Home');
  });
});
