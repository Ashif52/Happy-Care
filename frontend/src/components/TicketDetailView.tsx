"use client";

import React, { useState } from "react";
import {
  X,
  Clock,
  User,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Send,
  Lock,
  Globe,
  CheckCircle2,
  Play,
  Upload,
  Calendar,
  Layers,
  ArrowRight,
  ExternalLink,
  Volume2,
  Loader2,
  Mail,
  Check,
  Edit2,
  UserCheck,
  ArrowRightLeft,
  Building2,
  Users,
  Video,
  Camera,
  FileVideo,
  Image as ImageIcon,
  Film
} from "lucide-react";
import { api, Ticket, User as UserType, getFileUrl, formatTime, formatDateTime, parseUtcDate, formatDurationHoursMinutes } from "@/lib/api";

interface TicketDetailViewProps {
  ticket: Ticket;
  currentUser: UserType | null;
  onClose: () => void;
  onAcknowledge: (ticketId: number) => void;
  onStartWork: (ticketId: number) => void;
  onSubmitResolution: (ticketId: number, data: { summary: string; parts?: string; test_notes?: string }) => void;
  onCloseTicket: (ticketId: number, approvalNote?: string) => void;
  onAddNote: (ticketId: number, content: string, isInternal: boolean) => void;
  onUploadEvidence: (ticketId: number, stage: "before" | "after", file: File, mediaType: "image" | "video") => void;
  onTicketUpdated?: () => void;
}

