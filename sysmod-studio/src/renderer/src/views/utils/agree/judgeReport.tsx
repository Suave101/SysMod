/**
 * The Judge Report: a printable explanation of what is formally verified about the robot and
 * how, written for a reader who has never heard of AADL or AGREE. It is rendered to a static
 * HTML document, so the editor tab, printing and "Save as HTML" all show the same thing.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FRC_DEVICE_DEFAULTS } from '../../store/useRobotStore';
import type { VerificationReport } from '../systemVerifier';
import { CUSTOM_LABEL, FRC_LIMITS, STANDARD_LABEL } from './frcContracts';
import type { ProofResult } from './jkindResults';
import type { LustreProgram, PortVariable, ProofFact } from './lustreGenerator';
import type { ExplainedProof, ProofLine, ProofMethod } from './proofExplainer';
import { variablesOf } from './proofExplainer';
import { formatMath, formatNumber } from './proofNotation';

export interface JudgeReportData {
  team?: { number?: string; name?: string };
  generatedAt: Date;
  program: Pick<LustreProgram, 'ports' | 'obligations'>;
  results: ProofResult[];
  proofs: ExplainedProof[];
  rules: VerificationReport;
  componentCount: number;
  wireCount: number;
}

const deviceLabel = (type?: string): string => (type && FRC_DEVICE_DEFAULTS[type]?.label) || type || 'component';

const PORT_WORDS: Record<string, string> = {
  pwr: 'power', '12v': '12 V', in: 'input', out: 'output', high: 'high-current', low: 'low-current', switched: 'switchable',
  battery: 'battery', pdh: 'PDH', pwm: 'PWM', comp: 'compressor', press: 'pressure switch', regulated: 'regulated',
  can: 'CAN', eth: 'Ethernet', mpm: 'MPM', sol: 'solenoid', rsl: 'signal light', dio: 'digital', usb: 'USB',
};

function describePort(port: PortVariable): string {
  const where = port.handle.split('-').map((w) => PORT_WORDS[w] || w).join(' ');
  const meaning: Record<string, string> = {
    power: 'voltage in volts',
    pwm: 'PWM motor command, a number from −1 to 1',
    comp: 'whether the compressor is told to run (true or false)',
    press: 'whether the pressure switch is calling for air (true or false)',
    sol: 'whether the solenoid is energized (true or false)',
  };
  return `${meaning[port.family] || 'whether the link is active (true or false)'} at the ${where} of the ${deviceLabel(port.deviceType)} "${port.component}"`;
}

const SUPPLY_TYPES = new Set(['PDH', 'VRM', 'MPM', 'BuckConverter', 'SystemCore', 'roboRIO', 'RadioSwitch', 'PneumaticsHub', 'Limelight', 'Coprocessor', 'KrakenX60', 'KrakenX44', 'Falcon500', 'SparkMaxNEO', 'NEOVortex', 'NEO550', 'BrushedController']);

/** One or two sentences a judge can repeat: why anyone should care that this is true */
function whyItMatters(proof: ExplainedProof): string | undefined {
  const { obligation } = proof;
  if (obligation.source === CUSTOM_LABEL) return 'Our team wrote this requirement ourselves in the contract editor.';
  if (obligation.kind === 'assumption' && obligation.deviceType && SUPPLY_TYPES.has(obligation.deviceType)) {
    return `Every electronic part has a maximum input voltage, and too much can destroy it in the middle of a match. ${FRC_LIMITS.deviceMaxVolts} V is the roboRIO 2.0's maximum, the lowest among common FRC control electronics. The proof also shows this part is powered only through the battery, main breaker and distribution hub, as the FRC rules require.`;
  }
  if (obligation.deviceType === 'PWMServo') return 'A servo only understands commands from −1 to 1. A value outside that range would leave its behavior undefined.';
  if (/pressure switch/.test(obligation.description)) {
    return 'The compressor must stop when the pressure switch reaches its cutoff. If it kept running, air pressure could climb past what the tanks and tubing are rated for.';
  }
  return undefined;
}

const METHOD_LABELS: Record<ProofMethod, string> = {
  substitution: 'Follow the wires',
  bounds: 'Chain of limits',
  solver: 'Logic solver',
};

const ENGINE_LABELS: Record<string, string> = {
  kinduction: 'k-induction',
  pdr: 'property-directed reachability',
  'invariant-generation': 'invariant generation',
  bmc: 'bounded model checking',
};

