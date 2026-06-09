import { describe, expect, it } from 'vitest';
import { buildDualExportFiles, buildTranslatedFilename } from '../../../src/domain/exporter/export-files';
import { parseJson } from '../../../src/domain/parser/json-parser';
import { parseProperties } from '../../../src/domain/parser/properties-parser';
import { parseTs } from '../../../src/domain/parser/ts-parser';
import type { StandardI18nDocument } from '../../../src/domain/standard-i18n/types';

function withTranslations(document: StandardI18nDocument, translations: Record<string, string>) {
  return {
    ...document,
    entries: document.entries.map((entry) => ({
      ...entry,
      translatedValue: translations[entry.key] ?? entry.translatedValue,
    })),
  };
}

describe('buildTranslatedFilename', () => {
  it('replaces source-language markers with target-language markers', () => {
    expect(buildTranslatedFilename('zh-cn.ts')).toBe('en-us.ts');
    expect(buildTranslatedFilename('messages.zh.json')).toBe('messages.en.json');
    expect(buildTranslatedFilename('中文.properties')).toBe('英文.properties');
  });

  it('uses uploaded target filename when provided', () => {
    expect(buildTranslatedFilename('zh-cn.ts', 'en-US.ts')).toBe('en-US.ts');
  });

  it('appends locale suffix when no language marker is present', () => {
    expect(buildTranslatedFilename('messages.ts')).toBe('messages.en-US.ts');
  });
});

describe('buildDualExportFiles', () => {
  it('exports source JSON and translated JSON with the same file type', () => {
    const document = withTranslations(
      parseJson('{"title":"首页"}', { sourceName: 'zh-cn.json', locale: 'zh-CN' }),
      { title: 'Home' },
    );

    const result = buildDualExportFiles(document);

    expect(Object.keys(result.files)).toEqual(['zh-cn.json', 'en-us.json']);
    expect(JSON.parse(result.files['zh-cn.json'])).toEqual({ title: '首页' });
    expect(JSON.parse(result.files['en-us.json'])).toEqual({ title: 'Home' });
  });

  it('adds -en suffix to translated file when uploaded filenames collide', () => {
    const document = withTranslations(
      parseJson('{"title":"首页"}', { sourceName: 'messages.json', locale: 'zh-CN' }),
      { title: 'Home' },
    );

    const result = buildDualExportFiles(document, 'messages.json');

    expect(Object.keys(result.files)).toEqual(['messages.json', 'messages-en.json']);
    expect(result.sourceFilename).toBe('messages.json');
    expect(result.targetFilename).toBe('messages-en.json');
    expect(JSON.parse(result.files['messages.json'])).toEqual({ title: '首页' });
    expect(JSON.parse(result.files['messages-en.json'])).toEqual({ title: 'Home' });
  });

  it('preserves properties comments in source and translated files', () => {
    const document = withTranslations(
      parseProperties('! header\n\n# Page title\ntitle : 首页\n\n# tail', { sourceName: 'zh-cn.properties', locale: 'zh-CN' }),
      { title: 'Home' },
    );

    const result = buildDualExportFiles(document);

    expect(result.files['zh-cn.properties']).toBe('! header\n\n# Page title\ntitle : 首页\n\n# tail\n');
    expect(result.files['en-us.properties']).toBe('! header\n\n# Page title\ntitle : Home\n\n# tail\n');
  });

  it('uses uploaded target properties template so translated comments are not lost', () => {
    const document = withTranslations(
      parseProperties('# source title\ntitle=首页\n# source subtitle\nsubtitle=副标题', {
        sourceName: 'zh-cn.properties',
        locale: 'zh-CN',
      }),
      { title: 'Home', subtitle: 'Subtitle' },
    );
    const targetDocument = parseProperties('! translated header\n\n# target title\ntitle=Old home\n', {
      sourceName: 'en-us.properties',
      locale: 'en-US',
    });

    const result = buildDualExportFiles(document, 'en-us.properties', { targetDocument });

    expect(result.files['zh-cn.properties']).toContain('# source title');
    expect(result.files['en-us.properties']).toContain('! translated header');
    expect(result.files['en-us.properties']).toContain('# target title');
    expect(result.files['en-us.properties']).toContain('title=Home');
    expect(result.files['en-us.properties']).toContain('# source subtitle\nsubtitle=Subtitle');
  });

  it('preserves TS comments and file type while replacing translated values', () => {
    const document = withTranslations(
      parseTs(
        [
          '// locale file',
          'export default {',
          '  // title copy',
          "  title: '首页',",
          '};',
        ].join('\n'),
        { sourceName: 'zh-cn.ts', locale: 'zh-CN' },
      ),
      { title: 'Home' },
    );

    const result = buildDualExportFiles(document);

    expect(result.files['zh-cn.ts']).toContain('// locale file');
    expect(result.files['zh-cn.ts']).toContain("title: '首页'");
    expect(result.files['en-us.ts']).toContain('// title copy');
    expect(result.files['en-us.ts']).toContain("title: 'Home'");
  });

  it('uses uploaded target TS template for translated file comments', () => {
    const document = withTranslations(
      parseTs(
        [
          '// source locale file',
          'export default {',
          "  title: '首页',",
          '};',
        ].join('\n'),
        { sourceName: 'zh-cn.ts', locale: 'zh-CN' },
      ),
      { title: 'Home' },
    );
    const targetDocument = parseTs(
      [
        '// target locale file',
        'export default {',
        '  // translated title',
        "  title: 'Old home',",
        '};',
      ].join('\n'),
      { sourceName: 'en-us.ts', locale: 'en-US' },
    );

    const result = buildDualExportFiles(document, 'en-us.ts', { targetDocument });

    expect(result.files['zh-cn.ts']).toContain('// source locale file');
    expect(result.files['en-us.ts']).toContain('// target locale file');
    expect(result.files['en-us.ts']).toContain('// translated title');
    expect(result.files['en-us.ts']).toContain("title: 'Home'");
  });
});
