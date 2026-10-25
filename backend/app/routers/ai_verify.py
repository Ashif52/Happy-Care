import os
from datetime import datetime, timezone
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.config import settings
from app.models import Ticket, Evidence, AIVerificationJob, User, AuditLog, SystemSecuritySetting
from app.schemas import AIHumanReviewRequest
from app.services.auth_service import get_current_user, require_roles, require_permission
from app.services.ai_vision_service import AIVisionService

router = APIRouter(prefix="/ai-verify", tags=["AI Verification Center"])

class AIAnalyzeRequest(BaseModel):
    provider: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None

class AIModelConfigureRequest(BaseModel):
    provider: str = Field(..., description="'openai', 'gemini', 'anthropic', or 'mock'")
    model_name: str
    api_key: Optional[str] = None

class TestConnectionRequest(BaseModel):
    provider: str
    model_name: Optional[str] = None
    api_key: Optional[str] = None

def parse_job_response(job: AIVerificationJob) -> dict:
    # Try to unpack visual observations and differences if stored in analysis_notes or extra json
    return {
        "id": job.id,
        "ticket_id": job.ticket_id,
        "status": job.status,
        "before_evidence_id": job.before_evidence_id,
        "after_evidence_id": job.after_evidence_id,
        "provider_selected": getattr(job, "provider_selected", "mock"),
        "model_name_selected": getattr(job, "model_name_selected", "careops-vision-default"),
        "is_demo": getattr(job, "is_demo", False),
        "evidence_relevance": job.evidence_relevance,
        "equipment_match": job.equipment_match,
        "visible_fault_assessment": job.visible_fault_assessment,
        "after_repair_functional_evidence": job.after_repair_functional_evidence,
        "media_quality": job.media_quality,
        "missing_evidence": json.loads(job.missing_evidence) if isinstance(job.missing_evidence, str) else job.missing_evidence,
        "inconsistencies": json.loads(job.inconsistencies) if isinstance(job.inconsistencies, str) else job.inconsistencies,
        "ai_recommendation": job.ai_recommendation,
        "review_requirement": job.review_requirement,
        "confidence_score": job.confidence_score,
        "analysis_notes": job.analysis_notes,
        "model_version": job.model_version,
        "analysis_timestamp": job.analysis_timestamp,
        "human_decision": job.human_decision,
        "human_reviewer_id": job.human_reviewer_id,
        "human_review_notes": job.human_review_notes,
        "human_override_reason": job.human_override_reason,
        "human_reviewed_at": job.human_reviewed_at,
        "safety_disclaimer": "AI Visual Verification Disclaimer: Visual inspection cannot reliably verify internal electrical circuitry, pressurized medical gas or plumbing lines, structural anchoring, or chemical sanitization. Always require physical human sign-off or certified functional safety testing where policy mandates.",
        "created_at": job.created_at
    }

