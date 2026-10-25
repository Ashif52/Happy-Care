"use client";

import React, { useState } from "react";
import {
  X,
  UserPlus,
  Shield,
  Building,
  Mail,
  Phone,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  HelpCircle
} from "lucide-react";
import { Department, api } from "@/lib/api";

interface CreateStaffModalProps {
  departments: Department[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateStaffModal({
  departments,
  isOpen,
  onClose,
  onSuccess,
}: CreateStaffModalProps) {
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState("maintenance");
  const [designation, setDesignation] = useState("");
  const [role, setRole] = useState("staff");
  const [supervisorId, setSupervisorId] = useState<string>("");
  const [supervisorsList, setSupervisorsList] = useState<any[]>([]);
  const [initialPassword, setInitialPassword] = useState("TempPass2026!");
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [sendInvitationEmail, setSendInvitationEmail] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      api.getSupervisorsList().then((res: any) => {
        if (Array.isArray(res)) setSupervisorsList(res);
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Auto-generate helper
  const handleAutoSuggestId = () => {
    const deptPrefix = departmentId ? departmentId.slice(0, 3).toUpperCase() : "STF";
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setEmployeeId(`EMP-${deptPrefix}-${randomNum}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim() || !employeeId.trim() || !email.trim() || !designation.trim()) {
      setErrorMessage("Please complete all required fields: Name, Employee ID, Email, and Designation.");
      return;
    }

    if (role === "supervisor" && !phone.trim()) {
      setErrorMessage("Mobile number is mandatory for Supervisors (required for WhatsApp dispatch & operational calls).");
      return;
    }

    if (!email.includes("@")) {
      setErrorMessage("Please enter a valid work email address.");
      return;
    }

    setIsLoading(true);

    try {
      await api.createStaff({
        name: fullName.trim(),
        employee_id: employeeId.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        department_id: departmentId,
        designation: designation.trim(),
        role: role,
        supervisor_id: supervisorId ? parseInt(supervisorId, 10) : undefined,
        initial_password: initialPassword.trim(),
        require_password_change: requirePasswordChange,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create staff account. Please verify uniqueness.");
    } finally {
      setIsLoading(false);
    }
  };

  const roleOptions = [
    { id: "staff", label: "Facilities & Maintenance Lead (Staff)", dept: "Facilities" },
    { id: "doctor", label: "Physician & Duty Doctor", dept: "Physicians" },
    { id: "nurse", label: "Clinical Nursing Staff", dept: "Nursing" },
    { id: "supervisor", label: "Department Head / Supervisor", dept: "Supervisory" },
    { id: "it_admin", label: "IT Administrator (IAM Security)", dept: "IT Operations" },
    { id: "billing", label: "Patient Accounts & Billing Specialist", dept: "Billing" },
    { id: "pharmacy", label: "Inpatient Clinical Pharmacist", dept: "Pharmacy" },
    { id: "housekeeping", label: "Housekeeping & Sanitation Lead", dept: "Sanitation" },
    { id: "reception", label: "Reception & Admissions Staff", dept: "Front Desk" },
    { id: "auditor", label: "Compliance & Quality Auditor", dept: "Governance" },
    { id: "admin", label: "Hospital Administrator", dept: "Executive" },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Surface */}
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border-2 border-[#CBD5E1] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b-2 border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#176B63] text-white shadow-sm">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#0F172A]">Provision Hospital Staff Account</h2>
              <p className="text-xs font-semibold text-[#475569]">
                Register personnel identity, assign department role, and configure authentication credentials
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#64748B] hover:text-[#0F172A] hover:bg-[#E2E8F0] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-6 p-4 rounded-xl bg-[#FEF2F2] border-2 border-[#FCA5A5] flex items-center gap-3 text-sm font-bold text-[#991B1B]">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Section 1: Identity */}
          <div className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-[#176B63] flex items-center gap-2">
              <span>1. Personnel Identity</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">
                  Full Name <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Rajesh Varma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#334155]">
                    Employee ID <span className="text-[#DC2626]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoSuggestId}
                    className="text-xs font-black text-[#176B63] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="h-3 w-3" /> Auto-suggest
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. EMP-DOC-1020"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-mono font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">
                  Work Email <span className="text-[#DC2626]">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
                  <input
                    type="email"
                    required
                    placeholder="name@careops.hospital"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
                  <input
                    type="tel"
                    placeholder="+91 98765 44400"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Employment */}
          <div className="space-y-3 pt-2 border-t-2 border-[#E2E8F0]">
            <h3 className="text-sm font-black uppercase tracking-wider text-[#176B63]">
              2. Hospital Placement
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">
                  Department <span className="text-[#DC2626]">*</span>
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white cursor-pointer"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">
                  Designation / Role Title <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Attending Physician / Staff Nurse"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#334155] mb-1">
                  Assigned Department Supervisor {role === "supervisor" ? "(N/A for Department Leads)" : "(Optional)"}
                </label>
                <select
                  disabled={role === "supervisor"}
                  value={supervisorId}
                  onChange={(e) => setSupervisorId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white cursor-pointer disabled:opacity-50"
                >
                  <option value="">No supervisor assigned (Direct to Admin)</option>
                  {supervisorsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.department_name || s.department_id || "Lead"}) - {s.phone || "No phone"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: RBAC & Initial Password */}
          <div className="space-y-3 pt-2 border-t-2 border-[#E2E8F0]">
            <h3 className="text-sm font-black uppercase tracking-wider text-[#176B63]">
              3. Access Role & Credentials
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">
                  Primary Access Role <span className="text-[#DC2626]">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white cursor-pointer"
                >
                  {roleOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">
                  Initial Provisioning Password
                </label>
                <input
                  type="text"
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-mono font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white"
                />
              </div>
            </div>

            <div className="p-3 bg-[#F1F5F9] rounded-xl border border-[#CBD5E1] flex items-center justify-between mt-2">
              <div className="text-xs">
                <span className="font-extrabold text-[#0F172A] block">Force Password Change on First Login</span>
                <span className="text-[#64748B]">Requires user to create their own secure password immediately upon authentication</span>
              </div>
              <input
                type="checkbox"
                checked={requirePasswordChange}
                onChange={(e) => setRequirePasswordChange(e.target.checked)}
                className="h-5 w-5 accent-[#176B63] rounded cursor-pointer"
              />
            </div>

            <div className="p-3 bg-[#E8F3F1] rounded-xl border border-[#99F6E4] flex items-center justify-between mt-2">
              <div className="text-xs">
                <span className="font-extrabold text-[#176B63] block flex items-center gap-1.5">
                  <Mail className="h-4 w-4" />
                  Dispatch Account Invitation Email to Work Mailbox
                </span>
                <span className="text-[#334155]">
                  Sends welcome letter with Employee ID, registered work email, assigned department, and credentials
                </span>
              </div>
              <input
                type="checkbox"
                checked={sendInvitationEmail}
                onChange={(e) => setSendInvitationEmail(e.target.checked)}
                className="h-5 w-5 accent-[#176B63] rounded cursor-pointer"
              />
            </div>

            <div className="p-2.5 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[11px] text-[#64748B] leading-relaxed">
              <span className="font-bold text-[#0F172A]">Staff Email Assignment: </span>
              Assigns this official email address in the database for ticket dispatch and security alerts. Note: entering an address here assigns an existing mailbox (Mode 1); organizational mailboxes should be provisioned in your email provider console (Mode 2).
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t-2 border-[#E2E8F0] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl border-2 border-[#CBD5E1] text-[#475569] font-bold text-sm hover:bg-[#F1F5F9] transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 rounded-xl bg-[#176B63] hover:bg-[#10574F] text-white font-black text-sm shadow-md shadow-[#176B63]/25 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              <span>{isLoading ? "Provisioning..." : "Provision Staff Account"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
