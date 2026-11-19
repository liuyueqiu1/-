const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export const FORMULA_INJECTION_NOTE =
  "以=、+、-、@、制表符或回车开头的单元格已加前导单引号，用来降低电子表格把内容当成公式执行的风险。这不是加密。";

export function escapeCsvCell(raw: string): string {
  let value = raw ?? "";
  if (FORMULA_PREFIX.test(value)) value = `'${value}`;
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: string[][]): string {
  const body = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\r\n");
  return `\uFEFF${body}\r\n`;
}
