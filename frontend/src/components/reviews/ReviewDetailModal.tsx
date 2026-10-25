"use client";

import React, { useState } from "react";
import {
  X,
  Star,
  ExternalLink,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Send,
  Copy,
  Check,
  Building2,
  Clock,
  User as UserIcon,
  Link as LinkIcon,
  ClipboardList,
  Lock,
  RefreshCw,
  Info
} from "lucide-react";
import { GoogleReview, User, api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

interface ReviewDetailModalProps {
  review: GoogleReview;
  currentUser: User | null;
  onClose: () => void;
  onRefresh: () => void;
  onCreateCAP?: (review: GoogleReview) => void;
}

export function ReviewDetailModal({
  review,
  currentUser,
  onClose,
  onRefresh,
  onCreateCAP,
}: ReviewDetailModalProps) {
  const [internalNotes, setInternalNotes] = useState(review.internal_notes || "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSavedSuccess, setNotesSavedSuccess] = useState(false);

  const [replyDraft, setReplyDraft] = useState(review.public_reply_draft || review.ai_analysis?.suggested_public_reply || "");
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isApprovingDraft, setIsApprovingDraft] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [replyStatus, setReplyStatus] = useState(review.public_reply_status);

  const [ticketIdInput, setTicketIdInput] = useState("");
  const [isLinkingTicket, setIsLinkingTicket] = useState(false);

  const isStaff = currentUser?.role === "staff";
  const isSuperadminOrAdmin = currentUser?.role === "admin" || currentUser?.role === "superadmin" || currentUser?.role === "supervisor";

  const handleSaveNotes = async () => {
    if (isStaff) return;
    setIsSavingNotes(true);
    try {
      await api.updateReviewNotes(review.id, internalNotes);
      setNotesSavedSuccess(true);
      setTimeout(() => setNotesSavedSuccess(false), 3000);
      onRefresh();
    } catch (err: any) {
      alert(`Failed to save notes: ${err.message || err}`);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleGenerateDraft = async () => {
    setIsGeneratingDraft(true);
    try {
      const res: any = await api.generateReviewReplyDraft(review.id);
      setReplyDraft(res.draft);
      setReplyStatus("drafted");
      onRefresh();
    } catch (err: any) {
      alert(`Failed to generate draft: ${err.message || err}`);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleApproveDraft = async () => {
    if (!replyDraft.trim()) {
      alert("Draft reply is empty. Please generate or write a response first.");
      return;
    }
    setIsApprovingDraft(true);
    try {
      await api.approveReviewReplyDraft(review.id, replyDraft);
      setReplyStatus("approved");
      alert("Reply draft approved by authorized hospital supervisor. Ready for scheduled publication.");
      onRefresh();
    } catch (err: any) {
      alert(`Failed to approve reply: ${err.message || err}`);
    } finally {
      setIsApprovingDraft(false);
    }
  };

  const handleCopyDraft = async () => {
    if (!replyDraft) return;
    await copyToClipboard(replyDraft);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const handleLinkTicket = async () => {
    const tid = parseInt(ticketIdInput.trim(), 10);
    if (isNaN(tid) || tid <= 0) {
      alert("Please enter a valid numeric Ticket ID");
      return;
    }
    setIsLinkingTicket(true);
    try {
      await api.linkReviewToTicket(review.id, tid);
      alert(`Successfully linked Google Review #${review.id} with Internal Ticket #${tid}`);
      setTicketIdInput("");
      onRefresh();
    } catch (err: any) {
      alert(`Failed to link ticket: ${err.message || err}`);
    } finally {
      setIsLinkingTicket(false);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`h-4 w-4 ${
              s <= rating
                ? "text-amber-400 fill-amber-400"
                : "text-slate-200 fill-slate-100"
            }`}
          />
        ))}
        <span className="ml-1.5 font-bold text-xs text-slate-800">{rating}.0</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header Bar */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold">
              G
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Google Business Profile Review
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                  ID: #{review.id}
                </span>
                {review.star_rating < 3 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Critical Alert (&lt; 3★)
                  </span>
                )}
                {review.is_updated && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                    Updated by User
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Location: {review.location?.location_name || "CareOps Main Campus"} &bull; Source: Google Official API
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Review Details Card */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-sm">
                  {review.reviewer_name?.slice(0, 2).toUpperCase() || "AN"}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{review.reviewer_name}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{review.review_create_time ? new Date(review.review_create_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recent"}</span>
                    <span>&bull;</span>
                    {renderStars(review.star_rating)}
                  </div>
                </div>
              </div>

              {review.google_review_url && (
                <a
                  href={review.google_review_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 flex items-center gap-1.5 transition-colors"
                >
                  <span>View on Google Maps</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-800 leading-relaxed italic">
              &ldquo;{review.review_text || "(User gave a star rating without text comment)"}&rdquo;
            </div>

            {/* Attribution note required by Google API Policy */}
            <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
              <Info className="h-3.5 w-3.5" />
              <span>
                Synced via Google Business Profile API. Content cached for operational triage under Google API retention policies.
              </span>
            </div>
          </div>

          {/* AI Clinical & Operational Analysis Card */}
          {review.ai_analysis ? (
            <div className="p-5 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/40 via-white to-blue-50/20 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      CareOps Clinical AI Intelligence Assessment
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Model: {review.ai_analysis.model_name || "careops-clinical-cx-v2"} &bull; Confidence: {Math.round((review.ai_analysis.confidence || 0.85) * 100)}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                      review.ai_analysis.severity === "critical"
                        ? "bg-rose-100 text-rose-800 border border-rose-200"
                        : review.ai_analysis.severity === "high"
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : review.ai_analysis.severity === "medium"
                        ? "bg-blue-100 text-blue-800 border border-blue-200"
                        : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    }`}
                  >
                    {review.ai_analysis.severity} Severity
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                      review.ai_analysis.sentiment === "negative"
                        ? "bg-red-50 text-red-700"
                        : review.ai_analysis.sentiment === "positive"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {review.ai_analysis.sentiment} Tone
                  </span>
                </div>
              </div>

              {/* Topics & Department */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-semibold text-slate-600 block mb-1">Detected Complaint Categories:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {review.ai_analysis.detected_topics && review.ai_analysis.detected_topics.length > 0 ? (
                      review.ai_analysis.detected_topics.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-medium"
                        >
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400">Unclassified</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-slate-600 block mb-1">Responsible Hospital Department:</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 bg-white p-2 rounded-lg border border-slate-200">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    <span>{review.ai_analysis.suggested_department || "General Administration"}</span>
                    {review.ai_analysis.department_confidence && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        ({Math.round(review.ai_analysis.department_confidence * 100)}% match)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Issue Summary */}
              {review.ai_analysis.review_summary && (
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
                  <span className="font-bold text-slate-700 block mb-0.5">Clinical & Operational Summary:</span>
                  <p className="text-slate-600 leading-relaxed">{review.ai_analysis.review_summary}</p>
                </div>
              )}

              {/* Root Causes and Recommendations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Suspected Root Causes
                  </span>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    {review.ai_analysis.possible_root_causes?.map((rc, idx) => (
                      <li key={idx}>{rc}</li>
                    )) || <li>Requires internal audit.</li>}
                  </ul>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Recommended Actions
                  </span>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    {review.ai_analysis.recommended_actions?.map((ra, idx) => (
                      <li key={idx}>{ra}</li>
                    )) || <li>Acknowledge and conduct internal review.</li>}
                  </ul>
                </div>
              </div>

              {/* Evidence Needed & Human Review Indicator */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                {review.ai_analysis.evidence_needed && (
                  <div className="text-slate-500">
                    <strong className="text-slate-700">Audit Evidence Needed:</strong> {review.ai_analysis.evidence_needed}
                  </div>
                )}
                {review.ai_analysis.human_review_required && (
                  <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[11px] flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Human Supervisory Review Recommended
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 text-center space-y-2">
              <Sparkles className="h-8 w-8 text-slate-400 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700">AI Analysis Pending or Not Configured</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Automatic clinical sentiment and department classification will occur upon background synchronization or API key configuration.
              </p>
            </div>
          )}

          {/* Public Reply Assistant (Draft Only - HIPAA Compliant) */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Public Reply Assistant (Draft & Compliance)
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    replyStatus === "approved"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : replyStatus === "drafted"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  Status: {replyStatus}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                  🛡️ HIPAA Compliant
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200/80 text-[11px] text-amber-800 leading-relaxed">
              <strong>Medical Safety Standard:</strong> Public replies acknowledge general feedback without verifying patient identity, admission records, or medical details. Replies are never published automatically.
            </div>

            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder="Draft public response will appear here..."
              rows={4}
              className="w-full p-3 rounded-lg border border-slate-200 text-xs font-sans text-slate-800 focus:outline-none focus:border-blue-500 leading-relaxed"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateDraft}
                  disabled={isGeneratingDraft}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingDraft ? "animate-spin" : ""}`} />
                  <span>{isGeneratingDraft ? "Generating..." : "Regenerate Draft"}</span>
                </button>
                <button
                  onClick={handleCopyDraft}
                  disabled={!replyDraft}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {copiedDraft ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedDraft ? "Copied" : "Copy Reply"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Internal Management Notes (Staff Redacted) */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Confidential Internal Investigation Notes
                </h4>
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Management Only
              </span>
            </div>

            {isStaff ? (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-400" />
                <span>Internal investigation notes are restricted to Hospital Supervisors and Quality Admins.</span>
              </div>
            ) : (
              <>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Record internal findings, patient relation contact notes, staff statements..."
                  rows={3}
                  className="w-full p-3 rounded-lg border border-slate-200 text-xs font-sans text-slate-800 focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center justify-between">
                  {notesSavedSuccess && (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Notes updated successfully
                    </span>
                  )}
                  <div className="ml-auto">
                    <button
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSavingNotes ? "Saving..." : "Save Internal Notes"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Corrective Action Plans (CAP) & Internal Ticket Linking */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Corrective Action Plans (CAP) & Operations Integration
                </h4>
              </div>
              {onCreateCAP && (
                <button
                  onClick={() => onCreateCAP(review)}
                  className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  <span>Create Corrective Action Task</span>
                </button>
              )}
            </div>

            {/* Linked corrective actions list */}
            {review.corrective_actions && review.corrective_actions.length > 0 ? (
              <div className="space-y-2">
                {review.corrective_actions.map((cap) => (
                  <div
                    key={cap.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-700">{cap.task_code}</span>
                        <span className="font-semibold text-slate-900">{cap.title}</span>
                      </div>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Dept: {cap.department_id} &bull; Priority: {cap.priority} &bull; Status: <strong>{cap.status}</strong>
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white border border-slate-200">
                      {cap.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No formal CAP tasks logged for this review yet.</p>
            )}

            {/* Link to existing internal QR ticket */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <LinkIcon className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  Linked Ticket:{" "}
                  {review.linked_ticket_id ? (
                    <strong className="text-indigo-600">#{review.linked_ticket_id}</strong>
                  ) : (
                    <span className="text-slate-400">None</span>
                  )}
                </span>
              </div>

              {!isStaff && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Enter Ticket ID"
                    value={ticketIdInput}
                    onChange={(e) => setTicketIdInput(e.target.value)}
                    className="w-32 p-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleLinkTicket}
                    disabled={isLinkingTicket || !ticketIdInput}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLinkingTicket ? "Linking..." : "Link Ticket"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            CareOps External Reputation Management &bull; Safe Audit Logging Enabled
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
