/**
 * Monaco Editor environment bootstrap.
 *
 * Must be imported ONCE, at the top of main.tsx (before React renders),
 * so that @monaco-editor/react uses the local ESM package instead of the
 * CDN AMD loader.  This is required in Electron because:
 *   1. The default CDN (jsDelivr) may be blocked by Electron's CSP.
 *   2. Monaco's AMD `require` conflicts with Electron's patched Node `require`.
 */

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// ── 1. Point @monaco-editor/react at the local package ────────────────────
loader.config({ monaco });

// ── 2. Provide MonacoEnvironment BEFORE the loader resolves ───────────────
//
// Monaco's Monarch tokenizers (syntax highlighting) run entirely in the main
// thread, so a minimal stub worker is sufficient for a read-only viewer.
// Workers are only needed for language *services* (IntelliSense, diagnostics),
// which we don't use.
(window as Window & { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker(_moduleId: string, _label: string): Worker {
    const blob = new Blob(['self.onmessage = function() {};'], {
      type: 'application/javascript',
    });
    return new Worker(URL.createObjectURL(blob));
  },
};
