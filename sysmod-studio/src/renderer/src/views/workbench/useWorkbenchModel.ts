import { useCallback, useMemo, useState } from 'react';
import { useRobotStore } from '../store/useRobotStore';
import { generateAadlCode, generateJavaCode, generatePythonCode } from '../utils/codeGenerators';
import { verifySystemProperties } from '../utils/systemVerifier';
import { analyzeHardware } from '../utils/hardwareValidation';
import { buildContracts } from '../utils/agree/frcContracts';
import { generateLustre, LustreProgram } from '../utils/agree/lustreGenerator';
import { parseJKindXml, ProofResult } from '../utils/agree/jkindResults';
import { explainProofs } from '../utils/agree/proofExplainer';
import { generateSoar } from '../behavior/soarGenerator';
import { isSubsystem, subsystemCommands, subsystemGroups } from '../utils/subsystems';
import { buildBehaviorModel } from '../behavior/behaviorModel';
import { AgentAgree, AgentProgram, compileAgentAgree, compileAgentLustre, ReadingDomain } from '../behavior/agentAgree';
import { readingDomains } from '../utils/soarBridgeCode';
import type { AgentProperty } from '../behavior/agentProperties';

export type WorkbenchModel = ReturnType<typeof useWorkbenchModel>;

/**
 * Everything derived from the diagram and the student's contracts, plus the proof runner.
 * Shared by the side bar, editors, bottom panel and status bar so they always agree.
 */
export function useWorkbenchModel() {
  const diagramNodes = useRobotStore((state) => state.nodes);
  const edges = useRobotStore((state) => state.edges);
  const customContracts = useRobotStore((state) => state.customContracts);
  const behaviorBlocks = useRobotStore((state) => state.behaviorBlocks);

  // Subsystem frames group devices but aren't hardware, so rule checks, contracts, proofs and
  // the BOM only see the devices
  const nodes = useMemo(() => diagramNodes.filter((n) => !isSubsystem(n)), [diagramNodes]);
  const subsystems = useMemo(() => subsystemGroups(diagramNodes, behaviorBlocks), [diagramNodes, behaviorBlocks]);

  const contracts = useMemo(() => buildContracts(nodes, edges, customContracts), [nodes, edges, customContracts]);
  const aadl = useMemo(() => generateAadlCode(nodes, edges, contracts, subsystems), [nodes, edges, contracts, subsystems]);
  const hardware = useMemo(() => analyzeHardware(nodes, edges), [nodes, edges]);
  const soar = useMemo(() => generateSoar(behaviorBlocks), [behaviorBlocks]);
  // With behavior rules, the robot code runs agent.soar through the FRC-Soar bridge
  const agent = useMemo(() => (soar.includes('sp {') ? { commands: subsystemCommands(behaviorBlocks) } : undefined), [soar, behaviorBlocks]);
  // Every generated file, keyed like GENERATED_FILES, so editor tabs update as you wire
  // The agent as an AADL component with an AGREE contract, and the facts the student asked to prove
  const behaviorProperties = useRobotStore((state) => state.behaviorProperties);
  const behaviorModel = useMemo(() => buildBehaviorModel(behaviorBlocks), [behaviorBlocks]);
  // What each device and subsystem can send. Keyed by text so dragging a node doesn't recompile the agent
  const domainsKey = JSON.stringify([...readingDomains(nodes, subsystems)]);
  const readingDomainMap = useMemo(() => new Map<string, ReadingDomain>(JSON.parse(domainsKey)), [domainsKey]);
  const agentAgree = useMemo(() => compileAgentAgree(behaviorModel, behaviorProperties, readingDomainMap), [behaviorModel, behaviorProperties, readingDomainMap]);
  const agentProgram = useMemo(() => compileAgentLustre(agentAgree), [agentAgree]);
  const hasRules = behaviorModel.operators.length + behaviorModel.elaborations.length > 0;
  const agentAadl = hasRules ? agentAgree.aadl : '-- No behavior rules yet. Build the agent in the Behavior tab, and its AADL model appears here.\n';
  const generated = useMemo(
    () => ({ aadl, python: generatePythonCode(nodes, edges, subsystems, agent), java: generateJavaCode(nodes, edges, subsystems, agent), soar, agentAadl }),
    [aadl, nodes, edges, subsystems, agent, soar, agentAadl],
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

  // Behavior proofs run separately from the contract proofs: a different program and question
  const [behaviorProving, setBehaviorProving] = useState(false);
  const [behaviorError, setBehaviorError] = useState<string>();
  const [behaviorRun, setBehaviorRun] = useState<{ agent: AgentAgree; program: AgentProgram; properties: AgentProperty[]; results: ProofResult[] }>();
  const proveBehavior = useCallback(async () => {
    setBehaviorError(undefined);
    if (agentProgram.errors.length > 0) {
      setBehaviorError(`SysMod made an AGREE model it can't read: ${agentProgram.errors[0].message}. Please report this.`);
      return;
    }
    if (!window.sysmodAPI?.runJKind) {
      setBehaviorError('Proofs run JKind on this computer, so they only work in the SysMod Studio desktop app.');
      return;
    }
    setBehaviorProving(true);
    try {
      const response = await window.sysmodAPI.runJKind(agentProgram.lustre);
      if (response.success && response.xml) setBehaviorRun({ agent: agentAgree, program: agentProgram, properties: behaviorProperties, results: parseJKindXml(response.xml) });
      else setBehaviorError(response.error || 'JKind did not return any results.');
    } finally {
      setBehaviorProving(false);
    }
  }, [agentAgree, agentProgram, behaviorProperties]);

  return {
    behavior: {
      model: behaviorModel,
      agent: agentAgree,
      program: agentProgram,
      hasRules,
      properties: behaviorProperties,
      prove: proveBehavior,
      proving: behaviorProving,
      error: behaviorError,
      /** The last run, with the agent it was about, so results stay readable while blocks change */
      run: behaviorRun,
      isStale: !!behaviorRun && behaviorRun.program.lustre !== agentProgram.lustre,
    },
    /** The devices on the diagram, without subsystem frames */
    nodes,
    subsystems,
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