@router.get("/models")
def get_model_options(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns available AI vision providers, supported models, and active configuration"""
    sec = db.query(SystemSecuritySetting).filter(SystemSecuritySetting.id == 1).first()
    active_provider = sec.ai_vision_provider if sec else "mock"
    active_model = sec.ai_vision_model if sec else "careops-vision-default"
    
    # Indicate whether API key is present without exposing the actual secret key
    has_keys = {
        "openai": bool((sec and sec.openai_api_key) or os.getenv("OPENAI_API_KEY") or settings.OPENAI_API_KEY),
        "gemini": bool((sec and sec.gemini_api_key) or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or settings.GEMINI_API_KEY),
        "anthropic": bool((sec and sec.anthropic_api_key) or os.getenv("ANTHROPIC_API_KEY")),
        "mock": True
    }

    models_catalog = AIVisionService.get_supported_models()
    for item in models_catalog:
        item["is_key_configured"] = has_keys.get(item["provider"], False)
        item["is_active"] = (item["provider"] == active_provider)

    return {
        "active_provider": active_provider,
        "active_model": active_model,
        "supported_providers": models_catalog
    }

@router.post("/configure-model")
def configure_model(
    payload: AIModelConfigureRequest,
    current_user: User = Depends(require_roles("admin", "superadmin", "supervisor")),
    db: Session = Depends(get_db)
):
    """Configures the hospital's active default AI vision provider, model, and optional API key"""
    sec = db.query(SystemSecuritySetting).filter(SystemSecuritySetting.id == 1).first()
    if not sec:
        sec = SystemSecuritySetting(id=1)
        db.add(sec)

    sec.ai_vision_provider = payload.provider
    sec.ai_vision_model = payload.model_name
    
    if payload.api_key and payload.api_key.strip():
        clean_key = payload.api_key.strip()
        if payload.provider == "gemini":
            sec.gemini_api_key = clean_key
        elif payload.provider == "openai":
            sec.openai_api_key = clean_key
        elif payload.provider == "anthropic":
            sec.anthropic_api_key = clean_key

    db.commit()

    return {
        "success": True,
        "message": f"AI vision model configured to {payload.provider} ({payload.model_name}).",
        "active_provider": sec.ai_vision_provider,
        "active_model": sec.ai_vision_model
    }

@router.post("/test-connection")
def test_connection_endpoint(
    payload: TestConnectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Tests provider API key connectivity to ensure AI video and vision models can analyze evidence"""
    sec = db.query(SystemSecuritySetting).filter(SystemSecuritySetting.id == 1).first()
    key = payload.api_key
    if not key or not key.strip():
        if payload.provider == "gemini":
            key = (sec and sec.gemini_api_key) or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or settings.GEMINI_API_KEY
        elif payload.provider == "openai":
            key = (sec and sec.openai_api_key) or os.getenv("OPENAI_API_KEY") or settings.OPENAI_API_KEY
        elif payload.provider == "anthropic":
            key = (sec and sec.anthropic_api_key) or os.getenv("ANTHROPIC_API_KEY")
        elif payload.provider == "mock":
            key = "mock"

    success, message = AIVisionService.test_connection(payload.provider, payload.model_name, key or "")
    return {"success": success, "message": message}

@router.get("/queue")
def get_verification_queue(
    department_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns queue of verification jobs awaiting supervisor sign-off or action"""
    if current_user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Super Admin does not access operational verification queue.")

    query = db.query(AIVerificationJob).join(Ticket, AIVerificationJob.ticket_id == Ticket.id)
    
    active_dept_id = department_id
    if current_user.role in ["supervisor", "staff"] and current_user.department_id:
        active_dept_id = current_user.department_id

    if active_dept_id:
        query = query.filter(Ticket.department_id == active_dept_id)
        
    jobs = query.order_by(desc(AIVerificationJob.created_at)).limit(50).all()
    
    result = []
    for job in jobs:
        ticket = db.query(Ticket).filter(Ticket.id == job.ticket_id).first()
        before_ev = db.query(Evidence).filter(Evidence.id == job.before_evidence_id).first() if job.before_evidence_id else None
        after_ev = db.query(Evidence).filter(Evidence.id == job.after_evidence_id).first() if job.after_evidence_id else None
        
        parsed = parse_job_response(job)
        parsed["ticket_number"] = ticket.ticket_number if ticket else None
        parsed["ticket_title"] = ticket.title if ticket else None
        parsed["ticket_category"] = ticket.category if ticket else None
        parsed["ticket_priority"] = ticket.priority if ticket else None
        parsed["ticket_status"] = ticket.status if ticket else None
        parsed["room_number"] = ticket.room_number if ticket else None
        parsed["department_id"] = ticket.department_id if ticket else None
        parsed["before_evidence"] = before_ev
        parsed["after_evidence"] = after_ev
        result.append(parsed)
        
    return result

@router.post("/{ticket_id}/analyze")
def trigger_analysis(
    ticket_id: int,
    payload: Optional[AIAnalyzeRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Triggers or recalculates AI Multimodal verification job for a ticket"""
    if current_user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Super Admin does not execute operational AI verifications.")

    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Scoping check
    if current_user.role in ["supervisor", "staff"] and current_user.department_id:
        if ticket.department_id != current_user.department_id:
            raise HTTPException(status_code=403, detail="Unauthorized: Ticket belongs to a different department.")
        
    before_ev = db.query(Evidence).filter(Evidence.ticket_id == ticket.id, Evidence.stage == "before").first()
    after_ev = db.query(Evidence).filter(Evidence.ticket_id == ticket.id, Evidence.stage == "after").order_by(Evidence.id.desc()).first()

    # Determine provider & model
    sec = db.query(SystemSecuritySetting).filter(SystemSecuritySetting.id == 1).first()
    provider = (payload and payload.provider) or (sec.ai_vision_provider if sec else "mock")
    model_name = (payload and payload.model_name) or (sec.ai_vision_model if sec else "careops-vision-default")

    api_key = (payload and payload.api_key and payload.api_key.strip()) or None
    if not api_key:
        if provider == "openai":
            api_key = (sec and sec.openai_api_key) or os.getenv("OPENAI_API_KEY") or settings.OPENAI_API_KEY
        elif provider == "gemini":
            api_key = (sec and sec.gemini_api_key) or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or settings.GEMINI_API_KEY
        elif provider == "anthropic":
            api_key = (sec and sec.anthropic_api_key) or os.getenv("ANTHROPIC_API_KEY")
    
    analysis_data = AIVisionService.analyze_ticket_evidence(
        ticket=ticket,
        before_evidence=before_ev,
        after_evidence=after_ev,
        provider=provider,
        model_name=model_name,
        api_key=api_key
    )
    
    job = AIVerificationJob(
        ticket_id=ticket.id,
        status="completed",
        before_evidence_id=before_ev.id if before_ev else None,
        after_evidence_id=after_ev.id if after_ev else None,
        provider_selected=analysis_data.get("provider_selected", provider),
        model_name_selected=analysis_data.get("model_name_selected", model_name),
        is_demo=analysis_data.get("is_demo", False),
        evidence_relevance=analysis_data["evidence_relevance"],
        equipment_match=analysis_data["equipment_match"],
        visible_fault_assessment=analysis_data["visible_fault_assessment"],
        after_repair_functional_evidence=analysis_data["after_repair_functional_evidence"],
        media_quality=analysis_data["media_quality"],
        missing_evidence=json.dumps(analysis_data["missing_evidence"]),
        inconsistencies=json.dumps(analysis_data["inconsistencies"]),
        ai_recommendation=analysis_data["ai_recommendation"],
        review_requirement=analysis_data["review_requirement"],
        confidence_score=analysis_data["confidence_score"],
        analysis_notes=analysis_data["analysis_notes"],
        model_version=analysis_data["model_version"],
        analysis_timestamp=analysis_data["analysis_timestamp"]
    )
    db.add(job)
    
    audit = AuditLog(
        ticket_id=ticket.id,
        action="AI_ANALYSIS_TRIGGERED",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "provider": provider,
            "model": model_name,
            "ai_recommendation": analysis_data["ai_recommendation"],
            "confidence": analysis_data["confidence_score"]
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(job)

    # In-App notification: Notify department supervisors
    try:
        from app.services.in_app_notification_service import InAppNotificationService
        rec_display = str(analysis_data.get("ai_recommendation", "inconclusive")).replace("_", " ").title()
        InAppNotificationService.notify_department_supervisors(
            db=db,
            department_id=ticket.department_id,
            event_type="AI_VERIFICATION_COMPLETE",
            title=f"AI Verification Complete: {ticket.ticket_number}",
            message=f"{ticket.title} (Room {ticket.room_number}) ready for supervisor sign-off. AI recommendation: {rec_display}.",
            ticket=ticket,
            destination_link=f"/ai-verify?ticket={ticket.id}",
            dedup_prefix=f"AI_VERIFY:{job.id}"
        )
    except Exception as ne:
        pass

    resp = parse_job_response(job)
    resp["visual_observations"] = analysis_data.get("visual_observations", [])
    resp["before_after_differences"] = analysis_data.get("before_after_differences", [])
    resp["recommended_next_action"] = analysis_data.get("recommended_next_action", "")
    resp["safety_disclaimer"] = analysis_data.get("safety_disclaimer", "")
    return resp

@router.post("/{job_id}/review")
def review_verification(
    job_id: int,
    payload: AIHumanReviewRequest,
    current_user: User = Depends(require_roles("admin", "supervisor")),
    db: Session = Depends(get_db)
):
    """
    Supervisor or Admin human sign-off / override on AI verification.
    If overruling AI recommendation, requires documented justification!
    """
    job = db.query(AIVerificationJob).filter(AIVerificationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="AI Verification Job not found")
        
    ticket = db.query(Ticket).filter(Ticket.id == job.ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Associated ticket not found")

    # Check department scoping if supervisor
    if current_user.role == "supervisor" and current_user.department_id:
        if ticket.department_id != current_user.department_id:
            raise HTTPException(status_code=403, detail="Unauthorized: Ticket belongs to a different department.")
        
    # Check if this is an override of the AI recommendation
    is_override = (
        (payload.decision == "approved" and job.ai_recommendation != "likely_resolved") or
        (payload.decision == "rejected" and job.ai_recommendation == "likely_resolved")
    )
    
    if is_override and not (payload.override_reason and payload.override_reason.strip()):
        raise HTTPException(
            status_code=400,
            detail="Mandatory requirement: You must provide a documented rationale when overruling the AI system's assessment."
        )
        
    job.human_decision = payload.decision
    job.human_reviewer_id = current_user.id
    job.human_review_notes = payload.notes
    job.human_override_reason = payload.override_reason
    job.human_reviewed_at = datetime.now(timezone.utc)
    
    # If supervisor approves, and ticket is ready, advance ticket to completed/closed
    from app.services.in_app_notification_service import InAppNotificationService

    if payload.decision == "approved":
        if ticket.status in ["resolution_submitted", "work_completed"]:
            ticket.status = "closed"
            ticket.closed_at = datetime.now(timezone.utc)
            ticket.is_escalated = False

        if ticket.assigned_staff_id:
            InAppNotificationService.notify_assigned_staff(
                db=db,
                ticket=ticket,
                event_type="TASK_APPROVED",
                title=f"Task Approved: {ticket.ticket_number}",
                message=f"Supervisor {current_user.name} approved your resolution for Room {ticket.room_number}.",
                dedup_key=f"VERIFY_APPROVE_STAFF:{job.id}:{ticket.id}"
            )
        if ticket.patient_user_id:
            InAppNotificationService.notify_patient(
                db=db,
                ticket=ticket,
                event_type="PATIENT_TICKET_CLOSED",
                title="Service Request Resolved & Closed",
                message=f"Your request #{ticket.ticket_number} (Room {ticket.room_number}) has been inspected and closed.",
                dedup_key=f"VERIFY_APPROVE_PATIENT:{job.id}:{ticket.id}"
            )
    elif payload.decision == "rejected":
        # Return task for correction
        ticket.status = "in_progress"
        if ticket.assigned_staff_id:
            InAppNotificationService.notify_assigned_staff(
                db=db,
                ticket=ticket,
                event_type="TASK_RETURNED_FOR_CORRECTION",
                title=f"Task Returned for Correction: {ticket.ticket_number}",
                message=f"Supervisor {current_user.name} requested corrections for Room {ticket.room_number}: {payload.notes or 'Please address issues and resubmit evidence.'}",
                dedup_key=f"VERIFY_REJECT_STAFF:{job.id}:{ticket.id}"
            )
            
    audit = AuditLog(
        ticket_id=ticket.id,
        action="AI_VERIFICATION_HUMAN_REVIEW",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "job_id": job.id,
            "decision": payload.decision,
            "is_override": is_override,
            "override_reason": payload.override_reason,
            "notes": payload.notes
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(job)
    return parse_job_response(job)
