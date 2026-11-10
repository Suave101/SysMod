import { ProofObligation } from './lustreGenerator';

export type ProofAnswer = 'valid' | 'falsifiable' | 'unknown' | 'inconsistent';

export interface CounterexampleSignal {
  name: string;
  component: string;
  port: string;
  type: string;
  values: (number | boolean)[];
}

export interface ProofResult {
  property: string;
  answer: ProofAnswer;
  source?: string;
  runtimeSec?: number;
  k?: number;
  obligation?: ProofObligation;
  counterexample?: { steps: number; signals: CounterexampleSignal[] };
  /** The facts (wires, guarantees, definitions) this proof needed, from "jkind -ivc" */
  ivc?: string[];
  /** Invariants JKind found to make the induction go through */
  invariants?: string[];
}

const decodeXml = (text: string): string =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const attribute = (tag: string, name: string): string | undefined => {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match ? decodeXml(match[1]) : undefined;
};

// JKind prints reals as exact rationals such as 13/2
function parseValue(text: string, type: string): number | boolean {
  if (type === 'bool') return text === '1' || text === 'true';
  const [numerator, denominator] = text.split('/').map(Number);
  return denominator ? numerator / denominator : numerator;
}

/**
 * Reads JKind's -xml output. Signals from helper nodes (names containing "~") are dropped,
 * and generated names like "pdh3__pwr_12v_in" are split back into a device and a port.
 */
export function parseJKindXml(xml: string, obligations: ProofObligation[] = []): ProofResult[] {
  const results: ProofResult[] = [];
  const propertyBlocks = xml.match(/<Property\b[\s\S]*?<\/Property>/g) || [];

  propertyBlocks.forEach((block) => {
    const property = attribute(block.slice(0, block.indexOf('>')), 'name') as string;
    const answerMatch = /<Answer\b([^>]*)>([^<]*)<\/Answer>/.exec(block);
    const runtimeMatch = /<Runtime\b[^>]*>([^<]*)<\/Runtime>/.exec(block);
    const kMatch = /<K>([^<]*)<\/K>/.exec(block);

    const result: ProofResult = {
      property,
      answer: (answerMatch?.[2].trim() || 'unknown') as ProofAnswer,
      source: answerMatch ? attribute(answerMatch[1], 'source') : undefined,
      runtimeSec: runtimeMatch ? Number(runtimeMatch[1]) : undefined,
      k: kMatch ? Number(kMatch[1]) : undefined,
      obligation: obligations.find((o) => o.property === property),
    };
    const listOf = (tag: string): string[] | undefined => {
      const items = [...block.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => decodeXml(m[1].trim()));
      return items.length > 0 ? items : undefined;
    };
    result.ivc = listOf('Ivc');
    result.invariants = listOf('Invariant');

    const counterexample = /<Counterexample\b[^>]*>([\s\S]*?)<\/Counterexample>/.exec(block);
    if (counterexample) {
      let steps = 0;
      const signals = (counterexample[1].match(/<Signal\b[\s\S]*?<\/Signal>/g) || [])
        .map((signalBlock) => {
          const header = signalBlock.slice(0, signalBlock.indexOf('>'));
          const name = attribute(header, 'name') as string;
          const type = attribute(header, 'type') || 'real';
          const values: (number | boolean)[] = [];
          for (const value of signalBlock.matchAll(/<Value time="(\d+)">([^<]*)<\/Value>/g)) {
            values[Number(value[1])] = parseValue(value[2].trim(), type);
            steps = Math.max(steps, Number(value[1]) + 1);
          }
          const split = name.indexOf('__');
          return {
            name,
            component: split > 0 ? name.slice(0, split) : '',
            port: split > 0 ? name.slice(split + 2) : name,
            type,
            values,
          };
        })
        .filter((signal) => !signal.name.includes('~'));
      result.counterexample = { steps, signals };
    }

    results.push(result);
  });

  return results;
}
