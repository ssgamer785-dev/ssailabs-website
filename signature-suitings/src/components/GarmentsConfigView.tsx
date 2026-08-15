import React, { useState } from "react";
import { GarmentCatalogManager } from "./GarmentCatalogManager";
import { MeasurementTemplateManager } from "./MeasurementTemplateManager";
import { ShoppingBag, Sliders, Scissors, Layers } from "lucide-react";

export const GarmentsConfigView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"catalog" | "templates">("catalog");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-light shadow-xs">
        <div>
          <span className="text-[10px] text-gold uppercase tracking-wider font-extrabold flex items-center gap-1">
            <Scissors className="w-3.5 h-3.5" />
            Showroom Master Catalog & Spec Engine
          </span>
          <h1 className="text-xl font-serif font-bold text-navy">Garments & Measurement Setup</h1>
          <p className="text-xs text-muted-grey mt-0.5">
            Configure expandable garment products, categories, and tailoring measurement templates.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab("catalog")}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "catalog"
                ? "bg-navy text-gold shadow-sm"
                : "text-slate-600 hover:text-navy"
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Garment Products & Categories</span>
          </button>

          <button
            onClick={() => setActiveTab("templates")}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "templates"
                ? "bg-navy text-gold shadow-sm"
                : "text-slate-600 hover:text-navy"
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Measurement Templates & Specs</span>
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div key={refreshKey} className="bg-white p-6 rounded-3xl border border-light shadow-xs">
        {activeTab === "catalog" ? (
          <GarmentCatalogManager onRefresh={handleRefresh} />
        ) : (
          <MeasurementTemplateManager onRefresh={handleRefresh} />
        )}
      </div>
    </div>
  );
};

export default GarmentsConfigView;
