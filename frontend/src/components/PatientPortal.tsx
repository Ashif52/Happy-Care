"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Wrench,
  Stethoscope,
  HeartPulse,
  Sparkles,
  Receipt,
  Pill,
  Mic,
  MicOff,
  Square,
  Play,
  RotateCcw,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ArrowRight,
  ShieldCheck,
  Building,
  Clock,
  Send,
  X,
  QrCode,
  AlertTriangle,
  Flame,
  Fan,
  Droplets,
  Utensils,
  HelpCircle,
  Phone,
  UserCheck,
  Lock,
  ExternalLink,
  RefreshCw,
  Pause,
  Trash2,
  Volume2,
  MessageSquare,
  ThumbsUp,
  Star,
  KeyRound,
  Mail,
  Video,
  Film,
  Image,
  Plus,
  Zap,
  Bed,
  Check,
  Copy,
  ChevronRight
} from "lucide-react";
import { api, formatTime } from "@/lib/api";
import { RoomQRPlacardModal } from "@/components/RoomQRPlacardModal";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

interface PatientPortalProps {
  onClose?: () => void;
  initialRoomToken?: string;
  allRooms?: any[];
  currentUser?: any;
}

interface RoomData {
  hospital_name?: string;
  room_number: string;
  floor: string;
  wing: string;
  token: string;
  is_active: boolean;
  departments?: any[];
}

export interface AttachmentItem {
  id: string;
  mediaType: "PHOTO" | "VIDEO";
  fileName: string;
  fileSizeBytes: number;
  dataBase64: string;
  previewUrl: string;
}

