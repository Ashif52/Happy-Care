"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  Camera,
  Film,
  Video,
  FileQuestion,
  HelpCircle,
  Sliders,
  Key,
  Check,
  Loader2,
  RefreshCw,
  ExternalLink
} from "lucide-react";
import { AIVerificationJob, User, getFileUrl, api } from "@/lib/api";

interface AIVerificationCenterProps {
  queue: AIVerificationJob[];
  currentUser: User | null;
  onReviewSubmit: (jobId: number, decision: string, notes?: string, overrideReason?: string) => void;
  onSelectTicket: (ticketId: number) => void;
  onRefreshQueue?: () => void;
}

export function AIVerificationCenter({
  queue,
  currentUser,
  onReviewSubmit,
  onSelectTicket,
  onRefreshQueue,
}: AIVerificationCenterProps) {
  const [selectedJob, setSelectedJob] = useState<AIVerificationJob | null>(queue[0] || null);
  const [reviewDecision, setReviewDecision] = useState<string>("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverridePrompt, setShowOverridePrompt] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<string>("");

  // AI Connection & Configuration Modal State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>("gemini");
  const [activeModel, setActiveModel] = useState<string>("gemini-2.0-flash");
  const [supportedProviders, setSupportedProviders] = useState<any[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>("");

  // Live Analysis Trigger State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string>("");

  // Keep selectedJob synced if queue updates
  useEffect(() => {
    if (selectedJob) {
      const match = queue.find((q) => q.id === selectedJob.id);
      if (match) setSelectedJob(match);
    } else if (queue.length > 0) {
      setSelectedJob(queue[0]);
    }
  }, [queue]);

  // Load configured AI models on mount
  useEffect(() => {
    loadAIModels();
  }, []);

  const loadAIModels = async () => {
    try {
      const res = await api.getAIModels();
      if (res && res.supported_providers) {
        setSupportedProviders(res.supported_providers);
        setActiveProvider(res.active_provider || "gemini");
        setActiveModel(res.active_model || "gemini-2.0-flash");
      }
    } catch (err) {
      console.warn("Could not load AI models catalog:", err);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingKey(true);
    setTestResult(null);
    try {
      const res = await api.testAIConnection({
        provider: activeProvider,
        model_name: activeModel,
        api_key: apiKeyInput.trim() || undefined,
      });
      setTestResult({
        success: res.success,
        message: res.message || (res.success ? "Connection verified!" : "Failed to connect."),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Failed to reach AI provider API.",
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleSaveAIConfig = async () => {
    setIsSavingConfig(true);
    setSaveSuccessMsg("");
    try {
      await api.configureAIModel(activeProvider, activeModel, apiKeyInput.trim() || undefined);
      setSaveSuccessMsg(`AI Model set to ${activeProvider.toUpperCase()} (${activeModel})!`);
      setApiKeyInput("");
      await loadAIModels();
      setTimeout(() => {
        setShowConfigModal(false);
        setSaveSuccessMsg("");
        setTestResult(null);
      }, 1200);
    } catch (err: any) {
      alert("Error configuring AI model: " + (err.message || err));
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTriggerAnalysis = async () => {
    if (!selectedJob) return;
    setIsAnalyzing(true);
    setAnalysisError("");
    try {
      const res = await api.triggerAIAnalysis(selectedJob.ticket_id);
      if (res && res.id) {
        setSelectedJob(res);
      }
      if (onRefreshQueue) {
        onRefreshQueue();
      }
    } catch (err: any) {
      setAnalysisError(err.message || "Failed to analyze evidence with AI.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDecisionClick = (decision: string) => {
    if (!selectedJob) return;

    // Check if this decision is an override of the AI recommendation
    const isOverride =
      (decision === "approved" && selectedJob.ai_recommendation !== "likely_resolved") ||
      (decision === "rejected" && selectedJob.ai_recommendation === "likely_resolved");

    if (isOverride) {
      setPendingDecision(decision);
      setShowOverridePrompt(true);
    } else {
      onReviewSubmit(selectedJob.id, decision, reviewNotes);
      setReviewNotes("");
    }
  };

  const handleConfirmOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob || !overrideReason.trim()) return;
    onReviewSubmit(selectedJob.id, pendingDecision, reviewNotes, overrideReason.trim());
    setShowOverridePrompt(false);
    setOverrideReason("");
    setReviewNotes("");
  };

  const activeProviderObj = supportedProviders.find((p) => p.provider === activeProvider);
  const currentProviderObj = supportedProviders.find((p) => p.is_active);

  return (
    <div className="p-5 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#176B63] text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold text-[#17212F] tracking-tight">
              AI Verification Center
            </h1>
          </div>
          <p className="text-xs text-[#667085] mt-0.5">
            Multimodal video motion & before-and-after photo evidence verification for hospital engineering
          </p>
        </div>

        {/* AI Connection Status & Config Button */}
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => {
              setShowConfigModal(true);
              setTestResult(null);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#A7D7D1] bg-[#F4FAF9] hover:bg-[#E8F3F1] text-[#176B63] font-semibold transition-all shadow-xs"
            title="Configure Gemini or OpenAI vision & video models"
          >
            <Sliders className="h-3.5 w-3.5 text-[#176B63]" />
            <span>AI Model:</span>
            <span className="font-bold text-[#17212F] capitalize">
              {currentProviderObj?.label || activeProvider}
            </span>
            <span
              className={`h-2 w-2 rounded-full ${
                currentProviderObj?.is_key_configured ? "bg-[#16805D] animate-pulse" : "bg-[#B7791F]"
              }`}
              title={currentProviderObj?.is_key_configured ? "API Key Connected" : "Sandbox / Key Missing"}
            />
          </button>

          <span className="px-2.5 py-1.5 rounded-full bg-[#E8F3F1] text-[#176B63] font-semibold">
            {queue.length} Verification Jobs
          </span>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Verification Queue */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-[#E5E9EF] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between pb-3 border-b border-[#E5E9EF] mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">
              Awaiting Inspection
            </span>
            <span className="text-[11px] text-[#176B63] font-semibold">{queue.length} Active</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {queue.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#667085]">
                No jobs currently awaiting verification review.
              </div>
            ) : (
              queue.map((job) => {
                const isSelected = selectedJob?.id === job.id;
                const isResolved = job.ai_recommendation === "likely_resolved";
                const isInconclusive = job.ai_recommendation === "inconclusive";

                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-1.5 ${
                      isSelected
                        ? "border-[#176B63] bg-[#E8F3F1]/40 shadow-xs ring-1 ring-[#176B63]"
                        : "border-[#E5E9EF] bg-white hover:bg-[#F7F8FA]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#176B63] tabular-nums">
                        {job.ticket_number || `Ticket #${job.ticket_id}`}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          isResolved
                            ? "bg-[#EDF7F2] text-[#16805D]"
                            : isInconclusive
                            ? "bg-[#FEF7EC] text-[#B7791F]"
                            : "bg-[#FDF2F2] text-[#C43D4B]"
                        }`}
                      >
                        {job.ai_recommendation.replace("_", " ")}
                      </span>
                    </div>

                    <div className="font-semibold text-[#17212F] truncate">
                      {job.ticket_title || job.ticket_category || "Equipment Repair"}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#667085]">
                      <span>{job.room_number || "Room Location"}</span>
                      <span className="font-semibold tabular-nums">
                        {Math.round(job.confidence_score * 100)}% Confidence
                      </span>
                    </div>

                    {job.human_decision && (
                      <div className="pt-1 border-t border-[#E5E9EF] text-[10px] text-[#16805D] font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Sign-off: {job.human_decision.toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Evidence Comparison Workspace & AI Diagnostics */}
        <div className="lg:col-span-8 space-y-6">
          {selectedJob ? (
            <div className="space-y-6">
              {/* Evidence Side-by-Side Comparison Workspace */}
              <div className="bg-white rounded-xl border border-[#E5E9EF] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E9EF]">
                  <div>
                    <h3 className="text-sm font-bold text-[#17212F] flex items-center gap-2">
                      <span>Evidence Inspection: {selectedJob.ticket_number}</span>
                      <span className="text-xs font-normal text-[#667085]">
                        ({selectedJob.room_number})
                      </span>
                    </h3>
                    <p className="text-xs text-[#667085]">
                      Side-by-side pre-repair baseline vs post-repair functional verification video/photo
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Live AI Analyze Button */}
                    <button
                      onClick={handleTriggerAnalysis}
                      disabled={isAnalyzing}
                      className="px-3 py-1.5 rounded-lg bg-[#176B63] hover:bg-[#11534D] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-60"
                      title="Run multimodal AI analysis on video and photo evidence"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Analyzing Video...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Analyze with AI</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onSelectTicket(selectedJob.ticket_id)}
                      className="text-xs font-semibold text-[#176B63] hover:underline flex items-center gap-1 ml-1"
                    >
                      <span>Ticket Details</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {analysisError && (
                  <div className="p-3 bg-[#FDF2F2] rounded-lg border border-[#F5C2C7] text-xs text-[#C43D4B] flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{analysisError}</span>
                  </div>
                )}

                {/* 2-Column Comparison Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* LEFT: BEFORE REPAIR */}
                  <div className="bg-[#F7F8FA] rounded-xl border border-[#E5E9EF] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-[#667085]">
                        <Camera className="h-3.5 w-3.5 text-[#B7791F]" />
                        <span>Before Repair</span>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#FEF7EC] text-[#B7791F]">
                        Baseline Fault
                      </span>
                    </div>

                    <div className="h-60 bg-black rounded-lg flex items-center justify-center overflow-hidden border border-[#E5E9EF] relative">
                      {selectedJob.before_evidence?.media_type === "video" ||
                      selectedJob.before_evidence?.file_url?.match(/\.(mp4|webm|mov)$/i) ? (
                        <video
                          src={getFileUrl(selectedJob.before_evidence.file_url)}
                          controls
                          playsInline
                          className="w-full h-full object-contain bg-black"
                        />
                      ) : selectedJob.before_evidence?.file_url ? (
                        <img
                          src={getFileUrl(selectedJob.before_evidence.file_url)}
                          alt="Before"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.dataset.fallback && selectedJob.before_evidence?.file_url) {
                              target.dataset.fallback = "true";
                              target.src = selectedJob.before_evidence.file_url;
                            }
                          }}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">No baseline media attached</span>
                      )}
                    </div>

                    <div className="text-xs text-[#667085] space-y-1">
                      <div className="flex justify-between">
                        <span>Equipment Tag:</span>
                        <strong className="text-[#17212F]">
                          {selectedJob.before_evidence?.equipment_type || selectedJob.ticket_category || "Fixture"}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Reported Condition:</span>
                        <strong className="text-[#C43D4B]">Non-functional / Fault Present</strong>
                      </div>
                      {selectedJob.before_evidence?.file_url && (
                        <div className="pt-1 text-right">
                          <a
                            href={getFileUrl(selectedJob.before_evidence.file_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#176B63] hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>View Full Artifact</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: AFTER REPAIR */}
                  <div className="bg-[#F7F8FA] rounded-xl border border-[#E5E9EF] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-[#667085]">
                        <Video className="h-3.5 w-3.5 text-[#16805D]" />
                        <span>After Repair</span>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#EDF7F2] text-[#16805D]">
                        Verification Video / Photo
                      </span>
                    </div>

                    <div className="h-60 bg-black rounded-lg flex items-center justify-center overflow-hidden border border-[#E5E9EF] relative">
                      {selectedJob.after_evidence?.media_type === "video" ||
                      selectedJob.after_evidence?.file_url?.match(/\.(mp4|webm|mov)$/i) ? (
                        <video
                          src={getFileUrl(selectedJob.after_evidence.file_url)}
                          controls
                          playsInline
                          className="w-full h-full object-contain bg-black"
                        />
                      ) : selectedJob.after_evidence?.file_url ? (
                        <img
                          src={getFileUrl(selectedJob.after_evidence.file_url)}
                          alt="After"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.dataset.fallback && selectedJob.after_evidence?.file_url) {
                              target.dataset.fallback = "true";
                              target.src = selectedJob.after_evidence.file_url;
                            }
                          }}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Awaiting post-repair video</span>
                      )}
                    </div>

                    <div className="text-xs text-[#667085] space-y-1">
                      <div className="flex justify-between">
                        <span>Observed Dynamics:</span>
                        <strong className="text-[#16805D] capitalize">
                          {selectedJob.after_repair_functional_evidence.replace("_", " ")}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Media Resolution:</span>
                        <strong className="text-[#17212F] capitalize">
                          {selectedJob.media_quality.replace("_", " ")}
                        </strong>
                      </div>
                      {selectedJob.after_evidence?.file_url && (
                        <div className="pt-1 text-right">
                          <a
                            href={getFileUrl(selectedJob.after_evidence.file_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#176B63] hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>View Full Artifact</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Structured AI Analysis Card */}
              <div className="bg-[#F4FAF9] rounded-xl border border-[#A7D7D1] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[#176B63] text-white">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#17212F]">
                        Structured AI Diagnostic Evaluation
                      </h4>
                      <span className="text-[10px] text-[#667085]">
                        Model: {selectedJob.model_version || `${selectedJob.provider_selected}:${selectedJob.model_name_selected}`} • Clinical Operations Protocol
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        selectedJob.ai_recommendation === "likely_resolved"
                          ? "bg-[#176B63] text-white"
                          : selectedJob.ai_recommendation === "inconclusive"
                          ? "bg-[#B7791F] text-white"
                          : "bg-[#C43D4B] text-white"
                      }`}
                    >
                      {selectedJob.ai_recommendation.replace("_", " ")}
                    </span>
                    <div className="text-[10px] text-[#667085] mt-0.5 tabular-nums">
                      Confidence Score: {Math.round(selectedJob.confidence_score * 100)}%
                    </div>
                  </div>
                </div>

                {/* Structured 4-Metric Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-[#E5E9EF]">
                    <span className="text-[#667085] text-[10px] uppercase font-bold block mb-0.5">
                      Equipment Match
                    </span>
                    <strong className="text-[#17212F] capitalize">
                      {selectedJob.equipment_match.replace("_", " ")}
                    </strong>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#E5E9EF]">
                    <span className="text-[#667085] text-[10px] uppercase font-bold block mb-0.5">
                      Fault Cleared
                    </span>
                    <strong className="text-[#17212F] capitalize">
                      {selectedJob.visible_fault_assessment.replace("_", " ")}
                    </strong>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#E5E9EF]">
                    <span className="text-[#667085] text-[10px] uppercase font-bold block mb-0.5">
                      Operational Flow / Motion
                    </span>
                    <strong className="text-[#17212F] capitalize">
                      {selectedJob.after_repair_functional_evidence.replace("_", " ")}
                    </strong>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#E5E9EF]">
                    <span className="text-[#667085] text-[10px] uppercase font-bold block mb-0.5">
                      Policy Rule
                    </span>
                    <strong className="text-[#17212F] capitalize">
                      {selectedJob.review_requirement.replace("_", " ")}
                    </strong>
                  </div>
                </div>

                {/* Analysis Notes */}
                <div className="p-3 bg-white rounded-lg border border-[#E5E9EF] text-xs text-[#17212F] leading-relaxed">
                  <span className="font-bold text-[#176B63] block mb-1">AI Recommendation & Video Analysis Context:</span>
                  <p>{selectedJob.analysis_notes}</p>
                </div>
              </div>

              {/* Human Review & Supervisor Decision Controls */}
              <div className="bg-white rounded-xl border border-[#E5E9EF] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E5E9EF]">
                  <div>
                    <h4 className="text-xs font-bold text-[#17212F] flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-[#176B63]" />
                      <span>Authorized Supervisor Human Review</span>
                    </h4>
                    <span className="text-[11px] text-[#667085]">
                      Policy requires authorized personnel sign-off prior to official ticket closure
                    </span>
                  </div>
                  {selectedJob.human_decision && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#EDF7F2] text-[#16805D] border border-[#A6E1CE]">
                      Decision: {selectedJob.human_decision.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                {currentUser?.role === "staff" ? (
                  <div className="p-3 bg-[#EEF4FD] rounded-xl border border-[#BFDBFE] text-xs text-[#3868C9] flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-[#3868C9]" />
                    <span>
                      <strong>Supervisor Sign-Off Required:</strong> Field technicians can review automated diagnostics, but certifying ticket closure or overruling AI recommendations requires Shift Supervisor or Administrator authorization.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => handleDecisionClick("approved")}
                      className="px-4 py-2 rounded-lg bg-[#16805D] hover:bg-[#116348] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Approve & Certify Closure</span>
                    </button>

                    <button
                      onClick={() => handleDecisionClick("requested_new_evidence")}
                      className="px-4 py-2 rounded-lg bg-[#B7791F] hover:bg-[#8C5E14] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Request Clearer Evidence</span>
                    </button>

                    <button
                      onClick={() => handleDecisionClick("rejected")}
                      className="px-4 py-2 rounded-lg bg-[#C43D4B] hover:bg-[#9E2E3A] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Reject Repair Quality</span>
                    </button>

                    <button
                      onClick={() => handleDecisionClick("inconclusive")}
                      className="px-4 py-2 rounded-lg border border-[#E5E9EF] bg-[#F7F8FA] hover:bg-[#E5E9EF] text-[#17212F] text-xs font-medium flex items-center gap-1.5 transition-all"
                    >
                      <HelpCircle className="h-3.5 w-3.5 text-[#667085]" />
                      <span>Mark Inconclusive</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#E5E9EF] p-12 text-center text-xs text-[#667085]">
              Select a verification job from the queue to inspect evidence.
            </div>
          )}
        </div>
      </div>

      {/* AI Model & Key Connection Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-[#E5E9EF] shadow-2xl space-y-5 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E9EF]">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-[#E8F3F1] text-[#176B63]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#17212F]">
                    Connect AI for Video & Visual Verification
                  </h3>
                  <p className="text-[11px] text-[#667085]">
                    Select multimodal provider and configure your API key for video analysis
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-[#667085] hover:text-[#17212F] p-1 rounded-md text-base leading-none"
              >
                &times;
              </button>
            </div>

            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="font-semibold text-[#17212F] block">Select AI Vision & Video Provider:</label>
              <div className="grid grid-cols-2 gap-2">
                {supportedProviders.map((prov) => {
                  const isChosen = activeProvider === prov.provider;
                  return (
                    <button
                      key={prov.provider}
                      type="button"
                      onClick={() => {
                        setActiveProvider(prov.provider);
                        setActiveModel(prov.models[0]);
                        setTestResult(null);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isChosen
                          ? "border-[#176B63] bg-[#E8F3F1]/40 ring-1 ring-[#176B63]"
                          : "border-[#E5E9EF] bg-white hover:bg-[#F7F8FA]"
                      }`}
                    >
                      <div className="font-bold text-xs text-[#17212F] flex items-center justify-between">
                        <span>{prov.label}</span>
                        {prov.is_key_configured && (
                          <span className="h-2 w-2 rounded-full bg-[#16805D]" title="Key configured" />
                        )}
                      </div>
                      <span className="text-[10px] text-[#667085] line-clamp-2 mt-1 block">
                        {prov.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model Selection for chosen provider */}
            {activeProviderObj && activeProviderObj.models && (
              <div className="space-y-1.5">
                <label className="font-semibold text-[#17212F] block">AI Model:</label>
                <select
                  value={activeModel}
                  onChange={(e) => setActiveModel(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[#E5E9EF] bg-white text-xs text-[#17212F] focus:outline-none focus:border-[#176B63]"
                >
                  {activeProviderObj.models.map((m: string) => (
                    <option key={m} value={m}>
                      {m} {m === "gemini-2.0-flash" ? "(Recommended for fast video motion analysis)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* API Key Input */}
            {activeProvider !== "mock" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[#17212F]">
                    {activeProvider === "gemini" ? "Google Gemini API Key" : "OpenAI API Key"}:
                  </label>
                  {activeProviderObj?.is_key_configured && (
                    <span className="text-[10px] font-semibold text-[#16805D] flex items-center gap-1">
                      <Check className="h-3 w-3" /> Key Saved on Server
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    placeholder={
                      activeProviderObj?.is_key_configured
                        ? "•••••••••••••••••••••••• (Leave blank to keep existing)"
                        : activeProvider === "gemini"
                        ? "Enter your Google Gemini API Key (AIza...)"
                        : "Enter your OpenAI API Key (sk-...)"
                    }
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="w-full p-2.5 pr-10 rounded-lg border border-[#E5E9EF] focus:outline-none focus:border-[#176B63] font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-2.5 text-[#667085] hover:text-[#17212F]"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-[#667085]">
                  Get free Google Gemini API keys at{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#176B63] underline font-semibold"
                  >
                    Google AI Studio
                  </a>
                  . Keys are stored securely in backend system settings.
                </p>
              </div>
            )}

            {/* Connection Test Status Message */}
            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  testResult.success
                    ? "bg-[#EDF7F2] border-[#A6E1CE] text-[#16805D]"
                    : "bg-[#FDF2F2] border-[#F5C2C7] text-[#C43D4B]"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {saveSuccessMsg && (
              <div className="p-3 bg-[#EDF7F2] border border-[#A6E1CE] text-xs text-[#16805D] rounded-lg flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[#E5E9EF]">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingKey}
                className="px-3 py-1.5 rounded-lg border border-[#E5E9EF] hover:bg-[#F7F8FA] font-semibold text-[#17212F] flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {isTestingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                <span>Test Connection</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#E5E9EF] text-[#667085] hover:text-[#17212F]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveAIConfig}
                  disabled={isSavingConfig}
                  className="px-4 py-1.5 rounded-lg bg-[#176B63] hover:bg-[#11534D] text-white font-semibold transition-all disabled:opacity-50"
                >
                  {isSavingConfig ? "Saving..." : "Save & Set Default"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Override Rationale Modal */}
      {showOverridePrompt && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmOverride}
            className="bg-white rounded-xl max-w-md w-full p-6 border border-[#E5E9EF] shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-center gap-2 text-[#C43D4B] pb-2 border-b border-[#E5E9EF]">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-bold text-sm text-[#17212F]">
                Supervisor Override Rationale Required
              </h3>
            </div>
            <p className="text-[#667085] leading-relaxed">
              Your decision diverges from the AI verification assessment (
              <strong className="text-[#17212F] capitalize">
                {selectedJob?.ai_recommendation.replace("_", " ")}
              </strong>
              ). Hospital operational compliance requires an explicit documented rationale.
            </p>
            <div className="space-y-1">
              <label className="font-semibold text-[#17212F]">
                Documented Override Reason *
              </label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Conducted physical on-site inspection in Room 204. Verified fan rotating smoothly despite lighting glare in video..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-[#E5E9EF] focus:outline-none focus:border-[#176B63]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOverridePrompt(false)}
                className="px-3 py-1.5 rounded-lg border border-[#E5E9EF]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#17212F] text-white font-semibold hover:bg-black"
              >
                Confirm Override & Record in Audit
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
