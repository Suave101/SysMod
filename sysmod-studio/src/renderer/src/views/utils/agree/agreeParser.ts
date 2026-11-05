/**
 * Parser for the subset of the AGREE annex language that SysMod can verify locally.
 * Supported: assume, guarantee, lemma, assert, eq, const, and the expression operators
 * that map one-to-one onto Lustre. Anything else is reported as an error, not ignored.
 */

export type AgreeType = 'bool' | 'int' | 'real';

export type AgreeExpr =
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; text: string; isReal: boolean }
  | { kind: 'id'; path: string[]; line: number }
  | { kind: 'unary'; op: 'not' | '-' | 'pre'; operand: AgreeExpr }
  | { kind: 'binary'; op: string; left: AgreeExpr; right: AgreeExpr }
  | { kind: 'prev'; value: AgreeExpr; initial: AgreeExpr }
  | { kind: 'ite'; cond: AgreeExpr; then: AgreeExpr; else: AgreeExpr };

export type AgreeStatement =
  | { kind: 'assume' | 'guarantee' | 'lemma' | 'assert'; name?: string; description: string; expr: AgreeExpr; line: number }
  | { kind: 'eq' | 'const'; name: string; type: AgreeType; expr: AgreeExpr; line: number };

export interface AgreeError {
  line: number;
  message: string;
}

export interface AgreeAnnex {
  statements: AgreeStatement[];
  errors: AgreeError[];
}

interface Token {
  kind: 'id' | 'number' | 'string' | 'op' | 'eof';
  text: string;
  line: number;
}

const OPERATORS = ['<=>', '->', '=>', '<>', '<=', '>=', '=', '<', '>', '+', '-', '*', '/', '(', ')', ',', ';', ':', '.'];

const UNSUPPORTED_KEYWORDS = new Set([
  'node', 'fun', 'linearization', 'record', 'enum', 'property', 'initially', 'parent', 'this', 'event',
  'floor', 'real', 'connection', 'spec', 'synchrony', 'calendar', 'lift', 'reachable', 'interval',
]);

function tokenize(source: string): { tokens: Token[]; errors: AgreeError[] } {
  const tokens: Token[] = [];
  const errors: AgreeError[] = [];
  let pos = 0;
  let line = 1;

  while (pos < source.length) {
    const ch = source[pos];
    if (ch === '\n') {
      line++;
      pos++;
    } else if (/\s/.test(ch)) {
      pos++;
    } else if (source.startsWith('--', pos)) {
      while (pos < source.length && source[pos] !== '\n') pos++;
    } else if (ch === '"') {
      const end = source.indexOf('"', pos + 1);
      if (end < 0) {
        errors.push({ line, message: 'Unterminated string' });
        break;
      }
      tokens.push({ kind: 'string', text: source.slice(pos + 1, end), line });
      line += source.slice(pos, end).split('\n').length - 1;
      pos = end + 1;
    } else if (/[0-9]/.test(ch)) {
      const match = /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(source.slice(pos)) as RegExpExecArray;
      tokens.push({ kind: 'number', text: match[0], line });
      pos += match[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(pos)) as RegExpExecArray;
      tokens.push({ kind: 'id', text: match[0], line });
      pos += match[0].length;
    } else {
      const op = OPERATORS.find((o) => source.startsWith(o, pos));
      if (!op) {
        errors.push({ line, message: `Unexpected character "${ch}"` });
        pos++;
        continue;
      }
      tokens.push({ kind: 'op', text: op, line });
      pos += op.length;
    }
  }

  tokens.push({ kind: 'eof', text: '', line });
  return { tokens, errors };
}

