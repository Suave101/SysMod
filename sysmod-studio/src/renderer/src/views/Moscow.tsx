import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus, GripVertical, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react';

type Task = { id: string; content: string };
type Columns = {
  must: Task[];
  should: Task[];
  could: Task[];
  wont: Task[];
};

export default function Moscow() {
  const navigate = useNavigate();
  const [newTask, setNewTask] = useState('');
  const [columns, setColumns] = useState<Columns>({
    must: [],
    should: [],
    could: [],
    wont: []
  });
  const [warning, setWarning] = useState(false);

  // Load criteria from DesignBrief or prior saved MoSCoW board state
  useEffect(() => {
    const loadSavedData = async () => {
      let savedData: any = null;
      if (window.electronAPI && window.electronAPI.loadData) {
        savedData = await window.electronAPI.loadData();
      } else {
        const local = localStorage.getItem('workspace-data');
        if (local) savedData = JSON.parse(local);
      }

      if (savedData) {
        if (savedData.moscow) {
          setColumns(savedData.moscow);
        } else if (savedData.criteria && savedData.criteria.length > 0) {
          // If they have raw criteria from Page 1, import them into 'Could' as a starting point
          const importedTasks: Task[] = savedData.criteria.map((c: any) => ({
            id: c.id || `crit-${Date.now()}-${Math.random()}`,
            content: c.text ? `[${c.category}] ${c.text}` : c.content
          }));
          setColumns({
            must: [],
            should: [],
            could: importedTasks,
            wont: []
          });
        }
      }
    };

    loadSavedData();
  }, []);

  // Show warning if Must Have exceeds 60% of requirements
  useEffect(() => {
    const total = columns.must.length + columns.should.length + columns.could.length + columns.wont.length;
    if (total > 0 && (columns.must.length / total) > 0.6) {
      setWarning(true);
    } else {
      setWarning(false);
    }
  }, [columns]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;

    if (source.droppableId !== destination.droppableId) {
      const sourceColumn = columns[source.droppableId as keyof Columns];
      const destColumn = columns[destination.droppableId as keyof Columns];
      const sourceItems = [...sourceColumn];
      const destItems = [...destColumn];
      const [removed] = sourceItems.splice(source.index, 1);
      
      destItems.splice(destination.index, 0, removed);
      
      setColumns({
        ...columns,
        [source.droppableId]: sourceItems,
        [destination.droppableId]: destItems
      });
    } else {
      const column = columns[source.droppableId as keyof Columns];
      const copiedItems = [...column];
      const [removed] = copiedItems.splice(source.index, 1);
      copiedItems.splice(destination.index, 0, removed);
      
      setColumns({
        ...columns,
        [source.droppableId]: copiedItems
      });
    }
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    const task: Task = { id: `crit-${Date.now()}`, content: newTask.trim() };
    setColumns({ ...columns, could: [...columns.could, task] });
    setNewTask('');
  };

  const handleProceed = async () => {
    let existingData: any = {};
    if (window.electronAPI && window.electronAPI.loadData) {
      existingData = await window.electronAPI.loadData() || {};
    } else {
      const local = localStorage.getItem('workspace-data');
      if (local) existingData = JSON.parse(local);
    }

    const payload = {
      ...existingData,
      moscow: columns
    };

    if (window.electronAPI && window.electronAPI.saveData) {
      await window.electronAPI.saveData(payload);
    } else {
      localStorage.setItem('workspace-data', JSON.stringify(payload));
    }

    navigate('/brainstorming'); // Proceed to Brainstorming (Decision Matrix)
  };

  const columnConfig = {
    must: { title: '🔴 MUST HAVE', desc: 'Critical requirements' },
    should: { title: '🟡 SHOULD HAVE', desc: 'High priority, but not critical' },
    could: { title: '🟢 COULD HAVE', desc: 'Nice-to-have stretch goals' },
    wont: { title: '⚪ WON\'T HAVE', desc: 'Explicitly excluded' }
  };

  return (
    <div className="h-screen w-full bg-[#0a0d14] text-slate-300 p-10 flex flex-col font-sans overflow-hidden">
      <header className="border-b border-slate-800/60 pb-6 mb-8 shrink-0 flex justify-between items-end">
        <div>
          <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded uppercase tracking-wider mb-2 inline-block">
            PLTW Portfolio Component
          </span>
          <h1 className="text-3xl font-extrabold text-white tracking-tight uppercase">Strategic Prioritization (MoSCoW)</h1>
          <p className="text-sm text-slate-400 mt-2 font-medium">Phase 2: Establish Weights for the Decision Matrix</p>
        </div>
        
        <div className="flex items-center gap-4">
          {warning && (
            <div className="flex items-center gap-2 text-amber-400 bg-amber-400/10 px-4 py-2 rounded border border-amber-400/20">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm font-bold">Warning: Over 60% of capabilities are MUST HAVE.</span>
            </div>
          )}
          <button 
            onClick={() => navigate('/')} 
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button 
            onClick={handleProceed} 
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-lg transition text-sm flex items-center gap-2 uppercase tracking-wide"
          >
            Go to Decision Matrix <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <form onSubmit={addTask} className="mb-8 shrink-0 flex gap-4">
        <input 
          type="text" 
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Enter a robot capability or constraint..."
          className="flex-1 bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 text-slate-200 focus:outline-none focus:border-indigo-500 transition-all shadow-inner"
        />
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 rounded-lg transition flex items-center gap-2">
          <Plus className="w-5 h-5" /> Add Criterion
        </button>
      </form>

      <div className="flex-1 min-h-0">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-4 gap-6 h-full">
            {(Object.entries(columns) as [keyof Columns, Task[]][]).map(([columnId, columnTasks]) => (
              <div key={columnId} className="flex flex-col bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 bg-slate-800/80 border-b border-slate-700/50">
                  <h2 className="font-bold text-slate-200 text-sm tracking-wide">{columnConfig[columnId].title}</h2>
                  <p className="text-xs text-slate-500 mt-1">{columnConfig[columnId].desc}</p>
                </div>

                <Droppable droppableId={columnId}>
                  {(provided, snapshot) => (
                    <div 
                      {...provided.droppableProps} 
                      ref={provided.innerRef}
                      className={`flex-1 p-4 overflow-y-auto transition-colors ${snapshot.isDraggingOver ? 'bg-indigo-950/20' : ''}`}
                    >
                      {columnTasks.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`group flex items-center gap-3 bg-[#0a0d14] border p-3 mb-3 rounded shadow-md transition-all ${
                                snapshot.isDragging ? 'border-indigo-500 shadow-indigo-500/20' : 'border-slate-700/60 hover:border-slate-500'
                              }`}
                            >
                              <div {...provided.dragHandleProps} className="text-slate-600 group-hover:text-slate-400 transition-colors">
                                <GripVertical className="w-4 h-4" />
                              </div>
                              <span className="text-sm font-medium text-slate-300">{item.content}</span>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}