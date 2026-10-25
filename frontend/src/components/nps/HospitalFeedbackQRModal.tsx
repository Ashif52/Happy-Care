"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  QrCode,
  Printer,
  Copy,
  Check,
  Download,
  ExternalLink,
  X,
  Sparkles,
  HeartHandshake,
  ShieldCheck,
  Star,
  Building2,
  Smartphone
} from "lucide-react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { copyToClipboard } from "@/lib/clipboard";

interface HospitalFeedbackQRModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HospitalFeedbackQRModal({ isOpen, onClose }: HospitalFeedbackQRModalProps) {
  const [feedbackURL, setFeedbackURL] = useState("http://localhost:3000/feedback");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setFeedbackURL(`${window.location.origin}/feedback`);
    }
  }, []);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    await copyToClipboard(feedbackURL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPNG = () => {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const pngUrl = canvas.toDataURL("image/png");
    const downloadLink = document.createElement("a");
    downloadLink.href = pngUrl;
    downloadLink.download = `Hospital-Master-Feedback-QR.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col my-8">
        {/* Modal Top Bar */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#176B63] rounded-lg text-white">
              <QrCode className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-black tracking-tight">Hospital Master Feedback QR</h3>
              <p className="text-[10px] text-slate-400">Universal Patient &amp; Visitor Experience QR</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* PRINTABLE PLACARD CONTAINER */}
        <div id="printable-feedback-placard" className="p-6 sm:p-8 flex flex-col items-center text-center space-y-4 bg-gradient-to-b from-white via-[#F8FAFC] to-white">
          {/* Hospital Crest Header */}
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EDF7F2] border border-[#A6E1CE] text-[#16805D] text-[10px] font-black uppercase tracking-wider">
              <HeartHandshake className="h-3 w-3" />
              <span>Metropolitan General Hospital &bull; Happy Care</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight pt-1">
              How Was Your Hospital Stay?
            </h2>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed font-medium">
              Scan with your smartphone camera to share your care ratings, compliments, and suggestions.
            </p>
          </div>

          {/* Star Rating Graphic */}
          <div className="flex items-center justify-center gap-1.5 text-amber-400 py-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
            ))}
            <span className="text-xs font-black text-slate-700 ml-1">Rate Your Care</span>
          </div>

          {/* THE REAL SCANNABLE QR CODE */}
          <div className="p-4 bg-white rounded-3xl border-2 border-[#176B63] shadow-xl flex flex-col items-center justify-center relative group">
            <QRCodeSVG
              value={feedbackURL}
              size={210}
              level="H"
              includeMargin={true}
            />
            {/* Hidden canvas for high-res PNG export */}
            <div ref={canvasRef} className="hidden">
              <QRCodeCanvas
                value={feedbackURL}
                size={600}
                level="H"
                includeMargin={true}
              />
            </div>
          </div>

          {/* Placard Explanatory Subtext */}
          <div className="space-y-1.5 max-w-sm">
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800">
              <Smartphone className="h-3.5 w-3.5 text-[#176B63]" />
              <span>Point your phone camera &bull; No app download required</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Every review directly alerts our Patient Experience team. Positive reviews help families discover compassionate healthcare.
            </p>
          </div>

          {/* Placard Distinction Note */}
          <div className="w-full p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-[11px] text-[#0F5147] font-semibold flex items-center justify-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-[#16805D] shrink-0" />
            <span>Master Feedback Standee (Distinct from Bedside Complaint QRs)</span>
          </div>

          {/* Target URL Reference */}
          <div className="w-full p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-left text-xs font-mono flex items-center justify-between text-slate-700">
            <span className="truncate max-w-[280px] text-[11px] font-bold text-slate-600">
              {feedbackURL}
            </span>
            <button
              onClick={handleCopyLink}
              className="px-2 py-1 rounded-md bg-white border border-slate-300 text-[10px] font-bold text-slate-700 hover:text-[#176B63] flex items-center gap-1 cursor-pointer"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <a
            href={feedbackURL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-[#176B63] hover:underline flex items-center gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Preview Form</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPNG}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Download className="h-3.5 w-3.5 text-[#176B63]" />
              <span>Download PNG</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-[#176B63] hover:bg-[#125852] text-white text-xs font-black flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Placard Poster</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
