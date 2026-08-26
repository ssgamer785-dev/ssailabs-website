import React, { useMemo, useState } from 'react';
import { Database, ArrowRight, Check, AlertTriangle, Loader2, Info } from 'lucide-react';
import { convertLegacyDataset, readLegacyLocalDatabase } from '../data/legacyImport';
import { restoreBackupPayload } from '../data/supabaseRepository';
import { usesSupabase } from '../lib/supabase';

interface LegacyMigrationCardProps {
  /** Live order count. The offer only appears while the database is still empty. */
  liveOrderCount: number;
  liveCustomerCount: number;
  onMigrated: () => void | Promise<void>;
}

/**
 * One-time move of a showroom's existing browser-storage database into
 * Supabase.
 *
 * Three properties this must have, and does:
 *   - it never runs on its own; the owner presses the button
 *   - it never deletes the browser copy, so the old data remains the rollback
 *   - it never invents anything; records it cannot map are listed, not dropped
 */
export const LegacyMigrationCard: React.FC<LegacyMigrationCardProps> = ({
  liveOrderCount,
  liveCustomerCount,
  onMigrated
}) => {
  const legacy = useMemo(() => (usesSupabase ? readLegacyLocalDatabase() : null), []);
  const preview = useMemo(() => (legacy ? convertLegacyDataset(legacy) : null), [legacy]);

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Nothing to offer once the database holds records: replacing live data is
  // the restore flow's job, with its own confirmation and safety snapshot.
  if (!usesSupabase || !legacy || !preview || dismissed) return null;
  if (liveOrderCount > 0 || liveCustomerCount > 0) return null;

  const handleMigrate = async () => {
    if (isRunning) return;
    const total = preview.stats.customers + preview.stats.orders;
    if (!confirm(
      `Copy ${total} record${total === 1 ? '' : 's'} from this browser into the Regency Tailors database?\n\n` +
      'The browser copy is left untouched, so this can be repeated or abandoned safely.'
    )) return;

    setIsRunning(true);
    setError(null);
    try {
      await restoreBackupPayload(
        preview.payload as unknown as Record<string, unknown>,
        'migration from browser storage'
      );
      setResult(
        `Migrated ${preview.stats.customers} customers, ${preview.stats.orders} orders and ` +
        `${preview.stats.measurements} measurement profiles.`
      );
      await onMigrated();
    } catch (err: any) {
      setError(err?.message || 'The migration could not be completed. Nothing was changed.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border-2 border-[#C9A24A]/50 shadow-2xs space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#071426] text-[#C9A24A] flex items-center justify-center shrink-0">
          <Database className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase">
            Existing records found
          </div>
          <h2 className="text-lg font-extrabold text-[#071426]">Move this browser's data into the database</h2>
          <p className="text-xs text-[#7A7060] mt-1 leading-relaxed">
            This browser still holds showroom records from before the database was connected. Copy them
            across once and they will be available on every device you sign in from.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          ['Customers', preview.stats.customers],
          ['Orders', preview.stats.orders],
          ['Garments', preview.stats.garments],
          ['Measurements', preview.stats.measurements]
        ].map(([label, count]) => (
          <div key={String(label)} className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E0D8CB]">
            <div className="text-[10px] text-[#7A7060] font-semibold uppercase">{label}</div>
            <div className="text-base font-extrabold text-[#071426]">{count}</div>
          </div>
        ))}
      </div>

      {preview.skipped.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-900 uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{preview.skipped.length} record(s) need attention</span>
          </div>
          <ul className="text-xs text-amber-900 list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
            {preview.skipped.slice(0, 12).map((note, i) => (
              <li key={i}>{note}</li>
            ))}
            {preview.skipped.length > 12 && <li>…and {preview.skipped.length - 12} more.</li>}
          </ul>
        </div>
      )}

      <div className="p-3 bg-[#FAF8F5] border border-[#E0D8CB] rounded-xl flex items-start gap-2 text-xs text-[#4A5568]">
        <Info className="w-3.5 h-3.5 text-[#C9A24A] shrink-0 mt-0.5" />
        <span>
          The browser copy is <strong className="text-[#071426]">not deleted</strong>. If anything looks
          wrong afterwards, the original data is still here untouched.
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-semibold text-red-900">
          {error}
        </div>
      )}

      {result ? (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-900">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{result}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleMigrate}
            disabled={isRunning}
            className="px-5 py-2.5 bg-[#071426] hover:bg-[#0B1930] disabled:opacity-60 text-[#D4AF5A] font-extrabold text-xs rounded-xl uppercase tracking-wider flex items-center gap-2 cursor-pointer"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4 text-[#C9A24A]" />}
            <span>{isRunning ? 'Migrating…' : 'Migrate to database'}</span>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-4 py-2.5 bg-[#FAF8F5] hover:bg-[#EFE9DD] border border-[#D5CCA8] text-[#071426] font-bold text-xs rounded-xl uppercase tracking-wider cursor-pointer"
          >
            Not now
          </button>
        </div>
      )}
    </div>
  );
};
