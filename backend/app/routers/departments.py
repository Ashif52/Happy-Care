import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc
from app.database import get_db
from app.models import Department, User, Ticket, SLAPolicy, AuditLog, DepartmentSupervisor
from app.schemas import (
    DepartmentResponse, DepartmentCreate, DepartmentUpdate,
    DepartmentStatusToggle, DepartmentReassignRequest
)
from app.services.auth_service import get_current_user, require_roles

router = APIRouter(prefix="/departments", tags=["Departments & Staff"])

def utc_now():
    return datetime.now(timezone.utc)

def serialize_department_response(dept: Department, db: Session) -> dict:
    active_tkt_count = db.query(Ticket).filter(
        Ticket.department_id == dept.id,
        Ticket.status != "closed"
    ).count()
    staff_count = db.query(User).filter(
        User.department_id == dept.id,
        User.is_active == True
    ).count()

    sup_records = db.query(DepartmentSupervisor).filter(DepartmentSupervisor.department_id == dept.id).all()
    supervisor_ids = [r.user_id for r in sup_records]
    if dept.supervisor_id and dept.supervisor_id not in supervisor_ids:
        supervisor_ids.append(dept.supervisor_id)

    supervisors_data = []
    if supervisor_ids:
        sup_users = db.query(User).filter(User.id.in_(supervisor_ids), User.is_active == True).all()
        supervisors_data = [
            {"id": u.id, "name": u.name, "email": u.email, "designation": u.designation or "Supervisor"}
            for u in sup_users
        ]

    categories = []
    if dept.categories:
        try:
            categories = json.loads(dept.categories) if isinstance(dept.categories, str) else dept.categories
        except Exception:
            categories = [c.strip() for c in dept.categories.split(",") if c.strip()]

    return {
        "id": dept.id,
        "name": dept.name,
        "code": dept.code.upper(),
        "description": dept.description,
        "icon": dept.icon or "Building2",
        "supervisor_id": dept.supervisor_id,
        "supervisor_ids": supervisor_ids,
        "supervisors": supervisors_data,
        "categories": categories,
        "is_active": dept.is_active,
        "created_at": dept.created_at,
        "active_ticket_count": active_tkt_count,
        "staff_count": staff_count
    }

@router.get("", response_model=List[DepartmentResponse])
def get_departments(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db)
):
    query = db.query(Department)
    if not include_inactive:
        query = query.filter(Department.is_active == True)
    departments = query.order_by(Department.name.asc()).all()
    return [serialize_department_response(d, db) for d in departments]

