import React, { useState, useCallback } from 'react';
import Editor, { type BeforeMount } from '@monaco-editor/react';
import { X, Copy, Check, Code2, FileText, Loader2 } from 'lucide-react';

type Tab = 'aadl' | 'java';

interface CodeViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  aadlCode: string;
  javaCode: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Register the AADL language + SysMod dark theme once Monaco loads.
// This callback is invoked by <Editor beforeMount={...}> before the first render.
// ─────────────────────────────────────────────────────────────────────────────
const beforeMonacoMount: BeforeMount = (monaco) => {
  // Avoid double-registration across hot-reloads
  if (!monaco.languages.getLanguages().some((l) => l.id === 'aadl')) {
    monaco.languages.register({ id: 'aadl', extensions: ['.aadl'], aliases: ['AADL'] });

    monaco.languages.setMonarchTokensProvider('aadl', {
      defaultToken: '',
      tokenPostfix: '.aadl',
      tokenizer: {
        root: [
          // Line comments
          [/--.*$/, 'comment'],
          // Strings
          [/"[^"]*"/, 'string'],
          // Keywords
          [
            /\b(?:package|public|private|end|is|with|system|device|processor|bus|memory|process|thread|data|subprogram|port|feature|features|subcomponents|connections|properties|implementation|in|out|event|requires|provides|extends|refined|to|access|flow|modes|annex|abstract|none|delta|applies|not|and|or|true|false|all|type)\b/,
            'keyword',
          ],
          // Numbers
          [/[0-9]+(?:\.[0-9]+)?(?:[Ee][+-]?[0-9]+)?/, 'number'],
          // Identifiers
          [/[a-zA-Z_][a-zA-Z0-9_.]*/, 'identifier'],
          // Arrows / colons / separators
          [/->|<->|::|=>|:/, 'operator'],
          [/[;,]/, 'delimiter'],
          // Whitespace
          [/\s+/, 'white'],
        ],
      },
    });
  }

  // Define the SysMod dark theme (works for both 'aadl' and 'java')
  monaco.editor.defineTheme('sysmod-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment',    foreground: '5A8A5E', fontStyle: 'italic' },
      { token: 'keyword',    foreground: '5B9BD5', fontStyle: 'bold'   },
      { token: 'string',     foreground: 'CE9178'                      },
      { token: 'number',     foreground: 'B5CEA8'                      },
      { token: 'identifier', foreground: 'D4D4D4'                      },
      { token: 'operator',   foreground: 'C586C0'                      },
      { token: 'delimiter',  foreground: '808080'                      },
      // Java-specific tokens
      { token: 'keyword.java',      foreground: '5B9BD5', fontStyle: 'bold' },
      { token: 'string.java',       foreground: 'CE9178'                    },
      { token: 'comment.java',      foreground: '5A8A5E', fontStyle: 'italic' },
      { token: 'annotation.java',   foreground: 'DCDCAA'                    },
    ],
    colors: {
      'editor.background':              '#0F172A', // slate-950
      'editor.foreground':              '#CBD5E1', // slate-300
      'editorLineNumber.foreground':    '#475569', // slate-600
      'editorLineNumber.activeForeground': '#94A3B8',
      'editorGutter.background':        '#0F172A',
      'editor.selectionBackground':     '#1E40AF55',
      'editor.lineHighlightBackground': '#1E293B',
      'editorCursor.foreground':        '#F59E0B', // amber-500
      'editorIndentGuide.background':   '#1E293B',
      'editorIndentGuide.activeBackground': '#334155',
      'scrollbar.shadow':               '#00000000',
      'scrollbarSlider.background':     '#334155AA',
      'scrollbarSlider.hoverBackground':'#475569CC',
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

// ─────────────────────────────────────────────────────────────────────────────
// Modal Component
// ─────────────────────────────────────────────────────────────────────────────
export function CodeViewerModal({ isOpen, onClose, aadlCode, javaCode }: CodeViewerModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('aadl');
  const [copied, setCopied] = useState(false);

  const currentCode = activeTab === 'aadl' ? aadlCode : javaCode;
  const currentLanguage = activeTab === 'aadl' ? 'aadl' : 'java';

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — silent fail
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

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-5 h-5 text-amber-400" />
            <h2 className="font-mono font-bold text-slate-100 text-sm tracking-wide">
              Generated Code Preview
            </h2>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-500 border border-slate-700 uppercase tracking-widest">
              read-only
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

        {/* ── Tab Bar ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-4 pt-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
          <TabButton
            active={activeTab === 'aadl'}
            onClick={() => setActiveTab('aadl')}
            icon={<FileText className="w-3.5 h-3.5" />}
            label="AADL Architecture"
          />
          <TabButton
            active={activeTab === 'java'}
            onClick={() => setActiveTab('java')}
            icon={<Code2 className="w-3.5 h-3.5" />}
            label="Java Hardware Map"
          />

          {/* Push copy to the right */}
          <div className="flex-1" />
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 mb-1.5 rounded text-xs font-mono transition border ${
              copied
                ? 'text-green-400 bg-green-400/10 border-green-400/30'
                : 'text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border-slate-700'
            }`}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* ── Monaco Editor ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          <Editor
            key={activeTab}           // remount on tab switch → correct language + scroll reset
            height="100%"
            language={currentLanguage}
            value={currentCode}
            theme="sysmod-dark"
            beforeMount={beforeMonacoMount}
            options={EDITOR_OPTIONS}
            loading={
              <div className="flex items-center justify-center h-full bg-slate-950">
                <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  Loading Monaco Editor…
                </div>
              </div>
            }
          />
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-800 bg-slate-950/60 shrink-0">
          <span className="text-[10px] font-mono text-slate-700 uppercase tracking-widest select-none">
            SysMod Studio · MBSE Engine · {new Date().getFullYear()}
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

// ─────────────────────────────────────────────────────────────────────────────
// Small helper component for tabs
// ─────────────────────────────────────────────────────────────────────────────
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
          ? 'text-amber-400 border-amber-400 bg-slate-800/60'
          : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