class ParseError extends Error {
  constructor(public line: number, message: string) {
    super(message);
  }
}

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private isKeyword(word: string): boolean {
    const token = this.peek();
    return token.kind === 'id' && token.text.toLowerCase() === word;
  }

  private isOp(op: string): boolean {
    const token = this.peek();
    return token.kind === 'op' && token.text === op;
  }

  private expectOp(op: string): void {
    if (!this.isOp(op)) throw new ParseError(this.peek().line, `Expected "${op}" but found "${this.peek().text || 'end of annex'}"`);
    this.next();
  }

  private expectKeyword(word: string): void {
    if (!this.isKeyword(word)) throw new ParseError(this.peek().line, `Expected "${word}" but found "${this.peek().text || 'end of annex'}"`);
    this.next();
  }

  private expectId(): Token {
    const token = this.peek();
    if (token.kind !== 'id') throw new ParseError(token.line, `Expected a name but found "${token.text || 'end of annex'}"`);
    return this.next();
  }

  atEnd(): boolean {
    return this.peek().kind === 'eof';
  }

  /** Skips to just past the next ";" so one bad statement does not hide the rest */
  recover(): void {
    while (!this.atEnd() && !this.isOp(';')) this.next();
    if (this.isOp(';')) this.next();
  }

  statement(): AgreeStatement {
    const token = this.peek();
    const word = token.kind === 'id' ? token.text.toLowerCase() : '';

    if (['assume', 'guarantee', 'lemma', 'assert'].includes(word)) {
      this.next();
      const name = this.peek().kind === 'id' ? this.next().text : undefined;
      let description = '';
      if (this.peek().kind === 'string') {
        description = this.next().text;
        this.expectOp(':');
      } else if (word !== 'assert') {
        throw new ParseError(token.line, `${word} needs a description in quotes, for example ${word} "Battery is charged" : ...`);
      }
      const expr = this.expr();
      this.expectOp(';');
      return { kind: word as 'assume', name, description, expr, line: token.line };
    }

    if (word === 'eq' || word === 'const') {
      this.next();
      const name = this.expectId().text;
      this.expectOp(':');
      const typeToken = this.expectId();
      const type = typeToken.text.toLowerCase();
      if (type !== 'bool' && type !== 'int' && type !== 'real') {
        throw new ParseError(typeToken.line, `Unsupported type "${typeToken.text}". Use bool, int or real.`);
      }
      this.expectOp('=');
      const expr = this.expr();
      this.expectOp(';');
      return { kind: word, name, type, expr, line: token.line };
    }

    if (UNSUPPORTED_KEYWORDS.has(word)) {
      throw new ParseError(token.line, `"${token.text}" statements are not supported by SysMod's local checker yet`);
    }
    throw new ParseError(token.line, `Unknown AGREE statement "${token.text}"`);
  }

  // Precedence, lowest first: ->, =>, <=>, or/xor, and, relational, + -, * / div mod, unary
  expr(): AgreeExpr {
    const left = this.implies();
    if (this.isOp('->')) {
      this.next();
      return { kind: 'binary', op: '->', left, right: this.expr() };
    }
    return left;
  }

  private implies(): AgreeExpr {
    const left = this.equiv();
    if (this.isOp('=>')) {
      this.next();
      return { kind: 'binary', op: '=>', left, right: this.implies() };
    }
    return left;
  }

  private equiv(): AgreeExpr {
    let left = this.or();
    while (this.isOp('<=>')) {
      this.next();
      left = { kind: 'binary', op: '<=>', left, right: this.or() };
    }
    return left;
  }

  private or(): AgreeExpr {
    let left = this.and();
    while (this.isKeyword('or') || this.isKeyword('xor')) {
      const op = this.next().text.toLowerCase();
      left = { kind: 'binary', op, left, right: this.and() };
    }
    return left;
  }

  private and(): AgreeExpr {
    let left = this.relational();
    while (this.isKeyword('and')) {
      this.next();
      left = { kind: 'binary', op: 'and', left, right: this.relational() };
    }
    return left;
  }

  private relational(): AgreeExpr {
    const left = this.additive();
    const op = ['=', '<>', '<', '<=', '>', '>='].find((o) => this.isOp(o));
    if (op) {
      this.next();
      return { kind: 'binary', op, left, right: this.additive() };
    }
    return left;
  }

  private additive(): AgreeExpr {
    let left = this.multiplicative();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().text;
      left = { kind: 'binary', op, left, right: this.multiplicative() };
    }
    return left;
  }

  private multiplicative(): AgreeExpr {
    let left = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isKeyword('div') || this.isKeyword('mod')) {
      const op = this.next().text.toLowerCase();
      left = { kind: 'binary', op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): AgreeExpr {
    if (this.isKeyword('not')) {
      this.next();
      return { kind: 'unary', op: 'not', operand: this.unary() };
    }
    if (this.isOp('-')) {
      this.next();
      return { kind: 'unary', op: '-', operand: this.unary() };
    }
    return this.primary();
  }

  private primary(): AgreeExpr {
    const token = this.peek();

    if (token.kind === 'number') {
      this.next();
      return { kind: 'number', text: token.text, isReal: /[.eE]/.test(token.text) };
    }

    if (this.isOp('(')) {
      this.next();
      const inner = this.expr();
      this.expectOp(')');
      return inner;
    }

    if (token.kind !== 'id') throw new ParseError(token.line, `Unexpected "${token.text || 'end of annex'}" in expression`);
    const word = token.text.toLowerCase();

    if (word === 'true' || word === 'false') {
      this.next();
      return { kind: 'bool', value: word === 'true' };
    }

    if (word === 'pre') {
      this.next();
      this.expectOp('(');
      const operand = this.expr();
      this.expectOp(')');
      return { kind: 'unary', op: 'pre', operand };
    }

    if (word === 'prev') {
      this.next();
      this.expectOp('(');
      const value = this.expr();
      this.expectOp(',');
      const initial = this.expr();
      this.expectOp(')');
      return { kind: 'prev', value, initial };
    }

    if (word === 'if') {
      this.next();
      const cond = this.expr();
      this.expectKeyword('then');
      const thenExpr = this.expr();
      this.expectKeyword('else');
      return { kind: 'ite', cond, then: thenExpr, else: this.expr() };
    }

    if (UNSUPPORTED_KEYWORDS.has(word)) {
      throw new ParseError(token.line, `"${token.text}" is not supported by SysMod's local checker yet`);
    }

    this.next();
    const path = [token.text];
    while (this.isOp('.')) {
      this.next();
      path.push(this.expectId().text);
    }
    if (this.isOp('(')) {
      throw new ParseError(token.line, `Calling "${path.join('.')}" as a node or function is not supported yet`);
    }
    return { kind: 'id', path, line: token.line };
  }
}

/** Parses the text between annex agree {** and **} */
export function parseAgreeAnnex(source: string): AgreeAnnex {
  const { tokens, errors } = tokenize(source);
  const statements: AgreeStatement[] = [];
  const parser = new Parser(tokens);

  while (!parser.atEnd()) {
    try {
      statements.push(parser.statement());
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      errors.push({ line: error.line, message: error.message });
      parser.recover();
    }
  }

  return { statements, errors };
}