export function PatientPortal({ onClose, initialRoomToken, allRooms, currentUser }: PatientPortalProps) {
  const currentToken = initialRoomToken || "CARE-RM204-7X9Q";

  // State: QR Resolution & Validation
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isValidatingQR, setIsValidatingQR] = useState(true);
  const [qrError, setQrError] = useState<string | null>(null);

  // Flow Step: "categories" -> "form" -> "confirmation" (No guest or OTP screens; mobile is required on form)
  const [step, setStep] = useState<"categories" | "form" | "confirmation">("categories");

  // Helper functions for E.164 phone normalization and validation
  const normalizeE164 = (phone: string): string => {
    const cleaned = phone.replace(/[\s\-\(\)]/g, "");
    if (!cleaned) return "";
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.length === 10) return `+1${cleaned}`;
    return `+${cleaned}`;
  };

  const isValidPhone = (phone: string): boolean => {
    const cleaned = phone.replace(/[\s\-\(\)]/g, "");
    return /^\+?[1-9]\d{7,14}$/.test(cleaned);
  };

  const isValidEmail = (emailStr: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr.trim());
  };

  // Form Fields
  const [selectedDept, setSelectedDept] = useState<string>("maintenance");
  const [categoryName, setCategoryName] = useState<string>("Lighting / Electrical");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [patientContact, setPatientContact] = useState<string>(currentUser?.phone || "");
  const [patientEmail, setPatientEmail] = useState<string>(currentUser?.email || "");
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [showAttachmentChooser, setShowAttachmentChooser] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const takePhotoInputRef = useRef<HTMLInputElement>(null);
  const choosePhotoInputRef = useRef<HTMLInputElement>(null);
  const recordVideoInputRef = useRef<HTMLInputElement>(null);
  const chooseVideoInputRef = useRef<HTMLInputElement>(null);

  // Dedicated Patient Account State
  const [patientView, setPatientView] = useState<"lodge" | "my_tickets" | "profile">("lodge");
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [isLoadingMyTickets, setIsLoadingMyTickets] = useState(false);
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone || "");
  const [profileEmail, setProfileEmail] = useState(currentUser?.email || "");
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    if (currentUser?.phone) {
      setPatientContact(currentUser.phone);
      setProfilePhone(currentUser.phone);
    }
    if (currentUser?.email) {
      setPatientEmail(currentUser.email);
      setProfileEmail(currentUser.email);
    }
  }, [currentUser]);

  const fetchMyTickets = async () => {
    setIsLoadingMyTickets(true);
    try {
      const data: any = await api.getMyTickets();
      setMyTickets(data || []);
    } catch (err) {
      console.error("Failed to load patient tickets:", err);
    } finally {
      setIsLoadingMyTickets(false);
    }
  };

  useEffect(() => {
    if (patientView === "my_tickets" || currentUser) {
      fetchMyTickets();
    }
  }, [patientView, currentUser]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileSuccessMsg(null);
    try {
      await api.updatePatientProfile({
        phone: profilePhone.trim() || undefined,
        email: profileEmail.trim() || undefined,
      });
      setProfileSuccessMsg("Profile contact information updated successfully.");
    } catch (err: any) {
      alert(`Update failed: ${err.message || err}`);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const initialOffsetRef = useRef<number>(0);

  const formatAudioDuration = (totalSeconds: number) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "0:00";
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Submission & Tracking State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [submittedTicket, setSubmittedTicket] = useState<{
    id?: number;
    ticket_number: string;
    department: string;
    status: string;
    room_number: string;
    category?: string;
    created_at: string;
    friendly_status?: string;
    acknowledged_at?: string | null;
    in_progress_at?: string | null;
    work_started_at?: string | null;
    work_completed_at?: string | null;
    closed_at?: string | null;
    estimated_arrival_minutes?: number | null;
    tracking_url?: string;
    tracking_token?: string;
    resolution_summary?: string | null;
    assigned_staff_name?: string | null;
    assigned_staff_designation?: string | null;
    ready_for_feedback?: boolean;
    is_eligible_for_feedback?: boolean;
  } | null>(null);


  const [showQRModal, setShowQRModal] = useState(false);

  // 1. Resolve & Validate Room QR on Mount
  useEffect(() => {
    let isMounted = true;
    const validateQR = async () => {
      setIsValidatingQR(true);
      setQrError(null);
      try {
        const data = await api.getRoomByToken(currentToken);
        if (isMounted) {
          setRoomData(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setQrError(err.message || "Failed to resolve room from QR token.");
        }
      } finally {
        if (isMounted) {
          setIsValidatingQR(false);
        }
      }
    };

    validateQR();
    // Initialize idempotency key for this session
    setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

    return () => {
      isMounted = false;
    };
  }, [currentToken]);

  // 2. Real-Time Tracking for Submitted Ticket (SSE + Polling Fallback)
  useEffect(() => {
    if (!submittedTicket?.ticket_number) return;

    const ticketNum = submittedTicket.ticket_number;
    let sse: EventSource | null = null;

    const refreshTicketStatus = async () => {
      try {
        const live = await api.getPatientTicketStatus(ticketNum);
        setSubmittedTicket((prev) =>
          prev
            ? {
                ...prev,
                id: live.id || prev.id,
                status: live.status,
                friendly_status: live.friendly_status,
                acknowledged_at: live.acknowledged_at,
                in_progress_at: live.in_progress_at,
                work_started_at: live.work_started_at,
                work_completed_at: live.work_completed_at,
                closed_at: live.closed_at,
                estimated_arrival_minutes: live.estimated_arrival_minutes,
                resolution_summary: live.resolution_summary,
                assigned_staff_name: live.assigned_staff_name,
                assigned_staff_designation: live.assigned_staff_designation,
                ready_for_feedback: live.ready_for_feedback || live.is_eligible_for_feedback,
                is_eligible_for_feedback: live.is_eligible_for_feedback,
              }
            : null
        );
      } catch (_) {}
    };

    try {
      const sseUrl = api.getPatientStreamUrl(ticketNum);
      sse = new EventSource(sseUrl);

      sse.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.event === "ticket_updated") {
            refreshTicketStatus();
          }
        } catch (_) {}
      };

      sse.addEventListener("ticket_updated", () => {
        refreshTicketStatus();
      });
    } catch (_) {}

    const interval = setInterval(refreshTicketStatus, 4000);

    return () => {
      clearInterval(interval);
      if (sse) sse.close();
    };
  }, [submittedTicket?.ticket_number]);

  // Canonical / Dynamic Departments and their Permitted Request Categories
  const DEFAULT_DEPT_CATEGORIES: Record<string, string[]> = {
    maintenance: [
      "Electrical issue",
      "Plumbing issue",
      "Air conditioning",
      "Equipment repair",
      "General maintenance",
    ],
    nursing: [
      "Nursing assistance",
      "Bedside support",
      "Ward-related service request",
      "Other approved nursing request",
    ],
    medical: [
      "Nursing assistance",
      "Bedside support",
      "Ward-related service request",
      "Other approved nursing request",
    ],
    dietitian: [
      "Diet consultation",
      "Diet-plan query",
      "Food-related dietary concern",
    ],
    food_services: [
      "Meal not received",
      "Food quality concern",
      "Incorrect meal",
      "Other approved food-service request",
    ],
    housekeeping: [
      "Room cleaning",
      "Spill cleanup",
      "Trash disposal",
      "Linen change",
      "Disinfection",
    ],
    billing: [
      "Billing query",
      "Insurance claim inquiry",
      "Discharge billing estimate",
      "Receipt copy",
    ],
  };

  const getDeptVisuals = (deptId: string) => {
    const d = (deptId || "").toLowerCase();
    if (d.includes("maint") || d.includes("electr") || d.includes("engineer")) {
      return {
        icon: Wrench,
        iconBg: "bg-teal-600 text-white",
        accent: "AC, Lights, Plumbing, TV",
      };
    }
    if (d.includes("nurs") || d.includes("medic") || d.includes("clinic")) {
      return {
        icon: HeartPulse,
        iconBg: "bg-rose-500 text-white",
        accent: "IV Care, Vitals, Nurse Call",
      };
    }
    if (d.includes("house") || d.includes("clean") || d.includes("hygiene") || d.includes("sanit")) {
      return {
        icon: Sparkles,
        iconBg: "bg-amber-500 text-white",
        accent: "Room Sanitization, Spills",
      };
    }
    if (d.includes("food") || d.includes("diet") || d.includes("meal")) {
      return {
        icon: Utensils,
        iconBg: "bg-orange-500 text-white",
        accent: "Meals, Water, Special Diet",
      };
    }
    if (d.includes("bill") || d.includes("account") || d.includes("recep")) {
      return {
        icon: Receipt,
        iconBg: "bg-blue-600 text-white",
        accent: "Insurance, Claims, Receipts",
      };
    }
    if (d.includes("linen") || d.includes("bed")) {
      return {
        icon: Sparkles,
        iconBg: "bg-indigo-600 text-white",
        accent: "Fresh Sheets & Blankets",
      };
    }
    if (d.includes("it") || d.includes("tech") || d.includes("wifi")) {
      return {
        icon: Fan,
        iconBg: "bg-cyan-600 text-white",
        accent: "Wi-Fi, TV, Connectivity",
      };
    }
    return {
      icon: Building,
      iconBg: "bg-slate-700 text-white",
      accent: "Hospital Patient Care",
    };
  };

  const getCategoryVisuals = (catName: string) => {
    const c = (catName || "").toLowerCase();
    if (c.includes("electr") || c.includes("light") || c.includes("power") || c.includes("switch")) {
      return { icon: Zap, color: "from-amber-500 to-orange-500", sla: "⚡ ~12m" };
    }
    if (c.includes("plumb") || c.includes("water") || c.includes("leak") || c.includes("tap") || c.includes("sink") || c.includes("restroom")) {
      return { icon: Droplets, color: "from-blue-500 to-cyan-500", sla: "⚡ ~15m" };
    }
    if (c.includes("air") || c.includes("ac") || c.includes("fan") || c.includes("temp") || c.includes("heat") || c.includes("climate")) {
      return { icon: Fan, color: "from-teal-600 to-emerald-500", sla: "⚡ ~10m" };
    }
    if (c.includes("nurse") || c.includes("medic") || c.includes("vital") || c.includes("drip") || c.includes("iv")) {
      return { icon: HeartPulse, color: "from-rose-500 to-red-600", sla: "⚡ ~5m Urgent" };
    }
    if (c.includes("linen") || c.includes("bed") || c.includes("sheet") || c.includes("pillow") || c.includes("towel") || c.includes("gown")) {
      return { icon: Bed, color: "from-indigo-500 to-purple-600", sla: "⚡ ~10m" };
    }
    if (c.includes("clean") || c.includes("sanit") || c.includes("trash") || c.includes("waste") || c.includes("spill") || c.includes("mop")) {
      return { icon: Sparkles, color: "from-emerald-500 to-teal-600", sla: "⚡ ~8m" };
    }
    if (c.includes("food") || c.includes("meal") || c.includes("drink") || c.includes("diet")) {
      return { icon: Utensils, color: "from-orange-500 to-amber-600", sla: "⚡ ~15m" };
    }
    if (c.includes("wifi") || c.includes("tv") || c.includes("remote") || c.includes("tech") || c.includes("phone")) {
      return { icon: Wrench, color: "from-sky-500 to-blue-600", sla: "⚡ ~10m" };
    }
    return { icon: Wrench, color: "from-teal-600 to-slate-700", sla: "⚡ ~12m" };
  };

  const availableDepartments = useMemo(() => {
    if (roomData?.departments && roomData.departments.length > 0) {
      return roomData.departments.map((d: any) => ({
        id: d.id,
        name: d.name,
        code: d.code || d.id.toUpperCase(),
        description: d.description || `Hospital ${d.name} services`,
        categories:
          d.categories && d.categories.length > 0
            ? d.categories
            : DEFAULT_DEPT_CATEGORIES[d.id] || ["General Request"],
      }));
    }
    return [
      {
        id: "maintenance",
        name: "Maintenance",
        code: "MNT",
        description: "Electrical, plumbing, AC & equipment repair",
        categories: DEFAULT_DEPT_CATEGORIES.maintenance,
      },
      {
        id: "nursing",
        name: "Nursing",
        code: "NUR",
        description: "Bedside nursing assistance & clinical care support",
        categories: DEFAULT_DEPT_CATEGORIES.nursing,
      },
      {
        id: "dietitian",
        name: "Dietitian",
        code: "DIET",
        description: "Diet consultations, diet-plans & dietary restrictions",
        categories: DEFAULT_DEPT_CATEGORIES.dietitian,
      },
      {
        id: "food_services",
        name: "Food Services",
        code: "FOOD",
        description: "Patient meal delivery, food quality & meal timing",
        categories: DEFAULT_DEPT_CATEGORIES.food_services,
      },
      {
        id: "housekeeping",
        name: "Housekeeping",
        code: "HSK",
        description: "Room cleaning, spills, trash & sanitization",
        categories: DEFAULT_DEPT_CATEGORIES.housekeeping,
      },
      {
        id: "billing",
        name: "Billing",
        code: "BIL",
        description: "Patient hospital billing, insurance & receipts",
        categories: DEFAULT_DEPT_CATEGORIES.billing,
      },
    ];
  }, [roomData?.departments]);

  const [activeDeptId, setActiveDeptId] = useState<string>("maintenance");

  const handleSelectCategory = (deptId: string, category: string) => {
    setSelectedDept(deptId);
    setCategoryName(category);
    setTitle(`${category} Issue`);
    setStep("form");
  };

  // Clean up audio & recording timers on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Web Audio Recording with Accurate Hardware Clock Normalization
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Audio recording is not supported in this browser.");
        return;
      }

      // Reset prior audio states
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setIsPlaying(false);
      setPlaybackTime(0);
      setRecordedDuration(0);
      setRecordingSeconds(0);
      initialOffsetRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/aac")) {
          mimeType = "audio/aac";
        }
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        const elapsedMs = Date.now() - recordingStartTimeRef.current;
        const finalSecs = Math.max(1, Math.round(elapsedMs / 1000));
        setRecordedDuration(finalSecs);
        setRecordingSeconds(finalSecs);

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        const reader = new FileReader();
        reader.onloadend = () => {
          setAudioBase64(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);

        setTranscription(
          `Patient voice message recorded for care team (${formatAudioDuration(finalSecs)}).`
        );
      };

      mediaRecorder.start(250);
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingSeconds(elapsed);
        if (elapsed >= 120) {
          stopRecording();
        }
      }, 250);
    } catch (_) {
      alert("Microphone permission required to record audio.");
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
  };

  const resetRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioBase64(null);
    setTranscription("");
    setIsRecording(false);
    setRecordingSeconds(0);
    setRecordedDuration(0);
    setPlaybackTime(0);
    setIsPlaying(false);
    initialOffsetRef.current = 0;
  };

  // Custom Audio Playback Handlers (Immune to WebM Android hardware timestamp bug)
  const togglePlayback = () => {
    const audio = audioPlayerRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (playbackTime >= recordedDuration) {
        audio.currentTime = initialOffsetRef.current || 0;
        setPlaybackTime(0);
      }
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error("Playback error:", err));
    }
  };

  const handleAudioTimeUpdate = () => {
    const audio = audioPlayerRef.current;
    if (!audio) return;

    let curr = audio.currentTime;
    // Normalize Android WebM system uptime clock offset (e.g. 10800s / ~3 hours)
    if (curr > 3600) {
      if (!initialOffsetRef.current) {
        initialOffsetRef.current = curr;
      }
      curr = curr - initialOffsetRef.current;
    }

    curr = Math.max(0, Math.min(recordedDuration, Math.floor(curr)));
    setPlaybackTime(curr);
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setPlaybackTime(0);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = initialOffsetRef.current || 0;
    }
  };

  const handleSeek = (seconds: number) => {
    const target = Math.max(0, Math.min(recordedDuration, seconds));
    setPlaybackTime(target);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = (initialOffsetRef.current || 0) + target;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileAttachment = (e: React.ChangeEvent<HTMLInputElement>, mediaType: "PHOTO" | "VIDEO") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (attachments.length >= 3) {
      setAttachmentError("Maximum of 3 attachments allowed per request.");
      return;
    }

    const MAX_SIZE = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX_SIZE) {
      setAttachmentError(`File "${file.name}" exceeds the 25MB limit. Please choose a smaller file.`);
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const allowedPhotoExts = ["jpg", "jpeg", "png", "webp", "gif"];
    const allowedVideoExts = ["mp4", "webm", "mov", "m4v", "ogg"];
    const allowed =
      mediaType === "PHOTO"
        ? allowedPhotoExts.includes(ext) || file.type.startsWith("image/")
        : allowedVideoExts.includes(ext) || file.type.startsWith("video/");

    if (!allowed) {
      setAttachmentError(
        `Unsupported format for ${mediaType.toLowerCase()}. Allowed: ${
          mediaType === "PHOTO" ? "JPG, PNG, WebP, GIF" : "MP4, WebM, QuickTime (MOV)"
        }.`
      );
      return;
    }

    setAttachmentError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const newAtt: AttachmentItem = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        mediaType,
        fileName: file.name,
        fileSizeBytes: file.size,
        dataBase64: base64,
        previewUrl: base64,
      };
      setAttachments((prev) => [...prev, newAtt]);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Submit Complaint with Idempotency Protection
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Prevent double-clicks

    const trimmedContact = patientContact.trim();
    if (!trimmedContact) {
      alert("Mobile number is required for ticket tracking and WhatsApp status notifications.");
      return;
    }
    const normalizedPhone = normalizeE164(trimmedContact);
    if (!isValidPhone(normalizedPhone)) {
      alert("Please enter a valid mobile number (e.g. +1 555-0192 or +91 98450 11223).");
      return;
    }

    const trimmedEmail = patientEmail.trim();
    if (!trimmedEmail) {
      alert("Email address is required so we can send your Work Started and Work Finished confirmation receipts and live tracking link.");
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      alert("Please enter a valid email address (e.g. yourname@gmail.com).");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.submitPatientTicket({
        qr_token: currentToken,
        department_id: selectedDept,
        category: categoryName,
        title: title || `${categoryName} Request`,
        description: description || transcription || `Service request for ${categoryName}`,
        voice_recording_base64: audioBase64 || undefined,
        voice_transcription: transcription || undefined,
        patient_contact: normalizedPhone,
        photo_base64: attachments.find((a) => a.mediaType === "PHOTO")?.dataBase64 || photoBase64 || undefined,
        attachments: attachments.map((a) => ({
          media_type: a.mediaType,
          file_name: a.fileName,
          data_base64: a.dataBase64,
          file_size_bytes: a.fileSizeBytes,
        })),
        patient_email: trimmedEmail ? trimmedEmail.toLowerCase() : (currentUser?.email || undefined),
        idempotency_key: idempotencyKey,
      });

      setSubmittedTicket({
        id: res.id,
        ticket_number: res.ticket_number,
        department: res.department,
        status: res.status,
        room_number: res.room_number,
        category: categoryName,
        created_at: res.created_at,
        friendly_status: "Received & Queued",
        tracking_url: res.tracking_url,
        tracking_token: res.token,
      });
      setStep("confirmation");
    } catch (err: any) {
      alert(`Submission error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="w-full flex-1 bg-slate-50 flex flex-col justify-between relative">
      {/* Top Header Bar */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-[#12685E] to-[#1DAA9B] flex items-center justify-center text-white shadow-xs">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-900 flex items-center gap-2 leading-tight">
              <span>HappyCare Bedside</span>
              <span className="text-[10px] text-teal-800 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Inpatient Care
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
              <Building className="h-3 w-3 text-teal-600 shrink-0" />
              <span>
                {roomData ? `${roomData.room_number} • ${roomData.wing}` : "Bedside Assistant"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowQRModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200 text-xs font-bold transition-all cursor-pointer"
            title="View Real Scannable Room QR Placard"
          >
            <QrCode className="h-3.5 w-3.5 text-teal-700" />
            <span className="hidden sm:inline">QR Placard</span>
          </button>
          <a
            href="/"
            className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100/80 text-[#176B63] border border-teal-200/80 text-xs font-bold transition-all flex items-center gap-1"
            title="Switch to Staff & Administration Portal"
          >
            <span>Staff Portal</span>
          </a>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close patient portal"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Content Pane */}
      <main className="flex-1 p-5 overflow-y-auto space-y-5">

        {/* LOADING & QR ERROR STATES */}
        {isValidatingQR ? (
          <div className="py-20 text-center text-sm text-[#64748B] space-y-3">
            <div className="animate-spin h-8 w-8 border-3 border-[#176B63] border-t-transparent rounded-full mx-auto" />
            <p className="font-semibold text-xs">Validating Hospital Bedside QR Code...</p>
          </div>
        ) : qrError ? (
          <div className="p-6 rounded-3xl bg-white border-2 border-[#FCA5A5] text-center space-y-4 shadow-sm">
            <div className="h-12 w-12 rounded-full bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">Bedside QR Code Invalid or Revoked</h2>
              <p className="text-xs text-[#64748B] mt-1">{qrError}</p>
            </div>
            <div className="p-3 bg-[#F8FAFC] rounded-2xl border border-[#CBD5E1] text-[11px] text-[#475569]">
              Please inform your attending nurse or ward manager to generate an updated QR placard.
            </div>
          </div>
        ) : (
          <>
            {currentUser && (
              <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-[#176B63]/10 text-[#176B63] flex items-center justify-center font-bold text-xs">
                      {currentUser.name?.[0] || "P"}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{currentUser.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        ID: {currentUser.patient_id || "PAT-10001"} • Room {roomData?.room_number || currentUser.room_number || "204"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                    <button
                      type="button"
                      onClick={() => setPatientView("lodge")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        patientView === "lodge"
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      New Request
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPatientView("my_tickets");
                        fetchMyTickets();
                      }}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        patientView === "my_tickets"
                          ? "bg-white text-[#176B63] shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <span>My Requests</span>
                      {myTickets.length > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-[#176B63] text-white text-[10px] flex items-center justify-center font-mono">
                          {myTickets.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPatientView("profile")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        patientView === "profile"
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 1: MY TICKETS HISTORY */}
            {patientView === "my_tickets" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <h2 className="text-base font-black text-slate-900">My Service Requests</h2>
                  <button
                    onClick={fetchMyTickets}
                    disabled={isLoadingMyTickets}
                    className="text-xs font-semibold text-[#176B63] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingMyTickets ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {isLoadingMyTickets ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    <div className="animate-spin h-6 w-6 border-2 border-[#176B63] border-t-transparent rounded-full mx-auto mb-2" />
                    <span>Loading your requests...</span>
                  </div>
                ) : myTickets.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                    <h3 className="font-bold text-sm text-slate-800">No Active Service Requests</h3>
                    <p className="text-xs text-slate-500">
                      You have not submitted any room complaints or service requests yet.
                    </p>
                    <button
                      onClick={() => setPatientView("lodge")}
                      className="mt-2 px-4 py-2 rounded-xl bg-[#176B63] text-white text-xs font-bold cursor-pointer"
                    >
                      Lodge Service Request Now →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myTickets.map((t) => (
                      <div
                        key={t.id}
                        className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-[#176B63]">
                              {t.ticket_number}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">
                              {t.category || t.department_id}
                            </span>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              t.status === "closed"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : t.status === "resolution_submitted"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : t.status === "in_progress"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {t.status.replace("_", " ")}
                          </span>
                        </div>

                        <div>
                          <h4 className="font-bold text-sm text-slate-900">{t.title}</h4>
                          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{t.description}</p>
                        </div>

                        {t.resolution_summary && (
                          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-0.5">
                            <strong className="block font-semibold">Resolution Summary:</strong>
                            <p className="text-[11px] text-emerald-800">{t.resolution_summary}</p>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                          <span>Submitted: {new Date(t.created_at).toLocaleDateString()}</span>
                          <span className="font-mono text-slate-500">Room {t.room_number || "204"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VIEW 2: PATIENT ACCOUNT PROFILE */}
            {patientView === "profile" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="pb-1 border-b border-slate-200">
                  <h2 className="text-base font-black text-slate-900">Patient Account & Profile</h2>
                  <p className="text-xs text-slate-500">
                    Manage your verified bedside contact details and portal credentials.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Patient Name</span>
                      <strong className="text-slate-800">{currentUser?.name}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Patient ID</span>
                      <strong className="text-[#176B63] font-mono">{currentUser?.patient_id || "PAT-10001"}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Assigned Ward / Room</span>
                      <span className="text-slate-700 font-medium">Room {roomData?.room_number || currentUser?.room_number || "204"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Account Status</span>
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </span>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleUpdateProfile} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3 text-xs">
                  <h3 className="font-bold text-slate-900 text-xs">Update Contact Information</h3>

                  {profileSuccessMsg && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{profileSuccessMsg}</span>
                    </div>
                  )}

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Mobile Contact Phone</label>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="+1-555-0192"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#176B63] font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Email Address</label>
                    <input
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="patient@gmail.com"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#176B63]"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isUpdatingProfile}
                      className="px-4 py-2 rounded-xl bg-[#176B63] hover:bg-[#125852] disabled:opacity-50 text-white font-bold text-xs cursor-pointer shadow-2xs"
                    >
                      {isUpdatingProfile ? "Saving..." : "Save Contact Info"}
                    </button>
                  </div>
                </form>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                  <h3 className="font-bold text-slate-900 text-xs">Security & Credentials</h3>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setShowChangePassModal(true)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-[#176B63]" />
                      <span>Change Password</span>
                    </button>
                    {onClose && (
                      <button
                        type="button"
                        onClick={onClose}
                        className="py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs cursor-pointer"
                      >
                        Log Out
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 3: LODGE SERVICE REQUEST FLOW (Original Flow) */}
            {patientView === "lodge" && (
              <>
                {/* STEP 1: LUXURY BEDSIDE HOSPITAL CONCIERGE & CATEGORY SELECTION */}
                {step === "categories" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Top Row: Responsive Luxury Room Card */}
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#064E3B] via-[#0D5E56] to-[#0F766E] p-5 sm:p-6 text-white shadow-xl shadow-teal-950/15 flex flex-col justify-between">
                      <div className="absolute -top-16 -right-16 h-44 w-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                      <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-teal-300/20 blur-xl pointer-events-none" />

                      <div className="relative z-10 space-y-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-extrabold tracking-wide text-teal-100 border border-white/20 shadow-xs">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                            Verified Bedside Suite
                          </span>
                          <span className="font-mono text-[11px] font-bold text-teal-100/90 bg-black/30 px-2.5 py-1 rounded-xl border border-white/15">
                            {roomData?.token || currentToken}
                          </span>
                        </div>

                        <div>
                          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                            {roomData ? roomData.room_number : "Suite 501"}
                            <span className="text-teal-200 font-semibold text-sm sm:text-base ml-2">
                              • {roomData?.wing || "VIP Pavilion"}
                            </span>
                          </h2>
                          <p className="text-xs text-teal-100/80 font-medium mt-0.5">
                            {roomData?.floor || "Floor 5"} • Metropolitan General Hospital
                          </p>
                        </div>

                        {/* Floor Station Online Row */}
                        <div className="pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-teal-100/90 font-semibold">
                          <div className="flex items-center gap-1.5 text-emerald-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Floor Station Online</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Department Showcase Grid */}
                    <div className="space-y-2.5 pt-2">
                      <div className="flex items-center justify-between px-0.5">
                        <div>
                          <h3 className="text-sm font-black text-slate-900 tracking-tight">Select Service Department</h3>
                          <p className="text-[11px] text-slate-500 font-medium">Requests are routed directly to on-duty departmental supervisors</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                        {availableDepartments.map((dept: any) => {
                          const isSelected = activeDeptId === dept.id;
                          const visual = getDeptVisuals(dept.id);
                          const DeptIcon = visual.icon;
                          return (
                            <button
                              key={dept.id}
                              type="button"
                              onClick={() => setActiveDeptId(dept.id)}
                              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group flex flex-col justify-between min-h-[104px] ${
                                isSelected
                                  ? "bg-gradient-to-br from-white via-teal-50/80 to-emerald-50/50 border-teal-600 shadow-md shadow-teal-900/10 ring-2 ring-teal-600/30 scale-[1.02]"
                                  : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs active:scale-[0.98]"
                              }`}
                            >
                              {isSelected && (
                                <span className="absolute top-2.5 right-2.5 flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-600"></span>
                                </span>
                              )}
                              <div className="flex items-center justify-between">
                                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shadow-2xs ${visual.iconBg}`}>
                                  <DeptIcon className="h-5 w-5" />
                                </div>
                                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100/90 px-1.5 py-0.5 rounded-md border border-slate-200/60">
                                  {dept.code}
                                </span>
                              </div>
                              <div className="mt-2.5">
                                <div className={`text-xs font-black tracking-tight leading-tight ${isSelected ? "text-teal-950" : "text-slate-900 group-hover:text-teal-700"}`}>
                                  {dept.name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-semibold truncate mt-0.5">
                                  {visual.accent}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Active Department Categories */}
                    {(() => {
                      const currentDept =
                        availableDepartments.find((d: any) => d.id === activeDeptId) ||
                        availableDepartments[0];
                      if (!currentDept) return null;
                      return (
                        <div className="space-y-3 pt-3 border-t border-slate-200/80">
                          <div className="flex items-center justify-between px-0.5">
                            <div>
                              <span className="text-xs font-black text-slate-900">
                                Common {currentDept.name} Issues
                              </span>
                              <span className="text-[11px] text-slate-400 font-medium ml-2">
                                ({currentDept.categories.length} issue types)
                              </span>
                            </div>
                            <span className="text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/60">
                              Tap to describe &amp; dispatch
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {currentDept.categories.map((cat: string, idx: number) => {
                              const catVisual = getCategoryVisuals(cat);
                              const CatIcon = catVisual.icon;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleSelectCategory(currentDept.id, cat)}
                                  className="text-left p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-teal-600 hover:shadow-lg hover:shadow-teal-900/5 hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-between group cursor-pointer relative overflow-hidden"
                                >
                                  <div className="flex items-center gap-3 min-w-0 pr-2">
                                    <div className={`h-10 w-10 rounded-xl bg-gradient-to-tr ${catVisual.color} text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform`}>
                                      <CatIcon className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-teal-950 transition-colors leading-snug">
                                        {cat}
                                      </h4>
                                      <div className="flex items-center gap-1.5 mt-1">
                                        <span className="text-[10px] font-semibold text-slate-400">
                                          {currentDept.name}
                                        </span>
                                        <span className="text-[9px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded-full border border-teal-200/60">
                                          {catVisual.sla}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="h-7 w-7 rounded-xl bg-slate-50 group-hover:bg-teal-600 group-hover:text-white text-slate-400 flex items-center justify-center shrink-0 transition-all shadow-2xs">
                                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Service Guarantee Banner */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-50/80 via-emerald-50/50 to-slate-50 border border-teal-200/70 flex flex-col sm:flex-row items-center justify-between gap-2 mt-2">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-teal-950">HappyCare Verified Service Guarantee</div>
                          <p className="text-[11px] text-slate-500 font-medium">
                            Live SLA tracking • Computer Vision verification • Automated supervisor escalation
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-teal-800 bg-teal-100/80 px-2.5 py-1 rounded-lg shrink-0">
                        100% Zero App Required
                      </span>
                    </div>
                  </div>
                )}

            {/* STEP 2: COMPLAINT FORM */}
            {step === "form" && (
              <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setStep("categories")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-xs text-slate-700 font-bold cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Back to Categories</span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {categoryName}
                    </span>
                  </div>
                </div>

                {/* Complaint Title */}
                <div>
                  <label className="text-xs font-black text-slate-900 block mb-1.5">
                    Complaint Title / Issue Summary *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ceiling light over bed 2 is not turning on"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 focus:bg-white text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium focus:outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 transition-all"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-black text-slate-900 block mb-1.5">
                    Details &amp; Specific Room Area *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Describe the problem, location in room, or any noise/leaks..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full p-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 focus:bg-white text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium focus:outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 transition-all"
                  />
                </div>

                {/* Voice Note Recording Option */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Mic className="h-4 w-4 text-teal-600" />
                      <span>Optional Voice Note</span>
                    </span>
                    {audioUrl && (
                      <button
                        type="button"
                        onClick={resetRecording}
                        className="text-[11px] text-rose-600 font-bold hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete Recording</span>
                      </button>
                    )}
                  </div>

                  {!audioUrl ? (
                    <div>
                      {!isRecording ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                          <button
                            type="button"
                            onClick={startRecording}
                            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-700 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs shrink-0 active:scale-95"
                          >
                            <Mic className="h-4 w-4" />
                            <span>Record Voice Message</span>
                          </button>
                          <span className="text-[11px] text-slate-500 font-medium">
                            Speak details in your language (hands-free audio dispatch)
                          </span>
                        </div>
                      ) : (
                        <div className="p-3.5 bg-rose-50/80 rounded-2xl border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="relative flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="w-1 h-3 bg-rose-600 rounded-full animate-pulse" />
                              <span className="w-1 h-5 bg-rose-600 rounded-full animate-pulse delay-75" />
                              <span className="w-1 h-2 bg-rose-600 rounded-full animate-pulse delay-150" />
                            </div>
                            <span className="text-xs font-mono font-bold text-rose-700">
                              Recording: {formatAudioDuration(recordingSeconds)}
                            </span>
                            <span className="text-[11px] text-rose-500">(Max 2:00)</span>
                          </div>

                          <button
                            type="button"
                            onClick={stopRecording}
                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-sm shrink-0"
                          >
                            <Square className="h-3.5 w-3.5 fill-current" />
                            <span>Stop Recording</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200 space-y-2.5">
                      <audio
                        ref={audioPlayerRef}
                        src={audioUrl}
                        preload="auto"
                        onTimeUpdate={handleAudioTimeUpdate}
                        onEnded={handleAudioEnded}
                        className="hidden"
                      />

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={togglePlayback}
                          className="h-9 w-9 rounded-xl bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center shrink-0 shadow-sm cursor-pointer transition-transform active:scale-95"
                          title={isPlaying ? "Pause" : "Play"}
                        >
                          {isPlaying ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4 fill-current ml-0.5" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-800 mb-1">
                            <span className="text-teal-700">
                              {formatAudioDuration(playbackTime)}
                            </span>
                            <span className="text-slate-500">
                              {formatAudioDuration(recordedDuration)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={recordedDuration || 1}
                            value={playbackTime}
                            onChange={(e) => handleSeek(Number(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                          />
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <span>Recorded ✓</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Photo & Video Attachments */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black text-slate-900">Photo &amp; Video Evidence</span>
                      <p className="text-[11px] text-slate-500 font-medium">Add visual proof for AI Computer Vision verification (up to 3 files)</p>
                    </div>
                    {attachments.length > 0 && (
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200/60">
                        {attachments.length}/3 attached
                      </span>
                    )}
                  </div>

                  {attachmentError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{attachmentError}</span>
                    </div>
                  )}

                  {/* List of current attachments */}
                  {attachments.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-200/90 bg-slate-50/80 relative group"
                        >
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/5 shrink-0 flex items-center justify-center border border-slate-200">
                            {att.mediaType === "PHOTO" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={att.previewUrl} alt={att.fileName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-600">
                                <Video className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pr-6">
                            <p className="text-xs font-semibold text-slate-900 truncate" title={att.fileName}>
                              {att.fileName}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  att.mediaType === "PHOTO"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {att.mediaType}
                              </span>
                              <span className="text-[11px] text-slate-500">{formatFileSize(att.fileSizeBytes)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(att.id)}
                            className="absolute right-2 top-2 p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Remove attachment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add button (opens chooser modal) */}
                  {attachments.length < 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAttachmentChooser(true)}
                      className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-teal-600 bg-slate-50/60 hover:bg-teal-50/30 text-xs font-bold text-teal-800 transition-all cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Attach Photo or Video Evidence</span>
                    </button>
                  )}

                  {/* Hidden inputs triggered by chooser */}
                  <input
                    ref={takePhotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleFileAttachment(e, "PHOTO")}
                    className="hidden"
                  />
                  <input
                    ref={choosePhotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileAttachment(e, "PHOTO")}
                    className="hidden"
                  />
                  <input
                    ref={recordVideoInputRef}
                    type="file"
                    accept="video/*"
                    capture="environment"
                    onChange={(e) => handleFileAttachment(e, "VIDEO")}
                    className="hidden"
                  />
                  <input
                    ref={chooseVideoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={(e) => handleFileAttachment(e, "VIDEO")}
                    className="hidden"
                  />
                </div>

                {/* Patient Contact Information: Mobile Phone & Email Address */}
                <div className="space-y-3.5">
                  {/* Mobile Phone Number (Required for WhatsApp & Live Tracking) */}
                  <div>
                    <label className="text-xs font-black text-slate-900 flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-teal-600" />
                        <span>Mobile Phone Number *</span>
                      </span>
                      <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        WhatsApp Live Updates
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        placeholder="e.g. +1 555-0192 or +91 98450 11223"
                        value={patientContact}
                        onChange={(e) => setPatientContact(e.target.value)}
                        className="w-full p-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 focus:bg-white text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium focus:outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 pl-10 transition-all"
                      />
                      <Phone className="h-4 w-4 text-slate-400 absolute left-3.5 top-4" />
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">
                      Mandatory for automated WhatsApp status dispatch and tracking receipts.
                    </p>
                  </div>

                  {/* Patient Email Address (Mandatory for Work Started & Finished Receipts) */}
                  <div>
                    <label className="text-xs font-black text-slate-900 flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-teal-600" />
                        <span>Client Email Address *</span>
                      </span>
                      <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Required for Receipts
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        placeholder="e.g. client@gmail.com"
                        value={patientEmail}
                        onChange={(e) => setPatientEmail(e.target.value)}
                        className="w-full p-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 focus:bg-white text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium focus:outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 pl-10 transition-all"
                      />
                      <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-4" />
                    </div>
                    <p className="text-[11px] text-teal-800 font-semibold mt-1">
                      Automated confirmation receipts will be emailed when work begins and when verified.
                    </p>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 text-white text-sm font-black shadow-xl shadow-teal-700/25 flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-50 active:scale-[0.99]"
                >
                  <Send className="h-4 w-4" />
                  <span>{isSubmitting ? "Submitting to Hospital Staff..." : "Submit Bedside Request Now"}</span>
                </button>
              </form>
            )}

            {/* STEP 3: CONFIRMATION & LIVE TRACKING */}
            {step === "confirmation" && submittedTicket && (
              <div className="space-y-6 text-center py-4 animate-in zoom-in-95 duration-200">
                <div className="h-16 w-16 rounded-full bg-[#EDF7F2] text-[#16805D] flex items-center justify-center mx-auto border-4 border-white shadow-md">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-black text-[#16805D] uppercase tracking-wider bg-[#EDF7F2] px-3 py-1 rounded-full">
                    Complaint Successfully Saved
                  </span>
                  <h2 className="text-xl font-black text-[#0F172A]">Request Sent to Care Team</h2>
                  <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                    The {submittedTicket.department} staff has been notified. This screen updates live in real-time.
                  </p>
                </div>

                {/* Dynamic Arrival Status Banner */}
                {(() => {
                  const isAcknowledged =
                    submittedTicket.status === "acknowledged" ||
                    (Boolean(submittedTicket.acknowledged_at) &&
                      submittedTicket.status === "submitted");
                  const isWorking = ["in_progress", "work_started"].includes(submittedTicket.status);
                  const isWorkCompleted = [
                    "resolution_submitted",
                    "work_completed",
                  ].includes(submittedTicket.status);
                  const isClosed = submittedTicket.status === "closed";

                  if (isAcknowledged) {
                    return (
                      <div className="p-4 rounded-2xl bg-[#EBF3FD] border-2 border-[#BFDBFE] text-xs flex items-center justify-between text-left shadow-2xs animate-in fade-in">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-xl text-[#3868C9] shadow-2xs">
                            <Clock className="h-5 w-5 text-[#3868C9]" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#3868C9] block">
                              Estimated Arrival
                            </span>
                            <strong className="text-sm font-black text-[#17212F]">
                              {submittedTicket.estimated_arrival_minutes || 10}–{((submittedTicket.estimated_arrival_minutes || 10) + 5)} Minutes
                            </strong>
                            <span className="text-[11px] text-[#475467] block">
                              Staff acknowledged and en route to {submittedTicket.room_number}
                            </span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-white text-[11px] font-bold text-[#3868C9] border border-[#BFDBFE] shrink-0">
                          Technician En Route
                        </span>
                      </div>
                    );
                  }

                  if (isWorking) {
                    return (
                      <div className="p-4 rounded-2xl bg-[#EDF7F2] border-2 border-[#A6E1CE] text-xs flex items-center justify-between text-left shadow-2xs animate-in fade-in">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-xl text-[#16805D] shadow-2xs">
                            <UserCheck className="h-5 w-5 text-[#16805D]" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#16805D] block">
                              Staff Arrived On-Site
                            </span>
                            <strong className="text-sm font-black text-[#0F172A]">
                              Staff Has Arrived at {submittedTicket.room_number}
                            </strong>
                            <span className="text-[11px] text-[#334155] block">
                              {submittedTicket.assigned_staff_name ? `${submittedTicket.assigned_staff_name} is` : "Technician is"} actively attending to your request
                            </span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-white text-[11px] font-black text-[#16805D] border border-[#A6E1CE] shrink-0">
                          Work in Progress
                        </span>
                      </div>
                    );
                  }

                  if (isWorkCompleted) {
                    return (
                      <div className="p-4 rounded-2xl bg-[#F0FDF4] border-2 border-[#86EFAC] text-xs flex items-center justify-between text-left shadow-2xs animate-in fade-in">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-xl text-[#15803D] shadow-2xs">
                            <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#15803D] block">
                              Service Completed
                            </span>
                            <strong className="text-sm font-black text-[#0F172A]">
                              Staff Has Completed the Service
                            </strong>
                            <span className="text-[11px] text-[#334155] block">
                              Work completed with safety standards; awaiting final sign-off
                            </span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-white text-[11px] font-black text-[#15803D] border border-[#86EFAC] shrink-0">
                          Work Completed
                        </span>
                      </div>
                    );
                  }

                  if (isClosed) {
                    return (
                      <div className="p-4 rounded-2xl bg-[#EDF7F2] border-2 border-[#A6E1CE] text-xs flex items-center justify-between text-left shadow-2xs animate-in fade-in">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-xl text-[#16805D] shadow-2xs">
                            <CheckCircle2 className="h-5 w-5 text-[#16805D]" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#16805D] block">
                              Resolved & Closed
                            </span>
                            <strong className="text-sm font-black text-[#0F172A]">
                              Issue Officially Resolved
                            </strong>
                            <span className="text-[11px] text-[#334155] block">
                              Inspected and closed by hospital supervisor
                            </span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-white text-[11px] font-black text-[#16805D] border border-[#A6E1CE] shrink-0">
                          Closed
                        </span>
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* Patient-Safe Confirmation Box */}
                {(() => {
                  const fullTrackingUrl = (submittedTicket.tracking_url && submittedTicket.tracking_url.startsWith("http"))
                    ? submittedTicket.tracking_url
                    : typeof window !== "undefined"
                    ? `${window.location.origin}/track/${submittedTicket.ticket_number}${submittedTicket.tracking_url?.includes("?token=") ? `?token=${submittedTicket.tracking_url.split("?token=")[1]}` : ""}`
                    : `https://care-ops-dusky.vercel.app/track/${submittedTicket.ticket_number}`;

                  const waNoticeText = `*Official Happy Care Hospital Confirmation Notice*\n\nYour complaint has been registered successfully.\n• Ticket Reference: *${submittedTicket.ticket_number}*\n• Service Location: *${submittedTicket.room_number}*\n• Department: *${submittedTicket.department}*\n\nTrack real-time resolution progress here:\n${fullTrackingUrl}`;

                  const cleanPhone = patientContact.replace(/[^\d+]/g, "").replace(/^\+/, "");
                  const waUrl = cleanPhone
                    ? `https://api.whatsapp.com/send?phone=${encodeURIComponent(cleanPhone)}&text=${encodeURIComponent(waNoticeText)}`
                    : `https://api.whatsapp.com/send?text=${encodeURIComponent(waNoticeText)}`;

                  return (
                    <div className="p-4 rounded-2xl bg-[#E8F3F1] border-2 border-[#A7D7D1] text-left space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold text-[#176B63] uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Official Confirmation Notice</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {patientContact && (
                            <span className="text-[10px] font-bold text-[#16805D] bg-white px-2 py-0.5 rounded-full border border-[#A6E1CE]">
                              WhatsApp: {patientContact}
                            </span>
                          )}
                          {patientEmail && (
                            <span className="text-[10px] font-bold text-[#1D4ED8] bg-white px-2 py-0.5 rounded-full border border-[#BFDBFE] flex items-center gap-1">
                              <Mail className="h-3 w-3 text-[#1D4ED8]" />
                              <span>Email: {patientEmail}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-xs font-medium text-[#0F172A] leading-relaxed bg-white p-3.5 rounded-xl border border-[#CBD5E1]">
                        &ldquo;Your complaint has been registered successfully. Your ticket reference is{" "}
                        <strong className="font-mono text-[#176B63]">{submittedTicket.ticket_number}</strong>. Track the progress of your request here:{" "}
                        <a
                          href={fullTrackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#176B63] underline font-bold break-all"
                        >
                          {fullTrackingUrl}
                        </a>
                        .&rdquo;
                      </p>

                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                        title="Receive / Open Official Notice in WhatsApp"
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span>Open / Receive on WhatsApp</span>
                      </a>
                    </div>
                  );
                })()}

                {/* Reference Card */}
                <div className="bg-white p-5 rounded-3xl border-2 border-[#CBD5E1] shadow-xs text-left space-y-3">
                  <div className="flex justify-between items-center pb-3 border-b border-[#F1F5F9]">
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase font-bold block">
                        Unique Reference ID
                      </span>
                      <span className="font-black text-base text-[#176B63] font-mono">
                        {submittedTicket.ticket_number}
                      </span>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-[#EDF7F2] text-[#16805D] capitalize">
                      {submittedTicket.friendly_status || "Received & Queued"}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Service Location:</span>
                      <strong className="text-[#0F172A]">{submittedTicket.room_number}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Department:</span>
                      <strong className="text-[#0F172A]">{submittedTicket.department}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Submitted Time:</span>
                      <span className="text-[#0F172A]">
                        {formatTime(submittedTicket.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5-Step Live Progress Tracker */}
                <div className="p-5 bg-white rounded-3xl border-2 border-[#CBD5E1] text-left space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-[#0F172A] uppercase tracking-wider">
                      Live Resolution Milestones
                    </h4>
                    <span className="text-[10px] text-[#16805D] bg-[#EDF7F2] px-2 py-0.5 rounded-full font-bold">
                      ● Live Sync Active
                    </span>
                  </div>

                  <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#CBD5E1]">
                    {[
                      {
                        label: "1. Request Registered",
                        desc: "Saved in Happy Care hospital database",
                        active: true,
                        time: submittedTicket.created_at,
                      },
                      {
                        label: "2. Assigned to On-Duty Team",
                        desc: "Assigned according to room and department",
                        active: submittedTicket.status !== "submitted",
                        time: submittedTicket.created_at,
                      },
                      {
                        label: "3. Staff Acknowledged & En Route",
                        desc: "Staff member accepted the task",
                        active: [
                          "acknowledged",
                          "in_progress",
                          "work_started",
                          "work_completed",
                          "resolution_submitted",
                          "closed",
                        ].includes(submittedTicket.status),
                        time: submittedTicket.acknowledged_at,
                      },
                      {
                        label: "4. Work in Progress",
                        desc: "Repairs / service underway at room",
                        active: [
                          "in_progress",
                          "work_started",
                          "work_completed",
                          "resolution_submitted",
                          "closed",
                        ].includes(submittedTicket.status),
                        time: submittedTicket.in_progress_at || submittedTicket.work_started_at,
                      },
                      {
                        label: "5. Resolved & Closed",
                        desc: "Verified by hospital supervisor",
                        active: [
                          "closed",
                          "work_completed",
                          "resolution_submitted",
                        ].includes(submittedTicket.status),
                        time: submittedTicket.closed_at || submittedTicket.work_completed_at,
                      },
                    ].map((m, idx) => (
                      <div key={idx} className="relative flex items-start gap-3">
                        <div
                          className={`absolute -left-6 top-0.5 h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold ${
                            m.active
                              ? "bg-[#176B63] text-white shadow-xs"
                              : "bg-white border-2 border-[#CBD5E1] text-[#94A3B8]"
                          }`}
                        >
                          {m.active ? "✓" : idx + 1}
                        </div>
                        <div>
                          <span
                            className={`text-xs block font-bold ${
                              m.active ? "text-[#0F172A]" : "text-[#94A3B8]"
                            }`}
                          >
                            {m.label}
                          </span>
                          <span className="text-[10px] text-[#64748B] block">{m.desc}</span>
                          {m.time && (
                            <span className="text-[10px] text-[#16805D] font-mono">
                              {formatTime(m.time)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Issue-Resolved Confirmation Card (Section 8) */}
                {(submittedTicket.ready_for_feedback ||
                  ["closed", "work_completed", "resolution_submitted"].includes(submittedTicket.status)) && (
                  <div className="bg-white rounded-3xl border-2 border-[#16805D] p-5 shadow-xs space-y-3 text-left">
                    <div className="flex items-center gap-2.5 text-[#16805D]">
                      <div className="p-2 rounded-xl bg-[#EDF7F2]">
                        <CheckCircle2 className="h-5 w-5 text-[#16805D]" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-[#0F172A]">
                          Your request has been resolved.
                        </h3>
                        <span className="text-[11px] font-mono text-[#16805D] font-bold">
                          Reference: {submittedTicket.ticket_number}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#CBD5E1] space-y-2 text-xs">
                      <div className="flex justify-between text-[#64748B]">
                        <span>Department:</span>
                        <span className="font-bold text-[#0F172A] capitalize">
                          {submittedTicket.department || selectedDept}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#64748B]">
                        <span>Service Category:</span>
                        <span className="font-semibold text-[#0F172A]">
                          {submittedTicket.category || categoryName}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#64748B]">
                        <span>Location:</span>
                        <span className="font-mono text-[#0F172A]">
                          {submittedTicket.room_number || "Room Location"}
                        </span>
                      </div>
                      {submittedTicket.resolution_summary && (
                        <div className="pt-2 border-t border-[#E2E8F0] space-y-1">
                          <span className="font-bold text-[#0F172A] block">Completion Summary:</span>
                          <p className="text-[#475569] leading-relaxed">
                            {submittedTicket.resolution_summary}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <a
                    href={`/track/${submittedTicket.ticket_number}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-3 rounded-2xl border-2 border-[#176B63] text-[#176B63] hover:bg-[#E8F3F1] text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Open Standalone Tracker</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>

                  <button
                    onClick={() => {
                      setStep("categories");
                      setTitle("");
                      setDescription("");
                      resetRecording();
                      setPhotoBase64(null);
                      setPhotoPreview(null);
                      setAttachments([]);
                      setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
                    }}
                    className="flex-1 py-3 rounded-2xl border-2 border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-bold text-[#0F172A] transition-all cursor-pointer"
                  >
                    Report Another Issue
                  </button>
                </div>
              </div>
            )}
              </>
            )}
          </>
        )}
      </main>

      {/* Footer Branding */}
      <footer className="p-4 border-t border-[#E2E8F0] bg-white text-center text-[11px] text-[#64748B]">
        <span>Happy Care Hospital Dignity & Service Assurance • Zero Patient App Download Required</span>
      </footer>

      {/* Attachment Chooser Modal */}
      {showAttachmentChooser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Camera className="h-4 w-4 text-[#176B63]" />
                <span>Add Photo or Video</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAttachmentChooser(false)}
                className="p-1 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[#64748B]">
              Attach media evidence to help hospital technicians diagnose and resolve your request quickly.
            </p>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowAttachmentChooser(false);
                  takePhotoInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#CBD5E1] hover:border-[#176B63] hover:bg-[#F0F7F6] text-left transition-all group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-emerald-50 text-[#176B63] group-hover:bg-[#176B63] group-hover:text-white transition-colors">
                  <Camera className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">Take Photo</div>
                  <div className="text-[11px] text-[#64748B]">Use device camera (rear camera)</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAttachmentChooser(false);
                  choosePhotoInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#CBD5E1] hover:border-[#176B63] hover:bg-[#F0F7F6] text-left transition-all group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-emerald-50 text-[#176B63] group-hover:bg-[#176B63] group-hover:text-white transition-colors">
                  <Image className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">Choose Photo</div>
                  <div className="text-[11px] text-[#64748B]">Select image from gallery / files</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAttachmentChooser(false);
                  recordVideoInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#CBD5E1] hover:border-[#176B63] hover:bg-[#F0F7F6] text-left transition-all group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Video className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">Record Video</div>
                  <div className="text-[11px] text-[#64748B]">Record short video clip with camera</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAttachmentChooser(false);
                  chooseVideoInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#CBD5E1] hover:border-[#176B63] hover:bg-[#F0F7F6] text-left transition-all group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Film className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#0F172A]">Choose Video</div>
                  <div className="text-[11px] text-[#64748B]">Select existing video from device</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setShowAttachmentChooser(false)}
                className="w-full py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#64748B] hover:bg-gray-100 transition-colors mt-1 cursor-pointer text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scannable Room QR Placard Modal */}
      {showQRModal && (
        <RoomQRPlacardModal
          room={{
            room_number: roomData?.room_number || "Room 204",
            floor: roomData?.floor || "Floor 2",
            wing: roomData?.wing || "East Wing",
            qr_token: currentToken,
          }}
          allRooms={allRooms}
          onSelectRoom={(r) => {
            // Reload with chosen room
            window.location.href = `/?room=${r.qr_token}`;
          }}
          onClose={() => setShowQRModal(false)}
        />
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showChangePassModal}
        onClose={() => setShowChangePassModal(false)}
        userRole="patient"
      />
    </div>
  );
}