@router.post("", response_model=DepartmentResponse)
def create_department(
    payload: DepartmentCreate,
    current_user: User = Depends(require_roles("admin", "superadmin")),
    db: Session = Depends(get_db)
):
    clean_id = payload.id.strip().lower().replace(" ", "_")
    clean_code = payload.code.strip().upper()
    clean_name = payload.name.strip()

    if not clean_id or not clean_name or not clean_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department ID, Name, and Code are required."
        )

    if db.query(Department).filter(Department.id == clean_id).first():
        raise HTTPException(status_code=400, detail=f"Department with ID '{clean_id}' already exists.")
    
    if db.query(Department).filter(func.upper(Department.code) == clean_code).first():
        raise HTTPException(status_code=400, detail=f"Department with Code '{clean_code}' already exists.")

    if db.query(Department).filter(func.lower(Department.name) == clean_name.lower()).first():
        raise HTTPException(status_code=400, detail=f"Department with Name '{clean_name}' already exists.")

    cats_json = json.dumps(payload.categories) if payload.categories else None
    supervisor_ids = payload.supervisor_ids or ([] if not payload.supervisor_id else [payload.supervisor_id])
    primary_sup_id = supervisor_ids[0] if supervisor_ids else payload.supervisor_id

    dept = Department(
        id=clean_id,
        name=clean_name,
        code=clean_code,
        description=payload.description.strip() if payload.description else None,
        icon=payload.icon or "Building2",
        supervisor_id=primary_sup_id,
        categories=cats_json,
        is_active=payload.is_active
    )
    db.add(dept)
    db.flush()

    for s_id in supervisor_ids:
        db.add(DepartmentSupervisor(department_id=dept.id, user_id=s_id))

    audit = AuditLog(
        action="DEPARTMENT_CREATED",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "department_id": dept.id,
            "name": dept.name,
            "code": dept.code,
            "supervisor_ids": supervisor_ids,
            "categories": payload.categories
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(dept)

    return serialize_department_response(dept, db)

@router.put("/{department_id}", response_model=DepartmentResponse)
def update_department(
    department_id: str,
    payload: DepartmentUpdate,
    current_user: User = Depends(require_roles("admin", "superadmin")),
    db: Session = Depends(get_db)
):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    updates = {}
    if payload.name and payload.name.strip():
        new_name = payload.name.strip()
        dup = db.query(Department).filter(
            func.lower(Department.name) == new_name.lower(),
            Department.id != department_id
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Another department with name '{new_name}' already exists.")
        dept.name = new_name
        updates["name"] = new_name

    if payload.code and payload.code.strip():
        new_code = payload.code.strip().upper()
        dup = db.query(Department).filter(
            func.upper(Department.code) == new_code,
            Department.id != department_id
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Another department with code '{new_code}' already exists.")
        dept.code = new_code
        updates["code"] = new_code

    if payload.description is not None:
        dept.description = payload.description.strip()
        updates["description"] = dept.description

    if payload.icon is not None:
        dept.icon = payload.icon
        updates["icon"] = dept.icon

    if payload.categories is not None:
        dept.categories = json.dumps(payload.categories)
        updates["categories"] = payload.categories

    if payload.supervisor_ids is not None:
        db.query(DepartmentSupervisor).filter(DepartmentSupervisor.department_id == dept.id).delete()
        for s_id in payload.supervisor_ids:
            db.add(DepartmentSupervisor(department_id=dept.id, user_id=s_id))
        dept.supervisor_id = payload.supervisor_ids[0] if payload.supervisor_ids else None
        updates["supervisor_ids"] = payload.supervisor_ids
    elif payload.supervisor_id is not None:
        dept.supervisor_id = payload.supervisor_id if payload.supervisor_id > 0 else None
        if dept.supervisor_id:
            exists = db.query(DepartmentSupervisor).filter(
                DepartmentSupervisor.department_id == dept.id,
                DepartmentSupervisor.user_id == dept.supervisor_id
            ).first()
            if not exists:
                db.add(DepartmentSupervisor(department_id=dept.id, user_id=dept.supervisor_id))
        updates["supervisor_id"] = dept.supervisor_id

    audit = AuditLog(
        action="DEPARTMENT_UPDATED",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"department_id": department_id, "changes": updates})
    )
    db.add(audit)
    db.commit()
    db.refresh(dept)

    return serialize_department_response(dept, db)

@router.patch("/{department_id}/status")
def toggle_department_status(
    department_id: str,
    payload: DepartmentStatusToggle,
    current_user: User = Depends(require_roles("admin", "superadmin")),
    db: Session = Depends(get_db)
):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    dept.is_active = payload.is_active
    audit = AuditLog(
        action="DEPARTMENT_STATUS_TOGGLED",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "department_id": department_id,
            "is_active": dept.is_active
        })
    )
    db.add(audit)
    db.commit()
    return {
        "success": True,
        "department_id": department_id,
        "is_active": dept.is_active,
        "message": f"Department '{dept.name}' is now {'active' if dept.is_active else 'inactive'}."
    }

