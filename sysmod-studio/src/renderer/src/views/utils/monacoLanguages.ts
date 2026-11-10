/**
 * Monaco setup shared by every editor in the app: the AADL and AGREE languages, the sysmod-dark
 * theme, and default read-only editor options.
 */
import type { BeforeMount } from '@monaco-editor/react';

export const beforeMonacoMount: BeforeMount = (monaco) => {
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

  if (!monaco.languages.getLanguages().some((l) => l.id === 'agree')) {
    monaco.languages.register({ id: 'agree', aliases: ['AGREE'] });

    monaco.languages.setMonarchTokensProvider('agree', {
      defaultToken: '',
      ignoreCase: true,
      tokenizer: {
        root: [
          [/--.*$/, 'comment'],
          [/"[^"]*"/, 'string'],
          [/\b(?:assume|guarantee|lemma|assert|eq|const|pre|prev|if|then|else|and|or|xor|not|div|mod|true|false|bool|int|real)\b/, 'keyword'],
          [/[0-9]+(?:\.[0-9]+)?(?:[Ee][+-]?[0-9]+)?/, 'number'],
          [/[a-zA-Z_][a-zA-Z0-9_.]*/, 'identifier'],
          [/<=>|->|=>|<>|<=|>=|[=<>+\-*/:]/, 'operator'],
          [/[;,()]/, 'delimiter'],
          [/\s+/, 'white'],
        ],
      },
    });
  }

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
    ],
    colors: {
      'editor.background': '#0F172A',
      'editor.foreground': '#CBD5E1',
      'editorLineNumber.foreground': '#475569',
      'editorLineNumber.activeForeground': '#94A3B8',
      'editorGutter.background': '#0F172A',
      'editor.selectionBackground': '#1E40AF55',
      'editor.lineHighlightBackground': '#1E293B',
      'editorCursor.foreground': '#F59E0B',
    },
  });
};

export const EDITOR_OPTIONS = {
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
  smoothScrolling: true,
  contextmenu: false,
};
