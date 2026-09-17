/** Tokenizer for the MATLAB-syntax subset understood by the lab console. */

export type TokenType =
  | "num"
  | "str"
  | "id"
  | "kw"
  | "op"
  | "newline"
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  /** True when whitespace immediately precedes this token (matters inside `[...]`). */
  spaceBefore: boolean;
  line: number;
}

export const KEYWORDS = new Set([
  "if", "elseif", "else", "end", "for", "while", "break", "continue", "function", "return",
]);

const THREE = ["...", "&&", "||"];
const TWO = [".*", "./", ".\\", ".^", ".'", "==", "~=", "<=", ">=", "&&", "||"];
const ONE = "+-*/\\^'()[]{}=<>&|~,;:@.";

export class SyntaxError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
    this.name = "SyntaxError";
  }
}

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  let space = false;
  const push = (type: TokenType, value: string) => {
    out.push({ type, value, spaceBefore: space, line });
    space = false;
  };
  const prevAllowsTranspose = (): boolean => {
    const p = out[out.length - 1];
    if (!p || space) return false;
    if (p.type === "num" || p.type === "id" || p.type === "str") return true;
    return p.type === "op" && (p.value === ")" || p.value === "]" || p.value === "}" || p.value === "'" || p.value === ".'");
  };
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\r") { i++; space = true; continue; }
    if (c === "\n") { push("newline", "\n"); i++; line++; continue; }
    if (c === "%" || (c === "#" && src[i + 1] !== "(")) {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (src.startsWith("...", i)) { // line continuation: skip to next line
      while (i < src.length && src[i] !== "\n") i++;
      i++; line++; space = true; continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
      push("num", m[0]);
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      push(KEYWORDS.has(m[0]) ? "kw" : "id", m[0]);
      i += m[0].length;
      continue;
    }
    if (c === '"' || (c === "'" && !prevAllowsTranspose())) {
      const q = c;
      let j = i + 1;
      let s = "";
      for (;;) {
        if (j >= src.length || src[j] === "\n") throw new SyntaxError("Unterminated string", line);
        if (src[j] === q) {
          if (src[j + 1] === q) { s += q; j += 2; continue; }
          break;
        }
        s += src[j]!;
        j++;
      }
      push("str", s);
      i = j + 1;
      continue;
    }
    const three = THREE.find((t) => src.startsWith(t, i));
    if (three) { push("op", three); i += 3; continue; }
    const two = TWO.find((t) => src.startsWith(t, i));
    if (two) { push("op", two); i += 2; continue; }
    if (ONE.includes(c)) { push("op", c); i++; continue; }
    throw new SyntaxError(`Unexpected character '${c}'`, line);
  }
  push("newline", "\n");
  push("eof", "");
  return out;
}
