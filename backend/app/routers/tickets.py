import asyncio
from datetime import datetime, timezone, timedelta
import json
import re
from typing import Optional, List
import uuid

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from jose import jwt, JWTError

from app.config import settings
from app.database import get_db
from app.models import (
    Ticket, User, Department, Room, Evidence, AIVerificationJob,
    TicketNote, AuditLog, DepartmentSupervisor
)
from app.schemas import (
    TicketResponse, StaffTicketCreate, TicketAcknowledgeRequest,
    TicketStartWorkRequest, TicketResolutionSubmitRequest,
    TicketClosureRequest, TicketDelayReportRequest, TicketNoteCreate,
    TicketNoteResponse, TicketContactUpdateRequest, FollowupEmailRequest,
    TicketAssignRequest, TicketTransferDepartmentRequest
)
from app.services.auth_service import get_current_user
from app.services.ticket_service import TicketService
from app.services.sla_engine import SLAEngine
from app.services.realtime_service import realtime_hub
from app.services.email_service import EmailService

router = APIRouter(prefix="/tickets", tags=["Ticket Operations"])

def get_supervisor_authorized_departments(user: User, db: Session) -> List[str]:
    """Resolves all department IDs where this supervisor has oversight authority."""
    sup_depts = [r.department_id for r in db.query(DepartmentSupervisor).filter(DepartmentSupervisor.user_id == user.id).all()]
    if user.department_id and user.department_id not in sup_depts:
        sup_depts.append(user.department_id)
    depts_where_sup = db.query(Department.id).filter(Department.supervisor_id == user.id).all()
    for (d_id,) in depts_where_sup:
        if d_id not in sup_depts:
            sup_depts.append(d_id)
    return sup_depts

def serialize_ticket_for_event(ticket: Ticket, db: Session) -> dict:
    """Helper to convert Ticket ORM to a strictly JSON-serializable dict for realtime SSE streaming"""
    staff_name = ticket.assigned_staff.name if ticket.assigned_staff else None
    supervisor_name = ticket.assigned_supervisor.name if ticket.assigned_supervisor else None
    
    latest_ai = db.query(AIVerificationJob).filter(
        AIVerificationJob.ticket_id == ticket.id
    ).order_by(AIVerificationJob.created_at.desc()).first()
    
    evidences = db.query(Evidence).filter(Evidence.ticket_id == ticket.id).all()
    notes = db.query(TicketNote).filter(TicketNote.ticket_id == ticket.id).order_by(TicketNote.created_at.asc()).all()
    
    return {
        "id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "title": ticket.title,
        "description": ticket.description,
        "voice_recording_url": ticket.voice_recording_url,
        "voice_transcription": ticket.voice_transcription,
        "department_id": ticket.department_id,
        "room_id": ticket.room_id,
        "room_number": ticket.room_number,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "is_escalated": ticket.is_escalated,
        "escalation_level": ticket.escalation_level,
        "escalation_reason": ticket.escalation_reason,
        "assigned_staff_id": ticket.assigned_staff_id,
        "assigned_staff_name": staff_name,
        "assigned_supervisor_id": ticket.assigned_supervisor_id,
        "assigned_supervisor_name": supervisor_name,
        "sla_acknowledgement_deadline": ticket.sla_acknowledgement_deadline.isoformat() if ticket.sla_acknowledgement_deadline else None,
        "sla_resolution_deadline": ticket.sla_resolution_deadline.isoformat() if ticket.sla_resolution_deadline else None,
        "acknowledged_at": ticket.acknowledged_at.isoformat() if ticket.acknowledged_at else None,
        "in_progress_at": ticket.in_progress_at.isoformat() if ticket.in_progress_at else None,
        "resolution_submitted_at": ticket.resolution_submitted_at.isoformat() if ticket.resolution_submitted_at else None,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
        "resolution_summary": ticket.resolution_summary,
        "parts_replaced": ticket.parts_replaced,
        "functional_test_notes": ticket.functional_test_notes,
        "delay_reason": ticket.delay_reason,
        "revised_eta": ticket.revised_eta.isoformat() if ticket.revised_eta else None,
        "patient_contact": ticket.patient_contact,
        "patient_email": ticket.patient_email,
        "patient_tracking_token": ticket.patient_tracking_token,
        "patient_feedback_rating": ticket.patient_feedback_rating,
        "patient_feedback_comment": ticket.patient_feedback_comment,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
        "evidences": [
            {
                "id": e.id,
                "stage": e.stage,
                "media_type": e.media_type,
                "file_url": e.file_url,
                "thumbnail_url": e.thumbnail_url,
                "notes": e.notes
            }
            for e in evidences
        ],
        "latest_ai_verification": {
            "id": latest_ai.id,
            "status": latest_ai.status,
            "ai_recommendation": latest_ai.ai_recommendation,
            "confidence_score": latest_ai.confidence_score,
            "analysis_notes": latest_ai.analysis_notes
        } if latest_ai else None,
        "notes": [
            {
                "id": n.id,
                "author_id": n.author_id,
                "author_name": n.author_name,
                "content": n.content,
                "is_internal": n.is_internal,
                "created_at": n.created_at.isoformat() if n.created_at else None
            }
            for n in notes
        ]
    }

