import { useCallback, useMemo, useState } from 'react';
import { useRobotStore } from '../store/useRobotStore';
import { generateAadlCode, generateJavaCode, generatePythonCode } from '../utils/codeGenerators';
import { verifySystemProperties } from '../utils/systemVerifier';
import { analyzeHardware } from '../utils/hardwareValidation';
import { buildContracts } from '../utils/agree/frcContracts';
import { generateLustre, LustreProgram } from '../utils/agree/lustreGenerator';
import { parseJKindXml, ProofResult } from '../utils/agree/jkindResults';
import { explainProofs } from '../utils/agree/proofExplainer';

export type WorkbenchModel = ReturnType<typeof useWorkbenchModel>;

/**
 * Everything derived from the diagram and the student's contracts, plus the proof runner.
 * Shared by the side bar, editors, bottom panel and status bar so they always agree.
 */
export function useWorkbenchModel() {
  const nodes = useRobotStore((state) => state.nodes);
  const edges = useRobotStore((state) => state.edges);
  const customContracts = useRobotStore((state) => state.customContracts);

  const contracts = useMemo(() => buildContracts(nodes, edges, customContracts), [nodes, edges, customContracts]);
  const aadl = useMemo(() => generateAadlCode(nodes, edges, contracts), [nodes, edges, contracts]);
  const hardware = useMemo(() => analyzeHardware(nodes, edges), [nodes, edges]);
  // Every generated file, keyed like GENERATED_FILES, so editor tabs update as you wire
  const generated = useMemo(
    () => ({ aadl, python: generatePythonCode(nodes, edges), java: generateJavaCode(nodes, edges) }),
    [aadl, nodes, edges],
  );
  const report = useMemo(() => verifySystemProperties(nodes, edges, hardware), [nodes, edges, hardware]);
  const program = useMemo(() => generateLustre(nodes, edges, contracts), [nodes, edges, contracts]);

  const [proving, setProving] = useState(false);
  const [proofError, setProofError] = useState<string>();
  const [proofResults, setProofResults] = useState<ProofResult[]>();
  // The program the results belong to, so proofs are explained with the facts JKind actually saw
  const [provedProgram, setProvedProgram] = useState<LustreProgram>();
  const explained = useMemo(
    () => (proofResults && provedProgram ? explainProofs(provedProgram, proofResults) : undefined),
    [proofResults, provedProgram],
  );

  const prove = useCallback(async () => {
    setProofError(undefined);
    if (program.errors.length > 0) {
      setProofError('Fix the AGREE errors listed in Problems before proving.');
      return;
    }
    if (!window.sysmodAPI?.runJKind) {
      setProofError('Proofs run JKind on this computer, so they only work in the SysMod Studio desktop app.');
      return;
    }
    setProving(true);
    try {
      const response = await window.sysmodAPI.runJKind(program.lustre);
      if (response.success && response.xml) {
        setProofResults(parseJKindXml(response.xml, program.obligations));
        setProvedProgram(program);
      } else {
        setProofError(response.error || 'JKind did not return any results.');
      }
    } finally {
      setProving(false);
    }
  }, [program]);

  return {
    nodes,
    edges,
    contracts,
    aadl,
    generated,
    hardware,
    report,
    program,
    proof: {
      prove,
      proving,
      error: proofError,
      results: proofResults,
      explained,
      provedProgram,
      isStale: !!proofResults && provedProgram?.lustre !== program.lustre,
      provedCount: proofResults?.filter((r) => r.answer === 'valid').length || 0,
    },
  };
}

/** A contract scope's display name: the device's palette label, or the whole robot */
export function scopeLabel(scope: string, deviceLabels: Record<string, { label: string }>): string {
  return scope === 'System' ? 'Whole robot' : deviceLabels[scope]?.label || scope;
}
