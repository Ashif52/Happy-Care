"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  HeartHandshake,
  Smile,
  Meh,
  Frown,
  CheckCircle2,
  Sparkles,
  Star,
  Building2,
  ShieldCheck,
  Send,
  MessageSquare,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Phone,
  User,
  MapPin
} from "lucide-react";
import { api } from "@/lib/api";

export default function HospitalFeedbackPage() {
  const [emojiRating, setEmojiRating] = useState<"happy" | "okay" | "unhappy" | null>(null);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<string>("general");
  const [patientName, setPatientName] = useState<string>("");
  const [patientContact, setPatientContact] = useState<string>("");
  const [roomNumber, setRoomNumber] = useState<string>("");
  const [comment, setComment] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const departments = [
    { id: "general", label: "Hospital-Wide Experience" },
    { id: "medical", label: "Doctors & Clinical Care" },
    { id: "nursing", label: "Nursing & Ward Staff" },
    { id: "housekeeping", label: "Cleanliness & Sanitation" },
    { id: "maintenance", label: "Room Facilities & AC / Lights" },
    { id: "food_beverage", label: "Food & Canteen Services" },
    { id: "billing", label: "Billing, Pharmacy & Discharge" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emojiRating) {
      setErrorMessage("Please select your overall satisfaction (Happy, Okay, or Needs Attention).");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await api.submitNPSFeedback({
        emoji_rating: emojiRating,
        nps_score: npsScore !== null ? npsScore : undefined,
        department_id: departmentId !== "general" ? departmentId : undefined,
        room_number: roomNumber.trim() || undefined,
        patient_name: patientName.trim() || undefined,
        patient_contact: patientContact.trim() || undefined,
        source: "Hospital Master Feedback QR",
        feedback_comment: comment.trim() || undefined,
      });
      setIsSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 via-[#F7F9FB] to-slate-100 text-slate-800 flex flex-col selection:bg-[#176B63] selection:text-white font-sans overflow-x-hidden">
      {/* Top Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 px-4 py-3.5 shadow-xs shrink-0">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#176B63] to-[#125852] flex items-center justify-center text-white shadow-xs">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-black tracking-tight text-slate-900 flex items-center gap-1.5">
                <span>Happy Care</span>
                <span className="text-[10px] text-[#16805D] bg-[#EDF7F2] px-2 py-0.5 rounded-full font-bold border border-[#A6E1CE]">
                  Hospital Feedback
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Metropolitan General Hospital</p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
            <ShieldCheck className="h-3.5 w-3.5 text-[#176B63]" />
            <span>Official Survey</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl w-full mx-auto px-4 py-6 sm:py-8 flex-1">
        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/80 shadow-xl shadow-slate-200/50 space-y-6">
            {/* Headline */}
            <div className="text-center space-y-1.5 pt-1">
              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#176B63] bg-[#EDF7F2] px-3 py-1 rounded-full border border-[#A6E1CE]">
                <Sparkles className="h-3 w-3" />
                <span>Patient &amp; Visitor Experience</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                How Was Your Hospital Visit Today?
              </h1>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Your direct ratings help our medical and care teams deliver compassionate, world-class healthcare.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold text-center animate-in fade-in">
                {errorMessage}
              </div>
            )}

            {/* STEP 1: 3-Emoji Overall Satisfaction */}
            <div className="space-y-2.5">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider block text-center">
                1. Overall Care Satisfaction *
              </label>
              <div className="grid grid-cols-3 gap-3">
                {/* Happy */}
                <button
                  type="button"
                  onClick={() => setEmojiRating("happy")}
                  className={`p-3.5 sm:p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    emojiRating === "happy"
                      ? "border-[#16805D] bg-[#EDF7F2] shadow-md shadow-[#16805D]/20 scale-[1.03]"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 text-slate-700"
                  }`}
                >
                  <Smile className={`h-8 w-8 sm:h-9 sm:w-9 transition-transform ${emojiRating === "happy" ? "text-[#16805D] scale-110" : "text-emerald-500"}`} />
                  <span className={`text-xs font-black ${emojiRating === "happy" ? "text-[#16805D]" : "text-slate-700"}`}>
                    Happy
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Exceptional</span>
                </button>

                {/* Okay */}
                <button
                  type="button"
                  onClick={() => setEmojiRating("okay")}
                  className={`p-3.5 sm:p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    emojiRating === "okay"
                      ? "border-amber-500 bg-amber-50 shadow-md shadow-amber-500/20 scale-[1.03]"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 text-slate-700"
                  }`}
                >
                  <Meh className={`h-8 w-8 sm:h-9 sm:w-9 transition-transform ${emojiRating === "okay" ? "text-amber-600 scale-110" : "text-amber-500"}`} />
                  <span className={`text-xs font-black ${emojiRating === "okay" ? "text-amber-700" : "text-slate-700"}`}>
                    Okay
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Average</span>
                </button>

                {/* Unhappy */}
                <button
                  type="button"
                  onClick={() => setEmojiRating("unhappy")}
                  className={`p-3.5 sm:p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    emojiRating === "unhappy"
                      ? "border-rose-500 bg-rose-50 shadow-md shadow-rose-500/20 scale-[1.03]"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 text-slate-700"
                  }`}
                >
                  <Frown className={`h-8 w-8 sm:h-9 sm:w-9 transition-transform ${emojiRating === "unhappy" ? "text-rose-600 scale-110" : "text-rose-500"}`} />
                  <span className={`text-xs font-black ${emojiRating === "unhappy" ? "text-rose-700" : "text-slate-700"}`}>
                    Unhappy
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Needs Attention</span>
                </button>
              </div>
            </div>

            {/* STEP 2: Optional 0-10 Net Promoter Score */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  2. Likelihood to Recommend (0 to 10 NPS)
                </label>
                <span className="text-[10px] font-bold text-slate-400">Optional</span>
              </div>
              <p className="text-[11px] text-slate-500">
                0 = Not at all likely &bull; 10 = Extremely likely
              </p>
              <div className="grid grid-cols-11 gap-1 pt-1">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                  const isSelected = npsScore === num;
                  const isDetractor = num <= 6;
                  const isPassive = num === 7 || num === 8;
                  const isPromoter = num >= 9;

                  let activeClass = "bg-[#176B63] text-white border-[#176B63]";
                  if (isSelected) {
                    if (isDetractor) activeClass = "bg-rose-600 text-white border-rose-600 shadow-sm";
                    else if (isPassive) activeClass = "bg-amber-500 text-white border-amber-500 shadow-sm";
                    else activeClass = "bg-emerald-600 text-white border-emerald-600 shadow-sm";
                  }

                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setNpsScore(num)}
                      className={`h-9 sm:h-10 rounded-xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center ${
                        isSelected
                          ? `${activeClass} scale-110 font-black z-10`
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] font-bold text-slate-400 px-0.5">
                <span>0 (Detractor)</span>
                <span>7-8 (Passive)</span>
                <span className="text-emerald-700">9-10 (Promoter)</span>
              </div>
            </div>

            {/* STEP 3: Department / Area Selection */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#176B63]" />
                <span>3. Specific Service or Department to Rate</span>
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#176B63] text-xs font-bold text-slate-800"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* STEP 4: Optional Contact & Room Details */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 block">
                4. Your Details (Optional &bull; Kept Confidential)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Your Name (Optional)"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="w-full p-2.5 pl-8 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#176B63] text-xs"
                  />
                  <User className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="Mobile / WhatsApp (Optional)"
                    value={patientContact}
                    onChange={(e) => setPatientContact(e.target.value)}
                    className="w-full p-2.5 pl-8 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#176B63] text-xs"
                  />
                  <Phone className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-3" />
                </div>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Room / Bed or OPD Counter (e.g. Ward 3, Bed 12 or OPD-2)"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  className="w-full p-2.5 pl-8 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#176B63] text-xs"
                />
                <MapPin className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>

            {/* STEP 5: Feedback Comments */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-[#176B63]" />
                <span>5. Detailed Comments or Suggestions</span>
              </label>
              <textarea
                rows={3}
                placeholder="What went exceptionally well, or where can our hospital improve? (Optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#176B63] text-xs leading-relaxed"
              />
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#176B63] to-[#11544D] hover:from-[#135A53] hover:to-[#0D443E] text-white font-black text-sm shadow-lg shadow-[#176B63]/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{isSubmitting ? "Submitting Your Feedback..." : "Submit Hospital Feedback"}</span>
            </button>
          </form>
        ) : (
          /* Thank You / Confirmation Screen */
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl text-center space-y-6 animate-in zoom-in-95 duration-200">
            <div className="h-16 w-16 rounded-full bg-[#EDF7F2] text-[#16805D] flex items-center justify-center mx-auto border-4 border-white shadow-md">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-black text-[#16805D] uppercase tracking-wider bg-[#EDF7F2] px-3 py-1 rounded-full border border-[#A6E1CE]">
                Feedback Successfully Recorded
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Thank You for Your Feedback!
              </h2>
              <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                Your ratings help Metropolitan General Hospital maintain high standards of patient care and hospital excellence.
              </p>
            </div>

            {/* Google Review Prompt for Positive Ratings */}
            {emojiRating === "happy" || (npsScore !== null && npsScore >= 9) ? (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 space-y-3">
                <div className="flex items-center justify-center gap-1 text-amber-500">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-900">Loved Your Care Experience?</h3>
                  <p className="text-xs text-slate-600">
                    Would you mind sharing your 5-star experience on Google? It takes 15 seconds and helps other families find compassionate care.
                  </p>
                </div>
                <a
                  href="https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  <span>Share on Google Reviews</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : null}

            {/* If Unhappy: Priority Follow-Up Confirmation */}
            {emojiRating === "unhappy" || (npsScore !== null && npsScore <= 6) ? (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-left space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                  <ShieldCheck className="h-4 w-4 text-rose-600" />
                  <span>Hospital Patient Advocacy Alerted</span>
                </div>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  We sincerely apologize that your experience fell short of hospital standards. Your comments have been prioritized to the Medical Superintendent and Patient Advocacy team for review.
                </p>
              </div>
            ) : null}

            {/* Back CTA */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsSubmitted(false);
                  setEmojiRating(null);
                  setNpsScore(null);
                  setComment("");
                }}
                className="text-xs font-bold text-[#176B63] hover:underline cursor-pointer"
              >
                Submit another response &rarr;
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-slate-400 text-[11px] border-t border-slate-200 bg-white mt-auto shrink-0">
        <p>&copy; 2026 Metropolitan General Hospital &bull; Happy Care Patient Experience System</p>
      </footer>
    </div>
  );
}
