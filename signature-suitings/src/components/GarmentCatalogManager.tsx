import React, { useState } from "react";
import { db } from "../db";
import { GarmentCatalogItem, GarmentCategory, MeasurementTemplate } from "../types";
import { Plus, Edit2, Trash2, CheckCircle, XCircle, Tag, Layers, DollarSign, FileText, ArrowUpDown, Copy } from "lucide-react";

interface Props {
  onRefresh?: () => void;
}

export const GarmentCatalogManager: React.FC<Props> = ({ onRefresh }) => {
  const [activeSubTab, setActiveSubTab] = useState<"catalog" | "categories">("catalog");
  
  // Data state
  const catalog = db.getAllGarmentCatalogIncludingInactive();
  const categories = db.getAllGarmentCategoriesIncludingInactive();
  const templates = db.getMeasurementTemplates();

  // Modals state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GarmentCatalogItem | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<GarmentCategory | null>(null);

  // Form states for Garment Catalog Item
  const [itemName, setItemName] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemPrice, setItemPrice] = useState("2000");
  const [itemTemplateId, setItemTemplateId] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemActive, setItemActive] = useState(true);

  // Form states for Category
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catOrder, setCatOrder] = useState("1");
  const [catActive, setCatActive] = useState(true);

  // Search/Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("ALL");

  // Open item modal
  const handleOpenItemModal = (item?: GarmentCatalogItem) => {
    if (item) {
      setEditingItem(item);
      setItemName(item.name);
      setItemCategoryId(item.categoryId);
      setItemPrice(String(item.defaultPrice));
      setItemTemplateId(item.measurementTemplateId);
      setItemDesc(item.description || "");
      setItemActive(item.active);
    } else {
      setEditingItem(null);
      setItemName("");
      setItemCategoryId(categories[0]?.id || "cat_suits");
      setItemPrice("2000");
      setItemTemplateId(templates[0]?.id || "tmpl_coat");
      setItemDesc("");
      setItemActive(true);
    }
    setIsItemModalOpen(true);
  };

  // Save Item
  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    const catMatch = categories.find(c => c.id === itemCategoryId);
    const tmplMatch = templates.find(t => t.id === itemTemplateId);

    const priceNum = parseFloat(itemPrice) || 0;

    if (editingItem) {
      db.updateGarmentCatalogItem(editingItem.id, {
        name: itemName.trim(),
        categoryId: itemCategoryId,
        categoryName: catMatch?.name || "Uncategorized",
        defaultPrice: priceNum,
        measurementTemplateId: itemTemplateId,
        measurementTemplateName: tmplMatch?.name || "Standard Template",
        description: itemDesc.trim(),
        active: itemActive
      });
    } else {
      db.addGarmentCatalogItem({
        name: itemName.trim(),
        categoryId: itemCategoryId,
        categoryName: catMatch?.name || "Uncategorized",
        defaultPrice: priceNum,
        measurementTemplateId: itemTemplateId,
        measurementTemplateName: tmplMatch?.name || "Standard Template",
        description: itemDesc.trim(),
        active: itemActive,
        displayOrder: catalog.length + 1
      });
    }

    setIsItemModalOpen(false);
    if (onRefresh) onRefresh();
  };

  // Delete Item
  const handleDeleteItem = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}" from Garment Catalog?`)) {
      db.deleteGarmentCatalogItem(id);
      if (onRefresh) onRefresh();
    }
  };

  // Toggle Item Active
  const handleToggleItemActive = (item: GarmentCatalogItem) => {
    db.updateGarmentCatalogItem(item.id, { active: !item.active });
    if (onRefresh) onRefresh();
  };

  // Open Category modal
  const handleOpenCategoryModal = (cat?: GarmentCategory) => {
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatDesc(cat.description || "");
      setCatOrder(String(cat.displayOrder));
      setCatActive(cat.active);
    } else {
      setEditingCategory(null);
      setCatName("");
      setCatDesc("");
      setCatOrder(String(categories.length + 1));
      setCatActive(true);
    }
    setIsCategoryModalOpen(true);
  };

  // Save Category
  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const orderNum = parseInt(catOrder, 10) || categories.length + 1;

    if (editingCategory) {
      db.updateGarmentCategory(editingCategory.id, {
        name: catName.trim(),
        description: catDesc.trim(),
        displayOrder: orderNum,
        active: catActive
      });
    } else {
      db.addGarmentCategory({
        name: catName.trim(),
        description: catDesc.trim(),
        displayOrder: orderNum,
        active: catActive
      });
    }

    setIsCategoryModalOpen(false);
    if (onRefresh) onRefresh();
  };

  // Delete Category
  const handleDeleteCategory = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete category "${name}"? Garments in this category will become Uncategorized.`)) {
      db.deleteGarmentCategory(id);
      if (onRefresh) onRefresh();
    }
  };

  // Filtered Catalog
  const filteredCatalog = catalog.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.categoryName || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategoryFilter === "ALL" || item.categoryId === selectedCategoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* Sub-header Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-navy p-4 rounded-2xl border border-gold/20 shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab("catalog")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === "catalog"
                ? "bg-gold text-navy shadow-md"
                : "bg-navy-light text-white/70 hover:text-white"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Garment Products ({catalog.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab("categories")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === "categories"
                ? "bg-gold text-navy shadow-md"
                : "bg-navy-light text-white/70 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Product Categories ({categories.length})</span>
          </button>
        </div>

        <div>
          {activeSubTab === "catalog" ? (
            <button
              onClick={() => handleOpenItemModal()}
              className="bg-gold hover:bg-gold-light text-navy font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Garment Product</span>
            </button>
          ) : (
            <button
              onClick={() => handleOpenCategoryModal()}
              className="bg-gold hover:bg-gold-light text-navy font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Category</span>
            </button>
          )}
        </div>
      </div>

      {/* SUB-TAB 1: GARMENT CATALOG */}
      {activeSubTab === "catalog" && (
        <div className="space-y-4">
          {/* Search & Category Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <input
              type="text"
              placeholder="Search garments by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-navy"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Filter Category:</span>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-navy focus:outline-none"
              >
                <option value="ALL">All Categories ({catalog.length})</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Garments Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="py-3 px-4">Garment Product</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Default Price</th>
                    <th className="py-3 px-4">Measurement Template</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                        No garment products found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredCatalog.map((item) => {
                      const catName = categories.find(c => c.id === item.categoryId)?.name || item.categoryName || "Uncategorized";
                      const tmpl = templates.find(t => t.id === item.measurementTemplateId);

                      return (
                        <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${!item.active ? "opacity-50 bg-slate-50/50" : ""}`}>
                          <td className="py-3 px-4 font-bold text-navy">
                            <div>{item.name}</div>
                            {item.description && (
                              <div className="text-[10px] text-slate-400 font-normal">{item.description}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-600">
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200/60 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                              <Tag className="w-2.5 h-2.5 text-amber-600" />
                              {catName}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-extrabold text-slate-800">
                            ₹{item.defaultPrice.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-600">
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px]">
                              <FileText className="w-3 h-3 text-slate-400" />
                              {tmpl ? tmpl.name : item.measurementTemplateName || "Standard"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleToggleItemActive(item)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                                item.active
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}
                            >
                              {item.active ? (
                                <>
                                  <CheckCircle className="w-3 h-3 text-emerald-600" />
                                  Active
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3 text-slate-400" />
                                  Archived
                                </>
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right space-x-1">
                            <button
                              onClick={() => handleOpenItemModal(item)}
                              className="p-1.5 text-slate-600 hover:text-navy hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Edit Garment Product"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id, item.name)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Garment Product"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* SUB-TAB 2: PRODUCT CATEGORIES */}
      {activeSubTab === "categories" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-3 px-4">Order</th>
                  <th className="py-3 px-4">Category Name</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-center">Associated Garments</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {categories.map((cat) => {
                  const itemsCount = catalog.filter(c => c.categoryId === cat.id).length;
                  return (
                    <tr key={cat.id} className={`hover:bg-slate-50/80 transition-colors ${!cat.active ? "opacity-50" : ""}`}>
                      <td className="py-3 px-4 font-bold text-slate-400">
                        #{cat.displayOrder}
                      </td>
                      <td className="py-3 px-4 font-bold text-navy">
                        {cat.name}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {cat.description || "—"}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">
                        <span className="bg-slate-100 px-2.5 py-0.5 rounded-full text-[10px]">
                          {itemsCount} Products
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          cat.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {cat.active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          onClick={() => handleOpenCategoryModal(cat)}
                          className="p-1.5 text-slate-600 hover:text-navy hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Category"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT GARMENT PRODUCT */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="bg-navy text-white px-6 py-4 flex items-center justify-between border-b border-gold/20">
              <h3 className="font-serif font-bold text-lg text-gold flex items-center gap-2">
                <Tag className="w-5 h-5" />
                {editingItem ? "Edit Garment Product" : "Add New Garment Product"}
              </h3>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="text-white/60 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Garment Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 3 Piece Tuxedo Suit, Pathani Kurta, Chinos"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={itemCategoryId}
                    onChange={(e) => setItemCategoryId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Default Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="100"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Attached Measurement Template <span className="text-red-500">*</span>
                </label>
                <select
                  value={itemTemplateId}
                  onChange={(e) => setItemTemplateId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.fields.length} fields)</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  When adding this item in Edit Order, these measurement fields will automatically be presented.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description / Style Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional details regarding fabric requirements, lining choice or standard cut style..."
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-navy"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="itemActiveToggle"
                  checked={itemActive}
                  onChange={(e) => setItemActive(e.target.checked)}
                  className="w-4 h-4 text-navy rounded border-slate-300 focus:ring-navy cursor-pointer"
                />
                <label htmlFor="itemActiveToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Active (Show in Order Line Item Add Menu)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-navy hover:bg-navy-light text-gold font-bold px-5 py-2 rounded-xl text-xs transition-all shadow-md cursor-pointer"
                >
                  {editingItem ? "Update Product" : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT CATEGORY */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="bg-navy text-white px-6 py-4 flex items-center justify-between border-b border-gold/20">
              <h3 className="font-serif font-bold text-lg text-gold flex items-center gap-2">
                <Layers className="w-5 h-5" />
                {editingCategory ? "Edit Category" : "Add Garment Category"}
              </h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-white/60 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Suits, Indian Wear, Trousers"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Traditional bespoke ceremonial wear"
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-navy"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Display Order</label>
                <input
                  type="number"
                  min="1"
                  value={catOrder}
                  onChange={(e) => setCatOrder(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-navy"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="catActiveToggle"
                  checked={catActive}
                  onChange={(e) => setCatActive(e.target.checked)}
                  className="w-4 h-4 text-navy rounded border-slate-300 focus:ring-navy cursor-pointer"
                />
                <label htmlFor="catActiveToggle" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Category Active
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-navy hover:bg-navy-light text-gold font-bold px-5 py-2 rounded-xl text-xs transition-all shadow-md cursor-pointer"
                >
                  {editingCategory ? "Update Category" : "Save Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
