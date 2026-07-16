import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Plus, DollarSign } from 'lucide-react';

interface WeightedCriterion {
  id: string;
  text: string;
  weight: number;
  category: string;
}

interface Subsystem {
  id: string;
  name: string;
  budget: string;
}

interface Alternative {
  id: string;
  name: string;
  scores: Record<string, number>; // Maps criterion.id -> score (1-5)
}

export default function Brainstorming() {
  const navigate = useNavigate();

  const [criteria, setCriteria] = useState<WeightedCriterion[]>([]);
  const [spendingLimit, setSpendingLimit] = useState('0');
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [newSubName, setNewSubName] = useState('');
  const [newSubBudget, setNewSubBudget] = useState('');

  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [newAltName, setNewAltName] = useState('');

  // Load state and map the MoSCoW priorities to weights
  useEffect(() => {
    const processData = (data: any) => {
      if (!data) return;

      if (data.spendingLimit) setSpendingLimit(data.spendingLimit);
      if (data.subsystems) setSubsystems(data.subsystems);
      if (data.alternatives) setAlternatives(data.alternatives);

      if (data.moscow) {
        const weightedList: WeightedCriterion[] = [];
        
        // Must Have = Weight 3
        if (data.moscow.must) {
          data.moscow.must.forEach((item: any) => {
            weightedList.push({ id: item.id, text: item.content, weight: 3, category: 'Must' });
          });
        }
        // Should Have = Weight 2
        if (data.moscow.should) {
          data.moscow.should.forEach((item: any) => {
            weightedList.push({ id: item.id, text: item.content, weight: 2, category: 'Should' });
          });
        }
        // Could Have = Weight 1
        if (data.moscow.could) {
          data.moscow.could.forEach((item: any) => {
            weightedList.push({ id: item.id, text: item.content, weight: 1, category: 'Could' });
          });
        }
        // (Won't Have targets have weight 0, meaning they are excluded from the Matrix columns)

        setCriteria(weightedList);
      }
    };

    if (window.electronAPI && window.electronAPI.loadData) {
      window.electronAPI.loadData().then(processData);
    } else {
      const saved = localStorage.getItem('workspace-data');
      if (saved) processData(JSON.parse(saved));
    }
  }, []);

  const saveState = async (updatedSubs: Subsystem[], updatedAlts: Alternative[]) => {
    let baseData: any = {};
    if (window.electronAPI && window.electronAPI.loadData) {
      baseData = await window.electronAPI.loadData() || {};
    } else {
      const raw = localStorage.getItem('workspace-data');
      if (raw) baseData = JSON.parse(raw);
    }

    const payload = {
      ...baseData,
      subsystems: updatedSubs,
      alternatives: updatedAlts
    };

    if (window.electronAPI && window.electronAPI.saveData) {
      await window.electronAPI.saveData(payload);
    } else {
      localStorage.setItem('workspace-data', JSON.stringify(payload));
    }
  };

  const handleProceed = async () => {
    let baseData: any = {};
    
    // 1. Load existing data (so we don't wipe out Page 1 & Page 2 info)
    if (window.electronAPI && window.electronAPI.loadData) {
      baseData = await window.electronAPI.loadData() || {};
    } else {
      const raw = localStorage.getItem('workspace-data');
      if (raw) baseData = JSON.parse(raw);
    }
  
    // 2. Merge the current Brainstorming states
    const payload = {
      ...baseData,
      subsystems: subsystems,
      alternatives: alternatives
    };
  
    // 3. Save the payload back to the local JSON file (or localStorage fallback)
    if (window.electronAPI && window.electronAPI.saveData) {
      await window.electronAPI.saveData(payload);
    } else {
      localStorage.setItem('workspace-data', JSON.stringify(payload));
    }
  
    // 4. Move on to the architecture view
    navigate('/architecture');
  };

  const handleAddSubsystem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    const list = [...subsystems, { id: `sub-${Date.now()}`, name: newSubName.trim(), budget: newSubBudget || '0' }];
    setSubsystems(list);
    setNewSubName('');
    setNewSubBudget('');
    saveState(list, alternatives);
  };

  const handleDeleteSubsystem = (id: string) => {
    const list = subsystems.filter(s => s.id !== id);
    setSubsystems(list);
    saveState(list, alternatives);
  };

  const handleAddAlternative = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAltName.trim()) return;
    const list = [...alternatives, { id: `alt-${Date.now()}`, name: newAltName.trim(), scores: {} }];
    setAlternatives(list);
    setNewAltName('');
    saveState(subsystems, list);
  };

  const handleDeleteAlternative = (id: string) => {
    const list = alternatives.filter(a => a.id !== id);
    setAlternatives(list);
    saveState(subsystems, list);
  };

  const handleScoreChange = (altId: string, critId: string, val: number) => {
    const list = alternatives.map(alt => {
      if (alt.id === altId) {
        return { ...alt, scores: { ...alt.scores, [critId]: val } };
      }
      return alt;
    });
    setAlternatives(list);
    saveState(subsystems, list);
  };

  const totalAllocated = useMemo(() => {
    return subsystems.reduce((acc, sub) => acc + (parseFloat(sub.budget) || 0), 0);
  }, [subsystems]);

  const limitNum = parseFloat(spendingLimit) || 0;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#0a0d14] text-slate-100 font-sans p-10 scroll-smooth">
      <header className="max-w-[1500px] mx-auto mb-8 border-b border-slate-800 pb-6 flex justify-between items-end">
        <div>
          <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded uppercase tracking-wider mb-2 inline-block">
            PLTW Portfolio Component
          </span>
          <h1 className="text-3xl font-extrabold text-white tracking-tight uppercase">Evaluation Matrix (Brainstorming)</h1>
          <p className="text-sm text-slate-400 mt-2 font-medium">Phase 3: Rate Design Alternatives Against Prioritized Criteria</p>
        </div>
        <button 
          onClick={() => navigate('/moscow')} 
          className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 font-bold rounded-lg px-4 py-2.5 transition flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to MoSCoW
        </button>
      </header>

      <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 pb-20">
        
        {/* Left Side: Decision Matrix */}
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
            <div>
              <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
                Engineering Decision Matrix
              </h2>
              <p className="text-xs text-slate-400 mt-2">
                Rate each alternative alternative from 1 to 5. The total automatically updates: 
                <strong className="text-indigo-400 ml-1 font-mono">Sum of (Score × MoSCoW Weight)</strong>.
              </p>
            </div>

            <form onSubmit={handleAddAlternative} className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Candidate Alternative</label>
                <input 
                  type="text" 
                  placeholder="e.g. Double-Roller Intake System" 
                  value={newAltName}
                  onChange={(e) => setNewAltName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 rounded text-xs transition h-[34px] flex items-center gap-1">
                <Plus className="w-4 h-4" /> Add Alternative
              </button>
            </form>

            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-850">
                    <th className="p-3 font-semibold w-1/3">Alternative Name</th>
                    {criteria.map((c) => (
                      <th key={c.id} className="p-3 font-semibold text-center border-l border-slate-850 min-w-[120px]">
                        <span className="block text-[9px] text-indigo-400 font-mono uppercase font-bold">
                          {c.category} (w:{c.weight})
                        </span>
                        <span className="block text-[10px] text-slate-300 font-normal line-clamp-1" title={c.text}>{c.text}</span>
                      </th>
                    ))}
                    <th className="p-3 font-bold text-center border-l border-slate-850 bg-indigo-950/20 text-indigo-400 w-24">Weighted Total</th>
                    <th className="p-3 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {alternatives.length === 0 ? (
                    <tr>
                      <td colSpan={criteria.length + 3} className="p-6 text-center text-slate-500 italic">No alternative designs added yet.</td>
                    </tr>
                  ) : (
                    alternatives.map((alt) => {
                      const totalWeightedScore = criteria.reduce((sum, crit) => {
                        const score = alt.scores[crit.id] || 0;
                        return sum + (score * crit.weight);
                      }, 0);

                      return (
                        <tr key={alt.id} className="hover:bg-slate-900/10">
                          <td className="p-3 font-medium text-slate-200 text-sm">{alt.name}</td>
                          {criteria.map((c) => (
                            <td key={c.id} className="p-3 border-l border-slate-850 text-center">
                              <select 
                                value={alt.scores[c.id] || 0}
                                onChange={(e) => handleScoreChange(alt.id, c.id, parseInt(e.target.value) || 0)}
                                className="bg-slate-950 border border-slate-800 text-xs rounded text-white py-1 px-1.5 focus:outline-none"
                              >
                                <option value="0">-</option>
                                <option value="1">1 (Poor)</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                                <option value="4">4</option>
                                <option value="5">5 (Best)</option>
                              </select>
                            </td>
                          ))}
                          <td className="p-3 border-l border-slate-850 text-center font-bold text-sm bg-indigo-950/40 text-emerald-400">
                            {totalWeightedScore}
                          </td>
                          <td className="p-3 text-center">
                            <button type="button" onClick={() => handleDeleteAlternative(alt.id)} className="text-slate-600 hover:text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: Custom Subsystems */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 shadow-lg space-y-5">
            <div>
              <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
                Subsystem Budgets
              </h2>
              <p className="text-[10px] text-slate-400 mt-1">
                Allocate parts margins to different physical modules of your design.
              </p>
            </div>

            <form onSubmit={handleAddSubsystem} className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 space-y-3">
              <div>
                <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Subsystem Name</label>
                <input 
                  type="text" placeholder="e.g. Elevator Assembly" value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Estimated Cost ($)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" placeholder="0" value={newSubBudget}
                    onChange={(e) => setNewSubBudget(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none"
                  />
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 rounded text-xs transition">
                    + Add
                  </button>
                </div>
              </div>
            </form>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {subsystems.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-4">No custom subsystems built yet.</p>
              ) : (
                subsystems.map(s => (
                  <div key={s.id} className="flex justify-between items-center bg-slate-950 p-3 rounded border border-slate-850 text-xs">
                    <div>
                      <span className="font-semibold text-slate-200 block">{s.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">${parseFloat(s.budget).toLocaleString()}</span>
                    </div>
                    <button type="button" onClick={() => handleDeleteSubsystem(s.id)} className="text-slate-500 hover:text-red-400">✕</button>
                  </div>
                ))
              )}
            </div>

            {/* Calculations Summary Card */}
            <div className="border-t border-slate-800 pt-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Budget Cap (from Brief):</span>
                <span className="font-mono text-slate-200">${limitNum.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total Allocated:</span>
                <span className="font-mono text-slate-200">${totalAllocated.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-sm pt-2 border-t border-dashed border-slate-800">
                <span>Remaining Balance:</span>
                <span className={`${(limitNum - totalAllocated < 0) ? 'text-red-400' : 'text-emerald-400'} font-mono`}>
                  ${(limitNum - totalAllocated).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Proceed Action Trigger */}
          <button 
            type="button" onClick={handleProceed}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-lg transition shadow-lg text-sm tracking-wider text-center"
          >
            Save &amp; Continue to Architectural Design Canvas →
          </button>
        </div>

      </div>
    </div>
  );
}