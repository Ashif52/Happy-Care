from datetime import datetime, timezone
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator

class BaseUTCModel(BaseModel):
    @field_validator("*", mode="after")
    @classmethod
    def _ensure_utc_tz(cls, v: Any) -> Any:
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

# ----------------- User & Auth Schemas -----------------
class UserBase(BaseUTCModel):
    email: str
    name: str
    role: str
    department_id: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool = True
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    account_status: str = "active"
    failed_login_attempts: int = 0
    locked_at: Optional[datetime] = None
    locked_reason: Optional[str] = None
    last_login_at: Optional[datetime] = None

    token_version: int = 1
    patient_id: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    created_at: datetime
    permissions: List[str] = []
    
    class Config:
        from_attributes = True

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None


class LoginRequest(BaseModel):
    email: Optional[str] = None
    login_identifier: Optional[str] = None
    password: str
    portal_hint: Optional[str] = None  # "admin", "staff", "patient"

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ForgotPasswordRequest(BaseModel):
    identifier: str

class ResetPasswordWithTokenRequest(BaseModel):
    token: str
    new_password: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = "staff"
    department_id: Optional[str] = "maintenance"
    designation: Optional[str] = "Hospital Personnel"
    phone: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ----------------- Enterprise Staff & Access Management Schemas -----------------
class StaffCreate(BaseModel):
    name: str
    employee_id: str
    email: str
    phone: Optional[str] = None
    department_id: str
    designation: str
    role: str = "staff"
    supervisor_id: Optional[int] = None
    password: Optional[str] = None
    initial_password: Optional[str] = "TempPass2026!"
    require_password_change: bool = True
    permissions: Optional[List[str]] = None

class StaffUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    employee_id: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[str] = None
    designation: Optional[str] = None
    role: Optional[str] = None
    supervisor_id: Optional[int] = None

class UserPermissionsUpdateRequest(BaseModel):
    permissions: List[str]

class StaffActionReason(BaseModel):
    reason: str

class StaffPasswordResetRequest(BaseModel):
    temporary_password: Optional[str] = None
    require_change: bool = True

class StaffResponse(BaseUTCModel):
    id: int
    employee_id: Optional[str] = None
    name: str
    email: str
    phone: Optional[str] = None
    role: str
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    supervisor_id: Optional[int] = None
    supervisor_name: Optional[str] = None
    designation: Optional[str] = None
    account_status: str
    is_active: bool
    failed_login_attempts: int = 0
    locked_at: Optional[datetime] = None
    locked_reason: Optional[str] = None
    last_login_at: Optional[datetime] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    permissions: List[str] = []

    class Config:
        from_attributes = True

class StaffMetrics(BaseModel):
    total_staff: int
    active_accounts: int
    inactive_accounts: int
    locked_accounts: int
    pending_activation: int