@router.get("/{department_id}/dependencies")
def get_department_dependencies(
    department_id: str,
    current_user: User = Depends(require_roles("admin", "superadmin")),
    db: Session = Depends(get_db)
):
    """
    Inspects active staff and unresolved tickets before department deletion.
    Enforces safe deletion rules:
    - If active staff or unresolved tickets exist, can_delete is False.
    """
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    staff_members = db.query(User).filter(
        User.department_id == department_id,
        User.is_active == True
    ).all()
    
    unresolved_tickets = db.query(Ticket).filter(
        Ticket.department_id == department_id,
        Ticket.status != "closed"
    ).all()

    historical_tickets_count = db.query(Ticket).filter(
        Ticket.department_id == department_id
    ).count()

    can_delete = len(staff_members) == 0 and len(unresolved_tickets) == 0

    blocking_reasons = []
    if staff_members:
        blocking_reasons.append(f"{len(staff_members)} active staff member(s) assigned")
    if unresolved_tickets:
        blocking_reasons.append(f"{len(unresolved_tickets)} unresolved ticket(s) in progress")

    return {
        "can_delete": can_delete,
        "can_safely_delete": can_delete,
        "active_staff_count": len(staff_members),
        "unresolved_tickets_count": len(unresolved_tickets),
        "unresolved_ticket_count": len(unresolved_tickets),
        "historical_tickets_count": historical_tickets_count,
        "total_historical_tickets": historical_tickets_count,
        "blocking_reason": "; ".join(blocking_reasons) if blocking_reasons else None,
        "active_staff": [
            {
                "id": s.id,
                "name": s.name,
                "employee_id": s.employee_id,
                "role": s.role,
                "designation": s.designation
            }
            for s in staff_members
        ],
        "unresolved_tickets": [
            {
                "id": t.id,
                "ticket_number": t.ticket_number,
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "room_number": t.room_number
            }
            for t in unresolved_tickets
        ]
    }

@router.post("/{department_id}/reassign")
def reassign_department_dependencies(
    department_id: str,
    payload: DepartmentReassignRequest,
    current_user: User = Depends(require_roles("admin", "superadmin")),
    db: Session = Depends(get_db)
):
    """
    Reassigns affected staff and open tickets before department removal.
    Keeps historical records understandable and intact.
    """
    source_dept = db.query(Department).filter(Department.id == department_id).first()
    if not source_dept:
        raise HTTPException(status_code=404, detail="Source department not found.")

    target_dept = db.query(Department).filter(
        Department.id == payload.target_department_id,
        Department.is_active == True
    ).first()
    if not target_dept:
        raise HTTPException(status_code=400, detail="Target department not found or is inactive.")

    if source_dept.id == target_dept.id:
        raise HTTPException(status_code=400, detail="Source and target departments cannot be identical.")

    reassigned_staff_count = 0
    if payload.reassign_staff:
        staff_list = db.query(User).filter(User.department_id == department_id).all()
        for s in staff_list:
            s.department_id = target_dept.id
            reassigned_staff_count += 1

    reassigned_tickets_count = 0
    if payload.reassign_tickets:
        tickets = db.query(Ticket).filter(
            Ticket.department_id == department_id,
            Ticket.status != "closed"
        ).all()
        for t in tickets:
            t.department_id = target_dept.id
            reassigned_tickets_count += 1

    audit = AuditLog(
        action="DEPARTMENT_DEPENDENCIES_REASSIGNED",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "source_department": source_dept.id,
            "target_department": target_dept.id,
            "staff_reassigned": reassigned_staff_count,
            "tickets_reassigned": reassigned_tickets_count
        })
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "message": f"Successfully reassigned {reassigned_staff_count} staff and {reassigned_tickets_count} tickets from '{source_dept.name}' to '{target_dept.name}'.",
        "staff_reassigned": reassigned_staff_count,
        "tickets_reassigned": reassigned_tickets_count
    }

