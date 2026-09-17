/** Recursive-descent parser producing a small AST for the MATLAB subset. */

import { tokenize, SyntaxError, type Token } from "./lexer.ts";

export type Expr =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "id"; name: string }
  | { kind: "colon" } // bare `:` inside an index
  | { kind: "end" } // `end` inside an index
  | { kind: "unary"; op: string; arg: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "postfix"; op: string; arg: Expr }
  | { kind: "range"; start: Expr; step: Expr | null; stop: Expr }
  | { kind: "matrix"; rows: Expr[][] }
  | { kind: "index"; target: Expr; args: Expr[] } // call or index
  | { kind: "field"; target: Expr; name: string }
  | { kind: "anon"; params: string[]; body: Expr }
  | { kind: "handle"; name: string };

export type LValue =
  | { kind: "id"; name: string }
  | { kind: "index"; target: Expr; args: Expr[] }
  | { kind: "field"; target: Expr; name: string };

export type Stmt =
  | { kind: "expr"; expr: Expr; show: boolean; line: number }
  | { kind: "assign"; targets: LValue[]; expr: Expr; show: boolean; line: number }
  | { kind: "if"; branches: { cond: Expr; body: Stmt[] }[]; otherwise: Stmt[] | null; line: number }
  | { kind: "for"; name: string; iter: Expr; body: Stmt[]; line: number }
  | { kind: "while"; cond: Expr; body: Stmt[]; line: number }
  | { kind: "break"; line: number }
  | { kind: "continue"; line: number }
  | { kind: "return"; line: number }
  | { kind: "function"; name: string; params: string[]; outputs: string[]; body: Stmt[]; line: number };

export function parse(src: string): Stmt[] {
  return new Parser(tokenize(src)).program();
}

class Parser {
  private pos = 0;
  /** Nesting depth inside `[...]`/`{...}` where whitespace separates elements. */
  private matrixDepth = 0;
  /** Nesting depth inside `(...)` (whitespace not significant). */
  private parenDepth = 0;
  private indexDepth = 0;

  private toks: Token[];
  constructor(toks: Token[]) {
    this.toks = toks;
  }

  private peek(offset = 0): Token {
    return this.toks[Math.min(this.pos + offset, this.toks.length - 1)]!;
  }
  private next(): Token {
    return this.toks[this.pos++]!;
  }
  private is(type: string, value?: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === type && (value === undefined || t.value === value);
  }
  private isOp(value: string, offset = 0): boolean {
    return this.is("op", value, offset);
  }
  private expectOp(value: string): Token {
    if (!this.isOp(value)) this.fail(`Expected '${value}' but found '${this.peek().value || "end of input"}'`);
    return this.next();
  }
  private fail(msg: string): never {
    throw new SyntaxError(msg, this.peek().line);
  }
  private skipNewlines(): void {
    while (this.is("newline") || this.isOp(";") || this.isOp(",")) this.next();
  }

  program(): Stmt[] {
    const stmts: Stmt[] = [];
    this.skipNewlines();
    while (!this.is("eof")) {
      stmts.push(this.statement());
      this.skipNewlines();
    }
    return stmts;
  }

  private block(terminators: string[]): Stmt[] {
    const body: Stmt[] = [];
    this.skipNewlines();
    while (!(this.is("kw") && terminators.includes(this.peek().value))) {
      if (this.is("eof")) this.fail(`Expected '${terminators.join("' or '")}' before end of input`);
      body.push(this.statement());
      this.skipNewlines();
    }
    return body;
  }

  private terminator(): boolean {
    // Returns `show`: true unless the statement ends with ';'.
    if (this.isOp(";")) { this.next(); return false; }
    if (this.isOp(",")) { this.next(); return true; }
    if (this.is("newline") || this.is("eof")) return true;
    if (this.is("kw")) return true; // e.g. `if x, y = 1, end`
    this.fail(`Unexpected '${this.peek().value}'`);
  }

