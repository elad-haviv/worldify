import React, { useState } from 'react';
import {
  FileText,
  FileDown,
  BookOpen,
  FolderArchive,
  Download,
  X,
  Printer,
  Sparkles,
  Layers,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Entity, Project } from '../types/worldify';
import {
  exportEntityToMarkdown,
  exportEntityToWord,
  exportEntityToPdf,
  exportProjectToObsidianVaultZip,
  exportProjectToBookWord,
  exportProjectToBookPdf,
  downloadBlob,
} from '../utils/exportService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  activeEntity?: Entity | null;
  initialTab?: 'page' | 'project';
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  activeEntity,
  initialTab = 'project',
}) => {
  const [tab, setTab] = useState<'page' | 'project'>(
    activeEntity && initialTab === 'page' ? 'page' : 'project'
  );
  const [isExporting, setIsExporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAction = async (fn: () => Promise<void> | void, successText: string) => {
    try {
      setIsExporting(true);
      await fn();
      setSuccessMsg(successText);
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3500);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed: ' + String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Export & Publish</h2>
              <p className="text-xs text-slate-400">
                {tab === 'page' && activeEntity
                  ? `Export "${activeEntity.title}" to standard formats`
                  : `Export "${project.name}" as an encyclopedia or vault`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switchers if on wiki page */}
        {activeEntity && (
          <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 pt-2">
            <button
              type="button"
              onClick={() => setTab('page')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${
                tab === 'page'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Current Wiki Page ({activeEntity.title.slice(0, 16)}...)
            </button>
            <button
              type="button"
              onClick={() => setTab('project')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${
                tab === 'project'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Entire Project ({project.name})
            </button>
          </div>
        )}

        {/* Success toast banner */}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Body Options */}
        <div className="p-6 space-y-3.5 overflow-y-auto max-h-[65vh]">
          {tab === 'page' && activeEntity ? (
            <>
              {/* Single Wiki Page Options */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() =>
                  handleAction(
                    () => exportEntityToPdf(activeEntity, project),
                    `Opened print-to-PDF document for "${activeEntity.title}"!`
                  )
                }
                className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-850 hover:border-amber-500/50 flex items-start gap-3.5 transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/25 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Printer className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    Printable PDF Document (.pdf)
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                      Print Ready
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    High-end book typography with metadata callouts, properties table, and styled wikilinks formatted for printing or saving as PDF.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() =>
                  handleAction(
                    () => exportEntityToWord(activeEntity, project),
                    `Exported "${activeEntity.title}.docx" successfully!`
                  )
                }
                className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-850 hover:border-amber-500/50 flex items-start gap-3.5 transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/25 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    Microsoft Word Document (.docx)
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      Editable
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Formatted document with Word Heading styles, metadata tables, quote blocks, bullet points, and connected relationships.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() =>
                  handleAction(
                    () => exportEntityToMarkdown(activeEntity, project),
                    `Exported "${activeEntity.title}.md" successfully!`
                  )
                }
                className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-850 hover:border-amber-500/50 flex items-start gap-3.5 transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/25 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FileDown className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    Obsidian Markdown Note (.md)
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                      Obsidian Ready
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Clean Markdown with Obsidian YAML frontmatter, tags, properties table, and interconnected wikilinks.
                  </p>
                </div>
              </button>
            </>
          ) : (
            <>
              {/* Entire Project Options */}

              {/* 1. Obsidian Vault .zip */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() =>
                  handleAction(
                    () => exportProjectToObsidianVaultZip(project),
                    `Generated Obsidian vault ZIP with ${project.entities.length} notes!`
                  )
                }
                className="w-full text-left p-4 rounded-xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 hover:border-amber-500 flex items-start gap-3.5 transition-all group cursor-pointer shadow-lg"
              >
                <div className="w-11 h-11 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform font-bold">
                  <FolderArchive className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-50 flex items-center gap-2">
                    Obsidian Vault Archive (.zip)
                    <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                      Avalymia Structure
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Export the full project into a standalone Obsidian vault structured exactly like <code className="text-amber-300">elad-haviv/avalymia</code>. Includes <code className="text-slate-200">00 Overview/</code>, <code className="text-slate-200">01 Universe/</code>, <code className="text-slate-200">03 Gazetteer/</code> (subdivided by World), <code className="text-slate-200">04 Inhabitants/</code>, <code className="text-slate-200">05 Society/</code>, <code className="text-slate-200">06 Compendium/</code>, <code className="text-slate-200">99 Appendices/</code>, along with <code className="text-slate-200">.obsidian/</code> settings, graph configuration, and README.
                  </p>
                </div>
              </button>

              {/* 2. Book-like Word Document */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() =>
                  handleAction(
                    () => exportProjectToBookWord(project),
                    `Exported "${project.name} — World Encyclopedia.docx" successfully!`
                  )
                }
                className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-850 hover:border-blue-500/50 flex items-start gap-3.5 transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/25 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    Complete World Encyclopedia (.docx)
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      Word Book
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    A bound, book-like Word document with Title Cover, Preface, Worlds summary table, Volume chapter breaks, and formatted entries.
                  </p>
                </div>
              </button>

              {/* 3. Book-like PDF */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() =>
                  handleAction(
                    () => exportProjectToBookPdf(project),
                    `Opened printable book PDF for "${project.name}"!`
                  )
                }
                className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-850 hover:border-rose-500/50 flex items-start gap-3.5 transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/25 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Printer className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    Printable World Book (PDF)
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                      Print & PDF
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Book layout with Cover Page, Table of Contents, Volume section dividers, running headers, and page numbers ready to Save as PDF.
                  </p>
                </div>
              </button>

              {/* 4. Full JSON Vault */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => {
                  const dataStr =
                    'data:text/json;charset=utf-8,' +
                    encodeURIComponent(JSON.stringify([project], null, 2));
                  const a = document.createElement('a');
                  a.href = dataStr;
                  a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-worldify-vault.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setSuccessMsg(`Exported JSON vault backup for "${project.name}"!`);
                }}
                className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-850 hover:border-slate-600 flex items-start gap-3.5 transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    Raw Worldify Studio Backup (.json)
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      Full Data
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Complete lossless JSON data backup containing all maps, timelines, spatio-temporal keyframes, calendar relationships, and stories.
                  </p>
                </div>
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span className="text-amber-300">Generating export package...</span>
              </>
            ) : (
              <span>Select any format to download immediately</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