export function TicketDetailView({
  ticket,
  currentUser,
  onClose,
  onAcknowledge,
  onStartWork,
  onSubmitResolution,
  onCloseTicket,
  onAddNote,
  onUploadEvidence,
  onTicketUpdated,
}: TicketDetailViewProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "evidence" | "notes" | "audit">("overview");
  const [newNote, setNewNote] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(true);

  // Supervisor Staff Assignment States
  const [currentTicket, setCurrentTicket] = useState<Ticket>(ticket);
  const [deptStaff, setDeptStaff] = useState<any[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<number | "">("");
  const [assignNote, setAssignNote] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  // Department Re-routing / Transfer States (when client clicked wrong problem)
  const [assignmentMode, setAssignmentMode] = useState<"assign" | "transfer">("assign");
  const [allDepartments, setAllDepartments] = useState<any[]>([]);
  const [targetDeptId, setTargetDeptId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  React.useEffect(() => {
    setCurrentTicket(ticket);
  }, [ticket]);

  // Load all departments for transfer options
  React.useEffect(() => {
    api.getDepartments()
      .then((data: any) => {
        if (Array.isArray(data)) setAllDepartments(data);
      })
      .catch((err) => console.error("Failed to load departments:", err));
  }, []);

  // Load eligible staff for this ticket's department
  React.useEffect(() => {
    let isMounted = true;
    const fetchStaff = async () => {
      try {
        const staffList: any = await api.getDepartmentStaff(currentTicket.department_id);
        if (isMounted) {
          setDeptStaff(staffList || []);
          if (currentTicket.assigned_staff_id) {
            setSelectedStaffId(currentTicket.assigned_staff_id);
          }
        }
      } catch (err) {
        console.error("Failed to load department staff:", err);
      }
    };
    if (currentTicket.department_id) {
      fetchStaff();
    }
    return () => {
      isMounted = false;
    };
  }, [currentTicket.department_id, currentTicket.assigned_staff_id]);

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDeptId) {
      setTransferError("Please select a target department from the list.");
      return;
    }
    setIsTransferring(true);
    setTransferError(null);
    setTransferSuccess(null);
    try {
      const updated: any = await api.transferTicketDepartment(
        currentTicket.id,
        targetDeptId,
        transferReason.trim() || undefined
      );
      setCurrentTicket(updated);
      setTransferSuccess(`Ticket successfully transferred to ${targetDeptId.toUpperCase()} department.`);
      setTargetDeptId("");
      setTransferReason("");
      // Refresh staff list for new department
      const newStaff: any = await api.getDepartmentStaff(targetDeptId);
      setDeptStaff(newStaff || []);
      setSelectedStaffId("");
      if (onTicketUpdated) onTicketUpdated();
      setTimeout(() => setTransferSuccess(null), 5000);
    } catch (err: any) {
      setTransferError(err.message || "Failed to transfer ticket department.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId) {
      setAssignError("Please select an eligible staff member from the list.");
      return;
    }
    setIsAssigning(true);
    setAssignError(null);
    setAssignSuccess(null);
    try {
      const updated: any = await api.assignTicket(
        currentTicket.id,
        Number(selectedStaffId),
        currentTicket.assigned_staff_id,
        assignNote.trim() || undefined
      );
      setCurrentTicket((prev) => ({
        ...prev,
        ...updated,
        assigned_staff_id: updated.assigned_staff_id || Number(selectedStaffId),
        assigned_staff_name: updated.assigned_staff_name,
        status: updated.status || "assigned",
      }));
      setAssignSuccess(
        `Successfully assigned to ${updated.assigned_staff_name || "selected staff member"}. Work queue updated.`
      );
      if (onTicketUpdated) {
        onTicketUpdated();
      }
      setTimeout(() => setAssignSuccess(null), 5000);
    } catch (err: any) {
      const msg = err.message || "Failed to assign staff member.";
      if (
        msg.includes("409") ||
        msg.includes("Conflict") ||
        msg.includes("assigned by another supervisor")
      ) {
        setAssignError(
          "Conflict: This request was already assigned or modified by another supervisor. Reloading request..."
        );
        try {
          const fresh: any = await api.getTicketDetail(currentTicket.id);
          setCurrentTicket(fresh);
          if (fresh.assigned_staff_id) setSelectedStaffId(fresh.assigned_staff_id);
        } catch (_) {}
      } else {
        setAssignError(msg);
      }
    } finally {
      setIsAssigning(false);
    }
  };

  // Resolution form states
  const [showResModal, setShowResModal] = useState(false);
  const [resSummary, setResSummary] = useState("");
  const [resParts, setResParts] = useState("");
  const [resNotes, setResNotes] = useState("");

  // Evidence upload states (Photo & Video)
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStage, setUploadStage] = useState<"before" | "after">("after");
  const [evidenceMediaType, setEvidenceMediaType] = useState<"video" | "photo">("video");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  const handleSelectUploadFile = (file: File | null) => {
    setSelectedFile(file);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    if (file) {
      setFilePreviewUrl(URL.createObjectURL(file));
      if (file.type.includes("video") || file.name.endsWith(".mp4") || file.name.endsWith(".webm") || file.name.endsWith(".mov") || file.name.endsWith(".3gp")) {
        setEvidenceMediaType("video");
      } else if (file.type.includes("image")) {
        setEvidenceMediaType("photo");
      }
    } else {
      setFilePreviewUrl(null);
    }
  };

  const handleCloseUploadModal = () => {
    setShowUploadModal(false);
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
  };

  // Patient Email edit state (for authorized administrators/supervisors to correct typos)
  const [clientEmail, setClientEmail] = useState(ticket.patient_email || "");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailSaveMessage, setEmailSaveMessage] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const handleSaveEmail = async () => {
    setIsSavingEmail(true);
    try {
      await api.updateTicketContact(ticket.id, {
        patient_email: clientEmail.trim() || undefined,
      });
      setIsEditingEmail(false);
      setEmailSaveMessage({ msg: "Patient email updated successfully.", type: "success" });
      setTimeout(() => setEmailSaveMessage(null), 3500);
      if (onTicketUpdated) {
        onTicketUpdated();
      }
    } catch (e: any) {
      setEmailSaveMessage({ msg: e.message || "Failed to update email.", type: "error" });
    } finally {
      setIsSavingEmail(false);
    }
  };

  const canAcknowledge = ticket.status === "submitted" || ticket.status === "assigned";
  const canStartWork = ticket.status === "acknowledged";
  const canSubmitResolution = ticket.status === "in_progress" || ticket.status === "acknowledged";
  const canClose = (currentUser?.role === "admin" || currentUser?.role === "supervisor") && ticket.status !== "closed";
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "superadmin";

  const handleSendNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    onAddNote(ticket.id, newNote.trim(), isInternalNote);
    setNewNote("");
  };

  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resSummary.trim()) return;
    onSubmitResolution(ticket.id, {
      summary: resSummary,
      parts: resParts || undefined,
      test_notes: resNotes || undefined,
    });
    setShowResModal(false);
  };

  const handleFileUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    const isVideo = selectedFile.type.includes("video") || selectedFile.name.endsWith(".mp4") || selectedFile.name.endsWith(".webm") || selectedFile.name.endsWith(".mov") || selectedFile.name.endsWith(".3gp") || evidenceMediaType === "video";
    onUploadEvidence(ticket.id, uploadStage, selectedFile, isVideo ? "video" : "image");
    handleCloseUploadModal();
  };

  const beforeEvidence = ticket.evidences?.find((e) => e.stage === "before");
  const afterEvidence = ticket.evidences?.find((e) => e.stage === "after");
  const aiJob = ticket.latest_ai_verification;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-[#E5E9EF] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-[#E5E9EF] flex items-center justify-between bg-[#F7F8FA]">
          <div className="flex items-center gap-3">
            <span className="font-bold text-base text-[#176B63] tabular-nums">
              {ticket.ticket_number}
            </span>
            <span className="text-xs capitalize font-semibold px-2 py-0.5 rounded bg-white border border-[#E5E9EF] text-[#17212F]">
              {ticket.department_id}
            </span>
            <span className="text-xs capitalize font-bold px-2 py-0.5 rounded bg-[#FEF7EC] text-[#B7791F] border border-[#FAD7A0]">
              {ticket.priority} Priority
            </span>
            {ticket.is_escalated && (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#FDF2F2] text-[#C43D4B] border border-[#F8D7DA] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                <span>Escalated</span>
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#667085] hover:text-[#17212F] hover:bg-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action Workflow Ribbon */}
        <div className="px-6 py-2.5 bg-white border-b border-[#E5E9EF] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[#667085] font-medium">Workflow Status:</span>
            <span className="font-bold text-[#17212F] capitalize px-2 py-0.5 rounded bg-[#F1F4F9]">
              {ticket.status.replace("_", " ")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {canAcknowledge && (
              <button
                disabled={isActionPending}
                onClick={async () => {
                  setIsActionPending(true);
                  try {
                    await onAcknowledge(ticket.id);
                  } finally {
                    setIsActionPending(false);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-[#176B63] text-white font-semibold hover:bg-[#10574F] transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isActionPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Acknowledging...</span>
                  </>
                ) : (
                  <span>Acknowledge Receipt</span>
                )}
              </button>
            )}

            {canStartWork && (
              <button
                disabled={isActionPending}
                onClick={async () => {
                  setIsActionPending(true);
                  try {
                    await onStartWork(ticket.id);
                  } finally {
                    setIsActionPending(false);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-[#3868C9] text-white font-semibold hover:bg-[#2A52A3] transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isActionPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <span>Start Work</span>
                )}
              </button>
            )}

            {canSubmitResolution && (
              <button
                onClick={() => setShowResModal(true)}
                className="px-3 py-1.5 rounded-lg bg-[#16805D] text-white font-semibold hover:bg-[#116348] transition-all shadow-sm"
              >
                Submit Resolution
              </button>
            )}

            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3 py-1.5 rounded-lg border border-[#E5E9EF] text-[#17212F] hover:bg-[#F7F8FA] font-medium flex items-center gap-1.5"
            >
              <Upload className="h-3.5 w-3.5 text-[#176B63]" />
              <span>Attach Evidence</span>
            </button>

            {canClose && (
              <button
                onClick={() => onCloseTicket(ticket.id, "Supervisor verified and approved.")}
                className="px-3 py-1.5 rounded-lg bg-[#17212F] text-white font-semibold hover:bg-black transition-all"
              >
                Approve & Close
              </button>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="px-6 border-b border-[#E5E9EF] flex gap-6 text-xs font-semibold text-[#667085]">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-2.5 border-b-2 transition-all ${
              activeTab === "overview"
                ? "border-[#176B63] text-[#176B63]"
                : "border-transparent hover:text-[#17212F]"
            }`}
          >
            Overview & Context
          </button>
          <button
            onClick={() => setActiveTab("evidence")}
            className={`py-2.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "evidence"
                ? "border-[#176B63] text-[#176B63]"
                : "border-transparent hover:text-[#17212F]"
            }`}
          >
            <span>Evidence & AI Report</span>
            {aiJob && (
              <span className="text-[10px] bg-[#E8F3F1] text-[#176B63] px-1 rounded-full">
                1
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={`py-2.5 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "notes"
                ? "border-[#176B63] text-[#176B63]"
                : "border-transparent hover:text-[#17212F]"
            }`}
          >
            <span>Communication & Notes</span>
            <span className="text-[10px] bg-[#F1F4F9] text-[#17212F] px-1 rounded-full">
              {ticket.notes?.length || 0}
            </span>
          </button>
        </div>

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Title & Description */}
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-[#17212F]">{ticket.title}</h2>
                <p className="text-xs text-[#667085] leading-relaxed bg-[#F7F8FA] p-3.5 rounded-xl border border-[#E5E9EF]">
                  {ticket.description}
                </p>
                {(ticket.voice_transcription || ticket.voice_recording_url) && (
                  <div className="p-3.5 bg-[#F0FDF4] rounded-xl border border-[#BBF7D0] text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#16805D] flex items-center gap-1.5">
                        <Volume2 className="h-4 w-4" />
                        <span>Patient Bedside Voice Note</span>
                      </span>
                      <span className="text-[11px] text-[#64748B] font-medium">Recorded at Room</span>
                    </div>
                    {ticket.voice_transcription && (
                      <p className="text-[#17212F] italic bg-white/70 p-2.5 rounded-lg border border-[#DCFCE7]">
                        "{ticket.voice_transcription}"
                      </p>
                    )}
                    {ticket.voice_recording_url && (
                      <div className="pt-1">
                        <audio
                          controls
                          src={getFileUrl(ticket.voice_recording_url)}
                          className="w-full h-8 max-w-md"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Location & Personnel Meta Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-white p-4 rounded-xl border border-[#E5E9EF] space-y-2.5">
                  <h4 className="font-bold text-[#17212F] uppercase tracking-wider text-[11px] text-[#667085]">
                    Location & Service Context
                  </h4>
                  <div className="flex justify-between py-1 border-b border-[#F1F4F9]">
                    <span className="text-[#667085]">Room Number:</span>
                    <span className="font-semibold text-[#17212F]">{ticket.room_number}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#F1F4F9]">
                    <span className="text-[#667085]">Category / Appliance:</span>
                    <span className="font-semibold text-[#17212F]">{ticket.category}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#F1F4F9]">
                    <span className="text-[#667085]">Patient Phone:</span>
                    <span className="font-medium text-[#17212F]">
                      {ticket.patient_contact || "Not provided"}
                    </span>
                  </div>
                  <div className="py-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[#667085]">Client Email:</span>
                      {!isEditingEmail ? (
                        <div className="flex items-center gap-1.5 max-w-[200px]">
                          <span className={`font-medium text-[#17212F] truncate ${!clientEmail && !ticket.patient_email ? "text-[#94A3B8] italic" : ""}`}>
                            {clientEmail || ticket.patient_email || "Not registered"}
                          </span>
                          {(isAdmin || currentUser?.role === "supervisor") && (
                            <button
                              onClick={() => setIsEditingEmail(true)}
                              className="text-[#176B63] hover:text-[#10574F] p-0.5 rounded cursor-pointer"
                              title="Edit patient email"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                    {isEditingEmail && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <input
                          type="email"
                          value={clientEmail}
                          onChange={(e) => setClientEmail(e.target.value)}
                          placeholder="client@gmail.com"
                          className="flex-1 px-2 py-1 text-xs border border-[#176B63] rounded bg-white focus:outline-none"
                        />
                        <button
                          onClick={handleSaveEmail}
                          disabled={isSavingEmail}
                          className="px-2 py-1 bg-[#176B63] text-white rounded text-[11px] font-bold hover:bg-[#10574F] disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                        >
                          {isSavingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => {
                            setClientEmail(ticket.patient_email || "");
                            setIsEditingEmail(false);
                          }}
                          className="px-2 py-1 border border-[#E5E9EF] rounded text-[11px] hover:bg-gray-100 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {emailSaveMessage && (
                      <p className={`text-[10px] mt-1 ${emailSaveMessage.type === "success" ? "text-[#16805D]" : "text-[#DC2626]"}`}>
                        {emailSaveMessage.msg}
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#E5E9EF] space-y-2.5">
                  <h4 className="font-bold text-[#17212F] uppercase tracking-wider text-[11px] text-[#667085]">
                    Assignment & Operational SLA
                  </h4>
                  <div className="flex justify-between py-1 border-b border-[#F1F4F9]">
                    <span className="text-[#667085]">Assigned Staff:</span>
                    <span className="font-semibold text-[#176B63]">
                      {currentTicket.assigned_staff_name || "Awaiting Assignment"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#F1F4F9]">
                    <span className="text-[#667085]">Duty Supervisor:</span>
                    <span className="font-semibold text-[#17212F]">
                      {currentTicket.assigned_supervisor_name || "Operations Lead"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[#667085]">Resolution Target:</span>
                    <span className="font-semibold text-[#17212F] tabular-nums text-right">
                      {currentTicket.sla_resolution_deadline ? (
                        (() => {
                          const parsed = parseUtcDate(currentTicket.sla_resolution_deadline);
                          if (!parsed) return "N/A";
                          const targetClock = formatTime(parsed);
                          if (currentTicket.status === "closed") {
                            return <span className="text-[#16805D]">{targetClock} (Resolved)</span>;
                          }
                          const diffMins = Math.round((parsed.getTime() - Date.now()) / 60000);
                          const durationText = formatDurationHoursMinutes(diffMins);
                          if (diffMins < 0) {
                            return (
                              <span className="text-[#991B1B] font-bold">
                                {targetClock} ({durationText} Overdue)
                              </span>
                            );
                          }
                          return (
                            <span>
                              {targetClock} ({durationText} left)
                            </span>
                          );
                        })()
                      ) : (
                        "N/A"
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Supervisor Staff Assignment & Work Queue Control (Master Prompt Section 5) */}
              {(currentUser?.role === "supervisor" ||
                currentUser?.role === "admin" ||
                currentUser?.role === "superadmin") && (
                <div className="bg-white p-4.5 rounded-2xl border-2 border-[#176B63]/30 shadow-sm space-y-4">
                  {/* Header with Status Pill */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-[#E8F3F1] text-[#176B63] shadow-2xs">
                        <UserCheck className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-[#17212F] text-sm">
                          Supervisor Operations &amp; Dispatch Control
                        </h4>
                        <p className="text-[11px] text-[#667085]">
                          Assign department staff or re-route if patient selected wrong service
                        </p>
                      </div>
                    </div>
                    {currentTicket.assigned_staff_name ? (
                      <span className="self-start sm:self-auto text-[11px] font-bold px-3 py-1 rounded-full bg-[#EDF7F2] text-[#16805D] border border-[#A6E1CE] shadow-2xs">
                        Assigned: {currentTicket.assigned_staff_name}
                      </span>
                    ) : (
                      <span className="self-start sm:self-auto text-[11px] font-bold px-3 py-1 rounded-full bg-[#FEF3F2] text-[#DC2626] border border-[#FCA5A5] animate-pulse shadow-2xs">
                        Awaiting Assignment
                      </span>
                    )}
                  </div>

                  {/* Mode Selector Tabs (Menu as Two) */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/80 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setAssignmentMode("assign")}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                        assignmentMode === "assign"
                          ? "bg-white text-[#176B63] shadow-xs border border-slate-200/80 font-black"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Users className="h-3.5 w-3.5 text-[#176B63]" />
                      <span>1. Assign {currentTicket.department_id.toUpperCase()} Team</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignmentMode("transfer")}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                        assignmentMode === "transfer"
                          ? "bg-white text-amber-700 shadow-xs border border-amber-200/80 font-black"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 text-amber-600" />
                      <span>2. Re-Route Department (Mistake)</span>
                    </button>
                  </div>

                  {/* Alerts */}
                  {assignError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                      <span>{assignError}</span>
                    </div>
                  )}

                  {assignSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{assignSuccess}</span>
                    </div>
                  )}

                  {transferError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                      <span>{transferError}</span>
                    </div>
                  )}

                  {transferSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{transferSuccess}</span>
                    </div>
                  )}

                  {/* TAB 1: ASSIGN DEPARTMENT STAFF & SUPERVISORS */}
                  {assignmentMode === "assign" && (
                    <form onSubmit={handleAssignSubmit} className="space-y-3.5 text-xs">
                      {(() => {
                        const deptSupervisors = deptStaff.filter((s: any) => s.is_supervisor || s.role === "supervisor");
                        const deptTechnicians = deptStaff.filter((s: any) => !s.is_supervisor && s.role !== "supervisor");

                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-slate-800 font-bold flex items-center gap-1.5">
                                  <span>Select {currentTicket.department_id.toUpperCase()} Member *</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                  {deptStaff.length} active members
                                </span>
                              </div>
                              <select
                                value={selectedStaffId}
                                onChange={(e) =>
                                  setSelectedStaffId(e.target.value ? Number(e.target.value) : "")
                                }
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#176B63] shadow-2xs"
                              >
                                <option value="">
                                  -- Choose {currentTicket.department_id} Staff or Lead --
                                </option>
                                {deptSupervisors.length > 0 && (
                                  <optgroup label="👔 Department Supervisors &amp; Leads">
                                    {deptSupervisors.map((s: any) => (
                                      <option key={s.id} value={s.id}>
                                        👔 {s.name} ({s.designation || "Supervisor"})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {deptTechnicians.length > 0 && (
                                  <optgroup label="👷 Field Specialists &amp; Technicians">
                                    {deptTechnicians.map((s: any) => (
                                      <option key={s.id} value={s.id}>
                                        👷 {s.name} ({s.designation || s.role})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-slate-800 font-bold mb-1.5">
                                Assignment Instruction Note (Optional)
                              </label>
                              <input
                                type="text"
                                value={assignNote}
                                onChange={(e) => setAssignNote(e.target.value)}
                                placeholder="e.g. Please bring testing meter & inspect Suite 501..."
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#176B63] shadow-2xs"
                              />
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          disabled={isAssigning || !selectedStaffId}
                          className="px-4 py-2.5 rounded-xl bg-[#176B63] hover:bg-[#10574F] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-sm"
                        >
                          {isAssigning ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Dispatching Task...</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>
                                {currentTicket.assigned_staff_id ? "Confirm Reassignment" : "Confirm Task Assignment"}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* TAB 2: RE-ROUTE DEPARTMENT (CLIENT MISTAKE) */}
                  {assignmentMode === "transfer" && (
                    <form onSubmit={handleTransferSubmit} className="space-y-3.5 text-xs bg-amber-50/70 p-4 rounded-xl border border-amber-200">
                      <div className="flex items-start gap-2.5 text-amber-900">
                        <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-extrabold text-xs block">
                            Patient Mistake / Re-Route Service Request
                          </span>
                          <span className="text-[11px] text-amber-800 leading-relaxed block mt-0.5">
                            Did the client log this problem under <strong>{currentTicket.department_id}</strong> by accident (e.g. food issue reported to maintenance)? Select the correct department below to transfer ticket immediately.
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-slate-800 font-bold mb-1.5">
                            Transfer To Correct Department *
                          </label>
                          <select
                            value={targetDeptId}
                            onChange={(e) => setTargetDeptId(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-amber-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                          >
                            <option value="">-- Choose Target Department --</option>
                            {allDepartments
                              .filter((d: any) => d.id !== currentTicket.department_id)
                              .map((dept: any) => (
                                <option key={dept.id} value={dept.id}>
                                  {dept.name} ({dept.code})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-800 font-bold mb-1.5">
                            Transfer Reason (Documenting Client Correction)
                          </label>
                          <input
                            type="text"
                            value={transferReason}
                            onChange={(e) => setTransferReason(e.target.value)}
                            placeholder="e.g. Patient called for extra linens, reported to Maintenance by mistake..."
                            className="w-full px-3 py-2.5 rounded-xl border border-amber-300 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          disabled={isTransferring || !targetDeptId}
                          className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-sm"
                        >
                          {isTransferring ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Transferring Department...</span>
                            </>
                          ) : (
                            <>
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                              <span>Confirm Department Transfer</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}



              {/* Resolution Report if submitted */}
              {ticket.resolution_summary && (
                <div className="p-4 rounded-xl bg-[#EDF7F2] border border-[#A6E1CE] space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-[#16805D]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Submitted Work Resolution Summary</span>
                  </div>
                  <p className="text-[#17212F]">{ticket.resolution_summary}</p>
                  {ticket.parts_replaced && (
                    <div className="text-[11px] text-[#667085]">
                      <strong>Parts Replaced:</strong> {ticket.parts_replaced}
                    </div>
                  )}
                  {ticket.functional_test_notes && (
                    <div className="text-[11px] text-[#667085]">
                      <strong>Functional Checks:</strong> {ticket.functional_test_notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "evidence" && (
            <div className="space-y-6">
              {/* Evidence side-by-side comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* BEFORE REPAIR */}
                <div className="bg-[#F7F8FA] border border-[#E5E9EF] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase tracking-wider text-[#667085]">
                      Before Repair
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#FEF7EC] text-[#B7791F]">
                      Baseline Fault
                    </span>
                  </div>
                  {beforeEvidence ? (
                    <div className="space-y-2">
                      <div className="h-44 rounded-lg bg-black/5 flex items-center justify-center overflow-hidden border border-[#E5E9EF] relative group">
                        {beforeEvidence.media_type === "video" || beforeEvidence.file_url.match(/\.(mp4|webm|mov)$/i) ? (
                          <video
                            src={getFileUrl(beforeEvidence.file_url)}
                            controls
                            playsInline
                            className="w-full h-full object-contain bg-black"
                          />
                        ) : (
                          <img
                            src={getFileUrl(beforeEvidence.file_url)}
                            alt="Before Repair"
                            loading="eager"
                            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (!target.dataset.fallbackCount) {
                                target.dataset.fallbackCount = "1";
                                const clean = beforeEvidence.file_url.startsWith("/") ? beforeEvidence.file_url : `/${beforeEvidence.file_url}`;
                                target.src = `${window.location.origin}${clean}`;
                              }
                            }}
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <p className="text-[#667085] truncate">{beforeEvidence.notes || "Baseline evidence captured."}</p>
                        <a
                          href={getFileUrl(beforeEvidence.file_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-bold text-[#176B63] hover:underline shrink-0 ml-2"
                          title="Open full size"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>View Full</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="h-44 border-2 border-dashed border-[#E5E9EF] rounded-lg flex flex-col items-center justify-center text-[#98A2B3] text-xs">
                      <span>No pre-repair media attached.</span>
                    </div>
                  )}
                </div>

                {/* AFTER REPAIR */}
                <div className="bg-[#F7F8FA] border border-[#E5E9EF] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase tracking-wider text-[#667085]">
                      After Repair
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#EDF7F2] text-[#16805D]">
                      Verification Proof
                    </span>
                  </div>
                  {afterEvidence ? (
                    <div className="space-y-2">
                      <div className="h-44 rounded-lg bg-black/5 flex items-center justify-center overflow-hidden border border-[#E5E9EF] relative group">
                        {afterEvidence.media_type === "video" || afterEvidence.file_url.match(/\.(mp4|webm|mov)$/i) ? (
                          <video
                            src={getFileUrl(afterEvidence.file_url)}
                            controls
                            playsInline
                            className="w-full h-full object-contain bg-black"
                          />
                        ) : (
                          <img
                            src={getFileUrl(afterEvidence.file_url)}
                            alt="After Repair"
                            loading="eager"
                            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (!target.dataset.fallbackCount) {
                                target.dataset.fallbackCount = "1";
                                const clean = afterEvidence.file_url.startsWith("/") ? afterEvidence.file_url : `/${afterEvidence.file_url}`;
                                target.src = `${window.location.origin}${clean}`;
                              }
                            }}
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <p className="text-[#667085] truncate">{afterEvidence.notes || "Post-repair verification media."}</p>
                        <a
                          href={getFileUrl(afterEvidence.file_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-bold text-[#176B63] hover:underline shrink-0 ml-2"
                          title="Open full size"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>View Full</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="h-44 border-2 border-dashed border-[#E5E9EF] rounded-lg flex flex-col items-center justify-center text-[#98A2B3] text-xs">
                      <span>Awaiting post-repair evidence from technician.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Verification Report Card */}
              {aiJob ? (
                <div className="p-5 rounded-xl border border-[#A7D7D1] bg-[#F4FAF9] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-[#176B63] text-white">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[#17212F]">
                          CareOps Vision AI Diagnostics Report
                        </h4>
                        <span className="text-[10px] text-[#667085]">
                          Model: {aiJob.model_version} • Evaluated via temporal frame analysis
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#176B63] text-white uppercase tracking-wider">
                        {aiJob.ai_recommendation.replace("_", " ")}
                      </span>
                      <div className="text-[10px] text-[#667085] mt-0.5 tabular-nums">
                        Confidence: {Math.round(aiJob.confidence_score * 100)}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-[#E5E9EF]">
                      <span className="text-[#667085] text-[10px] block">Equipment Match</span>
                      <strong className="text-[#17212F] capitalize">
                        {aiJob.equipment_match.replace("_", " ")}
                      </strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-[#E5E9EF]">
                      <span className="text-[#667085] text-[10px] block">Fault Status</span>
                      <strong className="text-[#17212F] capitalize">
                        {aiJob.visible_fault_assessment.replace("_", " ")}
                      </strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-[#E5E9EF]">
                      <span className="text-[#667085] text-[10px] block">Motion / Flow</span>
                      <strong className="text-[#17212F] capitalize">
                        {aiJob.after_repair_functional_evidence.replace("_", " ")}
                      </strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-[#E5E9EF]">
                      <span className="text-[#667085] text-[10px] block">Review Policy</span>
                      <strong className="text-[#17212F] capitalize">
                        {aiJob.review_requirement.replace("_", " ")}
                      </strong>
                    </div>
                  </div>

                  <p className="text-xs text-[#17212F] leading-relaxed bg-white p-3 rounded-lg border border-[#E5E9EF]">
                    {aiJob.analysis_notes}
                  </p>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-[#667085] bg-[#F7F8FA] rounded-xl border border-[#E5E9EF]">
                  <span>AI analysis runs automatically when both pre- and post-repair evidence are submitted.</span>
                </div>
              )}
            </div>
          )}

          {activeTab === "notes" && (
            <div className="space-y-4">
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {ticket.notes && ticket.notes.length > 0 ? (
                  ticket.notes.map((note) => (
                    <div
                      key={note.id}
                      className={`p-3 rounded-xl border text-xs space-y-1 ${
                        note.is_internal
                          ? "bg-[#FEF7EC] border-[#FAD7A0]"
                          : "bg-[#F7F8FA] border-[#E5E9EF]"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-[#17212F] flex items-center gap-1.5">
                          {note.is_internal ? (
                            <Lock className="h-3 w-3 text-[#B7791F]" />
                          ) : (
                            <Globe className="h-3 w-3 text-[#176B63]" />
                          )}
                          <span>{note.author_name}</span>
                          <span className="font-normal text-[#667085]">
                            ({note.is_internal ? "Internal Staff Note" : "Patient-Visible Update"})
                          </span>
                        </span>
                        <span className="text-[#98A2B3] tabular-nums font-medium">
                          {formatTime(note.created_at)}
                        </span>
                      </div>
                      <p className="text-[#17212F]">{note.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[#667085] text-center py-4">No notes recorded yet.</p>
                )}
              </div>

              {/* Add Note Form */}
              <form onSubmit={handleSendNote} className="pt-3 border-t border-[#E5E9EF] space-y-2">
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="note_privacy"
                      checked={isInternalNote}
                      onChange={() => setIsInternalNote(true)}
                    />
                    <span className="font-semibold text-[#B7791F]">Internal Only (Private)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="note_privacy"
                      checked={!isInternalNote}
                      onChange={() => setIsInternalNote(false)}
                    />
                    <span className="font-semibold text-[#176B63]">Patient Visible (Public)</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={
                      isInternalNote
                        ? "Log technical note, parts status, internal handoff..."
                        : "Send reassuring progress update visible to patient..."
                    }
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-[#E5E9EF] text-xs text-[#17212F] focus:outline-none focus:border-[#176B63]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-[#176B63] hover:bg-[#10574F] text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Post</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Resolution Submission Modal */}
      {showResModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleResolveSubmit}
            className="bg-white rounded-xl max-w-md w-full p-6 border border-[#E5E9EF] shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b pb-3 border-[#E5E9EF]">
              <h3 className="font-bold text-sm text-[#17212F]">Submit Repair Resolution</h3>
              <button
                type="button"
                onClick={() => setShowResModal(false)}
                className="text-[#667085] hover:text-black"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-[#17212F]">Work Summary *</label>
              <textarea
                required
                rows={3}
                placeholder="Details of repair work completed..."
                value={resSummary}
                onChange={(e) => setResSummary(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-[#E5E9EF] focus:outline-none focus:border-[#176B63]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-[#17212F]">Parts Replaced (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 3.15uF Capacitor, Ball bearing"
                value={resParts}
                onChange={(e) => setResParts(e.target.value)}
                className="w-full p-2 rounded-lg border border-[#E5E9EF] focus:outline-none focus:border-[#176B63]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-[#17212F]">Functional Test Notes (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Tested at Step 5 for 10 minutes without heat buildup"
                value={resNotes}
                onChange={(e) => setResNotes(e.target.value)}
                className="w-full p-2 rounded-lg border border-[#E5E9EF] focus:outline-none focus:border-[#176B63]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResModal(false)}
                className="px-3 py-1.5 rounded-lg border border-[#E5E9EF] hover:bg-[#F7F8FA]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#16805D] text-white font-semibold hover:bg-[#116348]"
              >
                Submit Resolution
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upload Evidence Modal (with explicit Dedicated Video Option) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleFileUpload}
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 shadow-2xl space-y-4 text-xs animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Upload Verification Evidence</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Record or attach operational proof</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseUploadModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stage Selector */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 text-xs">Evidence Stage *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUploadStage("after")}
                  className={`p-2.5 rounded-xl border text-left font-bold transition cursor-pointer flex items-center gap-2 ${
                    uploadStage === "after"
                      ? "border-emerald-600 bg-emerald-50/80 text-emerald-950 ring-1 ring-emerald-600 shadow-2xs"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${uploadStage === "after" ? "bg-emerald-600" : "bg-slate-300"}`} />
                  <div>
                    <span className="block text-xs">After Repair</span>
                    <span className="block text-[10px] font-normal text-slate-500">Operational proof</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setUploadStage("before")}
                  className={`p-2.5 rounded-xl border text-left font-bold transition cursor-pointer flex items-center gap-2 ${
                    uploadStage === "before"
                      ? "border-amber-600 bg-amber-50/80 text-amber-950 ring-1 ring-amber-600 shadow-2xs"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${uploadStage === "before" ? "bg-amber-600" : "bg-slate-300"}`} />
                  <div>
                    <span className="block text-xs">Before Repair</span>
                    <span className="block text-[10px] font-normal text-slate-500">Baseline fault</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Media Type Switcher: VIDEO vs PHOTO */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 text-xs flex items-center justify-between">
                <span>Select Evidence Type *</span>
                <span className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide">
                  {evidenceMediaType === "video" ? "🎥 Video Mode Active" : "📸 Photo Mode Active"}
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setEvidenceMediaType("video");
                    handleSelectUploadFile(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-extrabold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    evidenceMediaType === "video"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Video className="h-4 w-4" />
                  <span>Upload Video</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEvidenceMediaType("photo");
                    handleSelectUploadFile(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-extrabold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    evidenceMediaType === "photo"
                      ? "bg-teal-700 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Camera className="h-4 w-4" />
                  <span>Upload Photo</span>
                </button>
              </div>
            </div>

            {/* DEDICATED VIDEO UPLOAD SECTION */}
            {evidenceMediaType === "video" && (
              <div className="space-y-2 p-3.5 rounded-xl bg-purple-50/70 border border-purple-200">
                <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                  <Film className="h-4 w-4 text-purple-700" />
                  <span>Operational Video Proof (Recommended for AI)</span>
                </div>
                <p className="text-[11px] text-purple-800/90 leading-tight">
                  Record a 5–15 sec video showing the equipment or fixture functioning normally (e.g. rotating fan blades, working light, water flow).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {/* Option 1: Record Video Camera */}
                  <label className="p-3 rounded-xl border-2 border-dashed border-purple-300 hover:border-purple-500 bg-white hover:bg-purple-50/50 flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition shadow-2xs group">
                    <Video className="h-5 w-5 text-purple-600 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-purple-950 text-xs">Record Live Video</span>
                    <span className="text-[10px] text-purple-600">Open mobile camera</span>
                    <input
                      type="file"
                      accept="video/*"
                      capture="environment"
                      onChange={(e) => handleSelectUploadFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>

                  {/* Option 2: Choose Video File */}
                  <label className="p-3 rounded-xl border-2 border-dashed border-purple-300 hover:border-purple-500 bg-white hover:bg-purple-50/50 flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition shadow-2xs group">
                    <FileVideo className="h-5 w-5 text-purple-600 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-purple-950 text-xs">Choose Video File</span>
                    <span className="text-[10px] text-purple-600">MP4, WebM, MOV, 3GP</span>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/3gpp,video/*"
                      onChange={(e) => handleSelectUploadFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* DEDICATED PHOTO UPLOAD SECTION */}
            {evidenceMediaType === "photo" && (
              <div className="space-y-2 p-3.5 rounded-xl bg-teal-50/70 border border-teal-200">
                <div className="flex items-center gap-2 text-teal-900 font-bold text-xs">
                  <ImageIcon className="h-4 w-4 text-teal-700" />
                  <span>High-Resolution Photo Proof</span>
                </div>
                <p className="text-[11px] text-teal-800/90 leading-tight">
                  Capture a clear still photo showing the repair work or initial fault.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {/* Option 1: Take Live Photo */}
                  <label className="p-3 rounded-xl border-2 border-dashed border-teal-300 hover:border-teal-500 bg-white hover:bg-teal-50/50 flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition shadow-2xs group">
                    <Camera className="h-5 w-5 text-teal-700 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-teal-950 text-xs">Take Live Photo</span>
                    <span className="text-[10px] text-teal-600">Open mobile camera</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleSelectUploadFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>

                  {/* Option 2: Choose Photo from Gallery */}
                  <label className="p-3 rounded-xl border-2 border-dashed border-teal-300 hover:border-teal-500 bg-white hover:bg-teal-50/50 flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition shadow-2xs group">
                    <Upload className="h-5 w-5 text-teal-700 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-teal-950 text-xs">Choose Photo</span>
                    <span className="text-[10px] text-teal-600">JPG, PNG, WebP</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/*"
                      onChange={(e) => handleSelectUploadFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* PREVIEW OF SELECTED FILE */}
            {selectedFile && filePreviewUrl && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="font-bold text-slate-900 truncate max-w-[200px]">
                      {selectedFile.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-500">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>

                {evidenceMediaType === "video" || selectedFile.type.includes("video") ? (
                  <video
                    src={filePreviewUrl}
                    controls
                    className="w-full max-h-36 rounded-lg bg-black object-contain"
                  />
                ) : (
                  <img
                    src={filePreviewUrl}
                    alt="Preview"
                    className="w-full max-h-36 rounded-lg object-contain bg-slate-100"
                  />
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSelectUploadFile(null)}
                    className="text-[11px] text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
                  >
                    Change / Remove File
                  </button>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCloseUploadModal}
                className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedFile}
                className={`px-5 py-2 rounded-xl text-white font-bold transition flex items-center gap-2 cursor-pointer shadow-sm ${
                  !selectedFile
                    ? "bg-slate-300 opacity-60 cursor-not-allowed"
                    : evidenceMediaType === "video"
                    ? "bg-purple-700 hover:bg-purple-800"
                    : "bg-[#176B63] hover:bg-[#10574F]"
                }`}
              >
                <Upload className="h-4 w-4" />
                <span>
                  {evidenceMediaType === "video" ? "Upload Video Evidence" : "Upload Photo Evidence"}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
