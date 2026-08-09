// Snapshot items -> CSV (plan Unit 5 data provisioning contract). The same
// CSV text is written into each webR instance's VFS at the path the preamble
// references, and into the export bundle — one vintage, all consumers.

export function itemsToCsv(items: Record<string, unknown>[]): string {
  const headers: string[] = [];
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  // case_id leads when present (replayable case-level moves depend on it).
  const caseIdIndex = headers.indexOf("case_id");
  if (caseIdIndex > 0) {
    headers.splice(caseIdIndex, 1);
    headers.unshift("case_id");
  }

  const lines = [headers.map(csvField).join(",")];
  for (const item of items) {
    lines.push(headers.map(h => csvValue(item[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvValue(value: unknown): string {
  // NA unquoted: read.csv parses it as missing for every column type.
  if (value == null || value === "") return "NA";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NA";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return csvField(String(value));
}

function csvField(text: string): string {
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}