def enrich_ticket_response(ticket: Ticket, db: Session) -> dict:
    """Helper to convert Ticket ORM to response dict with staff names and latest AI job for Pydantic schema"""
    staff_name = ticket.assigned_staff.name if ticket.assigned_staff else None
    supervisor_name = ticket.assigned_supervisor.name if ticket.assigned_supervisor else None
    
    latest_ai = db.query(AIVerificationJob).filter(
        AIVerificationJob.ticket_id == ticket.id
    ).order_by(AIVerificationJob.created_at.desc()).first()
    
    evidences = db.query(Evidence).filter(Evidence.ticket_id == ticket.id).all()
    notes = db.query(TicketNote).filter(TicketNote.ticket_id == ticket.id).order_by(TicketNote.created_at.asc()).all()
    
    return {
        "id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "title": ticket.title,
        "description": ticket.description,
        "voice_recording_url": ticket.voice_recording_url,
        "voice_transcription": ticket.voice_transcription,
        "department_id": ticket.department_id,
        "room_id": ticket.room_id,
        "room_number": ticket.room_number,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "is_escalated": ticket.is_escalated,
        "escalation_level": ticket.escalation_level,
        "escalation_reason": ticket.escalation_reason,
        "assigned_staff_id": ticket.assigned_staff_id,
        "assigned_staff_name": staff_name,
        "assigned_supervisor_id": ticket.assigned_supervisor_id,
        "assigned_supervisor_name": supervisor_name,
        "sla_acknowledgement_deadline": ticket.sla_acknowledgement_deadline,
        "sla_resolution_deadline": ticket.sla_resolution_deadline,
        "acknowledged_at": ticket.acknowledged_at,
        "in_progress_at": ticket.in_progress_at,
        "resolution_submitted_at": ticket.resolution_submitted_at,
        "closed_at": ticket.closed_at,
        "resolution_summary": ticket.resolution_summary,
        "parts_replaced": ticket.parts_replaced,
        "functional_test_notes": ticket.functional_test_notes,
        "delay_reason": ticket.delay_reason,
        "revised_eta": ticket.revised_eta,
        "patient_contact": ticket.patient_contact,
        "patient_email": ticket.patient_email,
        "patient_tracking_token": ticket.patient_tracking_token,
        "patient_feedback_rating": ticket.patient_feedback_rating,
        "patient_feedback_comment": ticket.patient_feedback_comment,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "evidences": evidences,
        "latest_ai_verification": latest_ai,
        "notes": notes
    }

