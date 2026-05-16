/**
 * Flatten a nested JSON object into a map of dot-notation key → value.
 * Only string leaf values are kept; non-string values produce null.
 * Arrays are iterated with numeric indices.
 */
export function flatten(
  obj: Record<string, unknown>,
  prefix: string[] = [],
): Map<string, string | null> {
  const result = new Map<string, string | null>();

  for (const [key, value] of Object.entries(obj)) {
    const keyPath = [...prefix, key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested object
      const nested = flatten(value as Record<string, unknown>, keyPath);
      for (const [k, v] of nested) {
        result.set(k, v);
      }
    } else if (typeof value === 'string') {
      result.set(keyPath.join('.'), value);
    } else {
      // Non-string value (number, boolean, null, array)
      result.set(keyPath.join('.'), null);
    }
  }

  return result;
}

/**
 * Unflatten a map of dot-notation keys back into a nested JSON object.
 * Only entries with non-null string values are included in the output.
 */
export function unflatten(
  flat: Map<string, string | null>,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const [dotKey, value] of flat) {
    if (value === null) continue;
    const parts = dotKey.split('.');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current[part] = value;
      } else {
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
    }
  }

  return root;
}
