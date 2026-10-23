import React, { useState, useCallback } from 'react';
import Editor, { type BeforeMount } from '@monaco-editor/react';
import { X, Copy, Check, Code2, FileText, Loader2, Terminal } from 'lucide-react';

type Tab = 'python' | 'java' | 'aadl';

interface CodeViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  aadlCode: string;
  javaCode: string;
  pythonCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Register AADL + SysMod dark theme once Monaco mounts.
// ─────────────────────────────────────────────────────────────────────────────
const beforeMonacoMount: BeforeMount = (monaco) => {
  // Register AADL language definition if not already registered
  if (!monaco.languages.getLanguages().some((l) => l.id === 'aadl')) {
    monaco.languages.register({ id: 'aadl', extensions: ['.aadl'], aliases: ['AADL'] });

    monaco.languages.setMonarchTokensProvider('aadl', {
      defaultToken: '',
      tokenPostfix: '.aadl',
      tokenizer: {
        root: [
          [/--.*$/, 'comment'],
          [/"[^"]*"/, 'string'],
          [
            /\b(?:package|public|private|end|is|with|system|device|processor|bus|memory|process|thread|data|subprogram|port|feature|features|subcomponents|connections|properties|implementation|in|out|event|requires|provides|extends|refined|to|access|flow|modes|annex|abstract|none|delta|applies|not|and|or|true|false|all|type)\b/,
            'keyword',
          ],
          [/[0-9]+(?:\.[0-9]+)?(?:[Ee][+-]?[0-9]+)?/, 'number'],
          [/[a-zA-Z_][a-zA-Z0-9_.]*/, 'identifier'],
          [/->|<->|::|=>|:/, 'operator'],
          [/[;,]/, 'delimiter'],
          [/\s+/, 'white'],
        ],
      },
    });
  }

  // Define SysMod dark theme supporting AADL, Java, and Python
  monaco.editor.defineTheme('sysmod-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5A8A5E', fontStyle: 'italic' },
      { token: 'keyword', foreground: '5B9BD5', fontStyle: 'bold' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'identifier', foreground: 'D4D4D4' },
      { token: 'operator', foreground: 'C586C0' },
      { token: 'delimiter', foreground: '808080' },
      // Java / Python specific tokens
      { token: 'keyword.java', foreground: '5B9BD5', fontStyle: 'bold' },
      { token: 'keyword.python', foreground: '4EC9B0', fontStyle: 'bold' },
      { token: 'string.python', foreground: 'CE9178' },
      { token: 'comment.python', foreground: '5A8A5E', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#0F172A', // slate-950
      'editor.foreground': '#CBD5E1', // slate-300
      'editorLineNumber.foreground': '#475569', // slate-600
      'editorLineNumber.activeForeground': '#94A3B8',
      'editorGutter.background': '#0F172A',
      'editor.selectionBackground': '#1E40AF55',
      'editor.lineHighlightBackground': '#1E293B',
      'editorCursor.foreground': '#F59E0B', // amber-500
      'editorIndentGuide.background': '#1E293B',
      'editorIndentGuide.activeBackground': '#334155',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': '#334155AA',
      'scrollbarSlider.hoverBackground': '#475569CC',
    },
  });
};

const EDITOR_OPTIONS = {
  readOnly: true,
  fontSize: 13,
  fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
  fontLigatures: true,
  minimap: { enabled: true, scale: 1 },
  scrollBeyondLastLine: false,
  lineNumbers: 'on' as const,
  renderLineHighlight: 'line' as const,
  wordWrap: 'off' as const,
  scrollbar: { vertical: 'auto' as const, horizontal: 'auto' as const },
  padding: { top: 18, bottom: 18 },
  bracketPairColorization: { enabled: true },
  renderWhitespace: 'none' as const,
  cursorStyle: 'line' as const,
  cursorBlinking: 'smooth' as const,
  smoothScrolling: true,
  contextmenu: false,
  occurrencesHighlight: 'off' as const,
  selectionHighlight: false,
  renderValidationDecorations: 'off' as const,
};

export function CodeViewerModal({
  isOpen,
  onClose,
  aadlCode,
  javaCode,
  pythonCode = '',
}: CodeViewerModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('python');
  const [copied, setCopied] = useState(false);

  const getCodeAndLang = useCallback(() => {
    switch (activeTab) {
      case 'python':
        return { code: pythonCode, lang: 'python' };
      case 'java':
        return { code: javaCode, lang: 'java' };
      case 'aadl':
        return { code: aadlCode, lang: 'aadl' };
    }
  }, [activeTab, pythonCode, javaCode, aadlCode]);

  const { code: currentCode, lang: currentLanguage } = getCodeAndLang();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fail silently if Clipboard API is restricted
    }
  }, [currentCode]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-[88vw] h-[88vh] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-5 h-5 text-indigo-400" />
            <h2 className="font-mono font-bold text-slate-100 text-sm tracking-wide">
              FRC Generated Code Preview
            </h2>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 border border-slate-700 uppercase tracking-widest">
              WPILib Target
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:text-slate-100 hover:bg-slate-800 transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 px-4 pt-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
          <TabButton
            active={activeTab === 'python'}
            onClick={() => setActiveTab('python')}
            icon={<Terminal className="w-3.5 h-3.5 text-emerald-400" />}
            label="Python (RobotPy)"
          />
          <TabButton
            active={activeTab === 'java'}
            onClick={() => setActiveTab('java')}
            icon={<Code2 className="w-3.5 h-3.5 text-amber-400" />}
            label="Java (WPILib)"
          />
          <TabButton
            active={activeTab === 'aadl'}
            onClick={() => setActiveTab('aadl')}
            icon={<FileText className="w-3.5 h-3.5 text-indigo-400" />}
            label="AADL Architecture"
          />

          <div className="flex-1" />
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 mb-1.5 rounded text-xs font-mono transition border ${
              copied
                ? 'text-green-400 bg-green-400/10 border-green-400/30'
                : 'text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Monaco Editor Container */}
        <div className="flex-1 overflow-hidden">
          <Editor
            key={activeTab}
            height="100%"
            language={currentLanguage}
            value={currentCode}
            theme="sysmod-dark"
            beforeMount={beforeMonacoMount}
            options={EDITOR_OPTIONS}
            loading={
              <div className="flex items-center justify-center h-full bg-slate-950">
                <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  Loading Monaco Editor...
                </div>
              </div>
            }
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-800 bg-slate-950/60 shrink-0">
          <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest select-none">
            SysMod Studio · WPILib & RobotPy Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-mono bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-100 border border-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-t text-xs font-mono transition border-b-2 -mb-px ${
        active
          ? 'text-indigo-400 border-indigo-400 bg-slate-800/60 font-bold'
          : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}