  private statement(): Stmt {
    const line = this.peek().line;
    if (this.is("kw")) {
      const kw = this.peek().value;
      switch (kw) {
        case "if": return this.ifStmt();
        case "for": return this.forStmt();
        case "while": return this.whileStmt();
        case "function": return this.functionStmt();
        case "break": this.next(); this.terminator(); return { kind: "break", line };
        case "continue": this.next(); this.terminator(); return { kind: "continue", line };
        case "return": this.next(); this.terminator(); return { kind: "return", line };
        default: this.fail(`Unexpected keyword '${kw}'`);
      }
    }
    // Command syntax: `hold on`, `format long`, `axis equal`, `grid on`, `clear x`, `close all`.
    if (this.is("id") && this.is("id", undefined, 1) && this.peek(1).spaceBefore && !this.isOp("=", 2) && !this.isOp("(", 2)) {
      const name = this.next().value;
      const args: Expr[] = [];
      while (this.is("id") || this.is("num")) args.push({ kind: "str", value: this.next().value });
      const show = this.terminator();
      return { kind: "expr", expr: { kind: "index", target: { kind: "id", name }, args }, show, line };
    }
    // Multi-assignment `[a, b] = f(...)`.
    if (this.isOp("[")) {
      const save = this.pos;
      const targets = this.tryLValueList();
      if (targets && this.isOp("=") && !this.isOp("==")) {
        this.next();
        const expr = this.expression();
        const show = this.terminator();
        return { kind: "assign", targets, expr, show, line };
      }
      this.pos = save;
    }
    const expr = this.expression();
    if (this.isOp("=")) {
      this.next();
      const target = this.toLValue(expr);
      const value = this.expression();
      const show = this.terminator();
      return { kind: "assign", targets: [target], expr: value, show, line };
    }
    const show = this.terminator();
    return { kind: "expr", expr, show, line };
  }

  private tryLValueList(): LValue[] | null {
    try {
      this.expectOp("[");
      const targets: LValue[] = [];
      this.matrixDepth++;
      while (!this.isOp("]")) {
        if (this.isOp(",")) { this.next(); continue; }
        if (this.isOp("~")) { this.next(); targets.push({ kind: "id", name: "~" }); continue; }
        targets.push(this.toLValue(this.postfix()));
      }
      this.matrixDepth--;
      this.next();
      return targets;
    } catch {
      this.matrixDepth = 0;
      return null;
    }
  }

  private toLValue(e: Expr): LValue {
    if (e.kind === "id") return e;
    if (e.kind === "index" && (e.target.kind === "id" || e.target.kind === "field")) return { kind: "index", target: e.target, args: e.args };
    if (e.kind === "field") return e;
    this.fail("Invalid assignment target");
  }

  private ifStmt(): Stmt {
    const line = this.next().line;
    const branches: { cond: Expr; body: Stmt[] }[] = [];
    let otherwise: Stmt[] | null = null;
    branches.push({ cond: this.expression(), body: this.block(["elseif", "else", "end"]) });
    for (;;) {
      const kw = this.next().value;
      if (kw === "elseif") branches.push({ cond: this.expression(), body: this.block(["elseif", "else", "end"]) });
      else if (kw === "else") otherwise = this.block(["end"]);
      else break;
    }
    return { kind: "if", branches, otherwise, line };
  }

  private forStmt(): Stmt {
    const line = this.next().line;
    const paren = this.isOp("(");
    if (paren) this.next();
    if (!this.is("id")) this.fail("Expected loop variable after 'for'");
    const name = this.next().value;
    this.expectOp("=");
    const iter = this.expression();
    if (paren) this.expectOp(")");
    const body = this.block(["end"]);
    this.next();
    return { kind: "for", name, iter, body, line };
  }

  private whileStmt(): Stmt {
    const line = this.next().line;
    const cond = this.expression();
    const body = this.block(["end"]);
    this.next();
    return { kind: "while", cond, body, line };
  }

