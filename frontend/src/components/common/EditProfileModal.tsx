"use client";

import React, { useState, useEffect } from "react";
import { User as UserIcon, Phone, Briefcase, Mail, Shield, CheckCircle2, AlertCircle, X, Loader2, Hash } from "lucide-react";
import { api, User } from "@/lib/api";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onProfileUpdated: (updatedUser: User) => void;
}

export function EditProfileModal({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
}: EditProfileModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser && isOpen) {
      setName(currentUser.name || "");
      setPhone(currentUser.phone || "");
      setDesignation(currentUser.designation || "");
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || cleanName.length < 2) {
      setErrorMsg("Full name must be at least 2 characters long.");
      return;
    }
    if (cleanName.length > 100) {
      setErrorMsg("Full name cannot exceed 100 characters.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const savedUser = await api.updateProfile({
        name: cleanName,
        phone: phone.trim() || undefined,
        designation: designation.trim() || undefined,
      });

      setSuccessMsg("Profile identity successfully synchronized in PostgreSQL database.");
      onProfileUpdated(savedUser);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#176B63]/10 text-[#176B63] flex items-center justify-center font-bold">
              <UserIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">Edit Account Profile</h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Canonical identity & operations personnel record
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          {/* Read-Only Account Identity Badges */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-[#176B63]" />
              <span>Verified Account Credentials</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600">
                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate font-semibold">{currentUser?.email || "—"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <Hash className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate font-mono text-[11px]">
                  {currentUser?.employee_id || `ID #${currentUser?.id || "—"}`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-slate-200/50 text-[11px]">
              <span className="font-bold text-slate-600">Role:</span>
              <span className="capitalize font-black text-[#176B63] bg-[#176B63]/10 px-2 py-0.5 rounded">
                {currentUser?.role || "Staff"}
              </span>
              {currentUser?.department_id && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="font-bold text-slate-600">Department:</span>
                  <span className="capitalize font-semibold text-slate-700">
                    {currentUser.department_id}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Editable Full Name */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dr. Jane Doe"
                disabled={isLoading}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#176B63] focus:border-[#176B63] transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-500">
              This name will be displayed across operations workspaces, headers, and assignment logs.
            </p>
          </div>

          {/* Editable Designation */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Designation / Title
            </label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Hospital Operations Director"
                disabled={isLoading}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#176B63] focus:border-[#176B63] transition-all"
              />
            </div>
          </div>

          {/* Editable Phone */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Contact Phone
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                disabled={isLoading}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#176B63] focus:border-[#176B63] transition-all"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 rounded-xl bg-[#176B63] hover:bg-[#10574F] disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Profile Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
