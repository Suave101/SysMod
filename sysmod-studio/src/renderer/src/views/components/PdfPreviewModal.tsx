import React, { useRef, useCallback } from 'react';
import { X, Printer, FileText } from 'lucide-react';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  htmlContent: string;
}

export function PdfPreviewModal({ isOpen, onClose, htmlContent }: PdfPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = useCallback(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    }
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
      onClick={handleBackdropClick}
    >
      <div className="w-[92vw] h-[92vh] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-sky-400" />
            <h2 className="font-mono font-bold text-slate-100 text-sm tracking-wide">
              FRC CAD Electrical Schematic Preview
            </h2>
            <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-sky-950 text-sky-400 border border-sky-800/60 uppercase tracking-widest font-bold">
              Printable Specification
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-1.5 rounded text-xs font-mono font-bold bg-sky-600 text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/20"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Embedded Isolated Print Frame */}
        <div className="flex-1 bg-slate-950 p-3 overflow-hidden">
          <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            title="CAD Schematic PDF Report"
            className="w-full h-full rounded border border-slate-800 bg-white shadow-inner"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-800 bg-slate-950/60 shrink-0">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            SysMod Studio · Engineering CAD Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-mono bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-100 border border-slate-700 transition"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}