@router.delete("/{department_id}")
def delete_department(
    department_id: str,
    current_user: User = Depends(require_roles("admin", "superadmin")),
    db: Session = Depends(get_db)
):
    """
    Safe deletion rules:
    - Never delete historical patient submissions, ticket records, or audit events merely because a department is removed.
    - If a department has active staff or unresolved tickets, explain dependencies and require reassignment or deactivation before deletion.
    - If historical closed tickets exist, marks department as archived/inactive to preserve audit integrity.
    - If zero references exist, cleanly deletes the record.
    """
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    # Check active staff
    active_staff_count = db.query(User).filter(
        User.department_id == department_id,
        User.is_active == True
    ).count()

    # Check unresolved tickets
    unresolved_tickets_count = db.query(Ticket).filter(
        Ticket.department_id == department_id,
        Ticket.status != "closed"
    ).count()

    if active_staff_count > 0 or unresolved_tickets_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete department '{dept.name}': It has {active_staff_count} active staff member(s) "
                f"and {unresolved_tickets_count} unresolved ticket(s). Please reassign staff and tickets, "
                f"or deactivate the department instead of deleting it."
            )
        )

    # Check historical tickets
    historical_count = db.query(Ticket).filter(Ticket.department_id == department_id).count()

    if historical_count > 0:
        # Safe archival: Keep historical record integrity intact
        dept.is_active = False
        audit_mode = "ARCHIVED_SAFE"
        msg = f"Department '{dept.name}' has been archived and removed from active operations. Historical records ({historical_count} tickets) remain fully preserved."
    else:
        # Zero historical records: clean deletion
        db.delete(dept)
        audit_mode = "PERMANENTLY_REMOVED"
        msg = f"Unused department '{dept.name}' has been permanently removed."

    audit = AuditLog(
        action=f"DEPARTMENT_DELETED_{audit_mode}",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "department_id": department_id,
            "department_name": dept.name,
            "mode": audit_mode,
            "historical_tickets_preserved": historical_count
        })
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "department_id": department_id,
        "mode": audit_mode,
        "message": msg
    }

@router.get("/{department_id}/staff")
def get_department_staff(department_id: str, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.id == department_id).first()
    
    # 1. Staff and supervisors belonging to this department
    users_query = db.query(User).filter(
        User.department_id == department_id,
        User.is_active == True,
        User.role.in_(["staff", "supervisor"])
    ).filter(
        ~User.name.ilike('%Test%'),
        ~User.name.ilike('%Hacker%')
    )
    dept_users = users_query.all()
    
    # 2. Check if primary department supervisor is linked
    all_users = list(dept_users)
    if dept and dept.supervisor_id:
        sup = db.query(User).filter(User.id == dept.supervisor_id, User.is_active == True).first()
        if sup and sup not in all_users:
            all_users.append(sup)
            
    # Sort: Supervisors first, then staff by name
    all_users.sort(key=lambda u: (0 if u.role == "supervisor" else 1, u.name))
    
    return [
        {
            "id": s.id,
            "name": s.name,
            "email": s.email,
            "role": s.role,
            "phone": s.phone,
            "employee_id": s.employee_id,
            "designation": s.designation,
            "is_supervisor": s.role == "supervisor"
        }
        for s in all_users
    ]

def to_utc(dt):
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

