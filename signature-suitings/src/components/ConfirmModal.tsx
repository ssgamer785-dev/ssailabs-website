/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AlertTriangle, Trash2, HelpCircle, Info, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel?: () => void; // If not provided, acts as an Alert (single button)
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const isAlertOnly = !onCancel;

  const getIcon = () => {
    switch (variant) {
      case "danger":
        return <Trash2 className="w-6 h-6 text-red-600 animate-pulse" />;
      case "warning":
        return <AlertTriangle className="w-6 h-6 text-amber-500 animate-pulse" />;
      case "info":
        return <Info className="w-6 h-6 text-navy" />;
      default:
        return <HelpCircle className="w-6 h-6 text-gold" />;
    }
  };

  const getHeaderBg = () => {
    switch (variant) {
      case "danger":
        return "bg-red-50 border-red-100";
      case "warning":
        return "bg-amber-50 border-amber-100";
      case "info":
        return "bg-blue-50 border-blue-100";
      default:
        return "bg-cream/40 border-light";
    }
  };

  const getConfirmButtonStyles = () => {
    switch (variant) {
      case "danger":
        return "bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md focus:ring-red-500";
      case "warning":
        return "bg-amber-500 hover:bg-amber-600 text-white shadow-sm hover:shadow-md focus:ring-amber-500";
      case "info":
        return "bg-navy hover:bg-navy-hover text-white shadow-sm hover:shadow-md focus:ring-navy";
      default:
        return "bg-gold hover:bg-gold/90 text-navy font-bold shadow-sm hover:shadow-md focus:ring-gold";
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans antialiased animate-fade-in">
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-navy/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={onCancel || onConfirm}
      />

      {/* Modal Dialog Body */}
      <div className="relative bg-white w-full max-w-md rounded-3xl border border-light/80 shadow-2xl overflow-hidden transform transition-all duration-300 scale-100 max-h-[90vh] flex flex-col z-[101]">
        
        {/* Header Ribbon / Status Banner */}
        <div className={`p-5 flex items-start gap-4 border-b ${getHeaderBg()}`}>
          <div className="p-2 rounded-2xl bg-white border border-light shadow-2xs flex-shrink-0">
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-base font-serif font-bold text-navy tracking-tight truncate">
              {title}
            </h3>
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-grey mt-0.5">
              Signature Suitings &bull; Verification Required
            </p>
          </div>
          {!isAlertOnly && (
            <button 
              onClick={onCancel}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-black/5 text-muted-grey hover:text-charcoal transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scrollable Message Content */}
        <div className="p-6 overflow-y-auto text-xs text-charcoal/80 leading-relaxed font-medium space-y-3">
          <p className="whitespace-pre-line">{message}</p>
        </div>

        {/* Action Button Row */}
        <div className="p-5 border-t border-light/60 bg-cream/10 flex justify-end items-center gap-3">
          {!isAlertOnly && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-bold text-charcoal hover:bg-cream border border-light rounded-xl transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-light"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-offset-2 ${getConfirmButtonStyles()}`}
          >
            {isAlertOnly ? "Understood" : confirmLabel}
          </button>
        </div>

      </div>
    </div>
  );
}
