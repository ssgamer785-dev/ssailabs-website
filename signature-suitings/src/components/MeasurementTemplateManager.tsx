import React, { useState } from "react";
import { db } from "../db";
import { MeasurementTemplate, MeasurementField, MeasurementInputType } from "../types";
import { Plus, Edit2, Trash2, FileText, CheckCircle, Sliders, ArrowUp, ArrowDown, Copy, Eye, CornerDownRight } from "lucide-react";

interface Props {
  onRefresh?: () => void;
}

export const MeasurementTemplateManager: React.FC<Props> = ({ onRefresh }) => {
  const templates = db.getMeasurementTemplates();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0]?.id || "");
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  // Modals state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MeasurementTemplate | null>(null);

  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<MeasurementField | null>(null);

  // Form states for Template
  const [tmplName, setTmplName] = useState("");
  const [tmplDesc, setTmplDesc] = useState("");

  // Form states for Field
  const [fieldName, setFieldName] = useState("");
  const [shortName, setShortName] = useState("");
  const [unit, setUnit] = useState("Inches");
  const [inputType, setInputType] = useState<MeasurementInputType>("Number");
  const [optionsStr, setOptionsStr] = useState("");
  const [required, setRequired] = useState(true);

  // Template Modal open
  const handleOpenTemplateModal = (tmpl?: MeasurementTemplate) => {
    if (tmpl) {
      setEditingTemplate(tmpl);
      setTmplName(tmpl.name);
      setTmplDesc(tmpl.description || "");
    } else {
      setEditingTemplate(null);
      setTmplName("");
      setTmplDesc("");
    }
    setIsTemplateModalOpen(true);
  };

  // Save Template
  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmplName.trim()) return;

    if (editingTemplate) {
      db.updateMeasurementTemplate(editingTemplate.id, {
        name: tmplName.trim(),
        description: tmplDesc.trim()
      });
    } else {
      const newTmpl = db.addMeasurementTemplate({
        name: tmplName.trim(),
        description: tmplDesc.trim(),
        fields: [
          { id: `f_${Date.now()}_1`, fieldName: "Length", shortName: "LEN", unit: "Inches", inputType: "Number", required: true, displayOrder: 1, active: true },
          { id: `f_${Date.now()}_2`, fieldName: "Chest / Waist", shortName: "CHEST", unit: "Inches", inputType: "Number", required: true, displayOrder: 2, active: true }
        ]
      });
      setSelectedTemplateId(newTmpl.id);
    }

    setIsTemplateModalOpen(false);
    if (onRefresh) onRefresh();
  };

  // Duplicate Template
  const handleDuplicateTemplate = (tmpl: MeasurementTemplate) => {
    const dup = db.addMeasurementTemplate({
      name: `${tmpl.name} (Copy)`,
      description: tmpl.description || "",
      fields: tmpl.fields.map((f, i) => ({ ...f, id: `f_${Date.now()}_${i}` }))
    });
    setSelectedTemplateId(dup.id);
    if (onRefresh) onRefresh();
  };

  // Delete Template
  const handleDeleteTemplate = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete template "${name}"?`)) {
      db.deleteMeasurementTemplate(id);
      const remaining = db.getMeasurementTemplates();
      if (remaining.length > 0) setSelectedTemplateId(remaining[0].id);
      if (onRefresh) onRefresh();
    }
  };

  // Field Modal open
  const handleOpenFieldModal = (field?: MeasurementField) => {
    if (field) {
      setEditingField(field);
      setFieldName(field.fieldName);
      setShortName(field.shortName);
      setUnit(field.unit || "Inches");
      setInputType(field.inputType);
      setRequired(field.required);
      if (field.options) {
        setOptionsStr(field.options.map(o => o.label).join(", "));
      } else {
        setOptionsStr("");
      }
    } else {
      setEditingField(null);
      setFieldName("");
      setShortName("");
      setUnit("Inches");
      setInputType("Number");
      setRequired(false);
      setOptionsStr("");
    }
    setIsFieldModalOpen(true);
  };

  // Save Field to selected template
  const handleSaveField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName.trim() || !selectedTemplate) return;

    const shortCode = (shortName.trim() || fieldName.trim()).toUpperCase();
    const parsedOptions = optionsStr.trim()
      ? optionsStr.split(",").map(s => {
          const val = s.trim();
          return { label: val, value: val };
        }).filter(o => o.label.length > 0)
      : undefined;

    let updatedFields = [...selectedTemplate.fields];

    if (editingField) {
      updatedFields = updatedFields.map(f => f.id === editingField.id ? {
        ...f,
        fieldName: fieldName.trim(),
        shortName: shortCode,
        unit: unit.trim(),
        inputType,
        options: parsedOptions,
        required
      } : f);
    } else {
      const newField: MeasurementField = {
        id: `f_${Date.now()}`,
        fieldName: fieldName.trim(),
        shortName: shortCode,
        unit: unit.trim(),
        inputType,
        options: parsedOptions,
        required,
        displayOrder: updatedFields.length + 1,
        active: true
      };
      updatedFields.push(newField);
    }

    db.updateMeasurementTemplate(selectedTemplate.id, { fields: updatedFields });
    setIsFieldModalOpen(false);
    if (onRefresh) onRefresh();
  };

  // Delete field from template
  const handleDeleteField = (fieldId: string) => {
    if (!selectedTemplate) return;
    const updatedFields = selectedTemplate.fields.filter(f => f.id !== fieldId);
    db.updateMeasurementTemplate(selectedTemplate.id, { fields: updatedFields });
    if (onRefresh) onRefresh();
  };

  // Reorder field
  const handleMoveField = (index: number, direction: "up" | "down") => {
    if (!selectedTemplate) return;
    const newFields = [...selectedTemplate.fields];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newFields.length) return;

    const temp = newFields[index];
    newFields[index] = newFields[targetIdx];
    newFields[targetIdx] = temp;

    // update displayOrder
    newFields.forEach((f, i) => f.displayOrder = i + 1);

    db.updateMeasurementTemplate(selectedTemplate.id, { fields: newFields });
    if (onRefresh) onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Template Selection Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-navy p-4 rounded-2xl border border-gold/20 shadow-md">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <FileText className="w-6 h-6 text-gold shrink-0" />
          <div className="flex-1">
            <span className="text-[10px] text-gold uppercase tracking-wider font-extrabold block">Selected Measurement Set</span>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="bg-navy-light border border-gold/30 text-white rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-gold w-full md:w-80 cursor-pointer"
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.fields.length} specs)</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={() => handleOpenTemplateModal(selectedTemplate)}
            className="bg-navy-light hover:bg-white/10 text-white font-bold px-3 py-2 rounded-xl text-xs border border-white/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Edit Template Details"
          >
            <Edit2 className="w-3.5 h-3.5 text-gold" />
            <span>Edit Template</span>
          </button>
          <button
            onClick={() => handleDuplicateTemplate(selectedTemplate)}
            className="bg-navy-light hover:bg-white/10 text-white font-bold px-3 py-2 rounded-xl text-xs border border-white/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Duplicate Template"
          >
            <Copy className="w-3.5 h-3.5 text-gold" />
            <span>Duplicate</span>
          </button>
          <button
            onClick={() => handleOpenTemplateModal()}
            className="bg-gold hover:bg-gold-light text-navy font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {/* Selected Template View */}
      {selectedTemplate && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-serif font-bold text-navy text-sm">{selectedTemplate.name}</h3>
              <p className="text-xs text-slate-600 font-medium">{selectedTemplate.description || "No description provided."}</p>
            </div>
            <button
              onClick={() => handleOpenFieldModal()}
              className="bg-navy hover:bg-navy-light text-gold font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Measurement Field</span>
            </button>
          </div>

          {/* Fields Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">Order</th>
                    <th className="py-3 px-4">Field Name</th>
                    <th className="py-3 px-4">Short Code</th>
                    <th className="py-3 px-4">Input Type</th>
                    <th className="py-3 px-4">Unit / Options</th>
                    <th className="py-3 px-4 text-center">Required</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {selectedTemplate.fields.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        No measurement fields configured for this template. Click "Add Measurement Field" to start.
                      </td>
                    </tr>
                  ) : (
                    selectedTemplate.fields.map((field, idx) => (
                      <tr key={field.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              disabled={idx === 0}
                              onClick={() => handleMoveField(idx, "up")}
                              className="p-0.5 text-slate-400 hover:text-navy disabled:opacity-20 cursor-pointer"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <span className="font-bold text-slate-500 text-[10px]">{field.displayOrder || idx + 1}</span>
                            <button
                              disabled={idx === selectedTemplate.fields.length - 1}
                              onClick={() => handleMoveField(idx, "down")}
                              className="p-0.5 text-slate-400 hover:text-navy disabled:opacity-20 cursor-pointer"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-navy">
                          {field.fieldName}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                            {field.shortName}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            field.inputType === "Number" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                            field.inputType === "Visual Selector" ? "bg-purple-50 text-purple-700 border border-purple-200" :
                            field.inputType === "Dropdown" ? "bg-amber-50 text-amber-800 border border-amber-200" :
                            "bg-slate-100 text-slate-700"
                          }`}>
                            {field.inputType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                          {field.inputType === "Number" ? (
                            <span className="text-slate-500 font-semibold">{field.unit || "Inches"}</span>
                          ) : field.options && field.options.length > 0 ? (
                            <span className="text-[10px] bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                              {field.options.map(o => o.label).join(" | ")}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {field.required ? (
                            <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full">Required</span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Optional</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button
                            onClick={() => handleOpenFieldModal(field)}
                            className="p-1.5 text-slate-600 hover:text-navy hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit Field"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteField(field.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT TEMPLATE */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="bg-navy text-white px-6 py-4 flex items-center justify-between border-b border-gold/20">
              <h3 className="font-serif font-bold text-lg text-gold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {editingTemplate ? "Edit Template Details" : "Create Measurement Template"}
              </h3>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="text-white/60 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bandhgala & Suit Jacket Specs"
                  value={tmplName}
                  onChange={(e) => setTmplName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of measurements covered..."
                  value={tmplDesc}
                  onChange={(e) => setTmplDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-navy"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-navy hover:bg-navy-light text-gold font-bold px-5 py-2 rounded-xl text-xs transition-all shadow-md cursor-pointer"
                >
                  {editingTemplate ? "Update Template" : "Create Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT FIELD */}
      {isFieldModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="bg-navy text-white px-6 py-4 flex items-center justify-between border-b border-gold/20">
              <h3 className="font-serif font-bold text-lg text-gold flex items-center gap-2">
                <Sliders className="w-5 h-5" />
                {editingField ? "Edit Measurement Field" : "Add Measurement Field"}
              </h3>
              <button
                onClick={() => setIsFieldModalOpen(false)}
                className="text-white/60 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveField} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Field Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cross Back, Lapel Style"
                    value={fieldName}
                    onChange={(e) => {
                      setFieldName(e.target.value);
                      if (!shortName) setShortName(e.target.value.toUpperCase().slice(0, 8));
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Short Code / Abbreviation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. C.BACK, LAPEL"
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold font-mono focus:outline-none focus:border-navy uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Input Control Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={inputType}
                    onChange={(e) => setInputType(e.target.value as MeasurementInputType)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                  >
                    <option value="Number">Number (Standard Dimension)</option>
                    <option value="Dropdown">Dropdown Choice</option>
                    <option value="Visual Selector">Visual Selector (Pills)</option>
                    <option value="Radio">Radio Buttons</option>
                    <option value="Text">Free Form Text</option>
                    <option value="Checkbox">Checkbox (Yes / No)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    placeholder="Inches, cm, etc."
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                  />
                </div>
              </div>

              {["Dropdown", "Visual Selector", "Radio"].includes(inputType) && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Options (Comma Separated) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Notch Lapel, Peak Lapel, Shawl Collar"
                    value={optionsStr}
                    onChange={(e) => setOptionsStr(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-navy"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Separate option choices with commas.</p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="fieldReqToggle"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="w-4 h-4 text-navy rounded border-slate-300 focus:ring-navy cursor-pointer"
                />
                <label htmlFor="fieldReqToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Mandatory Requirement in Order Form
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFieldModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-navy hover:bg-navy-light text-gold font-bold px-5 py-2 rounded-xl text-xs transition-all shadow-md cursor-pointer"
                >
                  {editingField ? "Update Field" : "Add Field"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