// ── Math ──────────────────────────────────────────────────────────────────────────────────

const MathView: React.FC<{ expr: Parameters<typeof formatMath>[0]; nameOf: (v: string) => string }> = ({ expr, nameOf }) => (
  <span className="math">
    {formatMath(expr, nameOf).map((token, i) => (
      <span key={i} className={`m-${token.kind}`} title={token.title}>
        {token.text}
      </span>
    ))}
  </span>
);

// ── Reasons ───────────────────────────────────────────────────────────────────────────────

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const lineList = (lines: number[]): string => {
  const shown = lines.map((l) => l + 1);
  return shown.length === 1 ? `line ${shown[0]}` : `lines ${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
};

function factReason(fact: ProofFact, proofNumber: Map<string, number>, program: JudgeReportData['program']): React.ReactNode {
  if (fact.kind === 'wire') {
    const [from] = fact.description.replace('Wire from ', '').split(' to ');
    return (
      <>
        <b>Wire on our diagram</b> from {from} to {fact.component}. A wire carries the same value at both ends.
      </>
    );
  }
  if (fact.kind === 'assertion') {
    return (
      <>
        <b>Assumed by our team</b> (an AGREE assert): “{fact.description}”. This is taken as given, not proved.
      </>
    );
  }
  if (fact.kind === 'definition') {
    return <><b>Definition</b> written in our contract for {fact.component}.</>;
  }
  const who = `${deviceLabel(fact.deviceType)} “${fact.component}”`;
  const kind = fact.source === STANDARD_LABEL ? 'FRC standard contract' : 'our own contract';
  const conditions = fact.requires
    .map((p) => ({ p, n: proofNumber.get(p), o: program.obligations.find((o) => o.property === p) }))
    .filter((c) => c.o);
  return (
    <>
      <b>Promise by the {who}</b> ({kind}): “{fact.description}”.
      {conditions.length > 0 && (
        <>
          {' '}It applies because the {deviceLabel(fact.deviceType)}’s own needs are always met:{' '}
          {conditions.map((c, i) => (
            <React.Fragment key={c.p}>
              {i > 0 && ', '}
              {c.n ? <a href={`#proof-${c.n}`}>Proof {c.n}</a> : `“${c.o?.description}”`}
            </React.Fragment>
          ))}
          .
        </>
      )}
    </>
  );
}

function lineReason(line: ProofLine, lines: ProofLine[], proofNumber: Map<string, number>, program: JudgeReportData['program']): React.ReactNode {
  const r = line.reason;
  switch (r.kind) {
    case 'fact':
      return factReason(r.fact, proofNumber, program);
    case 'chain': {
      const s = line.statement;
      const upper = s.kind === 'binary' && s.op.startsWith('<');
      return (
        <>
          From {lineList(r.from)}: each value is equal to, or {upper ? 'at most' : 'at least'}, the next, so the first is {upper ? 'at most' : 'at least'} the last.
          {r.cases && (
            <>
              {' '}Line {(r.from.find((n) => { const s = lines[n]?.statement; return s?.kind === 'binary' && s.op === 'or'; }) ?? r.from[0]) + 1} has two possible cases, so
              we take the {upper ? 'larger' : 'smaller'} one.
            </>
          )}
        </>
      );
    }
    case 'arithmetic':
      return <>Arithmetic.</>;
    case 'substitute':
      return r.using.length > 0 ? <>Replace each value in line {r.into + 1} with the one wired to it ({lineList(r.using)}).</> : <>Restates line {r.into + 1}.</>;
    case 'combine':
      return <>Put {lineList(r.from)} together.</>;
    case 'solver':
      return (
        <>
          {r.from.length > 0 ? <>{capitalize(lineList(r.from))} imply this by logic and arithmetic. </> : null}
          JKind’s SMT solver checked this step for every possible value.
        </>
      );
  }
}

// ── One proof ─────────────────────────────────────────────────────────────────────────────

