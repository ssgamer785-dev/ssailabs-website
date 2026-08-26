import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface StorageAlertBannerProps {
  message: string | null;
  onDismiss: () => void;
}

/**
 * Persistent warning shown when the browser refuses to save showroom data
 * (storage full, private-browsing mode, storage disabled). Without this the
 * suite looked like it was saving normally while every change was being lost.
 */
export const StorageAlertBanner: React.FC<StorageAlertBannerProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div className="no-print shrink-0 bg-red-50 border-b-2 border-red-300 px-4 md:px-8 py-2.5 flex items-start sm:items-center justify-between gap-3">
      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5 sm:mt-0" />
        <div className="min-w-0">
          <span className="text-xs font-black text-red-800 uppercase tracking-wider block sm:inline sm:mr-2">
            Data not saved
          </span>
          <span className="text-xs font-semibold text-red-900">
            {message}. Export a backup from Backup &amp; Recovery before closing this tab.
          </span>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="p-1.5 text-red-700 hover:bg-red-100 rounded-lg shrink-0 cursor-pointer"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
