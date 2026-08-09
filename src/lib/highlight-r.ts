// Lightweight R tokenizer for the script pane's syntax spans (plan Unit 6).
// Plain semantic HTML: tokens are real text in spans — screen readers read the
// code as text; color is decoration and never the only signal.

export type RTokenType =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "function"
  | "operator"
  | "identifier"
  | "plain";

export interface RToken {
  type: RTokenType;
  text: string;
}

const kKeywords = new Set([
  "if", "else", "for", "while", "repeat", "function", "in", "next", "break",
  "TRUE", "FALSE", "NULL", "NA", "Inf", "NaN"
]);

const kPattern =
  /(#[^\n]*)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(`(?:[^`\\]|\\.)*`)|(\d+\.?\d*(?:[eE][+-]?\d+)?)|([A-Za-z._][A-Za-z0-9._]*)|(<-|\|>|%in%|[=<>!+\-*/^~$@?:,;()[\]{}])|(\s+)|(.)/g;

// Tokenize one line of R (lines are the pane's DOM unit — Pretext contract).
export function tokenizeRLine(line: string): RToken[] {
  const tokens: RToken[] = [];
  kPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = kPattern.exec(line)) !== null) {
    const [, comment, dq, sq, backtick, num, ident, op, space, other] = match;
    if (comment != null) {tokens.push({ type: "comment", text: comment });}
    else if (dq != null) {tokens.push({ type: "string", text: dq });}
    else if (sq != null) {tokens.push({ type: "string", text: sq });}
    else if (backtick != null) {tokens.push({ type: "identifier", text: backtick });}
    else if (num != null) {tokens.push({ type: "number", text: num });}
    else if (ident != null) {
      if (kKeywords.has(ident)) {
        tokens.push({ type: "keyword", text: ident });
      } else {
        // Function when directly followed by "(".
        const rest = line.slice(kPattern.lastIndex);
        tokens.push({ type: rest.startsWith("(") ? "function" : "identifier", text: ident });
      }
    } else if (op != null) {tokens.push({ type: "operator", text: op });}
    else if (space != null) {tokens.push({ type: "plain", text: space });}
    else if (other != null) {tokens.push({ type: "plain", text: other });}
  }
  return tokens;
}
