/**
 * Minimal RFC4180-ish CSV parser (no external dependency): handles quoted fields with
 * embedded commas/newlines/escaped quotes ("") and both CRLF/LF line endings. Assumes UTF-8
 * text (Excel on Windows often exports Shift_JIS instead — if a CSV looks garbled, re-save it
 * as "CSV UTF-8" first).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // skip; \n (below) closes the row
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function splitMultiValue(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[,、]/).map((v) => v.trim()).filter(Boolean);
}

/** Resolves a list of names (e.g. from a comma-separated CSV cell) against a master list by exact name match. */
export function resolveNamesToIds(names: string[], options: { id: number; name: string }[]): { ids: number[]; unmatched: string[] } {
  const ids: number[] = [];
  const unmatched: string[] = [];
  for (const name of names) {
    const match = options.find((o) => o.name === name);
    if (match) ids.push(match.id);
    else unmatched.push(name);
  }
  return { ids, unmatched };
}

export function downloadCsvTemplate(filename: string, headers: string[]) {
  const bom = "﻿";
  const content = bom + headers.map((h) => (h.includes(",") ? `"${h}"` : h)).join(",") + "\r\n";
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