const ProofSection: React.FC<{
  proof: ExplainedProof;
  number: number;
  proofNumber: Map<string, number>;
  data: JudgeReportData;
  nameOf: (v: string) => string;
}> = ({ proof, number, proofNumber, data, nameOf }) => {
  const { obligation, result, lines } = proof;
  const subject = obligation.kind === 'lemma' ? 'The whole robot' : `The ${deviceLabel(obligation.deviceType)} “${obligation.component}”`;
  const why = whyItMatters(proof);
  const symbols = [...new Set([...variablesOf(obligation.expr), ...lines.flatMap((l) => [...variablesOf(l.statement)])])].filter((v) => data.program.ports[v]);
  const dependsOn = proof.dependsOn.map((p) => proofNumber.get(p)).filter((n): n is number => !!n);
  // A guarantee with two halves (like 0 ≤ x and x ≤ y) is cited twice; explain it once
  const firstUse = new Map<string, number>();
  lines.forEach((line, i) => {
    if (line.reason.kind === 'fact' && !firstUse.has(line.reason.fact.variable)) firstUse.set(line.reason.fact.variable, i);
  });

  return (
    <section className="proof" id={`proof-${number}`}>
      <div className="proof-head">
        <span className="badge ok">✓ Proved</span>
        <h3>
          Proof {number}. {obligation.description}
        </h3>
      </div>
      <p className="subject">
        {subject} · {obligation.source === STANDARD_LABEL ? 'FRC standard contract' : 'Our contract'} · method: {METHOD_LABELS[proof.method]}
      </p>
      {why && <p className="why"><b>Why it matters.</b> {why}</p>}

      <div className="theorem">
        <span className="label">Theorem.</span> For every moment <i>t</i> = 0, 1, 2, … while the robot is on:
        <div className="display">
          <MathView expr={obligation.expr} nameOf={nameOf} />
        </div>
      </div>

      <table className="steps">
        <thead>
          <tr>
            <th>#</th>
            <th>Statement</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className={i === lines.length - 1 ? 'last' : ''}>
              <td className="n">{i + 1}</td>
              <td>
                <MathView expr={line.statement} nameOf={nameOf} />
              </td>
              <td className="reason">
                {line.reason.kind === 'fact' && firstUse.get(line.reason.fact.variable) !== i ? (
                  <>Same {line.reason.fact.kind === 'wire' ? 'wire' : 'promise'} as line {(firstUse.get(line.reason.fact.variable) as number) + 1}.</>
                ) : (
                  lineReason(line, lines, proofNumber, data.program)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="qed">
        {proof.temporal ? (
          <>
            This statement compares different moments in time, so it is proved by <b>induction on t</b>. Base case: it holds at the first
            {result.k && result.k > 1 ? ` ${result.k} moments` : ' moment'}. Inductive step: if it held at the previous
            {result.k && result.k > 1 ? ` ${result.k} moments` : ' moment'}, the facts above force it to hold at the next one. So it holds at every moment.
          </>
        ) : (
          <>Each line holds at every moment <i>t</i> on its own, so the theorem holds at every moment.</>
        )}{' '}
        {dependsOn.length > 0 && (
          <>
            This proof builds on{' '}
            {dependsOn.map((n, i) => (
              <React.Fragment key={n}>
                {i > 0 && ', '}
                <a href={`#proof-${n}`}>Proof {n}</a>
              </React.Fragment>
            ))}
            .{' '}
          </>
        )}
        <span className="tomb">∎</span>
      </p>

      {symbols.length > 0 && (
        <div className="symbols">
          <b>What the symbols mean</b>
          <ul>
            {symbols.map((v) => (
              <li key={v}>
                <span className="math"><span className="m-var">{nameOf(v)}(t)</span></span>: {describePort(data.program.ports[v])}, at moment t.
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="machine">
        Machine-checked by JKind{result.source ? ` using ${ENGINE_LABELS[result.source] || result.source}` : ''}
        {result.runtimeSec !== undefined ? ` in ${formatNumber(result.runtimeSec)} s` : ''}.
        {result.ivc && ' JKind also reported which facts the proof needs, and the proof above uses only those.'}
      </p>
    </section>
  );
};

// ── The whole report ──────────────────────────────────────────────────────────────────────

export const JudgeReportDocument: React.FC<{ data: JudgeReportData }> = ({ data }) => {
  const { results, proofs, rules, team } = data;
  const proved = results.filter((r) => r.answer === 'valid');
  const notProved = results.filter((r) => r.answer !== 'valid');
  const proofNumber = new Map(proofs.map((p, i) => [p.obligation.property, i + 1]));
  const nameOf = (v: string): string => {
    const port = data.program.ports[v];
    return port ? `${port.component}.${port.port}` : v.replace('__', '.');
  };
  const ruleErrors = rules.issues.filter((i) => i.severity === 'error');
  const ruleWarnings = rules.issues.filter((i) => i.severity === 'warning');
  const teamLine = [team?.number && `Team ${team.number}`, team?.name].filter(Boolean).join(' · ');

  return (
    <main className="report">
      <header className="cover">
        <p className="eyebrow">{teamLine || 'FRC robot'} · Electrical architecture</p>
        <h1>Formal Verification Report</h1>
        <p className="big">
          <span className="count">
            {proved.length} of {results.length}
          </span>{' '}
          properties of our robot’s electrical design are <b>mathematically proved</b> to hold in every possible situation, not just the ones we tested.
        </p>
        <p className="meta">
          {data.componentCount} components · {data.wireCount} wires · generated {data.generatedAt.toLocaleString()} by SysMod Studio
        </p>
      </header>

      <section className="intro">
        <h2>Testing vs. proving, in one minute</h2>
        <p>
          Testing tries some situations and checks the robot behaves. It can’t try them all: the battery can sit at any voltage, a breaker can trip at
          any moment, and the robot runs for thousands of moments per match. <b>A proof covers every situation at once.</b> It works like a proof in
          geometry class. We start from facts we trust, and each step follows from earlier ones by logic or arithmetic, so the conclusion can’t be false.
        </p>
        <ol className="pipeline">
          <li>
            <b>Our wiring diagram</b> is drawn in SysMod Studio.
          </li>
          <li>
            It is turned into a precise model in <b>AADL</b>, a modeling language from the aerospace standard SAE AS5506.
          </li>
          <li>
            Each part gets a <b>contract</b> in AGREE: what it needs (assumptions) and what it promises (guarantees), taken from datasheets and the FRC rules.
          </li>
          <li>
            The proof engine <b>JKind</b>, an open-source model checker, proves that every part’s needs are met by what the parts wired to it promise.
          </li>
        </ol>
        <p className="howto">
          <b>Reading the math:</b> <span className="math"><span className="m-var">x(t)</span></span> is the value of x at moment t.{' '}
          <span className="math">∧</span> means “and”, <span className="math">∨</span> means “or”, <span className="math">⇒</span> means “if … then”, and{' '}
          <span className="math">∎</span> marks the end of a proof. Names like <span className="math"><span className="m-var">pdh3.pwr_low_out</span></span> are
          a part on our diagram, then one of its connections.
        </p>
      </section>

      <section>
        <h2>What we proved</h2>
        {proofs.length === 0 ? (
          <p>No properties are proved yet.</p>
        ) : (
          <table className="summary">
            <thead>
              <tr>
                <th>#</th>
                <th>Property</th>
                <th>About</th>
                <th>How</th>
              </tr>
            </thead>
            <tbody>
              {proofs.map((p, i) => (
                <tr key={p.obligation.property}>
                  <td className="n">
                    <a href={`#proof-${i + 1}`}>{i + 1}</a>
                  </td>
                  <td>✓ {p.obligation.description}</td>
                  <td>{p.obligation.kind === 'lemma' ? 'Whole robot' : `${deviceLabel(p.obligation.deviceType)} “${p.obligation.component}”`}</td>
                  <td>{METHOD_LABELS[p.method]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {notProved.length > 0 && (
        <section className="open">
          <h2>Not proved yet</h2>
          <p>We list these honestly. A property that isn’t proved shows us where the design, or our contracts, still need work.</p>
          <ul>
            {notProved.map((r) => (
              <li key={r.property}>
                <b>{r.obligation?.description || r.property}</b>:{' '}
                {r.answer === 'falsifiable'
                  ? `JKind found a situation where it fails, ${r.counterexample?.steps || 1} moment${(r.counterexample?.steps || 1) === 1 ? '' : 's'} long.`
                  : r.answer === 'inconsistent'
                    ? 'the contracts contradict each other, so nothing can be concluded.'
                    : 'JKind ran out of time before finishing.'}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>The proofs</h2>
        {proofs.map((proof, i) => (
          <ProofSection key={proof.obligation.property} proof={proof} number={i + 1} proofNumber={proofNumber} data={data} nameOf={nameOf} />
        ))}
      </section>

      <section>
        <h2>Wiring rule checks</h2>
        <p>
          Separately from the proofs, SysMod checks the diagram against FRC wiring rules, such as CAN chain termination, breaker sizes and unique CAN IDs.{' '}
          {ruleErrors.length === 0 && ruleWarnings.length === 0
            ? 'The current design passes every check.'
            : `The current design has ${ruleErrors.length} error${ruleErrors.length === 1 ? '' : 's'} and ${ruleWarnings.length} warning${ruleWarnings.length === 1 ? '' : 's'}.`}
        </p>
        {ruleErrors.length > 0 && (
          <ul>
            {ruleErrors.map((issue) => (
              <li key={issue.id}>{issue.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="fine-print">
        <h2>What a proof does and doesn’t mean</h2>
        <ul>
          <li>A proof is only as good as its starting facts. The limits in the contracts come from datasheets and the FRC rules, which we check each season.</li>
          <li>The proofs are about the design on our diagram. They don’t replace robot inspection, testing or careful wiring.</li>
          <li>Time is counted in moments, not seconds, and voltages are exact numbers, not measurements.</li>
        </ul>
      </section>
    </main>
  );
};

const REPORT_CSS = `
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1e293b;font:15px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif}
.report{max-width:900px;margin:0 auto;padding:40px 32px 64px}
h1{font-size:32px;margin:4px 0 12px;letter-spacing:-.5px}
h2{font-size:21px;margin:40px 0 12px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}
h3{font-size:17px;margin:0}
a{color:#4338ca}
.cover{border-bottom:4px solid #4f46e5;padding-bottom:20px}
.eyebrow{margin:0;text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:600;color:#4f46e5}
.big{font-size:19px;margin:0 0 8px}
.count{display:inline-block;padding:0 10px;border-radius:8px;background:#dcfce7;color:#166534;font-weight:700}
.meta{color:#64748b;font-size:13px;margin:0}
.pipeline{padding-left:22px}.pipeline li{margin:4px 0}
.howto{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:14px}
table{border-collapse:collapse;width:100%}
th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:2px solid #e2e8f0;padding:6px 8px}
td{border-bottom:1px solid #f1f5f9;padding:7px 8px;vertical-align:top}
td.n{width:32px;color:#94a3b8;font-variant-numeric:tabular-nums}
.summary td:nth-child(2){color:#166534}
.proof{margin:28px 0 36px;padding:20px 22px;border:1px solid #e2e8f0;border-radius:12px;break-inside:avoid-page}
.proof-head{display:flex;gap:10px;align-items:baseline}
.badge{font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;white-space:nowrap}
.badge.ok{background:#dcfce7;color:#166534}
.subject{color:#64748b;font-size:13px;margin:4px 0 10px}
.why{margin:10px 0;font-size:14px}
.theorem{background:#eef2ff;border-left:4px solid #4f46e5;border-radius:6px;padding:10px 14px;margin:14px 0}
.theorem .label{font-weight:700;font-style:italic}
.display{text-align:center;font-size:19px;margin:8px 0 2px}
.steps{table-layout:fixed}
.steps th:nth-child(1){width:36px}.steps th:nth-child(2){width:50%}
.steps td{font-size:14px}
.steps td:nth-child(2){font-size:15px;overflow-wrap:anywhere}
.steps tr.last td{border-top:2px solid #cbd5e1;font-weight:600}
.steps .reason{color:#475569}
.steps tr.last .reason{font-weight:400}
.math{font-family:"Cambria Math","STIX Two Math","Latin Modern Math","Times New Roman",serif}
.m-var{font-style:italic;color:#1e3a8a;padding-right:.08em}
.m-num{color:#0f172a}
.m-op{color:#475569}
.m-text{font-family:"Segoe UI",system-ui,sans-serif;font-size:.85em;color:#475569}
.qed{font-size:14px;margin:12px 0 6px}
.tomb{font-size:16px}
.symbols{font-size:13px;color:#475569;margin:8px 0;padding:8px 12px;background:#f8fafc;border-radius:6px}
.symbols ul{margin:4px 0 0;padding-left:20px}
.machine{font-size:12px;color:#94a3b8;margin:6px 0 0}
.open li{margin:4px 0}
.fine-print{font-size:14px;color:#475569}
@media print{
  body{font-size:12px}.report{padding:0;max-width:none}
  a{color:inherit;text-decoration:none}
  .proof{border-color:#cbd5e1}
}
`;

/** A complete, self-contained HTML page for the iframe, printing and saving */
export function renderJudgeReportHtml(data: JudgeReportData): string {
  const body = renderToStaticMarkup(<JudgeReportDocument data={data} />);
  const title = ['Formal Verification Report', data.team?.number && `Team ${data.team.number}`].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${REPORT_CSS}</style></head><body>${body}</body></html>`;
}