@router.get("/stream")
async def stream_tickets(
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Authenticated Server-Sent Events (SSE) real-time stream for hospital staff and administrators.
    Pushes incoming complaints and state transitions instantly without requiring manual page refresh.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required for staff operational stream"
        )
        
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("context") == "patient" or str(payload.get("role", "")).startswith("patient"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient sessions are not permitted on staff operational stream"
            )
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token for streaming")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive or not found")

    queue = await realtime_hub.subscribe_staff(
        user_id=user.id,
        role=user.role,
        department_id=user.department_id
    )

    async def event_generator():
        try:
            # Initial connection confirmation
            init_data = {
                "event": "connected",
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "role": user.role,
                    "department_id": user.department_id
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            yield f"event: connected\ndata: {json.dumps(init_data)}\n\n"

            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield msg
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await realtime_hub.unsubscribe_staff(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("", response_model=List[TicketResponse])
def get_tickets(
    department_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = None,
    is_escalated: Optional[bool] = None,
    assigned_to_me: Optional[bool] = False,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Authenticated operational tickets listing with multi-parameter filtering"""
    query = db.query(Ticket)
    
    # Role-Based Scoping:
    # 1. Staff strictly sees ONLY tasks assigned to them (Section 2, 5 & 6)
    if current_user.role == "staff":
        query = query.filter(Ticket.assigned_staff_id == current_user.id)
    # 2. Supervisors see all tasks for their authorized departments
    elif current_user.role == "supervisor":
        sup_depts = get_supervisor_authorized_departments(current_user, db)
        if department_id and department_id in sup_depts:
            query = query.filter(Ticket.department_id == department_id)
        else:
            query = query.filter(Ticket.department_id.in_(sup_depts))
        if assigned_to_me:
            query = query.filter(Ticket.assigned_staff_id == current_user.id)
    # 3. Admins & SuperAdmins see system-wide tasks
    else:
        if assigned_to_me:
            query = query.filter(Ticket.assigned_staff_id == current_user.id)
        elif department_id:
            query = query.filter(Ticket.department_id == department_id)
        
    if status_filter:
        query = query.filter(Ticket.status == status_filter)
        
    if priority:
        query = query.filter(Ticket.priority == priority)
        
    if is_escalated is not None:
        query = query.filter(Ticket.is_escalated == is_escalated)
        
    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Ticket.ticket_number.ilike(search_term),
                Ticket.title.ilike(search_term),
                Ticket.description.ilike(search_term),
                Ticket.room_number.ilike(search_term),
                Ticket.category.ilike(search_term)
            )
        )
        
    tickets = query.order_by(desc(Ticket.created_at)).offset(skip).limit(limit).all()
    return [enrich_ticket_response(t, db) for t in tickets]

def check_ticket_access(ticket: Ticket, user: User, db: Optional[Session] = None):
    if user.role in ["admin", "superadmin"]:
        return
    if user.role == "supervisor":
        sup_depts = get_supervisor_authorized_departments(user, db) if db else ([user.department_id] if user.department_id else [])
        if ticket.department_id not in sup_depts and ticket.assigned_supervisor_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access restricted: Ticket belongs to a department ('{ticket.department_id}') you do not supervise."
            )
        return
    if user.role == "staff":
        if ticket.assigned_staff_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access restricted: Staff can only access requests assigned to them."
            )
        return
    if user.role == "patient":
        if ticket.patient_user_id != user.id and ticket.patient_contact != user.phone and ticket.patient_email != user.email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access restricted: You can only view your own service requests."
            )

@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket_detail(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    check_ticket_access(ticket, current_user, db)
    return enrich_ticket_response(ticket, db)

@router.post("/{ticket_id}/assign", response_model=TicketResponse)
async def assign_ticket(
    ticket_id: int,
    payload: TicketAssignRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Supervisor assigns an incoming service request to an eligible department staff member.
    Enforces supervisor department authorization, staff eligibility, and optimistic concurrency lock.
    """
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if current_user.role not in ["supervisor", "admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Only supervisors and administrators can assign tasks.")

    updated = TicketService.assign_ticket(
        db=db,
        ticket=ticket,
        supervisor=current_user,
        staff_id=payload.staff_id,
        expected_assigned_staff_id=payload.expected_assigned_staff_id,
        note=payload.note
    )

    # Real-time event dispatch to assigned staff and department supervisors
    try:
        await realtime_hub.publish_ticket_updated(serialize_ticket_for_event(updated, db))
    except Exception:
        pass

    return enrich_ticket_response(updated, db)

@router.post("/{ticket_id}/transfer-department", response_model=TicketResponse)
async def transfer_ticket_department(
    ticket_id: int,
    payload: TicketTransferDepartmentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Supervisor or Admin transfers a ticket to another department.
    Used when a client/patient accidentally selected the wrong department or reported another problem.
    """
    if current_user.role not in ["supervisor", "admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Only supervisors and administrators can transfer tickets across departments.")

    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    new_dept = db.query(Department).filter(Department.id == payload.new_department_id).first()
    if not new_dept:
        raise HTTPException(status_code=400, detail="Target department does not exist")

    old_dept_id = ticket.department_id
    if old_dept_id == new_dept.id:
        raise HTTPException(status_code=400, detail="Ticket is already assigned to this department")

    old_dept = db.query(Department).filter(Department.id == old_dept_id).first()
    old_dept_name = old_dept.name if old_dept else old_dept_id

    # 1. Update ticket department & supervisor
    ticket.department_id = new_dept.id
    ticket.assigned_supervisor_id = new_dept.supervisor_id
    ticket.assigned_staff_id = None
    ticket.assigned_at = None
    ticket.status = "submitted"

    # Recalculate SLA resolution target for new department
    try:
        ack_dl, res_dl = SLAEngine.calculate_deadlines(db, new_dept.id, ticket.priority)
        ticket.sla_acknowledgement_deadline = ack_dl
        ticket.sla_resolution_deadline = res_dl
    except Exception:
        pass

    # 2. Add audit log
    transfer_note = payload.reason.strip() if payload.reason else "Client reported issue under wrong department by error; re-routed."
    audit = AuditLog(
        ticket_id=ticket.id,
        user_id=current_user.id,
        action="TICKET_DEPARTMENT_TRANSFERRED",
        details=json.dumps({
            "from_department": old_dept_id,
            "to_department": new_dept.id,
            "transferred_by": current_user.name,
            "reason": transfer_note
        })
    )
    db.add(audit)

    # 3. Add TicketNote
    note = TicketNote(
        ticket_id=ticket.id,
        user_id=current_user.id,
        author_name=current_user.name,
        author_role=current_user.role,
        note_type="system",
        content=f"🔄 Department Re-routed: Transferred from {old_dept_name} to {new_dept.name}. Reason: {transfer_note}"
    )
    db.add(note)

    db.commit()
    db.refresh(ticket)

    # 4. In-App Notifications: Alert new department supervisor
    try:
        from app.services.in_app_notification_service import InAppNotificationService
        InAppNotificationService.notify_department_supervisors(
            db=db,
            department_id=new_dept.id,
            event_type="TICKET_TRANSFERRED",
            title=f"Re-routed Ticket: {ticket.ticket_number}",
            message=f"Ticket re-routed to {new_dept.name} from {old_dept_name}. Reason: {transfer_note}",
            ticket=ticket,
            dedup_prefix=f"TRANSFERRED:{ticket.id}:{new_dept.id}"
        )
    except Exception:
        pass

    # 5. Real-time event dispatch
    try:
        await realtime_hub.publish_ticket_updated(serialize_ticket_for_event(ticket, db))
    except Exception:
        pass

    return enrich_ticket_response(ticket, db)

@router.post("", response_model=TicketResponse)
async def create_staff_ticket(
    payload: StaffTicketCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dept = db.query(Department).filter(Department.id == payload.department_id).first()
    if not dept:
        raise HTTPException(status_code=400, detail="Invalid department")
        
    ack_dl, res_dl = SLAEngine.calculate_deadlines(db, dept.id, payload.priority)
    ticket_number = TicketService.generate_ticket_number(db, dept.code)
    
    assigned_staff_id = payload.assigned_staff_id
    if not assigned_staff_id:
        auto_staff = TicketService.auto_assign_staff(db, dept.id)
        if auto_staff:
            assigned_staff_id = auto_staff.id
            
    patient_email = payload.patient_email.strip() if payload.patient_email and payload.patient_email.strip() else None
    patient_contact = payload.patient_contact.strip() if payload.patient_contact and payload.patient_contact.strip() else None
    tracking_token = uuid.uuid4().hex[:12]

    ticket = Ticket(
        ticket_number=ticket_number,
        title=payload.title,
        description=payload.description,
        department_id=dept.id,
        room_id=payload.room_id,
        room_number=payload.room_number,
        category=payload.category,
        priority=payload.priority,
        status="assigned" if assigned_staff_id else "submitted",
        assigned_staff_id=assigned_staff_id,
        assigned_supervisor_id=dept.supervisor_id,
        sla_acknowledgement_deadline=ack_dl,
        sla_resolution_deadline=res_dl,
        patient_email=patient_email,
        patient_contact=patient_contact,
        patient_tracking_token=tracking_token
    )
    db.add(ticket)
    db.flush()
    
    audit = AuditLog(
        ticket_id=ticket.id,
        action="TICKET_CREATED_STAFF",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"title": payload.title, "priority": payload.priority, "patient_email": patient_email})
    )
    db.add(audit)
    db.commit()
    db.refresh(ticket)

    # Healthcare Outbound Email Dispatch
    try:
        EmailService.on_ticket_created(db, ticket)
    except Exception:
        pass

    # Real-time event dispatch
    try:
        await realtime_hub.publish_ticket_created(serialize_ticket_for_event(ticket, db))
    except Exception:
        pass

    return enrich_ticket_response(ticket, db)

@router.post("/{ticket_id}/acknowledge", response_model=TicketResponse)
async def acknowledge_ticket(
    ticket_id: int,
    payload: Optional[TicketAcknowledgeRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if current_user.role == "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patients cannot perform staff ticket operations.")
    check_ticket_access(ticket, current_user, db)
    note = payload.note if payload else None
    updated = TicketService.acknowledge_ticket(db, ticket, current_user, note)

    # Real-time event dispatch
    try:
        await realtime_hub.publish_ticket_updated(serialize_ticket_for_event(updated, db))
    except Exception:
        pass

    return enrich_ticket_response(updated, db)

@router.post("/{ticket_id}/start-work", response_model=TicketResponse)
async def start_work(
    ticket_id: int,
    payload: Optional[TicketStartWorkRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if current_user.role == "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patients cannot perform staff ticket operations.")
    check_ticket_access(ticket, current_user, db)
    note = payload.note if payload else None
    updated = TicketService.start_work(db, ticket, current_user, note)

    # Real-time event dispatch
    try:
        await realtime_hub.publish_ticket_updated(serialize_ticket_for_event(updated, db))
    except Exception:
        pass

    return enrich_ticket_response(updated, db)

@router.post("/{ticket_id}/submit-resolution", response_model=TicketResponse)
async def submit_resolution(
    ticket_id: int,
    payload: TicketResolutionSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if current_user.role == "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patients cannot perform staff ticket operations.")
    check_ticket_access(ticket, current_user, db)
    updated = TicketService.submit_resolution(
        db, ticket, current_user, 
        payload.resolution_summary, 
        payload.parts_replaced, 
        payload.functional_test_notes
    )

    # Real-time event dispatch
    try:
        await realtime_hub.publish_ticket_updated(serialize_ticket_for_event(updated, db))
    except Exception:
        pass

    return enrich_ticket_response(updated, db)

@router.post("/{ticket_id}/close", response_model=TicketResponse)
async def close_ticket(
    ticket_id: int,
    payload: TicketClosureRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    updated = TicketService.close_ticket(db, ticket, current_user, payload.approval_note)

    # Real-time event dispatch
    try:
        await realtime_hub.publish_ticket_updated(serialize_ticket_for_event(updated, db))
    except Exception:
        pass

    return enrich_ticket_response(updated, db)

@router.post("/{ticket_id}/delay-report", response_model=TicketResponse)
async def report_delay(
    ticket_id: int,
    payload: TicketDelayReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if current_user.role == "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patients cannot perform staff ticket operations.")
    check_ticket_access(ticket, current_user, db)
        
    ticket.delay_reason = payload.delay_reason
    ticket.revised_eta = datetime.now(timezone.utc) + timedelta(minutes=payload.revised_eta_minutes)
    
    note = TicketNote(
        ticket_id=ticket.id,
        author_id=current_user.id,
        author_name=current_user.name,
        content=f"Delay Logged: {payload.delay_reason}. Revised ETA: +{payload.revised_eta_minutes} mins.",
        is_internal=True
    )
    db.add(note)
    
    audit = AuditLog(
        ticket_id=ticket.id,
        action="DELAY_RECORDED",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"reason": payload.delay_reason, "revised_minutes": payload.revised_eta_minutes})
    )
    db.add(audit)
    db.commit()
    db.refresh(ticket)

    # Real-time event dispatch
    try:
        await realtime_hub.publish_ticket_updated(serialize_ticket_for_event(ticket, db))
    except Exception:
        pass

    return enrich_ticket_response(ticket, db)

@router.post("/{ticket_id}/notes", response_model=TicketNoteResponse)
def add_note(
    ticket_id: int,
    payload: TicketNoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    check_ticket_access(ticket, current_user, db)
        
    note = TicketNote(
        ticket_id=ticket.id,
        author_id=current_user.id,
        author_name=current_user.name,
        content=payload.content,
        is_internal=payload.is_internal
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note

@router.put("/{ticket_id}/contact", response_model=TicketResponse)
async def update_ticket_contact(
    ticket_id: int,
    payload: TicketContactUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    check_ticket_access(ticket, current_user, db)
    
    if current_user.role not in ["admin", "superadmin", "supervisor"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only supervisors and administrators are authorized to update patient contact information."
        )
    
    if payload.patient_email is not None:
        clean_email = payload.patient_email.strip().lower()
        if clean_email:
            if not EMAIL_REGEX.match(clean_email):
                raise HTTPException(status_code=400, detail="Invalid email format. Please provide a valid address.")
            ticket.patient_email = clean_email
        else:
            ticket.patient_email = None

    if payload.patient_contact is not None:
        ticket.patient_contact = payload.patient_contact.strip() or None
        
    if not ticket.patient_tracking_token:
        ticket.patient_tracking_token = uuid.uuid4().hex[:12]
        
    audit = AuditLog(
        ticket_id=ticket.id,
        action="CONTACT_UPDATED",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"patient_email": ticket.patient_email, "patient_contact": ticket.patient_contact})
    )
    db.add(audit)
    db.commit()
    db.refresh(ticket)
    
    if payload.resend_email and ticket.patient_email:
        try:
            EmailService.on_ticket_created(db, ticket)
        except Exception:
            pass
            
    try:
        await realtime_hub.publish_ticket_updated(serialize_ticket_for_event(ticket, db))
    except Exception:
        pass
        
    return enrich_ticket_response(ticket, db)

@router.post("/{ticket_id}/send-followup-email")
async def send_followup_email(
    ticket_id: int,
    payload: FollowupEmailRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Maintenance staff do not have access to manual email dispatch. Client emails are sent automatically when work is started or finished."
        )
    check_ticket_access(ticket, current_user)
    
    recipient = (payload.recipient_email or ticket.patient_email or "").strip()
    if not recipient:
        raise HTTPException(status_code=400, detail="No client email specified or saved for this ticket. Please enter a valid email address.")
        
    stage = payload.stage
    notes = payload.custom_notes
    success = False
    
    if stage == "work_started":
        log = EmailService.send_work_started_email(
            db, ticket,
            actor_name=current_user.name,
            update_note=notes,
            recipient=recipient
        )
        success = bool(log and log.status != "failed")
    elif stage == "work_finished":
        log = EmailService.send_work_completed_email(
            db, ticket,
            actor_name=current_user.name,
            summary=notes or ticket.resolution_summary or "Work completed successfully by assigned technician.",
            recipient=recipient
        )
        success = bool(log and log.status != "failed")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid stage '{stage}'. Must be 'work_started' or 'work_finished'.")
        
    audit = AuditLog(
        ticket_id=ticket.id,
        action="FOLLOWUP_EMAIL_SENT",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"stage": stage, "recipient": recipient, "success": success})
    )
    db.add(audit)
    db.commit()
    
    return {
        "status": "success" if success else "failed",
        "stage": stage,
        "recipient": recipient,
        "message": f"Follow-up email for '{stage}' sent to {recipient}" if success else f"Email attempt to {recipient} failed. Verify SMTP settings in Admin."
    }
