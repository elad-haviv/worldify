import React, { useState } from 'react';
import { useWorldifyStore } from '../../store/useWorldifyStore';
import { EntityCategory, TemplateField, TemplateFieldType } from '../../types/worldify';
import { Layers, Plus, Trash2, BookOpen } from 'lucide-react';
import { SidePanel } from '../../components/SidePanel';
import { categoryLabel, getProjectCategories } from '../../utils/categories';

export const TemplatesView: React.FC = () => {
  const { projects, activeProjectId, createTemplate, updateTemplate, setActiveModule } =
    useWorldifyStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const [selectedTplId, setSelectedTplId] = useState<string | null>(
    project?.templates[0]?.id || null
  );

  // New Field state
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<TemplateFieldType>('text');
  const [fieldOptions, setFieldOptions] = useState('');

  // New Template modal state
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplCategory, setNewTplCategory] = useState<EntityCategory>('character');
  const [newTplColor, setNewTplColor] = useState('#f59e0b');

  if (!project) return null;

  const activeTemplate =
    project.templates.find((t) => t.id === selectedTplId) || project.templates[0];

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTemplate || !fieldLabel.trim()) return;
    const key = fieldLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');

    const newField: TemplateField = {
      key,
      label: fieldLabel.trim(),
      type: fieldType,
      options:
        fieldType === 'select'
          ? fieldOptions
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
    };

    updateTemplate(activeTemplate.id, {
      fields: [...activeTemplate.fields, newField],
    });
    setFieldLabel('');
    setFieldOptions('');
  };

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTplName.trim()) return;
    createTemplate({
      name: newTplName.trim(),
      category: newTplCategory,
      icon: 'Sparkles',
      color: newTplColor,
      fields: [
        { key: 'classification', label: 'Classification', type: 'text' },
        { key: 'associated_entity', label: 'Primary Affiliated Entity', type: 'entity_ref' },
      ],
      defaultMarkdown: `## Overview\n\n## Notable Characteristics\n\n## History & Lore\n`,
    });
    setNewTplName('');
    setShowNewTpl(false);
  };

  return (
    <div className="h-full flex bg-slate-950 overflow-hidden">
      {/* Left Sidebar: Templates List */}
      <SidePanel side="left" panelId="templates-list" label="Templates" width="w-72" defaultOpen={true} className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-amber-400" />
            Templates
          </h2>
          <button
            type="button"
            onClick={() => setShowNewTpl(true)}
            className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {project.templates.map((tpl) => {
            const isSelected = tpl.id === activeTemplate?.id;
            const usageCount = project.entities.filter((e) => e.templateId === tpl.id).length;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelectedTplId(tpl.id)}
                className={`w-full p-3 rounded-lg text-left border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 border-amber-500/50 text-slate-100'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: tpl.color }}
                    />
                    {tpl.name}
                  </span>
                  <span className="text-xs text-slate-400">{usageCount} entries</span>
                </div>
                <div className="text-xs capitalize text-slate-500">
                  Category: {categoryLabel(tpl.category, project)} • {tpl.fields.length} schema fields
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setActiveModule('wiki')}
          className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          Back to Wiki
        </button>
      </SidePanel>

      {/* Center: Template Schema & Boilerplate Designer */}
      {activeTemplate && (
        <main className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs capitalize text-amber-400 font-semibold">
                Template
              </span>
              <input
                type="text"
                value={activeTemplate.name}
                onChange={(e) =>
                  updateTemplate(activeTemplate.id, { name: e.target.value })
                }
                className="block text-2xl font-display font-bold text-slate-100 bg-transparent focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3 text-xs">
              <label className="text-slate-400">Colour</label>
              <input
                type="color"
                value={activeTemplate.color}
                onChange={(e) =>
                  updateTemplate(activeTemplate.id, { color: e.target.value })
                }
                className="w-8 h-8 rounded bg-transparent cursor-pointer"
              />
            </div>
          </div>

          {/* Schema Fields Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-slate-100">
              Fields ({activeTemplate.fields.length})
            </h3>
            <p className="text-xs text-slate-400">
              Fields of type <code className="text-amber-300">entity_ref</code> automatically
              create edges in the Knowledge Graph when populated on a Wiki Entry.
            </p>

            <div className="space-y-2">
              {activeTemplate.fields.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-200">{field.label}</span>
                    <span className="font-mono text-xs text-slate-500">({field.key})</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs capitalize whitespace-nowrap">
                      {field.type}
                    </span>
                    {field.options && (
                      <span className="text-xs text-slate-400">
                        Options: [{field.options.join(', ')}]
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateTemplate(activeTemplate.id, {
                        fields: activeTemplate.fields.filter((f) => f.key !== field.key),
                      })
                    }
                    className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Field Form */}
            <form
              onSubmit={handleAddField}
              className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs"
            >
              <input
                type="text"
                required
                value={fieldLabel}
                onChange={(e) => setFieldLabel(e.target.value)}
                placeholder="New Field Label (e.g., Homeworld)"
                className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as TemplateFieldType)}
                className="bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-slate-100"
              >
                <option value="text">Text String</option>
                <option value="number">Numeric Stat</option>
                <option value="entity_ref">Entity Reference (Graph Link)</option>
                <option value="select">Dropdown Select</option>
              </select>
              <input
                type="text"
                disabled={fieldType !== 'select'}
                value={fieldOptions}
                onChange={(e) => setFieldOptions(e.target.value)}
                placeholder="Comma options (if select)"
                className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 disabled:opacity-40"
              />
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded px-3 py-2 cursor-pointer"
              >
                + Add field
              </button>
            </form>
          </div>

          {/* Default Markdown Structure */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-100">
              Default Markdown Boilerplate
            </h3>
            <textarea
              rows={8}
              value={activeTemplate.defaultMarkdown}
              onChange={(e) =>
                updateTemplate(activeTemplate.id, { defaultMarkdown: e.target.value })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>
        </main>
      )}

      {/* New Template Modal */}
      {showNewTpl && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateTemplate}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-lg font-semibold text-slate-100">
              Create New Wiki Template
            </h3>
            <div>
              <label className="block text-slate-300 mb-1">Template Name *</label>
              <input
                type="text"
                required
                value={newTplName}
                onChange={(e) => setNewTplName(e.target.value)}
                placeholder="e.g., Starship Class, Guild, Spell"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Primary Category</label>
                <select
                  value={newTplCategory}
                  onChange={(e) => setNewTplCategory(e.target.value as EntityCategory)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-slate-100"
                >
                  {getProjectCategories(project).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Color</label>
                <input
                  type="color"
                  value={newTplColor}
                  onChange={(e) => setNewTplColor(e.target.value)}
                  className="w-full h-9 bg-slate-950 border border-slate-700 rounded p-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewTpl(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold cursor-pointer"
              >
                Create Template
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