class StaffListResponse(BaseModel):
    items: List[StaffResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    metrics: StaffMetrics


# ----------------- Room Schemas -----------------
class RoomBase(BaseModel):
    room_number: str
    floor: str
    wing: str
    bed_count: int = 1
    is_active: bool = True

class RoomCreate(RoomBase):
    qr_token: Optional[str] = None

class RoomResponse(RoomBase):
    id: int
    qr_token: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# ----------------- Department Schemas -----------------
class DepartmentBase(BaseModel):
    id: str
    name: str
    code: str
    description: Optional[str] = None
    icon: str = "Wrench"
    supervisor_id: Optional[int] = None
    supervisor_ids: Optional[List[int]] = []
    categories: Optional[List[str]] = []
    is_active: bool = True

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    supervisor_id: Optional[int] = None
    supervisor_ids: Optional[List[int]] = None
    categories: Optional[List[str]] = None

class DepartmentStatusToggle(BaseModel):
    is_active: bool

class DepartmentReassignRequest(BaseModel):
    target_department_id: str
    reassign_staff: bool = True
    reassign_tickets: bool = True

class DepartmentResponse(DepartmentBase):
    created_at: datetime
    active_ticket_count: Optional[int] = 0
    staff_count: Optional[int] = 0
    supervisors: Optional[List[dict]] = []
    
    class Config:
        from_attributes = True

# ----------------- Evidence Schemas -----------------
class EvidenceResponse(BaseModel):
    id: int
    ticket_id: int
    stage: str  # "before" | "after"
    media_type: str  # "image" | "video"
    file_url: str
    thumbnail_url: Optional[str] = None
    file_size_bytes: int
    file_hash: Optional[str] = None
    equipment_type: Optional[str] = None
    uploaded_by_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# ----------------- AI Verification Schemas -----------------
class AIVerificationJobResponse(BaseModel):
    id: int
    ticket_id: int
    status: str
    before_evidence_id: Optional[int] = None
    after_evidence_id: Optional[int] = None
    
    evidence_relevance: str
    equipment_match: str
    visible_fault_assessment: str
    after_repair_functional_evidence: str
    media_quality: str
    
    missing_evidence: Any
    inconsistencies: Any
    
    ai_recommendation: str  # "likely_resolved" | "likely_unresolved" | "inconclusive"
    review_requirement: str  # "mandatory_human_review" | "standard_signoff" | "fast_track_eligible"
    confidence_score: float
    analysis_notes: str
    model_version: str
    analysis_timestamp: Optional[datetime] = None
    
    human_decision: Optional[str] = None
    human_reviewer_id: Optional[int] = None
    human_review_notes: Optional[str] = None
    human_override_reason: Optional[str] = None
    human_reviewed_at: Optional[datetime] = None
    
    created_at: datetime
    
    class Config:
        from_attributes = True

class AIHumanReviewRequest(BaseModel):
    decision: str  # "approved" | "rejected" | "requested_new_evidence" | "inconclusive"
    notes: Optional[str] = None
    override_reason: Optional[str] = None  # Mandatory if overruling AI recommendation

# ----------------- Ticket Note Schemas -----------------
class TicketNoteCreate(BaseModel):
    content: str
    is_internal: bool = True  # Default internal

class TicketNoteResponse(BaseModel):
    id: int
    ticket_id: int
    author_id: Optional[int] = None
    author_name: str
    content: str
    is_internal: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# ----------------- Ticket Schemas -----------------
class PatientGuestSessionRequest(BaseModel):
    qr_token: str

class PatientVerifySessionRequest(BaseModel):
    phone: str
    otp_code: str
    qr_token: Optional[str] = None

class PatientSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    session_type: str  # "guest" | "verified"
    room_number: Optional[str] = None
    patient_identifier: Optional[str] = None
    expires_in_hours: int = 12

class PatientAttachment(BaseModel):
    media_type: str = "image"  # "image" or "video"
    file_name: Optional[str] = None
    data_base64: str
    file_size_bytes: Optional[int] = None

class PatientTicketCreate(BaseModel):
    qr_token: str  # Scanned from room QR code
    department_id: str
    category: str
    description: str
    patient_contact: Optional[str] = ""  # Mobile number (optional if patient_email provided)
    patient_email: Optional[str] = None
    title: Optional[str] = None
    idempotency_key: Optional[str] = None
    voice_recording_base64: Optional[str] = None
    voice_transcription: Optional[str] = None
    photo_base64: Optional[str] = None  # Legacy single photo
    attachments: Optional[List[PatientAttachment]] = None

class PatientRegisterRequest(BaseModel):
    name: str
    email: str
    phone: str
    password: str

class PatientProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class StaffTicketCreate(BaseModel):
    title: str
    description: str
    department_id: str
    room_id: Optional[int] = None
    room_number: str
    category: str
    priority: str = "medium"
    assigned_staff_id: Optional[int] = None
    patient_email: Optional[str] = None
    patient_contact: Optional[str] = None

class TicketContactUpdateRequest(BaseModel):
    patient_email: Optional[str] = None
    patient_contact: Optional[str] = None
    resend_email: Optional[bool] = False

class FollowupEmailRequest(BaseModel):
    stage: str  # "work_started" | "work_finished"
    recipient_email: Optional[str] = None
    custom_notes: Optional[str] = None

class TicketAssignRequest(BaseModel):
    staff_id: int
    expected_assigned_staff_id: Optional[int] = -999
    note: Optional[str] = None

class TicketTransferDepartmentRequest(BaseModel):
    new_department_id: str
    reason: Optional[str] = None

class TicketAcknowledgeRequest(BaseModel):
    note: Optional[str] = None

class TicketStartWorkRequest(BaseModel):
    note: Optional[str] = None

class TicketResolutionSubmitRequest(BaseModel):
    resolution_summary: str
    parts_replaced: Optional[str] = None
    functional_test_notes: Optional[str] = None

class TicketClosureRequest(BaseModel):
    approval_note: Optional[str] = None
    is_approved: bool = True

class TicketDelayReportRequest(BaseModel):
    delay_reason: str
    revised_eta_minutes: int  # minutes from now

class TicketResponse(BaseModel):
    id: int
    ticket_number: str
    title: str
    description: str
    voice_recording_url: Optional[str] = None
    voice_transcription: Optional[str] = None
    
    department_id: str
    room_id: Optional[int] = None
    room_number: str
    category: str
    priority: str
    status: str
    
    is_escalated: bool
    escalation_level: int
    escalation_reason: Optional[str] = None
    
    assigned_staff_id: Optional[int] = None
    assigned_staff_name: Optional[str] = None
    assigned_supervisor_id: Optional[int] = None
    assigned_supervisor_name: Optional[str] = None
    
    sla_acknowledgement_deadline: Optional[datetime] = None
    sla_resolution_deadline: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    in_progress_at: Optional[datetime] = None
    resolution_submitted_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    
    resolution_summary: Optional[str] = None
    parts_replaced: Optional[str] = None
    functional_test_notes: Optional[str] = None
    delay_reason: Optional[str] = None
    revised_eta: Optional[datetime] = None
    
    patient_contact: Optional[str] = None
    patient_email: Optional[str] = None
    patient_tracking_token: Optional[str] = None
    patient_feedback_rating: Optional[int] = None
    patient_feedback_comment: Optional[str] = None
    
    created_at: datetime
    updated_at: datetime
    
    evidences: List[EvidenceResponse] = []
    latest_ai_verification: Optional[AIVerificationJobResponse] = None
    notes: List[TicketNoteResponse] = []
    
    class Config:
        from_attributes = True

# ----------------- SLA Policy Schemas -----------------
class SLAPolicyBase(BaseModel):
    department_id: str
    priority: str
    ack_target_minutes: int
    resolution_target_minutes: int
    reminder_1_minutes_before: int = 30
    reminder_2_minutes_before: int = 10
    escalation_after_deadline_minutes: int = 0
    requires_closure_approval: bool = True
    is_active: bool = True

class SLAPolicyResponse(SLAPolicyBase):
    id: int
    
    class Config:
        from_attributes = True

# ----------------- Audit Log Schemas -----------------
class AuditLogResponse(BaseModel):
    id: int
    ticket_id: Optional[int] = None
    action: str
    actor_id: Optional[int] = None
    actor_name: str
    actor_role: str
    details: Any
    created_at: datetime
    
    class Config:
        from_attributes = True

# ----------------- Dashboard Analytics -----------------
class DashboardMetricsResponse(BaseModel):
    total_open_tickets: int
    tickets_due_soon: int
    overdue_tickets: int
    sla_compliance_rate: float
    avg_resolution_time_minutes: float
    pending_ai_verifications: int
    
    department_workload: List[dict]
    ticket_volume_trends: List[dict]
    sla_by_department: List[dict]
    recent_escalations: List[dict]
