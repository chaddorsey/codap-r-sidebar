import { attrRef, isSyntacticName } from "./r-syntax";

// CODAP formula -> R expression translation (plan Unit 3). The supported
// subset is an explicit mapping table; anything outside throws
// UntranslatableFormulaError and the caller emits the ratified comment-block
// fallback. The boundary grows empirically against real classroom formulas.

export class UntranslatableFormulaError extends Error {
  constructor(readonly formula: string, readonly reason: string) {
    super(`Cannot translate CODAP formula "${formula}": ${reason}`);
  }
}

// CODAP function name (lowercased) -> R function name. Direct matches included
// explicitly so unknown functions fail loudly instead of passing through.
const kFunctionMap = new Map<string, string>([
  ["mean", "mean"],
  ["median", "median"],
  ["sum", "sum"],
  ["min", "min"],
  ["max", "max"],
  ["abs", "abs"],
  ["sqrt", "sqrt"],
  ["exp", "exp"],
  ["round", "round"],
  ["floor", "floor"],
  ["ceiling", "ceiling"],
  // CODAP's ln is natural log; CODAP's log is base 10 — R's log/log10.
  ["ln", "log"],
  ["log", "log10"],
  ["if", "ifelse"],
  ["count", "n"],
  ["caseindex", "row_number"],
  ["concat", "paste0"],
  ["not", "!"]
]);

const kBoolMap = new Map<string, string>([
  ["true", "TRUE"],
  ["false", "FALSE"]
]);

type Token =
  | { kind: "string"; text: string }
  | { kind: "number"; text: string }
  | { kind: "ident"; text: string }
  | { kind: "op"; text: string }
  | { kind: "space"; text: string };

const kTokenPattern =
  /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(\d+\.?\d*(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)|(`(?:[^`\\]|\\.)*`)|(!=|<=|>=|≠|[=<>+\-*/^(),%&|!])|(\s+)/y;

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < formula.length) {
    kTokenPattern.lastIndex = index;
    const match = kTokenPattern.exec(formula);
    if (!match) {
      throw new UntranslatableFormulaError(
        formula,
        `unrecognized syntax at "${formula.slice(index, index + 8)}"`
      );
    }
    index = kTokenPattern.lastIndex;
    const [, dq, sq, num, ident, backtick, op, space] = match;
    if (dq != null) tokens.push({ kind: "string", text: dq });
    else if (sq != null) tokens.push({ kind: "string", text: `"${sq.slice(1, -1)}"` });
    else if (num != null) tokens.push({ kind: "number", text: num });
    else if (ident != null) tokens.push({ kind: "ident", text: ident });
    else if (backtick != null) tokens.push({ kind: "ident", text: backtick.slice(1, -1) });
    else if (op != null) tokens.push({ kind: "op", text: op });
    else if (space != null) tokens.push({ kind: "space", text: " " });
  }
  return tokens;
}

export interface FormulaTranslationOptions {
  // Attribute names known in this context; identifiers outside this set that
  // are not booleans/logical words are still treated as attribute references
  // (CODAP formulas only reference attributes and globals).
  knownAttrs?: string[];
}

export function translateFormula(formula: string, options?: FormulaTranslationOptions): string {
  const tokens = tokenize(formula).filter(t => t.kind !== "space");
  const out: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];

    switch (token.kind) {
      case "string":
      case "number":
        out.push(token.text);
        break;
      case "op": {
        // CODAP uses single = for equality; ≠ for not-equal.
        if (token.text === "=") {
          out.push("==");
        } else if (token.text === "≠") {
          out.push("!=");
        } else if (token.text === "%") {
          throw new UntranslatableFormulaError(formula, "the % operator is not supported");
        } else {
          out.push(token.text);
        }
        break;
      }
      case "ident": {
        const lower = token.text.toLowerCase();
        const isCall = next?.kind === "op" && next.text === "(";
        if (isCall) {
          const mapped = kFunctionMap.get(lower);
          if (!mapped) {
            throw new UntranslatableFormulaError(
              formula,
              `the function ${token.text}() is not in the supported subset yet`
            );
          }
          if (mapped === "!") {
            out.push("!");
            // not(x) -> !(x): keep the parenthesis from the call.
          } else {
            out.push(mapped);
          }
          break;
        }
        if (kBoolMap.has(lower)) {
          out.push(kBoolMap.get(lower)!);
          break;
        }
        if (lower === "and") {
          out.push("&");
          break;
        }
        if (lower === "or") {
          out.push("|");
          break;
        }
        // Bare identifier: an attribute (or global) reference.
        out.push(attrRef(token.text));
        break;
      }
      default:
        break;
    }
  }

  return joinTokens(out);
}

// Spacing rules: binary operators spaced, calls/parens/commas tight.
function joinTokens(parts: string[]): string {
  const spacedOps = new Set(["==", "!=", "<", ">", "<=", ">=", "+", "-", "*", "/", "&", "|"]);
  let result = "";
  for (const [i, part] of parts.entries()) {
    const prev = parts[i - 1];
    if (i === 0) {
      result = part;
    } else if (part === "(" || part === ")" || part === ",") {
      result += part;
    } else if (prev === "(" || prev === "!") {
      result += part;
    } else if (spacedOps.has(part) || (prev != null && spacedOps.has(prev)) || prev === ",") {
      result += ` ${part}`.replace(/\( /, "(");
      if (prev === ",") result = `${result}`;
    } else {
      result += part;
    }
  }
  // Normalize ", x" spacing introduced above.
  return result.replace(/,(?=\S)/g, ", ");
}

// Convenience: is this formula inside the supported subset?
export function isTranslatableFormula(formula: string, options?: FormulaTranslationOptions): boolean {
  try {
    translateFormula(formula, options);
    return true;
  } catch {
    return false;
  }
}

export { isSyntacticName };
