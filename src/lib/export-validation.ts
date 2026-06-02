export type ExportValidationError = {
  field: string;
  message: string;
};

export function exportValidationKey(field: string) {
  const prefix = "entries.";
  const suffixes = [".translatedValue", ".sourceValue", ".key"];
  if (!field.startsWith(prefix)) return field;
  const withoutPrefix = field.slice(prefix.length);
  const suffix = suffixes.find((item) => withoutPrefix.endsWith(item));
  return suffix ? withoutPrefix.slice(0, -suffix.length) : withoutPrefix;
}

export function exportValidationMessage(error: ExportValidationError) {
  const key = exportValidationKey(error.field);
  if (error.field.endsWith(".translatedValue")) {
    return `Key「${key}」缺少英文译文`;
  }
  if (error.field.endsWith(".sourceValue")) {
    return `Key「${key}」缺少中文基准`;
  }
  if (error.field.endsWith(".key")) {
    return `Key「${key}」的键名无效`;
  }
  return `${key}：${error.message}`;
}

export function summarizeExportValidationErrors(errors: ExportValidationError[]) {
  if (errors.length === 0) return "导出前校验未通过，请检查当前任务内容。";

  const missingTranslations = errors.filter((error) => error.field.endsWith(".translatedValue"));
  if (missingTranslations.length > 0) {
    const examples = missingTranslations.slice(0, 3).map((error) => `「${exportValidationKey(error.field)}」`);
    const rest = missingTranslations.length - examples.length;
    return [
      `导出失败：还有 ${missingTranslations.length} 条没有英文译文。`,
      `请先补全英文译文后再导出。`,
      `示例：${examples.join("、")}${rest > 0 ? ` 等 ${rest} 条` : ""}。`,
    ].join("");
  }

  const examples = errors.slice(0, 3).map(exportValidationMessage);
  const rest = errors.length - examples.length;
  return `导出前校验未通过：${examples.join("；")}${rest > 0 ? `；另有 ${rest} 条错误` : ""}。`;
}
