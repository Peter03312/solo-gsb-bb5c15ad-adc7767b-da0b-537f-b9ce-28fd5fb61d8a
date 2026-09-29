/** 解析 "mm:ss" 或纯秒数字符串,非法输入返回 null */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const v = Number(t);
    return v > 0 ? v : null;
  }
  const m = t.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (m) {
    const v = Number(m[1]) * 60 + Number(m[2]);
    return v > 0 ? v : null;
  }
  return null;
}

/** 秒 → "m:ss" */
export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmt(value: number | null, digits = 1, unit = ''): string {
  return value === null ? '—' : `${value.toFixed(digits)}${unit}`;
}
