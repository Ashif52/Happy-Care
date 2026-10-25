"use client";

import React, { useState, useEffect } from "react";
import {
  UserCheck,
  UserPlus,
  Shield,
  ShieldAlert,
  Edit2,
  CheckCircle2,
  XCircle,
  KeyRound,
  RefreshCw,
  Search,
  Sliders,
  Phone,
  Mail,
  Building2,
  Lock
} from "lucide-react";
import { api, User, formatDateTime } from "@/lib/api";
import { PermissionMatrixModal } from "@/components/common/PermissionMatrixModal";

export function AdminManagementView() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<User | null>(null);
  const [permissionTarget, setPermissionTarget] = useState<User | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    department_id: "",
    account_status: "active",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAdmins = async () => {
    setIsLoading(true);
    try {
      const res: any = await api.getAdminsList();
      if (Array.isArray(res)) {
        setAdmins(res);
      }
    } catch (err: any) {
      console.error("Failed to load admin accounts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleOpenCreate = () => {
    setEditingAdmin(null);
    setFormData({
      name: "",
      email: "",
      phone: "+91 98765 ",
      password: "",
      department_id: "",
      account_status: "active",
    });
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (admin: User) => {
    setEditingAdmin(admin);
    setFormData({
      name: admin.name || "",
      email: admin.email || "",
      phone: admin.phone || "",
      password: "",
      department_id: admin.department_id || "",
      account_status: admin.account_status || "active",
    });
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (editingAdmin) {
        await api.updateAdmin(editingAdmin.id, formData);
      } else {
        if (!formData.password || formData.password.length < 8) {
          throw new Error("Temporary password must be at least 8 characters long.");
        }
        await api.createAdmin(formData);
      }
      setShowCreateModal(false);
      await loadAdmins();
    } catch (err: any) {
      setFormError(err.message || "Failed to save Admin account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActivate = async (admin: User) => {
    const isActivating = admin.account_status === "deactivated" || !admin.is_active;
    const confirmMsg = isActivating
      ? `Activate Administrator account for ${admin.name}?`
      : `Deactivate Administrator account for ${admin.name}? They will immediately lose access to all operational modules.`;

    if (!confirm(confirmMsg)) return;

    try {
      if (isActivating) {
        await api.activateAdmin(admin.id);
      } else {
        await api.deactivateAdmin(admin.id);
      }
      await loadAdmins();
    } catch (err: any) {
      alert(`Status update error: ${err.message || err}`);
    }
  };

  const filteredAdmins = admins
    .filter(
      (a) =>
        a.role === "admin" ||
        (a.role !== "superadmin" && !a.email.toLowerCase().includes("superadmin"))
    )
    .filter(
      (a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.phone && a.phone.includes(searchQuery))
    );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5E9EF] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#EEF4FD] rounded-xl text-[#3868C9]">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#17212F] flex items-center gap-2">
                Administrator Account Management
                <span className="px-2 py-0.5 rounded-full bg-[#3868C9]/10 text-[#3868C9] text-[10px] font-bold uppercase tracking-wider">
                  Super Admin Authority
                </span>
              </h1>
              <p className="text-xs text-[#667085] mt-0.5">
                Provision, monitor, and configure granular permissions for hospital Administrators.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAdmins}
            disabled={isLoading}
            className="p-2 bg-white hover:bg-[#F7F8FA] border border-[#E5E9EF] rounded-lg text-[#667085] hover:text-[#17212F] transition cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3868C9] hover:bg-[#2C52A4] text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Create New Admin</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-4 bg-white p-3.5 rounded-xl border border-[#E5E9EF] shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#98A2B3]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search administrators by name, email, or mobile..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F7F8FA] border border-[#E5E9EF] rounded-lg focus:outline-hidden focus:border-[#3868C9] focus:bg-white"
          />
        </div>
        <div className="text-xs text-[#667085]">
          Total Administrators: <span className="font-bold text-[#17212F]">{filteredAdmins.length}</span>
        </div>
      </div>

      {/* Admin Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAdmins.map((admin) => {
          const isActive = admin.is_active && admin.account_status !== "deactivated";
          const permCount = admin.permissions?.length || 0;

          return (
            <div
              key={admin.id}
              className="bg-white rounded-xl border border-[#E5E9EF] p-4.5 shadow-xs space-y-3.5 hover:border-[#D0D5DD] transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#EEF4FD] text-[#3868C9] font-bold text-sm flex items-center justify-center border border-[#BFDBFE]">
                    {admin.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[#17212F]">{admin.name}</h3>
                    <span className="text-[11px] text-[#667085] flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {admin.email}
                    </span>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isActive
                      ? "bg-[#EDF7F2] text-[#16805D]"
                      : "bg-[#FEF3F2] text-[#B42318]"
                  }`}
                >
                  {isActive ? "Active" : "Deactivated"}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px] text-[#475467] border-t border-[#F2F4F7] pt-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#667085] flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Mobile:
                  </span>
                  <span className="font-mono text-[#17212F]">{admin.phone || "Not set"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#667085] flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Granted Permissions:
                  </span>
                  <span className="font-mono font-bold text-[#3868C9] bg-[#EEF4FD] px-1.5 py-0.5 rounded">
                    {permCount} permissions
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#F2F4F7] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPermissionTarget(admin)}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-[#EEF4FD] hover:bg-[#DCE7FB] text-[#3868C9] rounded-lg text-[11px] font-bold transition cursor-pointer"
                >
                  <Sliders className="h-3 w-3" />
                  <span>Permissions Matrix</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEdit(admin)}
                  className="p-1.5 text-[#667085] hover:text-[#17212F] hover:bg-[#F7F8FA] rounded-lg border border-[#E5E9EF] transition cursor-pointer"
                  title="Edit details"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleActivate(admin)}
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    isActive
                      ? "text-[#B42318] border-[#FECDCA] hover:bg-[#FEF3F2]"
                      : "text-[#16805D] border-[#A6E1CE] hover:bg-[#EDF7F2]"
                  }`}
                  title={isActive ? "Deactivate account" : "Activate account"}
                >
                  {isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Admin Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 border border-[#E5E9EF] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E9EF] pb-3">
              <h3 className="text-sm font-bold text-[#17212F]">
                {editingAdmin ? "Edit Administrator Account" : "Provision New Administrator"}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-[#667085] hover:text-[#17212F] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-3.5 text-xs">
              <div>
                <label className="text-[#344054] font-semibold block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Dr. Robert Langdon"
                  className="w-full px-3 py-2 border border-[#D0D5DD] rounded-lg focus:outline-hidden focus:border-[#3868C9]"
                />
              </div>

              <div>
                <label className="text-[#344054] font-semibold block mb-1">Email Address (Login)</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="admin@careops.hospital"
                  className="w-full px-3 py-2 border border-[#D0D5DD] rounded-lg focus:outline-hidden focus:border-[#3868C9]"
                />
              </div>

              <div>
                <label className="text-[#344054] font-semibold block mb-1">Mobile Number (WhatsApp & Calling)</label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 border border-[#D0D5DD] rounded-lg focus:outline-hidden focus:border-[#3868C9] font-mono"
                />
              </div>

              <div>
                <label className="text-[#344054] font-semibold block mb-1">
                  {editingAdmin ? "Set New Password (Leave blank to keep unchanged)" : "Temporary Password (min 8 chars)"}
                </label>
                <input
                  type="password"
                  required={!editingAdmin}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 border border-[#D0D5DD] rounded-lg focus:outline-hidden focus:border-[#3868C9]"
                />
              </div>

              <div className="pt-3 border-t border-[#E5E9EF] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-[#E5E9EF] hover:bg-[#F7F8FA] rounded-lg text-xs font-semibold text-[#344054] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#3868C9] hover:bg-[#2C52A4] text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : editingAdmin ? "Update Admin" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permission Matrix Modal */}
      {permissionTarget && (
        <PermissionMatrixModal
          isOpen={true}
          onClose={() => setPermissionTarget(null)}
          userId={permissionTarget.id}
          userName={permissionTarget.name}
          userRole="admin"
          isSuperadminTarget={true}
          onSaved={loadAdmins}
        />
      )}
    </div>
  );
}
