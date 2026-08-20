/**
 * CSV writer matching csv-writer's output, which is what the CLI produced and
 * what both platforms have accepted for a year. Fields are quoted only when
 * they contain a delimiter, a quote or a newline; records end with "\n".
 */

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(
  headers: string[],
  rows: string[][],
  options: { bom: boolean },
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','))
  // Adobe Stock needs the BOM; Shutterstock's own template ships without one
  // and its parser reads the header literally, so a BOM breaks the first column.
  return (options.bom ? '\uFEFF' : '') + lines.join('\n') + '\n'
}

/** metadata_<folder>_<timestamp>.csv — same naming as the CLI. */
export function csvFileName(prefix: string, folderName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${prefix}_${folderName}_${timestamp}.csv`
}