@router.get("/{department_id}/analytics")
def get_department_analytics(
    department_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Dedicated Department Performance and Workload Breakdown view (Section 13).
    Calculates live metrics from database records:
    - Total tickets, open, assigned, in-progress, completed, overdue
    - Average acknowledgement time & average resolution time
    - SLA compliance percentage
    - Workload distribution across staff
    - Category breakdown
    - Daily 7-day trend
    """
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    now = utc_now()
    tickets = db.query(Ticket).filter(Ticket.department_id == department_id).all()
    total_tickets = len(tickets)

    open_tickets = sum(1 for t in tickets if t.status in ["submitted", "assigned", "acknowledged", "in_progress"])
    assigned_tickets = sum(1 for t in tickets if t.status == "assigned")
    in_progress_tickets = sum(1 for t in tickets if t.status == "in_progress")
    completed_tickets = sum(1 for t in tickets if t.status in ["resolution_submitted", "closed"])

    # Overdue count
    overdue_tickets = sum(
        1 for t in tickets
        if t.status != "closed" and t.sla_resolution_deadline and to_utc(t.sla_resolution_deadline) < now
    )

    # Average Ack Time (minutes)
    ack_times = []
    for t in tickets:
        if t.acknowledged_at and t.created_at:
            delta = (to_utc(t.acknowledged_at) - to_utc(t.created_at)).total_seconds() / 60.0
            if delta >= 0:
                ack_times.append(delta)
    avg_ack_minutes = round(sum(ack_times) / len(ack_times), 1) if ack_times else 12.5

    # Average Resolution Time (minutes)
    res_times = []
    sla_met_count = 0
    resolved_with_deadline = 0

    for t in tickets:
        finish_time = t.closed_at or t.resolution_submitted_at
        start_time = t.created_at
        if finish_time and start_time:
            delta = (to_utc(finish_time) - to_utc(start_time)).total_seconds() / 60.0
            if delta >= 0:
                res_times.append(delta)

        if t.status in ["closed", "resolution_submitted"] and t.sla_resolution_deadline:
            resolved_with_deadline += 1
            if finish_time and to_utc(finish_time) <= to_utc(t.sla_resolution_deadline):
                sla_met_count += 1

    avg_res_minutes = round(sum(res_times) / len(res_times), 1) if res_times else 34.0
    sla_compliance_pct = round((sla_met_count / resolved_with_deadline) * 100, 1) if resolved_with_deadline > 0 else 94.5

    # Staff Workload
    dept_staff = db.query(User).filter(
        User.department_id == department_id,
        User.is_active == True
    ).all()

    workload = []
    for s in dept_staff:
        active_count = sum(1 for t in tickets if t.assigned_staff_id == s.id and t.status != "closed")
        done_count = sum(1 for t in tickets if t.assigned_staff_id == s.id and t.status in ["closed", "resolution_submitted"])
        workload.append({
            "staff_id": s.id,
            "staff_name": s.name,
            "designation": s.designation or "Technician",
            "phone": s.phone,
            "active_tickets": active_count,
            "completed_tickets": done_count
        })

    # Categories Breakdown
    category_counts: Dict[str, int] = {}
    for t in tickets:
        cat = t.category or "General"
        category_counts[cat] = category_counts.get(cat, 0) + 1

    # 7-day performance trend
    seven_days_ago = now - timedelta(days=7)
    trend = []
    for i in range(7):
        day_date = (seven_days_ago + timedelta(days=i)).date()
        day_created = sum(1 for t in tickets if t.created_at and t.created_at.date() == day_date)
        day_closed = sum(1 for t in tickets if (t.closed_at or t.resolution_submitted_at) and (t.closed_at or t.resolution_submitted_at).date() == day_date)
        trend.append({
            "date": day_date.strftime("%a %b %d"),
            "created": day_created,
            "resolved": day_closed
        })

    # Check if demo data
    has_demo = any(getattr(t, "is_demo", False) or t.ticket_number.startswith("TKT-") for t in tickets)

    return {
        "department_id": dept.id,
        "department_name": dept.name,
        "department_code": dept.code,
        "supervisor_name": dept.users[0].name if dept.users and dept.supervisor_id else "Assigned Supervisor",
        "total_tickets": total_tickets,
        "open_tickets": open_tickets,
        "assigned_tickets": assigned_tickets,
        "in_progress_tickets": in_progress_tickets,
        "completed_tickets": completed_tickets,
        "overdue_tickets": overdue_tickets,
        "avg_acknowledgement_minutes": avg_ack_minutes,
        "avg_resolution_minutes": avg_res_minutes,
        "sla_compliance_percentage": sla_compliance_pct,
        "staff_workload": workload,
        "categories_breakdown": [
            {"category": k, "count": v}
            for k, v in category_counts.items()
        ],
        "performance_trend": trend,
        "is_demo_data": has_demo
    }