  private functionStmt(): Stmt {
    const line = this.next().line;
    let outputs: string[] = [];
    let name: string;
    if (this.isOp("[")) {
      this.next();
      while (!this.isOp("]")) {
        if (this.isOp(",")) { this.next(); continue; }
        if (!this.is("id")) this.fail("Expected output name");
        outputs.push(this.next().value);
      }
      this.next();
      this.expectOp("=");
      name = this.next().value;
    } else {
      const first = this.next().value;
      if (this.isOp("=")) { this.next(); outputs = [first]; name = this.next().value; }
      else name = first;
    }
    const params: string[] = [];
    if (this.isOp("(")) {
      this.next();
      while (!this.isOp(")")) {
        if (this.isOp(",")) { this.next(); continue; }
        if (this.isOp("~")) { this.next(); params.push("~"); continue; }
        if (!this.is("id")) this.fail("Expected parameter name");
        params.push(this.next().value);
      }
      this.next();
    }
    const body = this.block(["end"]);
    this.next();
    return { kind: "function", name, params, outputs, body, line };
  }

  // ---- expressions -------------------------------------------------------

  expression(): Expr {
    return this.orOr();
  }

  private binaryLevel(ops: string[], nextLevel: () => Expr): Expr {
    let left = nextLevel();
    for (;;) {
      const t = this.peek();
      if (t.type !== "op" || !ops.includes(t.value)) break;
      if (this.elementBoundary(t)) break;
      this.next();
      const right = nextLevel();
      left = { kind: "binary", op: t.value, left, right };
    }
    return left;
  }

  /** Inside `[...]`, `a -b` is two elements while `a - b` and `a-b` are one. */
  private elementBoundary(t: Token): boolean {
    if (this.matrixDepth === 0 || this.parenDepth > 0) return false;
    if (t.value !== "+" && t.value !== "-") return false;
    return t.spaceBefore && !this.peek(1).spaceBefore;
  }

  private orOr(): Expr { return this.binaryLevel(["||"], () => this.andAnd()); }
  private andAnd(): Expr { return this.binaryLevel(["&&"], () => this.or()); }
  private or(): Expr { return this.binaryLevel(["|"], () => this.and()); }
  private and(): Expr { return this.binaryLevel(["&"], () => this.comparison()); }
  private comparison(): Expr { return this.binaryLevel(["==", "~=", "<", "<=", ">", ">="], () => this.range()); }

  private range(): Expr {
    const start = this.additive();
    if (!this.isOp(":") || this.rangeStops()) return start;
    this.next();
    const second = this.additive();
    if (this.isOp(":") && !this.rangeStops()) {
      this.next();
      const stop = this.additive();
      return { kind: "range", start, step: second, stop };
    }
    return { kind: "range", start, step: null, stop: second };
  }

  /** A `:` directly followed by `)` or `,` inside an index is not a range. */
  private rangeStops(): boolean {
    const n = this.peek(1);
    return n.type === "op" && (n.value === ")" || n.value === "," || n.value === "]");
  }

  private additive(): Expr { return this.binaryLevel(["+", "-"], () => this.multiplicative()); }
  private multiplicative(): Expr { return this.binaryLevel(["*", "/", "\\", ".*", "./", ".\\"], () => this.unary()); }

  private unary(): Expr {
    if (this.isOp("-") || this.isOp("+") || this.isOp("~") || this.isOp("!")) {
      const op = this.next().value;
      return { kind: "unary", op, arg: this.unary() };
    }
    return this.power();
  }

  private power(): Expr {
    const base = this.postfix();
    if (this.isOp("^") || this.isOp(".^")) {
      const op = this.next().value;
      // MATLAB: 2^-1 is legal; exponent binds tighter than unary minus on the base.
      let exponent: Expr;
      if (this.isOp("-") || this.isOp("+")) { const u = this.next().value; exponent = { kind: "unary", op: u, arg: this.power() }; }
      else exponent = this.power();
      return { kind: "binary", op, left: base, right: exponent };
    }
    return base;
  }

