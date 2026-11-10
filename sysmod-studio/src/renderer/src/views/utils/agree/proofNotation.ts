/**
 * Prints contract formulas in ordinary math notation (≤, ∧, ⇒, x(t)) instead of Lustre,
 * as a list of tokens so the report can style variables, numbers and operators.
 */
import { MathExpr } from './lustreGenerator';

export interface MathToken {
  kind: 'var' | 'num' | 'op' | 'text';
  text: string;
  /** A constant's name, shown on hover */
  title?: string;
}

const PRECEDENCE: Record<string, number> = {
  '->': 1, '=>': 2, '<=>': 3, or: 4, xor: 4, and: 5,
  '=': 6, '<>': 6, '<': 6, '<=': 6, '>': 6, '>=': 6,
  '+': 7, '-': 7, '*': 8, '/': 8, div: 8, mod: 8,
};

const SYMBOLS: Record<string, string> = {
  '=>': '⇒', '<=>': '⇔', or: '∨', xor: '⊕', and: '∧', '<=': '≤', '>=': '≥', '<>': '≠',
  '=': '=', '<': '<', '>': '>', '+': '+', '-': '−', '*': '×', '/': '÷', div: 'div', mod: 'mod',
};

export function formatNumber(value: number): string {
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return text.replace('-', '−');
}

const timeAt = (shift: number): string => (shift === 0 ? 't' : `t−${shift}`);

/** Renders "a ≤ x ∧ x ≤ b" as "a ≤ x ≤ b" */
function asRange(expr: MathExpr): { low: MathExpr; lowOp: string; x: MathExpr; highOp: string; high: MathExpr } | undefined {
  if (expr.kind !== 'binary' || expr.op !== 'and') return undefined;
  const sides = [expr.left, expr.right].map((side) => {
    if (side.kind !== 'binary' || !['<', '<=', '>', '>='].includes(side.op)) return undefined;
    if (side.left.kind === 'var') {
      return side.op.startsWith('>') ? { kind: 'low', x: side.left, op: side.op === '>' ? '<' : '<=', bound: side.right } : { kind: 'high', x: side.left, op: side.op, bound: side.right };
    }
    if (side.right.kind === 'var') {
      return side.op.startsWith('<') ? { kind: 'low', x: side.right, op: side.op, bound: side.left } : { kind: 'high', x: side.right, op: side.op === '>' ? '<' : '<=', bound: side.left };
    }
    return undefined;
  });
  const low = sides.find((s) => s?.kind === 'low');
  const high = sides.find((s) => s?.kind === 'high');
  if (!low || !high || low.x.kind !== 'var' || high.x.kind !== 'var' || low.x.name !== high.x.name) return undefined;
  return { low: low.bound, lowOp: low.op, x: low.x, highOp: high.op, high: high.bound };
}

export function formatMath(expr: MathExpr, nameOf: (variable: string) => string, shift = 0): MathToken[] {
  const out: MathToken[] = [];
  const op = (text: string): void => {
    out.push({ kind: 'op', text });
  };

  const walk = (e: MathExpr, parent: number, s: number): void => {
    const wrap = (prec: number, body: () => void): void => {
      if (prec < parent) op('(');
      body();
      if (prec < parent) op(')');
    };
    switch (e.kind) {
      case 'bool':
        out.push({ kind: 'text', text: e.value ? 'true' : 'false' });
        return;
      case 'number':
        out.push({ kind: 'num', text: formatNumber(e.value) });
        return;
      case 'const':
        out.push(e.value !== undefined ? { kind: 'num', text: formatNumber(e.value), title: e.label } : { kind: 'var', text: e.label });
        return;
      case 'var':
        out.push({ kind: 'var', text: `${nameOf(e.name)}(${timeAt(s)})` });
        return;
      case 'unary':
        if (e.op === 'pre') {
          walk(e.operand, parent, s + 1);
        } else {
          wrap(9, () => {
            op(e.op === 'not' ? '¬' : '−');
            walk(e.operand, 10, s);
          });
        }
        return;
      case 'prev':
        op('(');
        walk(e.initial, 0, s);
        out.push({ kind: 'text', text: ` if ${timeAt(s)} = 0, otherwise ` });
        walk(e.value, 0, s + 1);
        op(')');
        return;
      case 'ite':
        wrap(0, () => {
          out.push({ kind: 'text', text: 'if ' });
          walk(e.cond, 1, s);
          out.push({ kind: 'text', text: ' then ' });
          walk(e.then, 1, s);
          out.push({ kind: 'text', text: ' else ' });
          walk(e.else, 1, s);
        });
        return;
      case 'binary': {
        const range = asRange(e);
        if (range) {
          wrap(6, () => {
            walk(range.low, 7, s);
            op(` ${SYMBOLS[range.lowOp]} `);
            walk(range.x, 7, s);
            op(` ${SYMBOLS[range.highOp]} `);
            walk(range.high, 7, s);
          });
          return;
        }
        if (e.op === '->') {
          op('(');
          walk(e.left, 0, s);
          out.push({ kind: 'text', text: ` if ${timeAt(s)} = 0, otherwise ` });
          walk(e.right, 0, s);
          op(')');
          return;
        }
        const prec = PRECEDENCE[e.op] ?? 6;
        wrap(prec, () => {
          // Implication groups to the right; everything else to the left
          const rightAssoc = e.op === '=>';
          walk(e.left, rightAssoc ? prec + 1 : prec, s);
          op(` ${SYMBOLS[e.op] || e.op} `);
          walk(e.right, rightAssoc ? prec : prec + 1, s);
        });
        return;
      }
    }
  };

  walk(expr, 0, shift);
  return out;
}

export const mathToText = (expr: MathExpr, nameOf: (variable: string) => string): string =>
  formatMath(expr, nameOf).map((t) => t.text).join('');
