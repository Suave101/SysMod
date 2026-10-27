import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // Or your chosen Electron router hook
import ProcessTimeline from './components/ProcessTimeline';

export default function DesignBrief() {
  const navigate = useNavigate();

  // FRC Season Context
  const [seasonKey, setSeasonKey] = useState('reefscape');

  // Metadata
  const [designers, setDesigners] = useState('');
  const [teamNumber, setTeamNumber] = useState('');
  const [teamName, setTeamName] = useState('');
  const [client, setClient] = useState('FRC Event Officials & Technical Judges');
  const [targetConsumer, setTargetConsumer] = useState('Alliance Partners & Drive Team');

  // Statements
  const [problemStatement, setProblemStatement] = useState('');
  const [designStatement, setDesignStatement] = useState('');
  const problemRef = useRef<HTMLTextAreaElement>(null);
  const designRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (problemRef.current) {
      problemRef.current.style.height = 'auto';
      problemRef.current.style.height = `${problemRef.current.scrollHeight}px`;
    }
  }, [problemStatement]);

  useEffect(() => {
    if (designRef.current) {
      designRef.current.style.height = 'auto';
      designRef.current.style.height = `${designRef.current.scrollHeight}px`;
    }
  }, [designStatement]);

  // Criteria Registry
  const [criteria, setCriteria] = useState<{ id: string; text: string; category: string }[]>([]);
  const [newCriterionText, setNewCriterionText] = useState('');
  const [newCriterionCat, setNewCriterionCat] = useState('Intake');

  // FRC Sizing & Rules Constraints
  const [bounds, setBounds] = useState({ length: 30.0, width: 30.0, height: 48.0 });
  const [targetWeight, setTargetWeight] = useState(115.0); // FRC max limit is 125 lbs (excluding battery & bumpers)
  const [plannedMotors, setPlannedMotors] = useState('');
  const [plannedPneumatics, setPlannedPneumatics] = useState('');
  const [hasMainCircuitBreaker, setHasMainCircuitBreaker] = useState(true); // 120A Main Breaker is required by FRC rules

  // Project Spending Limit ($)
  const [spendingLimit, setSpendingLimit] = useState('4000');

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.loadData) {
      window.electronAPI.loadData().then((savedData: any) => {
        if (savedData) {
          if (savedData.seasonKey) setSeasonKey(savedData.seasonKey);
          if (savedData.designers) setDesigners(savedData.designers);
          if (savedData.teamNumber) setTeamNumber(savedData.teamNumber);
          if (savedData.teamName) setTeamName(savedData.teamName);
          if (savedData.client) setClient(savedData.client);
          if (savedData.targetConsumer) setTargetConsumer(savedData.targetConsumer);
          if (savedData.problemStatement) setProblemStatement(savedData.problemStatement);
          if (savedData.designStatement) setDesignStatement(savedData.designStatement);
          if (savedData.criteria) setCriteria(savedData.criteria);
          if (savedData.bounds) setBounds(savedData.bounds);
          if (savedData.targetWeight) setTargetWeight(savedData.targetWeight);
          if (savedData.plannedMotors) setPlannedMotors(savedData.plannedMotors);
          if (savedData.plannedPneumatics) setPlannedPneumatics(savedData.plannedPneumatics);
          if (savedData.hasMainCircuitBreaker !== undefined) setHasMainCircuitBreaker(savedData.hasMainCircuitBreaker);
          if (savedData.spendingLimit) setSpendingLimit(savedData.spendingLimit);
        }
      });
    }
  }, []);

  const handleAddCriterion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCriterionText.trim()) return;
    setCriteria([
      ...criteria,
      { id: `crit-${Date.now()}`, text: newCriterionText.trim(), category: newCriterionCat }
    ]);
    setNewCriterionText('');
  };

  const handleDeleteCriterion = (id: string) => {
    setCriteria(criteria.filter(c => c.id !== id));
  };

  const handleProceed = async () => {
    const payload = {
      seasonKey,
      designers,
      teamNumber,
      teamName,
      client,
      targetConsumer,
      problemStatement,
      designStatement,
      criteria,
      bounds,
      targetWeight,
      plannedMotors,
      plannedPneumatics,
      hasMainCircuitBreaker,
      spendingLimit
    };

    if (window.electronAPI && window.electronAPI.saveData) {
      await window.electronAPI.saveData(payload);
    } else {
      localStorage.setItem('workspace-data', JSON.stringify(payload));
    }
    
    navigate('/moscow'); 
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-950 text-slate-100 font-sans px-6 sm:px-8 lg:px-12 pt-2 pb-6 sm:pb-8 lg:pb-12 scroll-smooth [scrollbar-gutter:stable]">
      <ProcessTimeline currentStep="design-brief" />
      <div className="max-w-[1500px] mx-auto mb-8 border-b border-indigo-500/20 pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white">
                FRC Engineering Portfolio
              </span>
              <span className="text-slate-400 text-xs font-mono">Page 1: Project Scope &amp; Parameters</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white uppercase">Project Design Brief</h1>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
            <span className="text-xs text-slate-400 font-semibold font-mono">FRC Season:</span>
            <select 
              value={seasonKey} 
              onChange={(e) => setSeasonKey(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-indigo-400 font-bold rounded p-1.5 focus:outline-none"
            >
              <option value="reefscape">REEFSCAPE™ (2025)</option>
              <option value="crescendo">CRESCENDO™ (2024)</option>
              <option value="chargedup">CHARGED UP™ (2023)</option>
              <option value="rapidreact">RAPID REACT™ (2022)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 pb-20">
        {/* Left Side Inputs */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Document Information */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-lg">
            <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">
              1. Document Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              <div>
                <label className="text-slate-500 block mb-1.5 uppercase font-bold text-[10px]">Student Designer(s)</label>
                <input 
                  type="text" value={designers} onChange={(e) => setDesigners(e.target.value)}
                  placeholder="e.g. Lead Mechanical &amp; Software Engineers"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white text-sm focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1.5 uppercase font-bold text-[10px]">Team Name &amp; FRC Number</label>
                <div className="flex gap-2">
                  <input 
                    type="text" value={teamNumber} onChange={(e) => setTeamNumber(e.target.value)}
                    className="w-1/3 bg-slate-950 border border-slate-800 rounded p-3 text-center text-white text-sm focus:outline-none" placeholder="254"
                  />
                  <input 
                    type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)}
                    className="w-2/3 bg-slate-950 border border-slate-800 rounded p-3 text-white text-sm focus:outline-none" placeholder="The Cheesy Poofs"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-500 block mb-1.5 uppercase font-bold text-[10px]">Client</label>
                <input type="text" value={client} onChange={(e) => setClient(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-slate-500 block mb-1.5 uppercase font-bold text-[10px]">Target Consumer</label>
                <input type="text" value={targetConsumer} onChange={(e) => setTargetConsumer(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white text-sm focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Problem & Design Statements */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
            <div>
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-widest">2. Problem Statement</h2>
                <span className="text-[10px] text-slate-500 font-mono">Do not describe solutions</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Identify the game challenge, scoring bottlenecks, or alliance strategy problems to address.</p>
              <textarea 
                ref={problemRef} value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)}
                placeholder="Draft your formal FRC problem statement here..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-mono resize-none overflow-hidden"
              />
            </div>

            <div className="border-t border-slate-850 pt-6">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-widest">3. Design Statement</h2>
                <span className="text-[10px] text-slate-500 font-mono">Outline mechanisms &amp; FRC constraints</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Explain what your team plans to design, build, test, and program to succeed in competition matches.</p>
              <textarea 
                ref={designRef} value={designStatement} onChange={(e) => setDesignStatement(e.target.value)}
                placeholder="Design, build, test, and program an FRC robot to..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-mono resize-none overflow-hidden"
              />
            </div>
          </div>

          {/* Performance Criteria Setup */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-lg space-y-5">
            <div>
              <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2">
                4. Performance Criteria
              </h2>
              <p className="text-xs text-slate-400 mt-2 mb-4">
                List the measurable criteria you will use to evaluate candidate designs in your decision matrix.
              </p>
            </div>

            <form onSubmit={handleAddCriterion} className="bg-slate-950 p-4 rounded-lg border border-slate-850 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1.5">Criterion Description</label>
                <input 
                  type="text" placeholder="e.g. Scores Coral/Note element in under 1.5 seconds" value={newCriterionText}
                  onChange={(e) => setNewCriterionText(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1.5">Category</label>
                <select value={newCriterionCat} onChange={(e) => setNewCriterionCat(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-white focus:outline-none">
                  <option value="Intake">Intake</option>
                  <option value="Scoring">Scoring/Mechanism</option>
                  <option value="Autonomous">Autonomous</option>
                  <option value="Drivetrain">Drivetrain (Swerve)</option>
                  <option value="Climber">Climber/Endgame</option>
                  <option value="Vision">Vision/Targeting</option>
                </select>
              </div>
              <div>
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 rounded text-xs transition h-[36px]">
                  + Add
                </button>
              </div>
            </form>

            <div className="space-y-2">
              {criteria.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-4">No custom criteria added yet.</p>
              ) : (
                criteria.map(c => (
                  <div key={c.id} className="flex justify-between items-center bg-slate-950 p-3 rounded border border-slate-850 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-indigo-400 font-semibold text-[10px] uppercase font-mono bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/30">
                        {c.category}
                      </span>
                      <span className="text-slate-300 ml-1 text-sm">{c.text}</span>
                    </div>
                    <button type="button" onClick={() => handleDeleteCriterion(c.id)} className="text-slate-500 hover:text-red-400 transition text-sm">✕</button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right Side Controls */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* FRC Dimensions & Constraints */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-lg">
            <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3 border-b border-slate-800 pb-2">
              FRC Envelope Rules (R101/R103)
            </h2>
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-2">Starting Perimeter Limits (Inches)</span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[9px] text-slate-500 block mb-1">Length (X)</label>
                    <input type="number" step="0.5" value={bounds.length} onChange={(e) => setBounds({...bounds, length: parseFloat(e.target.value) || 0})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-center text-white text-xs font-mono" />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 block mb-1">Width (Y)</label>
                    <input type="number" step="0.5" value={bounds.width} onChange={(e) => setBounds({...bounds, width: parseFloat(e.target.value) || 0})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-center text-white text-xs font-mono" />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 block mb-1">Height (Z)</label>
                    <input type="number" step="0.5" value={bounds.height} onChange={(e) => setBounds({...bounds, height: parseFloat(e.target.value) || 0})} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-center text-white text-xs font-mono" />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-850 pt-4 flex justify-between items-center">
                <div>
                  <span className="text-xs font-semibold text-slate-300 block">Target Weight Goal</span>
                  <span className="text-[9px] text-slate-500">Max 125.0 lbs (excl. battery/bumpers)</span>
                </div>
                <div className="relative w-28">
                  <input type="number" step="0.5" value={targetWeight} onChange={(e) => setTargetWeight(parseFloat(e.target.value) || 0)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-right text-white text-xs font-mono pr-8" />
                  <span className="absolute right-2.5 top-2.5 text-[9px] text-slate-600 font-mono">lbs</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actuators & Safety Rules */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
            <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2">Actuators &amp; Safety Compliance</h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-300">Planned Motors / CAN IDs</span>
                <div className="flex items-center gap-1">
                  <input type="text" value={plannedMotors} onChange={(e) => setPlannedMotors(e.target.value)} className="w-12 bg-slate-950 border border-slate-800 rounded p-1 text-center text-white font-mono text-xs" placeholder="12" />
                  <span className="text-slate-500 text-[10px]">/ 20 Max PDH</span>
                </div>
              </div>
              <div className="flex justify-between items-center border-t border-slate-850 pt-3">
                <span className="text-slate-300">Planned Pneumatic Actuators</span>
                <div className="flex items-center gap-1">
                  <input type="text" value={plannedPneumatics} onChange={(e) => setPlannedPneumatics(e.target.value)} className="w-12 bg-slate-950 border border-slate-800 rounded p-1 text-center text-white font-mono text-xs" placeholder="2" />
                  <span className="text-slate-500 text-[10px]">Solenoids</span>
                </div>
              </div>
              <div className="flex justify-between items-center border-t border-slate-850 pt-3">
                <div>
                  <span className="text-slate-300 block">120A Main Circuit Breaker</span>
                  <span className="text-[9px] text-slate-500">Required by R601</span>
                </div>
                <input type="checkbox" checked={hasMainCircuitBreaker} onChange={(e) => setHasMainCircuitBreaker(e.target.checked)} className="rounded border-slate-800 text-indigo-600 bg-slate-950 h-5 w-5 cursor-pointer" />
              </div>
            </div>
          </div>

          {/* Spending Limit Ceiling */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-lg space-y-3">
            <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-1">Project Budget Ceiling</h2>
            <p className="text-[10px] text-slate-500">Establish the hardware cost limit for your overall design envelope.</p>
            <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded border border-slate-800">
              <span className="text-slate-500 font-bold text-sm">$</span>
              <input 
                type="text" value={spendingLimit} onChange={(e) => setSpendingLimit(e.target.value)}
                placeholder="4000"
                className="w-full bg-transparent border-none text-white font-mono font-bold text-sm focus:ring-0 p-0" 
              />
            </div>
          </div>

          {/* Proceed Action Trigger */}
          <button 
            type="button" onClick={handleProceed}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-lg transition shadow-lg text-sm tracking-wider text-center"
          >
            Save &amp; Continue to MoSCoW Prioritization →
          </button>

        </div>
      </div>
    </div>
  );
}