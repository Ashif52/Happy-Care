"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  User,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  UserX,
  UserCheck,
  Building,
  Mail,
  Phone,
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  History,
  Copy,
  Check,
  Trash2,
  Edit3,
  Sliders,
  Sparkles,
  Save,
  RotateCcw
} from "lucide-react";
import { StaffMember, api, formatDateTime } from "@/lib/api";
import { PermissionMatrixModal } from "@/components/common/PermissionMatrixModal";
import { copyToClipboard } from "@/lib/clipboard";

interface StaffDetailDrawerProps {
  staff: StaffMember | null;
  onClose: () => void;
  onRefresh: () => void;
  currentUserRole?: string;
  onOpenUnlockModal: (staff: StaffMember) => void;
  onOpenDeactivateModal: (staff: StaffMember) => void;
  onOpenResetPasswordModal: (staff: StaffMember) => void;
  onActivateAccount: (staff: StaffMember) => void;
  onOpenDeleteModal?: (staff: StaffMember) => void;
}

export function StaffDetailDrawer({
  staff: propStaff,
  onClose,
  onRefresh,
  currentUserRole,
  onOpenUnlockModal,
  onOpenDeactivateModal,
  onOpenResetPasswordModal,
  onActivateAccount,
  onOpenDeleteModal,
}: StaffDetailDrawerProps) {
  const [internalStaff, setInternalStaff] = useState<StaffMember | null>(null);
  const staff = internalStaff || propStaff;

  const [activeTab, setActiveTab] = useState<"overview" | "access" | "security" | "audit">("overview");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Role Assignment & Editing State
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("staff");
  const [selectedDesignation, setSelectedDesignation] = useState<string>("");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleUpdateMessage, setRoleUpdateMessage] = useState<string | null>(null);
  const [roleUpdateError, setRoleUpdateError] = useState<string | null>(null);

  // Permission Matrix Modal State
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  // Profile Editing State (Overview Tab)
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getDepartments().then((depts: any) => {
      if (Array.isArray(depts)) setDepartmentsList(depts);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setInternalStaff(null);
    setIsEditingRole(false);
    setIsEditingProfile(false);
    setRoleUpdateMessage(null);
    setRoleUpdateError(null);
    setProfileSuccessMsg(null);
    setProfileErrorMsg(null);
    if (propStaff) {
      setSelectedRole(propStaff.role);
      setSelectedDesignation(propStaff.designation || "");
      setEditName(propStaff.name || "");
      setEditEmail(propStaff.email || "");
      setEditPhone(propStaff.phone || "");
      setEditDepartmentId(propStaff.department_id || "");
      setEditDesignation(propStaff.designation || "");
    }
  }, [propStaff]);

  const handleSaveProfile = async () => {
    if (!staff) return;
    setIsSavingProfile(true);
    setProfileErrorMsg(null);
    setProfileSuccessMsg(null);
    try {
      const emailChanged = editEmail.trim().toLowerCase() !== staff.email.toLowerCase();
      const res: any = await api.updateStaff(staff.id, {
        name: editName.trim() || staff.name,
        email: editEmail.trim().toLowerCase() || staff.email,
        phone: editPhone.trim(),
        department_id: editDepartmentId || staff.department_id,
        designation: editDesignation.trim() || staff.designation,
      });
      if (res && res.id) {
        setInternalStaff(res);
        setProfileSuccessMsg(
          emailChanged
            ? "Staff details & official work email updated! Security notices have been dispatched."
            : "Staff details updated successfully!"
        );
        setIsEditingProfile(false);
        onRefresh();
        setTimeout(() => setProfileSuccessMsg(null), 5000);
      } else {
        throw new Error(res?.detail || "Failed to update profile");
      }
    } catch (err: any) {
      console.error("Failed to update staff details:", err);
      setProfileErrorMsg(err?.message || "Failed to update staff details.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const AVAILABLE_ROLES = [
    {
      id: "staff",
      name: "Department Staff Member",
      badge: "Staff",
      badgeBg: "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]",
      desc: "Frontline operational personnel: executes assigned service orders, uploads evidence/photos, views room checklists."
    },
    {
      id: "supervisor",
      name: "Department Supervisor",
      badge: "Supervisor",
      badgeBg: "bg-[#FEF3C7] text-[#D97706] border-[#FCD34D]",
      desc: "Departmental team leader: monitors SLA countdowns, reviews AI-verified tickets, coordinates technicians, handles service escalations."
    },
    {
      id: "admin",
      name: "Hospital Administrator",
      badge: "Admin",
      badgeBg: "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]",
      desc: "Hospital administrator: full access across all 6 departments, staff accounts, QR room managers, SLA escalations, NPS, and Google reputation."
    },
    ...(currentUserRole === "superadmin"
      ? [
          {
            id: "superadmin",
            name: "Super Administrator",
            badge: "Super Admin",
            badgeBg: "bg-[#FCE7F3] text-[#9D174D] border-[#F472B6]",
            desc: "Root system owner: manages administrative accounts, platform security controls, database maintenance, and permanent deletion."
          }
        ]
      : [])
  ];

  const handleSaveRole = async () => {
    if (!staff) return;
    setIsUpdatingRole(true);
    setRoleUpdateError(null);
    setRoleUpdateMessage(null);
    try {
      const res: any = await api.updateStaff(staff.id, {
        role: selectedRole,
        designation: selectedDesignation.trim() || staff.designation
      });
      if (res && res.id) {
        setInternalStaff(res);
        setRoleUpdateMessage(`Role successfully updated to "${selectedRole.toUpperCase()}". Default role permissions applied.`);
        setIsEditingRole(false);
        onRefresh();
        setTimeout(() => setRoleUpdateMessage(null), 5000);
      } else {
        throw new Error(res?.detail || "Failed to update role");
      }
    } catch (err: any) {
      console.error("Failed to update role:", err);
      setRoleUpdateError(err?.message || "Failed to update role. Please verify your permissions.");
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handlePermissionsSaved = async () => {
    if (!staff) return;
    try {
      const updated: any = await api.getStaffDetail(staff.id);
      if (updated && updated.id) {
        setInternalStaff(updated);
      }
    } catch (e) {
      console.error("Failed to reload staff permissions:", e);
    }
    onRefresh();
  };

  if (!staff) return null;

  const handleCopy = async (text: string, label: string) => {
    await copyToClipboard(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#EDF7F2] text-[#16805D] border-2 border-[#A6E1CE]">
            <span className="h-2 w-2 rounded-full bg-[#16805D]" />
            Active
          </span>
        );
      case "locked":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#FEE2E2] text-[#991B1B] border-2 border-[#FCA5A5] animate-pulse">
            <Lock className="h-3.5 w-3.5 text-[#991B1B]" />
            Locked
          </span>
        );
      case "inactive":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#F1F5F9] text-[#475569] border-2 border-[#CBD5E1]">
            <UserX className="h-3.5 w-3.5 text-[#475569]" />
            Inactive
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#FEF3C7] text-[#92400E] border-2 border-[#FCD34D]">
            Pending Activation
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      {/* Drawer Surface */}
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col z-10 border-l-2 border-[#CBD5E1] animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-6 border-b-2 border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-14 w-14 rounded-2xl bg-[#E8F3F1] text-[#176B63] border-2 border-[#99F6E4] flex items-center justify-center font-black text-lg shadow-sm">
                {staff.name
                  ? staff.name
                      .split(" ")
                      .filter(Boolean)
                      .map((n: string) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()
                  : "ST"}
              </div>
              <span
                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${
                  staff.account_status === "active"
                    ? "bg-[#16805D]"
                    : staff.account_status === "locked"
                    ? "bg-[#DC2626]"
                    : "bg-[#64748B]"
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black text-[#0F172A]">{staff.name}</h2>
                {getStatusBadge(staff.account_status)}
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#475569] mt-0.5">
                <span className="font-mono bg-[#E2E8F0] px-2 py-0.5 rounded text-[#0F172A]">
                  {staff.employee_id}
                </span>
                <span>•</span>
                <span>{staff.designation}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-xl text-[#475569] hover:text-[#0F172A] hover:bg-[#E2E8F0] transition-colors cursor-pointer"
            title="Close Drawer"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b-2 border-[#E2E8F0] bg-white px-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-3.5 px-4 font-black text-sm border-b-2 transition-all cursor-pointer ${
              activeTab === "overview"
                ? "border-[#176B63] text-[#176B63]"
                : "border-transparent text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("access")}
            className={`py-3.5 px-4 font-black text-sm border-b-2 transition-all cursor-pointer ${
              activeTab === "access"
                ? "border-[#176B63] text-[#176B63]"
                : "border-transparent text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            Access & Roles
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`py-3.5 px-4 font-black text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "security"
                ? "border-[#176B63] text-[#176B63]"
                : "border-transparent text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            <span>Security & Auth</span>
            {staff.account_status === "locked" && (
              <span className="h-2 w-2 rounded-full bg-[#DC2626] animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`py-3.5 px-4 font-black text-sm border-b-2 transition-all cursor-pointer ${
              activeTab === "audit"
                ? "border-[#176B63] text-[#176B63]"
                : "border-transparent text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            Activity & Audit
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {profileSuccessMsg && (
                <div className="p-3.5 bg-[#EDF7F2] border-2 border-[#A6E1CE] rounded-2xl flex items-center gap-2.5 text-xs font-bold text-[#16805D] animate-in fade-in">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#16805D]" />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              {profileErrorMsg && (
                <div className="p-3.5 bg-[#FEF2F2] border-2 border-[#FECACA] rounded-2xl flex items-center gap-2.5 text-xs font-bold text-[#DC2626] animate-in fade-in">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-[#DC2626]" />
                  <span>{profileErrorMsg}</span>
                </div>
              )}

              {/* Identity & Contact Card */}
              <div className="bg-[#F8FAFC] rounded-2xl border-2 border-[#CBD5E1] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                    <User className="h-5 w-5 text-[#176B63]" />
                    <span>Personal & Employment Identity</span>
                  </h3>
                  {(currentUserRole === "admin" || currentUserRole === "superadmin") && (
                    !isEditingProfile ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditName(staff.name || "");
                          setEditEmail(staff.email || "");
                          setEditPhone(staff.phone || "");
                          setEditDepartmentId(staff.department_id || "");
                          setEditDesignation(staff.designation || "");
                          setIsEditingProfile(true);
                          setProfileErrorMsg(null);
                        }}
                        className="px-3 py-1 rounded-lg bg-white hover:bg-[#F1F5F9] text-[#176B63] border-2 border-[#176B63] text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                        title="Edit Staff Personal & Department Info"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit Details</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingProfile(false)}
                        className="px-3 py-1 rounded-lg bg-white hover:bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1] text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    )
                  )}
                </div>

                {!isEditingProfile ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="text-xs font-bold text-[#475569] uppercase block mb-1">
                        Full Name
                      </label>
                      <div className="font-extrabold text-[#0F172A]">{staff.name}</div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#475569] uppercase block mb-1">
                        Hospital Employee ID
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-[#176B63] bg-white px-2.5 py-1 rounded-lg border border-[#CBD5E1]">
                          {staff.employee_id}
                        </span>
                        <button
                          onClick={() => handleCopy(staff.employee_id, "emp_id")}
                          className="p-1 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                          title="Copy ID"
                        >
                          {copiedText === "emp_id" ? (
                            <Check className="h-4 w-4 text-[#16805D]" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#475569] uppercase block mb-1">
                        Official Work Email
                      </label>
                      <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                        <Mail className="h-4 w-4 text-[#64748B]" />
                        <span>{staff.email}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#475569] uppercase block mb-1">
                        Contact Phone
                      </label>
                      <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                        <Phone className="h-4 w-4 text-[#64748B]" />
                        <span>{staff.phone || "Not recorded"}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#475569] uppercase block mb-1">
                        Assigned Department
                      </label>
                      <div className="flex items-center gap-2 font-extrabold text-[#0F172A]">
                        <Building className="h-4 w-4 text-[#176B63]" />
                        <span>{staff.department_name || staff.department_id || "Hospital Global"}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#475569] uppercase block mb-1">
                        Hospital Designation
                      </label>
                      <div className="font-extrabold text-[#0F172A]">{staff.designation}</div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#475569] uppercase block mb-1">
                        Account Provisioned
                      </label>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
                        <Calendar className="h-4 w-4 text-[#94A3B8]" />
                        <span>{formatDateTime(staff.created_at)}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#475569] uppercase block mb-1">
                        Last Successful Authentication
                      </label>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
                        <Clock className="h-4 w-4 text-[#94A3B8]" />
                        <span>
                          {staff.last_login_at
                            ? formatDateTime(staff.last_login_at)
                            : "Never authenticated"}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 bg-white p-4 rounded-xl border border-[#CBD5E1] animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <label className="text-xs font-black text-[#0F172A] uppercase block mb-1">
                          Full Name <span className="text-[#DC2626]">*</span>
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full p-2.5 rounded-xl border-2 border-[#CBD5E1] text-xs font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63]"
                          placeholder="Staff full name"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-black text-[#0F172A] uppercase block mb-1">
                          Contact Phone
                        </label>
                        <input
                          type="text"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="w-full p-2.5 rounded-xl border-2 border-[#CBD5E1] text-xs font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63]"
                          placeholder="+91 98765 43210"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-xs font-black text-[#0F172A] uppercase block mb-1">
                          Official Work Email <span className="text-[#DC2626]">*</span>
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
                          <input
                            type="email"
                            required
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] text-xs font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63]"
                            placeholder="staff.name@careops.hospital"
                          />
                        </div>
                        <div className="mt-2 p-2.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[11px] text-[#166534] leading-relaxed">
                          <span className="font-bold">Email Assignment Modes: </span>
                          <strong>Mode 1 (Active):</strong> Modifying this address centrally updates the database account store and routes all dispatch, assignment, and password-reset emails here.
                          <br />
                          <strong>Mode 2 (Org Mailbox):</strong> If this mailbox does not exist yet with your domain provider (e.g. Google Workspace / Microsoft 365), provision it via your provider administration console.
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-black text-[#0F172A] uppercase block mb-1">
                          Assigned Department <span className="text-[#DC2626]">*</span>
                        </label>
                        <select
                          value={editDepartmentId}
                          onChange={(e) => setEditDepartmentId(e.target.value)}
                          className="w-full p-2.5 rounded-xl border-2 border-[#CBD5E1] bg-white text-xs font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63]"
                        >
                          <option value="">Select Department...</option>
                          {departmentsList.map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-black text-[#0F172A] uppercase block mb-1">
                          Hospital Designation
                        </label>
                        <input
                          type="text"
                          value={editDesignation}
                          onChange={(e) => setEditDesignation(e.target.value)}
                          className="w-full p-2.5 rounded-xl border-2 border-[#CBD5E1] text-xs font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63]"
                          placeholder="e.g. Senior Specialist, Charge Nurse"
                        />
                      </div>
                    </div>

                    <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-[#F1F5F9]">
                      <button
                        type="button"
                        onClick={() => setIsEditingProfile(false)}
                        disabled={isSavingProfile}
                        className="px-4 py-2 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#475569] hover:bg-[#F8FAFC] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        disabled={isSavingProfile}
                        className="px-5 py-2 rounded-xl bg-[#176B63] hover:bg-[#10574F] text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>{isSavingProfile ? "Saving..." : "Save Details"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Banner */}
              {staff.account_status === "locked" && (
                <div className="bg-[#FEF2F2] border-2 border-[#FCA5A5] rounded-2xl p-4.5 flex items-start gap-3">
                  <ShieldAlert className="h-6 w-6 text-[#DC2626] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-black text-[#991B1B] text-base">Account Locked Out</h4>
                    <p className="text-sm font-semibold text-[#7F1D1D] mt-0.5">
                      {staff.locked_reason || "Account locked after 3 consecutive failed login attempts."}
                    </p>
                    {staff.locked_at && (
                      <div className="text-xs font-bold text-[#991B1B] mt-1">
                        Locked timestamp: {formatDateTime(staff.locked_at)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACCESS & ROLES */}
          {activeTab === "access" && (
            <div className="space-y-6">
              {roleUpdateMessage && (
                <div className="p-3.5 bg-[#EDF7F2] border-2 border-[#A6E1CE] rounded-2xl flex items-center gap-2.5 text-xs font-bold text-[#16805D] animate-in fade-in">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#16805D]" />
                  <span>{roleUpdateMessage}</span>
                </div>
              )}

              {roleUpdateError && (
                <div className="p-3.5 bg-[#FEF2F2] border-2 border-[#FECACA] rounded-2xl flex items-center gap-2.5 text-xs font-bold text-[#DC2626] animate-in fade-in">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-[#DC2626]" />
                  <span>{roleUpdateError}</span>
                </div>
              )}

              {/* Assigned Healthcare Role Card */}
              <div className="bg-[#F8FAFC] rounded-2xl border-2 border-[#CBD5E1] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                    <Shield className="h-5 w-5 text-[#176B63]" />
                    <span>Assigned Healthcare Role</span>
                  </h3>
                  
                  {!isEditingRole ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase px-3 py-1 rounded-lg bg-[#E8F3F1] text-[#176B63] border border-[#99F6E4]">
                        {staff.role}
                      </span>
                      {(currentUserRole === "admin" || currentUserRole === "superadmin") && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRole(staff.role);
                            setSelectedDesignation(staff.designation || "");
                            setIsEditingRole(true);
                            setRoleUpdateError(null);
                            setRoleUpdateMessage(null);
                          }}
                          className="px-3 py-1 rounded-lg bg-white hover:bg-[#F1F5F9] text-[#176B63] border-2 border-[#176B63] text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                          title="Assign or Change Healthcare Role"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Edit / Reassign Role</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingRole(false)}
                      className="px-3 py-1 rounded-lg bg-white hover:bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1] text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {!isEditingRole ? (
                  <div className="text-sm text-[#334155] font-semibold bg-white p-4 rounded-xl border border-[#CBD5E1] space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-[#64748B] font-bold block">Active Role:</span>
                        <strong className="text-[#0F172A] font-black capitalize text-base">{staff.role}</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-[#64748B] font-bold block">Department Scope:</span>
                        <strong className="text-[#0F172A] font-black">{staff.department_name || staff.department_id || "Hospital Global"}</strong>
                      </div>
                    </div>
                    <p className="text-xs text-[#475569] font-medium pt-2 border-t border-[#F1F5F9] leading-relaxed">
                      {AVAILABLE_ROLES.find((r) => r.id === staff.role)?.desc || "Configured hospital staff role with access permissions."}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded-xl border-2 border-[#176B63] space-y-4 animate-in fade-in">
                    <div>
                      <label className="text-xs font-black text-[#0F172A] uppercase block mb-2">
                        Select Healthcare Role to Assign <span className="text-[#DC2626]">*</span>
                      </label>
                      <div className="grid grid-cols-1 gap-2.5">
                        {AVAILABLE_ROLES.map((roleOpt) => {
                          const isSelected = selectedRole === roleOpt.id;
                          return (
                            <div
                              key={roleOpt.id}
                              onClick={() => setSelectedRole(roleOpt.id)}
                              className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                                isSelected
                                  ? "border-[#176B63] bg-[#E8F3F1]/40 shadow-xs"
                                  : "border-[#E2E8F0] hover:border-[#CBD5E1] bg-[#F8FAFC]"
                              }`}
                            >
                              <input
                                type="radio"
                                name="roleOption"
                                checked={isSelected}
                                onChange={() => setSelectedRole(roleOpt.id)}
                                className="mt-1 accent-[#176B63] h-4 w-4"
                              />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-black text-[#0F172A]">
                                    {roleOpt.name}
                                  </span>
                                  <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-md border ${roleOpt.badgeBg}`}>
                                    {roleOpt.badge}
                                  </span>
                                </div>
                                <p className="text-xs text-[#475569] mt-1 font-medium leading-relaxed">
                                  {roleOpt.desc}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-black text-[#0F172A] uppercase block mb-1">
                        Designation Title
                      </label>
                      <input
                        type="text"
                        value={selectedDesignation}
                        onChange={(e) => setSelectedDesignation(e.target.value)}
                        placeholder="e.g. Senior Biomedical Specialist, Inpatient Nursing Lead"
                        className="w-full p-2.5 rounded-xl border-2 border-[#CBD5E1] text-xs font-semibold focus:outline-none focus:border-[#176B63]"
                      />
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#E2E8F0]">
                      <button
                        type="button"
                        onClick={() => setIsEditingRole(false)}
                        disabled={isUpdatingRole}
                        className="px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#475569] hover:bg-[#F8FAFC] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveRole}
                        disabled={isUpdatingRole || !selectedRole}
                        className="px-5 py-2 rounded-xl bg-[#176B63] hover:bg-[#10574F] text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>{isUpdatingRole ? "Saving Role..." : "Save Assigned Role"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Effective Granular Permissions */}
              <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-[#16805D]" />
                    <span>Effective Granular Permissions ({staff.permissions?.length || 0})</span>
                  </h3>
                  
                  <div className="flex items-center gap-2">
                    {(currentUserRole === "admin" || currentUserRole === "superadmin") && (
                      <button
                        type="button"
                        onClick={() => setShowPermissionModal(true)}
                        className="px-3 py-1 rounded-lg bg-[#EEF4FD] hover:bg-[#DBEAFE] text-[#2563EB] border border-[#BFDBFE] text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                        title="Customize Specific Permissions in Matrix Modal"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                        <span>Customize Permissions</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-[#64748B] font-medium">
                  Permissions automatically granted for the <strong>{staff.role}</strong> role. Use &quot;Customize Permissions&quot; to toggle specific operational rights.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  {staff.permissions && staff.permissions.length > 0 ? (
                    staff.permissions.map((perm) => (
                      <div
                        key={perm}
                        className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2 text-xs"
                      >
                        <CheckCircle2 className="h-4 w-4 text-[#16805D] shrink-0" />
                        <span className="font-mono font-bold text-[#0F172A]">{perm}</span>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 text-xs font-semibold text-[#64748B] italic">
                      No specific granular permissions assigned.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & AUTH */}
          {activeTab === "security" && (
            <div className="space-y-6">
              {/* Authentication Security State */}
              <div className="bg-[#F8FAFC] rounded-2xl border-2 border-[#CBD5E1] p-5 space-y-4">
                <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                  <Lock className="h-5 w-5 text-[#176B63]" />
                  <span>Authentication Security State</span>
                </h3>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3.5 bg-white rounded-xl border border-[#CBD5E1]">
                    <label className="text-xs font-bold text-[#475569] block mb-1">
                      Consecutive Failed Logins
                    </label>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-black text-lg ${
                          staff.failed_login_attempts >= 3
                            ? "text-[#DC2626]"
                            : staff.failed_login_attempts > 0
                            ? "text-[#D97706]"
                            : "text-[#16805D]"
                        }`}
                      >
                        {staff.failed_login_attempts} / 3
                      </span>
                      {staff.failed_login_attempts >= 3 && (
                        <span className="text-xs font-black text-[#DC2626] bg-[#FEE2E2] px-2 py-0.5 rounded">
                          Threshold Exceeded
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 bg-white rounded-xl border border-[#CBD5E1]">
                    <label className="text-xs font-bold text-[#475569] block mb-1">
                      Account Lock Status
                    </label>
                    <div className="font-black text-sm">
                      {staff.account_status === "locked" ? (
                        <span className="text-[#DC2626] flex items-center gap-1.5">
                          <Lock className="h-4 w-4" /> Locked Out
                        </span>
                      ) : (
                        <span className="text-[#16805D] flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4" /> Unlocked / Eligible
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Primary Security Actions */}
                <div className="pt-2 flex flex-wrap gap-3">
                  {staff.account_status === "locked" ? (
                    <button
                      onClick={() => onOpenUnlockModal(staff)}
                      className="px-4.5 py-2.5 rounded-xl bg-[#16805D] hover:bg-[#11664A] text-white text-sm font-black flex items-center gap-2 shadow-sm cursor-pointer transition-all"
                    >
                      <Unlock className="h-4.5 w-4.5" />
                      <span>Unlock Account</span>
                    </button>
                  ) : null}

                  <button
                    onClick={() => onOpenResetPasswordModal(staff)}
                    className="px-4.5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-black flex items-center gap-2 shadow-sm cursor-pointer transition-all"
                  >
                    <KeyRound className="h-4.5 w-4.5" />
                    <span>Reset Credentials</span>
                  </button>

                  {staff.is_active ? (
                    <button
                      onClick={() => onOpenDeactivateModal(staff)}
                      className="px-4.5 py-2.5 rounded-xl bg-[#FEE2E2] hover:bg-[#FCD3D3] text-[#991B1B] border-2 border-[#FCA5A5] text-sm font-black flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <UserX className="h-4.5 w-4.5" />
                      <span>Inactivate Account</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onActivateAccount(staff)}
                      className="px-4.5 py-2.5 rounded-xl bg-[#EDF7F2] hover:bg-[#D7EFE4] text-[#16805D] border-2 border-[#A6E1CE] text-sm font-black flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <UserCheck className="h-4.5 w-4.5" />
                      <span>Activate Account</span>
                    </button>
                  )}

                  {currentUserRole === "superadmin" && onOpenDeleteModal && (
                    <button
                      onClick={() => onOpenDeleteModal(staff)}
                      className="px-4.5 py-2.5 rounded-xl bg-[#FFF1F2] hover:bg-[#FFE4E6] text-[#E11D48] border-2 border-[#FDA4AF] text-sm font-black flex items-center gap-2 cursor-pointer transition-all"
                      title="Permanently Delete Staff Member (SuperAdmin Only)"
                    >
                      <Trash2 className="h-4.5 w-4.5 text-[#E11D48]" />
                      <span>Delete Account (SuperAdmin)</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ACTIVITY & AUDIT */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                  <History className="h-5 w-5 text-[#176B63]" />
                  <span>Personnel Security Event History</span>
                </h3>
              </div>

              <div className="bg-[#F8FAFC] rounded-2xl border-2 border-[#CBD5E1] p-4 text-xs space-y-3">
                <div className="p-3 bg-white rounded-xl border border-[#E2E8F0]">
                  <div className="flex items-center justify-between font-bold text-[#0F172A]">
                    <span className="font-mono text-[#176B63]">STAFF_ACCOUNT_PROVISIONED</span>
                    <span className="text-[#64748B]">{formatDateTime(staff.created_at)}</span>
                  </div>
                  <p className="text-[#475569] mt-1 font-medium">
                    Account provisioned with Employee ID {staff.employee_id} and role {staff.role}.
                  </p>
                </div>

                {staff.locked_at && (
                  <div className="p-3 bg-[#FEF2F2] rounded-xl border border-[#FCA5A5]">
                    <div className="flex items-center justify-between font-bold text-[#991B1B]">
                      <span className="font-mono">ACCOUNT_LOCKED_AUTO</span>
                      <span>{formatDateTime(staff.locked_at)}</span>
                    </div>
                    <p className="text-[#7F1D1D] mt-1 font-semibold">
                      Account locked out after 3 consecutive failed password attempts.
                    </p>
                  </div>
                )}

                {staff.last_login_at && (
                  <div className="p-3 bg-white rounded-xl border border-[#E2E8F0]">
                    <div className="flex items-center justify-between font-bold text-[#0F172A]">
                      <span className="font-mono text-[#16805D]">LOGIN_SUCCESS</span>
                      <span className="text-[#64748B]">{formatDateTime(staff.last_login_at)}</span>
                    </div>
                    <p className="text-[#475569] mt-1 font-medium">
                      Authentication session issued. Consecutive failure counter reset to 0.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Granular Permission Matrix Modal */}
      {showPermissionModal && staff && (
        <PermissionMatrixModal
          isOpen={true}
          onClose={() => setShowPermissionModal(false)}
          userId={staff.id}
          userName={staff.name}
          userRole={staff.role}
          isSuperadminTarget={staff.role === "superadmin"}
          onSaved={handlePermissionsSaved}
        />
      )}
    </div>
  );
}
