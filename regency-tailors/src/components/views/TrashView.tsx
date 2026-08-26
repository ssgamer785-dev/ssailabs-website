import React from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import { TrashItem } from '../../types';

interface TrashViewProps {
  trashItems: TrashItem[];
  onRestoreItem: (item: TrashItem) => void;
  onPermanentDelete: (itemId: string) => void;
  onEmptyTrash: () => void;
}

export const TrashView: React.FC<TrashViewProps> = ({
  trashItems = [],
  onRestoreItem,
  onPermanentDelete,
  onEmptyTrash
}) => {
  const safeTrashItems = trashItems || [];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E6E1D7] shadow-2xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1 brand-font">
            RECYCLE BIN
          </div>
          <h1 className="text-2xl font-extrabold text-[#071426] brand-font">
            Trash & Archives
          </h1>
          <p className="text-xs text-[#7A7060]">
            Restore soft-deleted customer profiles, cancelled orders, and archived records.
          </p>
        </div>

        {safeTrashItems.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Permanently delete all items in trash? This cannot be undone.')) {
                onEmptyTrash();
              }
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Empty Trash</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-[#E6E1D7] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#F7F3EA] text-[#7A7060] font-semibold uppercase text-[10px] tracking-wider border-b border-[#E6E1D7]">
                <th className="py-3 px-4">Item Type</th>
                <th className="py-3 px-4">Title / Record Details</th>
                <th className="py-3 px-4">Deleted At</th>
                <th className="py-3 px-4">Deleted By</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2ECE1]">
              {safeTrashItems.length > 0 ? (
                safeTrashItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#F7F3EA]/50">
                    <td className="py-3.5 px-4 font-bold text-[#071426]">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-[#F7F3EA] text-[#C9A24A] border border-[#E0D8CB]">
                        {item.itemType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#071426]">
                      {item.title}
                    </td>
                    <td className="py-3.5 px-4 text-[#7A7060] font-mono">{item.deletedAt}</td>
                    <td className="py-3.5 px-4 text-[#7A7060]">{item.deletedBy}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onRestoreItem(item)}
                          className="px-3 py-1 bg-[#071426] text-[#D4AF5A] hover:bg-[#0B1930] font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3 text-[#C9A24A]" />
                          <span>Restore</span>
                        </button>
                        <button
                          onClick={() => onPermanentDelete(item.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                          title="Delete Permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-[#8C7E6A]">
                    Trash is empty. No deleted items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
