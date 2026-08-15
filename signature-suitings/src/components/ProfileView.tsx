import React, { useRef } from "react";
import { Camera, User, Shield, Key, HardDrive, Trash2, CheckCircle } from "lucide-react";
import { db } from "../db";

interface ProfileViewProps {
  userRole: "Admin" | "Staff";
  userPhoto: string;
  currentUserEmail: string;
  onPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
}

export default function ProfileView({ userRole, userPhoto, currentUserEmail, onPhotoChange, onRemovePhoto }: ProfileViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const matchedUser = currentUserEmail 
    ? db.getAllUsersIncludingInactive().find(u => u.email === currentUserEmail)
    : undefined;

  const userName = matchedUser?.name || (userRole === "Admin" ? "Hardik Nagpal" : "Showroom Staff");
  const userDesignation = userRole === "Admin" ? "Showroom Owner & Master Designer" : "Tailor & Operational Manager";
  const clearanceLevel = userRole === "Admin" ? "Level 1 - Master Terminal (Full Admin)" : "Level 2 - Showroom Terminal (Restricted)";
  const initials = userName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans animate-fade-in text-xs text-charcoal">
      
      {/* Page Header */}
      <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-navy tracking-tight">Staff Profile Settings</h1>
          <p className="text-muted-grey font-semibold mt-0.5">
            Manage your personal profile photo and active terminal credentials.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Profile Card & Avatar Selection */}
        <div className="md:col-span-5 bg-white rounded-3xl border border-light shadow-xs p-6 flex flex-col items-center justify-center text-center space-y-6">
          
          <div className="relative group">
            {/* Outer golden halo */}
            <div className="absolute inset-0 -m-1 bg-gradient-to-r from-gold via-yellow-300 to-gold rounded-full opacity-60 blur-xs group-hover:opacity-100 transition-opacity"></div>
            
            {/* Profile image container */}
            <label className="relative block w-32 h-32 rounded-full overflow-hidden bg-navy text-gold text-4xl font-serif font-bold flex items-center justify-center border-2 border-white shadow-md cursor-pointer transition-transform group-hover:scale-[1.02]">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onPhotoChange}
                className="hidden"
              />
              {userPhoto ? (
                <img src={userPhoto} alt="User Profile" className="w-full h-full object-cover" />
              ) : (
                <span>{initials || (userRole === "Admin" ? "HN" : "SS")}</span>
              )}
              
              {/* Photo Overlay hover effect */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity">
                <Camera className="w-6 h-6 text-white" />
                <span className="text-[9px] text-white font-sans uppercase font-bold tracking-wider">Upload Photo</span>
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-serif font-bold text-navy">{userName}</h2>
            <div className="inline-flex items-center gap-1.5 bg-gold/10 text-navy px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-gold/20">
              <Shield className="w-3 h-3 text-gold" />
              <span>{userRole} Account</span>
            </div>
          </div>

          <div className="w-full pt-4 border-t border-light flex flex-col gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-navy hover:bg-navy-hover text-white font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Camera className="w-4 h-4 text-gold" />
              Change Profile Photo
            </button>
            
            {userPhoto && (
              <button
                onClick={onRemovePhoto}
                className="w-full bg-cream hover:bg-light text-red-600 font-bold py-2.5 rounded-xl border border-light transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                Remove Photo
              </button>
            )}
          </div>
        </div>

        {/* Account Details & Credentials Info */}
        <div className="md:col-span-7 bg-white rounded-3xl border border-light shadow-xs p-6 space-y-6">
          <div>
            <h3 className="text-base font-serif font-bold text-navy">Terminal Account Credentials</h3>
            <p className="text-muted-grey">Your current security clearance and active configuration settings.</p>
          </div>

          <div className="w-full h-[1px] bg-light"></div>

          <div className="space-y-4">
            {/* Detail Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-cream/35 p-4 rounded-2xl border border-light space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-grey font-bold block">Full Legal Name</span>
                <p className="font-bold text-navy text-sm">{userName}</p>
              </div>

              <div className="bg-cream/35 p-4 rounded-2xl border border-light space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-grey font-bold block">Assigned Designation</span>
                <p className="font-bold text-navy text-sm">{userDesignation}</p>
              </div>

              <div className="bg-cream/35 p-4 rounded-2xl border border-light space-y-1 sm:col-span-2">
                <span className="text-[9px] uppercase tracking-wider text-muted-grey font-bold block">Security Clearance Access</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Key className="w-3.5 h-3.5 text-gold shrink-0" />
                  <p className="font-mono font-bold text-navy text-[11px]">{clearanceLevel}</p>
                </div>
              </div>
            </div>

            {/* Offline Data Persistence Banner */}
            <div className="bg-cream/55 border border-light rounded-2xl p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="bg-gold/10 text-gold p-2 rounded-xl mt-0.5 shrink-0 border border-gold/10">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-navy text-xs">Offline Terminal Memory Protection</h4>
                  <p className="text-muted-grey text-[11px] leading-relaxed mt-0.5">
                    Your terminal configuration and customized profile photo are securely persisted in your browser's private local state storage. These remain intact across system reboots.
                  </p>
                </div>
              </div>
            </div>

            {/* Success feedback indicator */}
            <div className="flex items-center gap-2 text-[10px] text-green-600 bg-green-50 border border-green-100 px-4 py-2.5 rounded-xl font-medium">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>All active changes made on this screen are immediately synchronized with your browser session.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
