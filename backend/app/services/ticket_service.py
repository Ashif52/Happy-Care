from datetime import datetime, timezone, timedelta
import json
import logging
import secrets
import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from app.config import settings
from app.models import (
    Ticket, User, Department, Room, Evidence, AIVerificationJob,
    TicketNote, AuditLog, SLAPolicy
)
from app.services.sla_engine import SLAEngine
from app.services.whatsapp_service import WhatsAppService
from app.services.email_service import EmailService

logger = logging.getLogger("careops.ticket_service")

def utc_now():
    return datetime.now(timezone.utc)

def to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def get_full_tracking_url(ticket: Ticket) -> str:
    base_url = (getattr(settings, "FRONTEND_URL", "") or "https://care-ops-dusky.vercel.app").rstrip("/")
    token_param = f"?token={ticket.patient_tracking_token}" if ticket.patient_tracking_token else ""
    return f"{base_url}/track/{ticket.ticket_number}{token_param}"

class TicketService:
    @staticmethod
    def generate_ticket_number(db: Session, dept_code: str) -> str:
        count = db.query(Ticket).count() + 1
        return f"TKT-{dept_code.upper()}-{count:04d}"

    @staticmethod
    def auto_assign_staff(db: Session, department_id: str) -> Optional[User]:
        """Finds active staff member with lowest active ticket load in the given department"""
        active_staff = db.query(User).filter(
            User.department_id == department_id,
            User.role == "staff",
            User.is_active == True
        ).all()
        
        if not active_staff:
            return None
            
        least_busy_staff = None
        lowest_count = float("inf")
        
        for staff in active_staff:
            active_count = db.query(Ticket).filter(
                Ticket.assigned_staff_id == staff.id,
                Ticket.status.in_(["assigned", "acknowledged", "in_progress"])
            ).count()
            if active_count < lowest_count:
                lowest_count = active_count
                least_busy_staff = staff
                
        return least_busy_staff

    @staticmethod
    def create_patient_ticket(
        db: Session,
        room: Room,
        department: Department,
        category: str,
        description: str,
        voice_url: Optional[str] = None,
        voice_transcription: Optional[str] = None,
        patient_contact: Optional[str] = None,
        photo_url: Optional[str] = None,
        patient_user_id: Optional[int] = None,
        patient_email: Optional[str] = None,
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> Ticket:
        """
        Creates a ticket submitted by a patient to one specific department.
        Per Master Prompt Section 4 & 5:
        - No ordinary staff member is automatically assigned at this stage.
        - Initial status is 'submitted' (unassigned).
        - Routed exclusively to authorized supervisors of the selected department.
        - Exactly-once Patient Email 1 (Request received) is dispatched.
        """
        priority = "high" if department.id in ["medical", "doctors", "nursing"] else "medium"
        ack_dl, res_dl = SLAEngine.calculate_deadlines(db, department.id, priority)
        
        ticket_number = TicketService.generate_ticket_number(db, department.code)
        tracking_token = secrets.token_urlsafe(16)
        
        ticket = Ticket(
            ticket_number=ticket_number,
            title=f"{category} Issue - {room.room_number}",
            description=description,
            voice_recording_url=voice_url,
            voice_transcription=voice_transcription,
            department_id=department.id,
            room_id=room.id,
            room_number=room.room_number,
            category=category,
            priority=priority,
            status="submitted",
            assigned_staff_id=None,
            assigned_supervisor_id=department.supervisor_id,
            assigned_at=None,
            sla_acknowledgement_deadline=ack_dl,
            sla_resolution_deadline=res_dl,
            patient_user_id=patient_user_id,
            patient_contact=patient_contact,
            patient_email=patient_email,
            patient_tracking_token=tracking_token,
            is_demo=getattr(room, "is_demo", False)
        )
        db.add(ticket)
        db.flush()
        
        # Save attachments if provided as initial before-evidence
        if attachments:
            for att in attachments:
                m_type = "video" if str(att.get("media_type", "")).upper() == "VIDEO" else "image"
                evidence = Evidence(
                    ticket_id=ticket.id,
                    stage="before",
                    media_type=m_type,
                    file_url=att.get("file_url"),
                    equipment_type=category,
                    notes=f"Patient attachment: {att.get('file_name', 'media')}",
                    is_demo=ticket.is_demo
                )
                db.add(evidence)
        elif photo_url:
            evidence = Evidence(
                ticket_id=ticket.id,
                stage="before",
                media_type="image",
                file_url=photo_url,
                equipment_type=category,
                notes="Patient submitted photo at ticket creation",
                is_demo=ticket.is_demo
            )
            db.add(evidence)
            
        # Initial patient-visible progress note
        welcome_note = TicketNote(
            ticket_id=ticket.id,
            author_name="CareOps Hospital System",
            content=f"Request received for {department.name}. Awaiting department review.",
            is_internal=False
        )
        db.add(welcome_note)
        
        # Audit log
        audit = AuditLog(
            ticket_id=ticket.id,
            action="TICKET_CREATED_PATIENT_QR",
            actor_name=f"Patient ({room.room_number})",
            actor_role="patient",
            details=json.dumps({
                "room": room.room_number,
                "department_id": department.id,
                "category": category,
                "assigned_staff": "Awaiting Supervisor Assignment",
                "patient_contact": patient_contact
            })
        )
        db.add(audit)
        db.commit()
        db.refresh(ticket)

        # Trigger WhatsApp Event 1: Complaint created
        tracking_url = get_full_tracking_url(ticket)
        try:
            WhatsAppService.on_complaint_created(db, ticket, tracking_url)
        except Exception:
            pass

        # Trigger Outbound Healthcare Email Dispatch (Patient confirmation Email 1 & Supervisor alert)
        try:
            EmailService.on_ticket_created(db, ticket)
        except Exception:
            pass

        # In-App Notifications: Alert department supervisors and administrators
        try:
            from app.services.in_app_notification_service import InAppNotificationService
            InAppNotificationService.notify_department_supervisors(
                db=db,
                department_id=department.id,
                event_type="NEW_TICKET",
                title=f"New Service Request: {ticket.ticket_number}",
                message=f"[{category}] Room {room.room_number}: {description[:120]}",
                ticket=ticket,
                dedup_prefix=f"NEW_TICKET:{ticket.id}"
            )
            InAppNotificationService.notify_administrators(
                db=db,
                event_type="NEW_TICKET",
                title=f"New Request: {ticket.ticket_number}",
                message=f"Department: {department.name} | Room: {room.room_number}",
                department_id=department.id,
                ticket=ticket,
                dedup_prefix=f"ADMIN_NEW_TICKET:{ticket.id}"
            )
            if ticket.patient_user_id:
                InAppNotificationService.notify_patient(
                    db=db,
                    ticket=ticket,
                    event_type="PATIENT_REQUEST_RECEIVED",
                    title="Service Request Received",
                    message=f"Your request #{ticket.ticket_number} for {ticket.category} has been received.",
                    dedup_key=f"PATIENT_RECEIVED:{ticket.id}"
                )
        except Exception as e:
            logger.warning(f"Error creating in-app notification for new ticket: {e}")

        return ticket

    @staticmethod
    def assign_ticket(
        db: Session,
        ticket: Ticket,
        supervisor: User,
        staff_id: int,
        expected_assigned_staff_id: Optional[int] = None,
        note: Optional[str] = None
    ) -> Ticket:
        """
        Supervisor assigns an incoming department request to an eligible department staff member.
        Enforces:
        - Supervisor authorization for ticket.department_id
        - Staff eligibility (must belong to ticket.department_id and be active)
        - Optimistic concurrency locking (409 Conflict if already assigned by another supervisor)
        - Audit trail (TICKET_ASSIGNED / TICKET_REASSIGNED)
        - Staff notification (email & real-time)
        - NO patient email dispatched on assignment
        """
        from app.models import DepartmentSupervisor

        # 1. Supervisor authorization check
        if supervisor.role not in ["admin", "superadmin"]:
            authorized_depts = [r.department_id for r in db.query(DepartmentSupervisor).filter(DepartmentSupervisor.user_id == supervisor.id).all()]
            if supervisor.department_id and supervisor.department_id not in authorized_depts:
                authorized_depts.append(supervisor.department_id)
            dept = db.query(Department).filter(Department.id == ticket.department_id).first()
            if dept and dept.supervisor_id == supervisor.id and ticket.department_id not in authorized_depts:
                authorized_depts.append(ticket.department_id)

            if ticket.department_id not in authorized_depts:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access restricted: You are not authorized to assign tasks for department '{ticket.department_id}'."
                )

        # 2. Staff eligibility check
        staff = db.query(User).filter(User.id == staff_id, User.is_active == True).first()
        if not staff:
            raise HTTPException(status_code=404, detail="Selected staff member not found or account is inactive.")

        if staff.department_id != ticket.department_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot assign task: Staff member '{staff.name}' belongs to department '{staff.department_id}', not '{ticket.department_id}'."
            )

        # 3. Concurrency check
        try:
            locked = db.query(Ticket).filter(Ticket.id == ticket.id).with_for_update().first()
            if locked:
                ticket = locked
        except Exception:
            pass

        if expected_assigned_staff_id != -999:
            expected_id = None if expected_assigned_staff_id in (None, 0) else expected_assigned_staff_id
            if ticket.assigned_staff_id != expected_id:
                assigned_name = ticket.assigned_staff.name if ticket.assigned_staff else "another technician"
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Conflict: This request has already been assigned to {assigned_name}. Please refresh your view."
                )

        old_staff_id = ticket.assigned_staff_id
        old_staff_name = ticket.assigned_staff.name if ticket.assigned_staff else "Unassigned"
        is_reassignment = old_staff_id is not None

        ticket.assigned_staff_id = staff.id
        ticket.assigned_supervisor_id = supervisor.id
        ticket.status = "assigned"
        ticket.assigned_at = utc_now()

        assign_note = TicketNote(
            ticket_id=ticket.id,
            author_id=supervisor.id,
            author_name=supervisor.name,
            content=note or (f"Task assigned to {staff.name} by Supervisor {supervisor.name}." if not is_reassignment else f"Task reassigned from {old_staff_name} to {staff.name} by Supervisor {supervisor.name}."),
            is_internal=True
        )
        db.add(assign_note)

        audit = AuditLog(
            ticket_id=ticket.id,
            action="TICKET_REASSIGNED" if is_reassignment else "TICKET_ASSIGNED",
            actor_id=supervisor.id,
            actor_name=supervisor.name,
            actor_role=supervisor.role,
            details=json.dumps({
                "previous_staff_id": old_staff_id,
                "previous_staff_name": old_staff_name,
                "assigned_staff_id": staff.id,
                "assigned_staff_name": staff.name,
                "supervisor_id": supervisor.id,
                "supervisor_name": supervisor.name,
                "note": note
            })
        )
        db.add(audit)
        db.commit()
        db.refresh(ticket)

        # Send staff assignment notification (Internal staff only, NO patient email)
        try:
            EmailService.send_staff_assignment_notification(db, ticket, staff, supervisor)
        except Exception as e:
            logger.warning(f"Error sending staff assignment email: {e}")

        # In-App notification: Notify assigned staff and confirm with supervisor
        try:
            from app.services.in_app_notification_service import InAppNotificationService
            InAppNotificationService.notify_assigned_staff(
                db=db,
                ticket=ticket,
                event_type="TICKET_ASSIGNED",
                title=f"New Task Assigned: {ticket.ticket_number}",
                message=f"Supervisor {supervisor.name} assigned you to {ticket.title} in Room {ticket.room_number}",
                dedup_key=f"ASSIGN_STAFF:{ticket.id}:{staff.id}"
            )
            InAppNotificationService.create_notification(
                db=db,
                recipient_id=supervisor.id,
                event_type="TICKET_ASSIGNED",
                title=f"Task Assigned: {ticket.ticket_number}",
                message=f"Assigned to {staff.name} for Room {ticket.room_number}",
                ticket_id=ticket.id,
                ticket_number=ticket.ticket_number,
                department_id=ticket.department_id,
                destination_link=f"/my-department?ticket={ticket.id}",
                dedup_key=f"ASSIGN_SUP:{ticket.id}:{staff.id}"
            )
            if is_reassignment and old_staff_id and old_staff_id != staff.id:
                InAppNotificationService.create_notification(
                    db=db,
                    recipient_id=old_staff_id,
                    event_type="TICKET_REASSIGNED",
                    title=f"Task Reassigned: {ticket.ticket_number}",
                    message=f"Task #{ticket.ticket_number} (Room {ticket.room_number}) has been reassigned to {staff.name}.",
                    ticket_id=ticket.id,
                    ticket_number=ticket.ticket_number,
                    department_id=ticket.department_id,
                    destination_link=f"/my-department",
                    dedup_key=f"REASSIGN_OLD:{ticket.id}:{old_staff_id}:{staff.id}"
                )
        except Exception as e:
            logger.warning(f"Error creating in-app notification on assignment: {e}")

        return ticket

    @staticmethod
    def acknowledge_ticket(db: Session, ticket: Ticket, user: User, note: Optional[str] = None) -> Ticket:
        # Idempotent
        if ticket.status in ["acknowledged", "in_progress", "resolution_submitted", "closed"]:
            return ticket

        if ticket.status not in ["submitted", "assigned"]:
            raise HTTPException(status_code=400, detail=f"Cannot acknowledge ticket in '{ticket.status}' status")
            
        now = utc_now()
        ticket.status = "acknowledged"
        ticket.acknowledged_at = now
        ticket.assigned_staff_id = user.id

        # Calculate estimated arrival time: active after acknowledgement
        eta_minutes = 15  # Default arrival SLA
        if ticket.sla_acknowledgement_deadline and ticket.sla_resolution_deadline:
            # Dynamically compute based on remaining resolution time or queue
            remaining_mins = max(10, int((to_utc(ticket.sla_resolution_deadline) - now).total_seconds() / 60))
            eta_minutes = min(20, max(10, remaining_mins // 3))

        ticket.estimated_arrival_minutes = eta_minutes
        ticket.estimated_arrival_at = now + timedelta(minutes=eta_minutes)
        ticket.en_route_at = now
        
        note_entry = TicketNote(
            ticket_id=ticket.id,
            author_id=user.id,
            author_name=user.name,
            content=note or f"Ticket acknowledged by {user.name}. Staff en route to {ticket.room_number} (Estimated arrival: {eta_minutes} mins).",
            is_internal=False
        )
        db.add(note_entry)
        
        audit = AuditLog(
            ticket_id=ticket.id,
            action="TICKET_ACKNOWLEDGED",
            actor_id=user.id,
            actor_name=user.name,
            actor_role=user.role,
            details=json.dumps({
                "acknowledged_at": ticket.acknowledged_at.isoformat(),
                "estimated_arrival_minutes": eta_minutes
            })
        )
        db.add(audit)
        db.commit()
        db.refresh(ticket)

        # Trigger WhatsApp Event 3: Staff acknowledged
        tracking_url = get_full_tracking_url(ticket)
        try:
            WhatsAppService.on_staff_acknowledged(db, ticket, eta_minutes, tracking_url)
        except Exception:
            pass

        # Email Notification: Patient & Staff
        try:
            EmailService.on_ticket_status_updated(db, ticket, "acknowledged", user.name, note)
        except Exception:
            pass

        return ticket

    @staticmethod
    def start_work(db: Session, ticket: Ticket, user: User, note: Optional[str] = None) -> Ticket:
        if ticket.status in ["in_progress", "resolution_submitted", "closed"]:
            return ticket

        if ticket.status not in ["assigned", "acknowledged"]:
            raise HTTPException(status_code=400, detail=f"Cannot start work from '{ticket.status}' status")
            
        now = utc_now()
        ticket.status = "in_progress"
        ticket.in_progress_at = now
        ticket.work_started_at = now
        
        note_entry = TicketNote(
            ticket_id=ticket.id,
            author_id=user.id,
            author_name=user.name,
            content=note or f"Work actively initiated at {ticket.room_number}.",
            is_internal=False
        )
        db.add(note_entry)
        
        audit = AuditLog(
            ticket_id=ticket.id,
            action="TICKET_WORK_STARTED",
            actor_id=user.id,
            actor_name=user.name,
            actor_role=user.role,
            details=json.dumps({"work_started_at": ticket.work_started_at.isoformat()})
        )
        db.add(audit)
        db.commit()
        db.refresh(ticket)

        # Trigger WhatsApp Event 4: Work started
        tracking_url = get_full_tracking_url(ticket)
        try:
            WhatsAppService.on_work_started(db, ticket, tracking_url)
        except Exception:
            pass

        # Email Notification: Client auto-alert on Work Started
        try:
            EmailService.on_ticket_status_updated(db, ticket, "in_progress", user.name, note)
            logger.info(f"Auto-dispatched Work Started email for ticket #{ticket.ticket_number}")
        except Exception as e:
            logger.error(f"Error auto-dispatching Work Started email for ticket #{ticket.ticket_number}: {e}")

        # In-App notification: Notify department supervisors
        try:
            from app.services.in_app_notification_service import InAppNotificationService
            InAppNotificationService.notify_department_supervisors(
                db=db,
                department_id=ticket.department_id,
                event_type="WORK_STARTED",
                title=f"Work Started: {ticket.ticket_number}",
                message=f"Staff member {user.name} has started work on {ticket.title} (Room {ticket.room_number}).",
                ticket=ticket,
                dedup_prefix=f"WORK_STARTED:{ticket.id}"
            )
            if ticket.patient_user_id:
                InAppNotificationService.notify_patient(
                    db=db,
                    ticket=ticket,
                    event_type="PATIENT_WORK_STARTED",
                    title="Staff Working on Your Request",
                    message=f"Staff member {user.name} has begun work on request #{ticket.ticket_number}.",
                    dedup_key=f"PATIENT_STARTED:{ticket.id}"
                )
        except Exception as e:
            logger.warning(f"Error creating in-app notification on work started: {e}")

        return ticket

    @staticmethod
    def submit_resolution(
        db: Session,
        ticket: Ticket,
        user: User,
        summary: str,
        parts: Optional[str] = None,
        test_notes: Optional[str] = None
    ) -> Ticket:
        if ticket.status not in ["in_progress", "acknowledged"]:
            raise HTTPException(status_code=400, detail=f"Cannot submit resolution from '{ticket.status}' status")
            
        now = utc_now()
        ticket.status = "resolution_submitted"
        ticket.resolution_submitted_at = now
        ticket.work_completed_at = now
        ticket.resolution_summary = summary
        ticket.parts_replaced = parts
        ticket.functional_test_notes = test_notes
        
        note_entry = TicketNote(
            ticket_id=ticket.id,
            author_id=user.id,
            author_name=user.name,
            content=f"Resolution submitted: {summary}. Awaiting inspection / sign-off.",
            is_internal=False
        )
        db.add(note_entry)
        
        audit = AuditLog(
            ticket_id=ticket.id,
            action="RESOLUTION_SUBMITTED",
            actor_id=user.id,
            actor_name=user.name,
            actor_role=user.role,
            details=json.dumps({
                "summary": summary,
                "parts": parts,
                "test_notes": test_notes,
                "work_completed_at": ticket.work_completed_at.isoformat()
            })
        )
        db.add(audit)
        db.commit()
        db.refresh(ticket)

        # Trigger WhatsApp Event 5: Work completed
        tracking_url = get_full_tracking_url(ticket)
        try:
            WhatsAppService.on_work_completed(db, ticket, tracking_url)
        except Exception:
            pass

        # Email Notification: Client auto-alert on Work Finished
        try:
            EmailService.on_ticket_status_updated(db, ticket, "resolution_submitted", user.name, summary)
            logger.info(f"Auto-dispatched Work Finished email for ticket #{ticket.ticket_number}")
        except Exception as e:
            logger.error(f"Error auto-dispatching Work Finished email for ticket #{ticket.ticket_number}: {e}")

        # In-App notification: Notify department supervisors that task awaits verification
        try:
            from app.services.in_app_notification_service import InAppNotificationService
            InAppNotificationService.notify_department_supervisors(
                db=db,
                department_id=ticket.department_id,
                event_type="RESOLUTION_SUBMITTED",
                title=f"Task Awaiting Verification: {ticket.ticket_number}",
                message=f"Staff member {user.name} submitted resolution for Room {ticket.room_number}. Ready for review.",
                ticket=ticket,
                destination_link=f"/my-department?ticket={ticket.id}",
                dedup_prefix=f"RESOLUTION_SUBMITTED:{ticket.id}"
            )
            if ticket.patient_user_id:
                InAppNotificationService.notify_patient(
                    db=db,
                    ticket=ticket,
                    event_type="PATIENT_WORK_COMPLETED",
                    title="Work Completed",
                    message=f"Work has been completed for request #{ticket.ticket_number} (Room {ticket.room_number}) and is awaiting inspection.",
                    dedup_key=f"PATIENT_COMPLETED:{ticket.id}"
                )
        except Exception as e:
            logger.warning(f"Error creating in-app notification on resolution submitted: {e}")

        return ticket

    @staticmethod
    def close_ticket(db: Session, ticket: Ticket, user: User, approval_note: Optional[str] = None) -> Ticket:
        if user.role not in ["admin", "supervisor"]:
            raise HTTPException(status_code=403, detail="Final ticket closure requires Supervisor or Administrator authority")
            
        now = utc_now()
        ticket.status = "closed"
        ticket.closed_at = now
        ticket.is_escalated = False
        
        note_entry = TicketNote(
            ticket_id=ticket.id,
            author_id=user.id,
            author_name=user.name,
            content=f"Ticket inspected and officially closed by {user.name} ({user.role.capitalize()}). {approval_note or ''}",
            is_internal=False
        )
        db.add(note_entry)
        
        audit = AuditLog(
            ticket_id=ticket.id,
            action="TICKET_CLOSED",
            actor_id=user.id,
            actor_name=user.name,
            actor_role=user.role,
            details=json.dumps({"closed_at": ticket.closed_at.isoformat(), "approval_note": approval_note})
        )
        db.add(audit)
        db.commit()
        db.refresh(ticket)

        # Trigger WhatsApp Event 6: Ticket closed / Feedback invite
        tracking_url = get_full_tracking_url(ticket)
        try:
            WhatsAppService.on_work_completed(db, ticket, tracking_url)
        except Exception:
            pass

        # Email Notification: Client closure confirmation
        try:
            EmailService.on_ticket_status_updated(db, ticket, "closed", user.name, approval_note)
            logger.info(f"Auto-dispatched ticket closed email for ticket #{ticket.ticket_number}")
        except Exception as e:
            logger.error(f"Error auto-dispatching ticket closed email for ticket #{ticket.ticket_number}: {e}")

        # In-App notification: Notify assigned staff member of approval & closure
        try:
            from app.services.in_app_notification_service import InAppNotificationService
            InAppNotificationService.notify_assigned_staff(
                db=db,
                ticket=ticket,
                event_type="TICKET_CLOSED",
                title=f"Task Approved & Closed: {ticket.ticket_number}",
                message=f"Supervisor {user.name} approved resolution for Room {ticket.room_number}.",
                dedup_key=f"TICKET_CLOSED:{ticket.id}"
            )
            if ticket.patient_user_id:
                InAppNotificationService.notify_patient(
                    db=db,
                    ticket=ticket,
                    event_type="PATIENT_TICKET_CLOSED",
                    title="Service Request Closed",
                    message=f"Your service request #{ticket.ticket_number} has been officially verified and closed.",
                    dedup_key=f"PATIENT_CLOSED:{ticket.id}"
                )
        except Exception as e:
            logger.warning(f"Error creating in-app notification on ticket closed: {e}")

        return ticket
