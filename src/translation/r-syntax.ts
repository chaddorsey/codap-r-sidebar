// R source-generation helpers: name sanitization, literals, and pipes.
// Deterministic by construction — same inputs, same strings (plan Unit 3).

const kReservedWords = new Set([
  "if", "else", "repeat", "while", "function", "for", "in", "next", "break",
  "TRUE", "FALSE", "NULL", "Inf", "NaN", "NA", "NA_integer_", "NA_real_",
  "NA_character_", "T", "F"
]);

const kSyntacticName = /^[a-zA-Z.][a-zA-Z0-9._]*$/;

export function isSyntacticName(name: string): boolean {
  return kSyntacticName.test(name) && !kReservedWords.has(name);
}

// Dataset variable names must be syntactic (they are rebound constantly).
// "Sleep Data (2024)" -> "sleep_data_2024". Deterministic; collisions get a
// numeric suffix via the engine's name registry.
export function sanitizeVariableName(name: string): string {
  let result = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (result === "" || /^[0-9]/.test(result)) result = `data_${result}`;
  if (kReservedWords.has(result)) result = `${result}_data`;
  return result;
}

// Attribute references inside tidyverse verbs keep their CODAP spelling,
// backtick-quoted when non-syntactic — idiomatic and preserves learner-visible
// names ("Heart Rate" stays recognizable).
export function attrRef(name: string): string {
  return isSyntacticName(name) ? name : `\`${name.replace(/`/g, "\\`")}\``;
}

export function rString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

export function rValue(value: unknown): string {
  if (value == null || value === "") return "NA";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NA";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return rString(String(value));
}

export function rNumericVector(values: number[]): string {
  return values.length === 1 ? String(values[0]) : `c(${values.join(", ")})`;
}

// One dplyr step in the ratified rebind model: `mammals <- mammals |> verb(...)`.
export function rebindStep(varName: string, verbCall: string): string {
  return `${varName} <- ${varName} |>\n  ${verbCall}`;
}
