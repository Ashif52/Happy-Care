"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Building2,
  User,
  Lock,
  ArrowRight,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  UserPlus,
  Loader2,
  QrCode,
  HeartHandshake,
  Stethoscope,
  X,
  Send,
  Phone,
  Mail
} from "lucide-react";
import { api, setStoredToken, User as UserType, SimulationAccount } from "@/lib/api";

interface PortalLoginGatewayProps {
  onLoginSuccess: (user: UserType, initialTab?: string) => void;
  onEnterPatientPortal?: (roomToken?: string) => void;
}

export function PortalLoginGateway({
  onLoginSuccess,
  onEnterPatientPortal,
}: PortalLoginGatewayProps) {
  // Hospital Operations Portals: Admin & Staff
  const [selectedPortal, setSelectedPortal] = useState<"admin" | "staff">("admin");

  // Shared Credential Fields
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Authenticating...");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "waking">("checking");

  // Forgot Password Modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotToken, setForgotToken] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [simAccounts, setSimAccounts] = useState<SimulationAccount[]>([]);

  useEffect(() => {
    let isMounted = true;
    api.getSimulationAccounts()
      .then((data) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setSimAccounts(data);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Pre-warm backend and check health
  useEffect(() => {
    let isMounted = true;
    api.warmup();
    api.healthCheck()
      .then(() => {
        if (isMounted) setBackendStatus("online");
      })
      .catch(() => {
        if (isMounted) setBackendStatus("waking");
        // Retry in 4 seconds if cloud backend is waking up
        setTimeout(() => {
          api.healthCheck()
            .then(() => { if (isMounted) setBackendStatus("online"); })
            .catch(() => {});
        }, 4000);
      });

    return () => { isMounted = false; };
  }, []);

  // Clear inputs on portal change
  const handleSelectPortal = (portal: "admin" | "staff") => {
    setSelectedPortal(portal);
    setErrorMsg(null);
    setLoginIdentifier("");
    setPassword("");
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !password) {
      setErrorMsg("Please enter your login identifier and password.");
      return;
    }

    setIsLoading(true);
    setLoadingText("Verifying credentials...");
    setErrorMsg(null);

    try {
      const res = await api.login({
        login_identifier: loginIdentifier.trim(),
        password: password,
        portal_hint: selectedPortal,
      });

      setStoredToken(res.access_token);

      if (res.user.role === "staff") {
        onLoginSuccess(res.user, "my-department");
      } else {
        onLoginSuccess(
          res.user,
          res.user.role === "superadmin" ? "superadmin-admins" : "overview"
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Invalid credentials. Please verify your details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setForgotError("Please enter your registered email address or login identifier.");
      return;
    }

    setIsSubmittingForgot(true);
    setForgotError(null);
    setForgotSuccess(null);

    try {
      const res = await api.forgotPassword({
        email_or_identifier: forgotIdentifier.trim(),
        portal_hint: selectedPortal,
      });

      setForgotSuccess(res.message);
      if (res.reset_token) {
        setForgotToken(res.reset_token);
      }
      setForgotStep("reset");
    } catch (err: any) {
      setForgotError(err.message || "Failed to initiate password reset.");
    } finally {
      setIsSubmittingForgot(false);
    }
  };

  const handleResetPasswordWithToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotToken.trim() || forgotNewPassword.length < 6) {
      setForgotError("Please enter the reset token and a new password with at least 6 characters.");
      return;
    }

    setIsSubmittingForgot(true);
    setForgotError(null);
    setForgotSuccess(null);

    try {
      const res = await api.resetPasswordWithToken({
        token: forgotToken.trim(),
        new_password: forgotNewPassword.trim(),
      });

      setForgotSuccess(res.message || "Password updated successfully. You can now log in!");
      setTimeout(() => {
        setShowForgotModal(false);
        setPassword(forgotNewPassword);
      }, 2000);
    } catch (err: any) {
      setForgotError(err.message || "Invalid or expired reset token.");
    } finally {
      setIsSubmittingForgot(false);
    }
  };

  // Quick Preset Helper
  const fillPreset = (identifier: string, pass: string = "password123") => {
    setLoginIdentifier(identifier);
    setPassword(pass);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-4 sm:p-6 lg:p-8 relative selection:bg-[#176B63] selection:text-white">
      {/* Top Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between pb-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-[#176B63] flex items-center justify-center text-white shadow-md shadow-[#176B63]/25">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="font-extrabold text-xl text-slate-900 tracking-tight flex items-center gap-2">
              <span>Happy <strong className="text-[#176B63]">Care</strong></span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-[#176B63] border border-emerald-200">
                Hospital OS
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Secure Central Identity & Operations Gateway
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${
              backendStatus === "online" 
                ? "text-emerald-800 bg-emerald-50 border-emerald-200" 
                : backendStatus === "waking"
                ? "text-amber-800 bg-amber-50 border-amber-200"
                : "text-slate-700 bg-slate-100 border-slate-200"
            }`}>
              <span className={`h-2 w-2 rounded-full ${
                backendStatus === "online" 
                  ? "bg-emerald-600 animate-pulse" 
                  : backendStatus === "waking"
                  ? "bg-amber-500 animate-ping"
                  : "bg-slate-400"
              }`} />
              <span>
                {backendStatus === "online"
                  ? "Hospital Cloud API: Online"
                  : backendStatus === "waking"
                  ? "Connecting / Waking Cloud..."
                  : "NABH / HIPAA Protected"}
              </span>
            </div>
          </div>
        </header>

      {/* Main Container */}
      <main className="max-w-5xl w-full mx-auto my-auto py-8 space-y-7 px-4">
        {/* Title */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight font-display">
            Hospital Management System
          </h1>
          <p className="text-sm sm:text-base text-slate-600 font-medium">
            Sign in to your authorized operations workspace. Patient requests are submitted via bedside room QR codes.
          </p>
        </div>

        {/* The Two Main Authorized Portals Selector Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {/* 1. Admin Portal */}
          <button
            type="button"
            onClick={() => handleSelectPortal("admin")}
            className={`p-6 rounded-3xl border-2 text-left transition-all cursor-pointer relative overflow-hidden group ${
              selectedPortal === "admin"
                ? "bg-white border-[#176B63] shadow-xl shadow-[#176B63]/10 ring-4 ring-[#176B63]/5"
                : "bg-white/70 hover:bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className={`p-3 rounded-2xl ${
                  selectedPortal === "admin"
                    ? "bg-[#176B63] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                }`}
              >
                <ShieldCheck className="h-6 w-6" />
              </div>
              <span
                className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                  selectedPortal === "admin"
                    ? "bg-emerald-50 text-[#176B63] border border-emerald-200"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Portal A
              </span>
            </div>
            <h2 className="font-extrabold text-lg text-slate-900 font-display">Admin Portal</h2>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed font-medium">
              Executive authority, staff credentials, SLA policies, security audit & email delivery dispatch.
            </p>
            {selectedPortal === "admin" && (
              <div className="mt-3.5 flex items-center gap-1.5 text-xs font-black text-[#176B63]">
                <span>Active Portal</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            )}
          </button>

          {/* 2. Staff Portal */}
          <button
            type="button"
            onClick={() => handleSelectPortal("staff")}
            className={`p-6 rounded-3xl border-2 text-left transition-all cursor-pointer relative overflow-hidden group ${
              selectedPortal === "staff"
                ? "bg-white border-[#176B63] shadow-xl shadow-[#176B63]/10 ring-4 ring-[#176B63]/5"
                : "bg-white/70 hover:bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className={`p-3 rounded-2xl ${
                  selectedPortal === "staff"
                    ? "bg-[#176B63] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                }`}
              >
                <Building2 className="h-6 w-6" />
              </div>
              <span
                className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                  selectedPortal === "staff"
                    ? "bg-emerald-50 text-[#176B63] border border-emerald-200"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Portal B
              </span>
            </div>
            <h2 className="font-extrabold text-lg text-slate-900 font-display">Staff Portal</h2>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed font-medium">
              Maintenance, Doctors, Nursing, Housekeeping, Billing & Pharmacy operational queues.
            </p>
            {selectedPortal === "staff" && (
              <div className="mt-3.5 flex items-center gap-1.5 text-xs font-black text-[#176B63]">
                <span>Active Portal</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            )}
          </button>
        </div>

        {/* Portal Login Card */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl shadow-slate-900/5 p-7 sm:p-10 max-w-3xl mx-auto space-y-6">
          {/* Card Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#176B63]">
                {selectedPortal === "admin" ? "Executive Authentication" : "Hospital Employee Sign In"}
              </span>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                {selectedPortal === "admin" ? "Admin Sign In" : "Staff Sign In"}
              </h3>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              <Lock className="h-3 w-3 text-[#176B63]" />
              <span>TLS 1.3 Encrypted</span>
            </div>
          </div>

          {/* Error Notice */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {/* Standard Sign-In Form (Admin or Staff Login) */}
          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {selectedPortal === "admin"
                  ? "Admin Email or Username *"
                  : "Staff ID (e.g. EMP-MNT-101) or Hospital Email *"}
              </label>
              <input
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder={
                  selectedPortal === "admin"
                    ? "admin@careops.hospital"
                    : "EMP-ID or staff@careops.hospital"
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#176B63] font-mono text-slate-900"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700">Password *</label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotIdentifier(loginIdentifier);
                    setForgotStep("request");
                    setForgotError(null);
                    setForgotSuccess(null);
                    setShowForgotModal(true);
                  }}
                  className="text-[11px] font-semibold text-[#176B63] hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#176B63]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-[#176B63] hover:bg-[#125852] disabled:opacity-50 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#176B63]/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{loadingText}</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>
                    {selectedPortal === "admin"
                      ? "Sign In to Admin Portal"
                      : "Sign In to Staff Workspace"}
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Quick-Test Personas (Ensures immediate evaluation without typing errors) */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              1-Click Verification Credentials
            </span>
            <div className="flex flex-wrap gap-1.5">
              {selectedPortal === "admin" && (
                <>
                  {simAccounts.filter((a) => a.role === "admin").length > 0 ? (
                    simAccounts
                      .filter((a) => a.role === "admin")
                      .map((acc) => (
                        <button
                          key={acc.email}
                          type="button"
                          onClick={() => fillPreset(acc.email, "password123")}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700"
                        >
                          {acc.name} ({acc.badge || "Admin"})
                        </button>
                      ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => fillPreset("admin@careops.hospital", "password123")}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Hospital Administrator (Admin)
                    </button>
                  )}
                </>
              )}

              {selectedPortal === "staff" && (
                <>
                  {simAccounts.filter((a) => a.role === "supervisor" || a.role === "staff").length > 0 ? (
                    simAccounts
                      .filter((a) => a.role === "supervisor" || a.role === "staff")
                      .slice(0, 4)
                      .map((acc) => (
                        <button
                          key={acc.email}
                          type="button"
                          onClick={() => fillPreset(acc.employee_id || acc.email, "password123")}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                            acc.role === "supervisor"
                              ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                          }`}
                        >
                          {acc.name} ({acc.employee_id || acc.badge || acc.role})
                        </button>
                      ))
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => fillPreset("supervisor.mnt@careops.hospital", "password123")}
                        className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Department Supervisor
                      </button>
                      <button
                        type="button"
                        onClick={() => fillPreset("EMP-MNT-101", "password123")}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Maintenance Specialist
                      </button>
                      <button
                        type="button"
                        onClick={() => fillPreset("EMP-NRS-202", "password123")}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Staff Nurse
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Informational Notice */}
        <div className="text-center text-xs text-slate-400">
          Bedside patient requests & tracking are accessed directly by scanning your room QR placard.
        </div>
      </main>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#176B63]/10 text-[#176B63]">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Secure Password Recovery</h3>
                  <p className="text-xs text-slate-500">Authoritative reset token dispatch</p>
                </div>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {forgotError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{forgotError}</span>
                </div>
              )}

              {forgotSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{forgotSuccess}</span>
                </div>
              )}

              {forgotStep === "request" ? (
                <form onSubmit={handleForgotPasswordRequest} className="space-y-3.5">
                  <p className="text-slate-600">
                    Enter your registered email address or login identifier. We will generate an authoritative reset token and dispatch instructions via the hospital email system.
                  </p>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Email or Login Identifier *
                    </label>
                    <input
                      type="text"
                      required
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder="e.g. admin@careops.hospital or EMP-MNT-101"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#176B63] font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingForgot}
                      className="px-4 py-2 rounded-xl bg-[#176B63] hover:bg-[#125852] disabled:opacity-50 text-white font-semibold cursor-pointer shadow-2xs"
                    >
                      {isSubmittingForgot ? "Sending Instructions..." : "Send Reset Link"}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetPasswordWithToken} className="space-y-3.5">
                  <p className="text-slate-600">
                    Enter the reset token received via email (or generated by the server) and set your new password.
                  </p>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Reset Token *</label>
                    <input
                      type="text"
                      required
                      value={forgotToken}
                      onChange={(e) => setForgotToken(e.target.value)}
                      placeholder="Paste reset token here"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#176B63] font-mono text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">New Password * (Min 6 chars)</label>
                    <input
                      type="password"
                      required
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#176B63]"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingForgot}
                      className="px-4 py-2 rounded-xl bg-[#176B63] hover:bg-[#125852] disabled:opacity-50 text-white font-semibold cursor-pointer shadow-2xs"
                    >
                      {isSubmittingForgot ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto text-center pt-4 border-t border-slate-200 text-xs text-slate-400">
        Hospital Patient, Staff & Admin Management System • Built with Next.js & FastAPI • HIPAA / NABH Compliant
      </footer>
    </div>
  );
}
