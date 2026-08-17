/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Trash2,
  RotateCcw,
  Search,
  ShieldAlert,
  Clock,
  User,
  ShoppingBag,
  Ruler,
  Receipt,
  Calendar,
  Scissors,
  Wallet,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Layers
} from "lucide-react";
import { db, TRASH_RETENTION_DAYS } from "../db";
import ConfirmModal from "./ConfirmModal";

interface TrashViewProps {
  userRole: "Admin" | "Staff";
}

const TYPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  customers: { label: "Customer", icon: User },
  orders: { label: "Order", icon: ShoppingBag },
  measurements: { label: "Measurement", icon: Ruler },
  invoices: { label: "Bill", icon: Receipt },
  appointments: { label: "Appointment", icon: Calendar },
  trials: { label: "Trial", icon: Scissors },
  alterations: { label: "Alteration", icon: Scissors },
  expenses: { label: "Expense", icon: Wallet }
};

export default function TrashView({ userRole }: TrashViewProps) {
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [busyBatch, setBusyBatch] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirm, setConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm: () => void;
    onCancel?: () => void;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  // The cloud database is the authority for what is in the bin.
  useEffect(() => {
    let alive = true;
    (async () => {
      await db.refreshTrashFromCloud();
      if (alive) setIsLoading(false);
    })();
    const unsubscribe = db.onSync(() => setVersion(v => v + 1));
    return () => { alive = false; unsubscribe(); };
  }, []);

  const groups = useMemo(() => db.getTrashGroups(), [version, isLoading]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: groups.length };
    for (const g of groups) {
      c[g.primary.recordType] = (c[g.primary.recordType] || 0) + 1;
    }
    return c;
  }, [groups]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter(g => {
      if (filter !== "all" && g.primary.recordType !== filter) return false;
      if (!q) return true;
      return (
        g.primary.displayName.toLowerCase().includes(q) ||
        (g.primary.displayMeta || "").toLowerCase().includes(q) ||
        (g.primary.deletedBy || "").toLowerCase().includes(q) ||
        g.primary.recordId.toLowerCase().includes(q)
      );
    });
  }, [groups, filter, query]);

  if (userRole !== "Admin") {
    return (
      <div className="bg-white rounded-3xl border border-light p-12 text-center max-w-md mx-auto space-y-4 shadow-sm font-sans text-xs">
        <div className="inline-flex bg-rose-50 text-red-600 p-4 rounded-full border border-rose-100">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-serif font-bold text-navy">Administrative Privilege Required</h2>
        <p className="text-muted-grey leading-relaxed">
          Trash holds deleted records and can only be opened by the showroom owner.
        </p>
      </div>
    );
  }

  const runRestore = (batchId: string, withRelated: boolean, label: string, relatedCount: number) => {
    setConfirm({
      isOpen: true,
      title: withRelated && relatedCount > 0 ? "Restore customer and related records?" : "Restore this record?",
      message:
        withRelated && relatedCount > 0
          ? `${label} will be put back along with ${relatedCount} related record${relatedCount === 1 ? "" : "s"} that were removed at the same time.`
          : `${label} will be put back into the showroom ledger.`,
      confirmLabel: "Restore",
      cancelLabel: "Cancel",
      variant: "info",
      onConfirm: async () => {
        setConfirm(p => ({ ...p, isOpen: false }));
        setBusyBatch(batchId);
        setBanner(null);
        try {
          const res = await db.restoreFromTrash(batchId, { relatedRecords: withRelated });
          if (res.success && res.cloudVerified !== false) {
            setBanner({ kind: "ok", text: `${label} restored — ${res.affected} record${res.affected === 1 ? "" : "s"} put back and confirmed in the cloud database.` });
          } else {
            setBanner({ kind: "error", text: res.error || "The restore could not be confirmed. Nothing was removed from Trash." });
          }
        } catch (e: any) {
          setBanner({ kind: "error", text: e?.message || "The restore could not be completed." });
        } finally {
          setBusyBatch(null);
          setVersion(v => v + 1);
        }
      },
      onCancel: () => setConfirm(p => ({ ...p, isOpen: false }))
    });
  };

  const runPermanentDelete = (batchId: string, label: string, total: number) => {
    setConfirm({
      isOpen: true,
      title: "Delete Permanently?",
      message: `${label}${total > 1 ? ` and ${total - 1} related record${total - 1 === 1 ? "" : "s"}` : ""} will be erased for good.\n\nThis action cannot be undone. This data cannot be recovered after permanent deletion.`,
      confirmLabel: "Delete Permanently",
      cancelLabel: "Keep in Trash",
      variant: "danger",
      onConfirm: async () => {
        setConfirm(p => ({ ...p, isOpen: false }));
        setBusyBatch(batchId);
        setBanner(null);
        try {
          const res = await db.permanentlyDelete(batchId);
          if (res.success) {
            setBanner({ kind: "ok", text: `${label} permanently deleted.` });
          } else {
            setBanner({ kind: "error", text: res.error || "Could not delete permanently." });
          }
        } catch (e: any) {
          setBanner({ kind: "error", text: e?.message || "Could not delete permanently." });
        } finally {
          setBusyBatch(null);
          setVersion(v => v + 1);
        }
      },
      onCancel: () => setConfirm(p => ({ ...p, isOpen: false }))
    });
  };

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
    } catch { return iso; }
  };

  const filterTabs = [
    { id: "all", label: "All" },
    { id: "customers", label: "Customers" },
    { id: "orders", label: "Orders" },
    { id: "measurements", label: "Measurements" },
    { id: "invoices", label: "Bills" },
    { id: "appointments", label: "Appointments" },
    { id: "expenses", label: "Expenses" }
  ];

  return (
    <div className="space-y-6 font-sans text-xs animate-fade-in">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-light pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-cream text-navy p-2.5 rounded-xl border border-light">
              <Trash2 className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h2 className="text-xl font-serif font-black text-navy tracking-tight">Trash</h2>
              <p className="text-muted-grey text-xs mt-0.5">
                Deleted records are kept here for {TRASH_RETENTION_DAYS} days and can be restored at any time.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-navy bg-cream px-3 py-1.5 rounded-full border border-gold/20">
            {groups.length} item{groups.length === 1 ? "" : "s"} in Trash
          </span>
        </div>

        {/* Filters + search */}
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex gap-1.5 flex-wrap">
            {filterTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`px-3 py-1.5 rounded-xl font-bold text-[11px] border transition-all cursor-pointer ${
                  filter === t.id
                    ? "bg-navy text-white border-navy"
                    : "bg-cream/40 text-navy border-light hover:border-gold/40"
                }`}
              >
                {t.label}
                {counts[t.id === "all" ? "all" : t.id] ? (
                  <span className="ml-1.5 opacity-70">{counts[t.id === "all" ? "all" : t.id]}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-xs">
            <Search className="w-4 h-4 text-gold absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search Trash by name, number or who deleted it..."
              className="w-full bg-cream/20 pl-9 pr-3 py-2 border border-light rounded-xl focus:outline-hidden focus:border-gold"
            />
          </div>
        </div>
      </div>

      {banner && (
        <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
          banner.kind === "ok"
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : "bg-rose-50 border-rose-200 text-rose-900"
        }`}>
          {banner.kind === "ok"
            ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <p className="leading-relaxed flex-1">{banner.text}</p>
          <button onClick={() => setBanner(null)} className="font-bold opacity-60 hover:opacity-100 cursor-pointer">×</button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="bg-white rounded-3xl border border-light p-12 text-center text-muted-grey">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-gold" />
          <p className="mt-3">Loading Trash from the cloud database...</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-3xl border border-light p-12 text-center space-y-3">
          <div className="inline-flex bg-cream text-gold p-4 rounded-full border border-light">
            <Trash2 className="w-7 h-7" />
          </div>
          <h3 className="font-serif font-bold text-navy text-base">
            {groups.length === 0 ? "Trash is empty" : "Nothing matches that search"}
          </h3>
          <p className="text-muted-grey max-w-sm mx-auto leading-relaxed">
            {groups.length === 0
              ? "Deleted customers, orders and other records will appear here, and can be restored for six months."
              : "Try a different filter or search term."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(g => {
            const meta = TYPE_META[g.primary.recordType] || { label: g.primary.recordType, icon: Layers };
            const Icon = meta.icon;
            const busy = busyBatch === g.batchId;
            return (
              <div key={g.batchId} className="bg-white rounded-2xl border border-light shadow-sm p-4 hover:border-gold/30 transition-all">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="bg-cream text-navy p-2.5 rounded-xl border border-light shrink-0">
                      <Icon className="w-4 h-4 text-gold" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-gold bg-gold/5 border border-gold/20 px-2 py-0.5 rounded-full">
                          {meta.label}
                        </span>
                        <h3 className="font-serif font-bold text-navy text-sm truncate">{g.primary.displayName}</h3>
                      </div>
                      {g.primary.displayMeta && (
                        <p className="text-muted-grey text-[11px] mt-0.5 truncate">{g.primary.displayMeta}</p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[10px] text-muted-grey">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {fmt(g.deletedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {g.primary.deletedBy || "Unknown"}
                        </span>
                        {g.related.length > 0 && (
                          <span className="flex items-center gap-1 text-navy font-semibold">
                            <Layers className="w-3 h-3" /> +{g.related.length} related record{g.related.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      g.daysRemaining > 30
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : g.daysRemaining > 0
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}>
                      {g.daysRemaining > 0 ? `${g.daysRemaining} day${g.daysRemaining === 1 ? "" : "s"} left` : "Retention ended"}
                    </span>

                    <button
                      onClick={() => runRestore(g.batchId, true, g.primary.displayName, g.related.length)}
                      disabled={busy}
                      className="flex items-center gap-1.5 bg-navy hover:bg-navy-hover text-white font-bold px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 text-[11px]"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 text-gold" />}
                      <span>Restore</span>
                    </button>

                    <button
                      onClick={() => runPermanentDelete(g.batchId, g.primary.displayName, g.totalRecords)}
                      disabled={busy}
                      className="flex items-center gap-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 text-[11px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Permanently</span>
                    </button>
                  </div>
                </div>

                {g.related.length > 0 && (
                  <details className="mt-3 pt-3 border-t border-light">
                    <summary className="cursor-pointer text-[11px] text-muted-grey hover:text-navy font-semibold">
                      Show the {g.related.length} record{g.related.length === 1 ? "" : "s"} that will be restored with it
                    </summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2.5">
                      {g.related.map(r => {
                        const rm = TYPE_META[r.recordType] || { label: r.recordType, icon: Layers };
                        return (
                          <div key={r.id} className="bg-cream/30 border border-light rounded-xl px-3 py-2">
                            <p className="text-[9px] uppercase font-bold tracking-wider text-muted-grey">{rm.label}</p>
                            <p className="font-semibold text-navy text-[11px] truncate">{r.displayName}</p>
                            {r.displayMeta && <p className="text-[10px] text-muted-grey truncate">{r.displayMeta}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-grey text-center leading-relaxed max-w-2xl mx-auto">
        Records stay in Trash for {TRASH_RETENTION_DAYS} days from the moment they were deleted. That countdown is
        kept by the cloud database, not by this computer, so it cannot be shortened by a clock change.
        Nothing is ever removed automatically.
      </p>

      <ConfirmModal
        isOpen={confirm.isOpen}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        cancelLabel={confirm.cancelLabel}
        variant={confirm.variant}
        onConfirm={confirm.onConfirm}
        onCancel={confirm.onCancel}
      />
    </div>
  );
}