  private postfix(): Expr {
    let e = this.primary();
    for (;;) {
      if (this.isOp("(") && !(this.matrixDepth > 0 && this.parenDepth === 0 && this.peek().spaceBefore)) {
        this.next();
        const args = this.argList(")");
        e = { kind: "index", target: e, args };
      } else if (this.isOp("{") && !this.peek().spaceBefore) {
        this.next();
        const args = this.argList("}");
        e = { kind: "index", target: e, args };
      } else if (this.isOp(".") && this.is("id", undefined, 1) && !this.peek().spaceBefore) {
        this.next();
        e = { kind: "field", target: e, name: this.next().value };
      } else if ((this.isOp("'") || this.isOp(".'")) && !this.peek().spaceBefore) {
        this.next();
        e = { kind: "postfix", op: "'", arg: e };
      } else break;
    }
    return e;
  }

  private argList(close: string): Expr[] {
    const args: Expr[] = [];
    const savedMatrix = this.matrixDepth;
    this.matrixDepth = 0;
    this.parenDepth++;
    this.indexDepth++;
    while (!this.isOp(close)) {
      if (this.isOp(",")) { this.next(); continue; }
      if (this.isOp(":") && (this.isOp(",", 1) || this.isOp(close, 1))) { this.next(); args.push({ kind: "colon" }); continue; }
      args.push(this.expression());
    }
    this.next();
    this.indexDepth--;
    this.parenDepth--;
    this.matrixDepth = savedMatrix;
    return args;
  }

  private primary(): Expr {
    const t = this.peek();
    if (t.type === "num") { this.next(); return { kind: "num", value: Number(t.value) }; }
    if (t.type === "str") { this.next(); return { kind: "str", value: t.value }; }
    if (t.type === "id") { this.next(); return { kind: "id", name: t.value }; }
    if (t.type === "kw" && t.value === "end" && this.indexDepth > 0) { this.next(); return { kind: "end" }; }
    if (t.type === "op") {
      if (t.value === "(") {
        this.next();
        const savedMatrix = this.matrixDepth;
        this.matrixDepth = 0;
        this.parenDepth++;
        const e = this.expression();
        this.parenDepth--;
        this.matrixDepth = savedMatrix;
        this.expectOp(")");
        return e;
      }
      if (t.value === "[") return this.matrixLiteral();
      if (t.value === "@") {
        this.next();
        if (this.isOp("(")) {
          this.next();
          const params: string[] = [];
          while (!this.isOp(")")) {
            if (this.isOp(",")) { this.next(); continue; }
            if (this.isOp("~")) { this.next(); params.push("~"); continue; }
            if (!this.is("id")) this.fail("Expected parameter name in anonymous function");
            params.push(this.next().value);
          }
          this.next();
          const savedMatrix = this.matrixDepth, savedParen = this.parenDepth;
          this.matrixDepth = 0; this.parenDepth = 0;
          const body = this.expression();
          this.matrixDepth = savedMatrix; this.parenDepth = savedParen;
          return { kind: "anon", params, body };
        }
        if (this.is("id")) return { kind: "handle", name: this.next().value };
        this.fail("Expected '(' or function name after '@'");
      }
    }
    if (t.type === "eof" || t.type === "newline") this.fail("Unexpected end of expression");
    this.fail(`Unexpected '${t.value}'`);
  }

  private matrixLiteral(): Expr {
    this.expectOp("[");
    const savedParen = this.parenDepth;
    this.parenDepth = 0;
    this.matrixDepth++;
    const rows: Expr[][] = [];
    let row: Expr[] = [];
    for (;;) {
      if (this.isOp("]")) break;
      if (this.is("eof")) this.fail("Unterminated matrix literal");
      if (this.isOp(";") || this.is("newline")) { this.next(); if (row.length) rows.push(row); row = []; continue; }
      if (this.isOp(",")) { this.next(); continue; }
      row.push(this.expression());
    }
    this.next();
    if (row.length) rows.push(row);
    this.matrixDepth--;
    this.parenDepth = savedParen;
    return { kind: "matrix", rows };
  }
}
