"""
Enterprise Staff Directory, Account Lifecycle, and Security Administration Router.
Enforces hospital RBAC, audit trails, account lockouts, and prevents privilege escalation.
"""

from datetime import datetime, timezone
import json
import secrets
import string
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, desc, asc
import logging
from app.database import get_db
from app.models import User, Department, AuditLog, Ticket
from app.schemas import (
    StaffCreate, StaffUpdate, StaffActionReason,
    StaffPasswordResetRequest, StaffResponse, StaffListResponse, StaffMetrics,
    UserPermissionsUpdateRequest
)
from app.services.auth_service import get_current_user, get_password_hash
from app.services.rbac_service import (
    has_permission, get_user_permissions, get_role_permissions,
    get_permission_matrix_catalog, get_all_roles_metadata, HOSPITAL_ROLES
)
from app.services.email_service import EmailService

logger = logging.getLogger("careops.staff")
router = APIRouter(prefix="/staff", tags=["Staff & Access Management"])

def utc_now():
    return datetime.now(timezone.utc)

def format_staff_response(u: User, db: Session) -> dict:
    dept_name = None
    if u.department_id:
        dept = db.query(Department).filter(Department.id == u.department_id).first()
        dept_name = dept.name if dept else u.department_id.capitalize()
    
    sup_name = None
    if getattr(u, "supervisor_id", None):
        sup = db.query(User).filter(User.id == u.supervisor_id).first()
        sup_name = sup.name if sup else None
    
    return {
        "id": u.id,
        "employee_id": u.employee_id,
        "name": u.name,
        "email": u.email,
        "phone": u.phone,
        "role": u.role,
        "department_id": u.department_id,
        "department_name": dept_name,
        "supervisor_id": getattr(u, "supervisor_id", None),
        "supervisor_name": sup_name,
        "designation": u.designation or "Hospital Personnel",
        "account_status": getattr(u, "account_status", "active"),
        "is_active": u.is_active,
        "failed_login_attempts": getattr(u, "failed_login_attempts", 0) or 0,
        "locked_at": getattr(u, "locked_at", None),
        "locked_reason": getattr(u, "locked_reason", None),
        "last_login_at": getattr(u, "last_login_at", None),
        "avatar_url": None,
        "created_at": u.created_at,
        "permissions": get_user_permissions(u)
    }

# ----------------- 1. Staff Directory (Search, Filter, Paginated) -----------------
@router.get("", response_model=StaffListResponse)
def list_staff(
    search: Optional[str] = Query(None, description="Search by name, employee ID, email, or designation"),
    department_id: Optional[str] = Query(None, description="Filter by department"),
    role: Optional[str] = Query(None, description="Filter by role"),
    account_status: Optional[str] = Query(None, description="Filter by account status: active, inactive, locked, pending_activation"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not has_permission(current_user, "staff.read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'staff.read'"
        )

    query = db.query(User)

    # Exclude System Superadmin from staff directory for hospital admins and staff
    if current_user.role != "superadmin":
        query = query.filter(User.role != "superadmin")

    # Department scoping for Department Supervisors
    if current_user.role == "supervisor" and not has_permission(current_user, "staff.create"):
        query = query.filter(User.department_id == current_user.department_id)

    # Apply Filters
    if department_id and department_id != "all":
        query = query.filter(User.department_id == department_id)
        
    if role and role != "all":
        query = query.filter(User.role == role)
        
    if account_status and account_status != "all":
        query = query.filter(User.account_status == account_status)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(User.name).like(term),
                func.lower(User.email).like(term),
                func.lower(User.employee_id).like(term),
                func.lower(User.designation).like(term)
            )
        )

    # Global Live Metrics
    metrics_base = db.query(User)
    if current_user.role != "superadmin":
        metrics_base = metrics_base.filter(User.role != "superadmin")
    if current_user.role == "supervisor" and not has_permission(current_user, "staff.create"):
        metrics_base = metrics_base.filter(User.department_id == current_user.department_id)
        
    total_staff = metrics_base.count()
    active_count = metrics_base.filter(User.account_status == "active").count()
    inactive_count = metrics_base.filter(User.account_status == "inactive").count()
    locked_count = metrics_base.filter(User.account_status == "locked").count()
    pending_count = metrics_base.filter(User.account_status == "pending_activation").count()

    # Pagination
    total_matching = query.count()
    total_pages = max(1, (total_matching + page_size - 1) // page_size)
    offset = (page - 1) * page_size
    users = query.order_by(User.id.asc()).offset(offset).limit(page_size).all()

    items = [format_staff_response(u, db) for u in users]

    return {
        "items": items,
        "total": total_matching,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "metrics": {
            "total_staff": total_staff,
            "active_accounts": active_count,
            "inactive_accounts": inactive_count,
            "locked_accounts": locked_count,
            "pending_activation": pending_count
        }
    }

# ----------------- 2. Roles Metadata & Security Events (Meta Routes First) -----------------
@router.get("/meta/roles")
def get_roles_metadata(
    current_user: User = Depends(get_current_user)
):
    if not has_permission(current_user, "roles.read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'roles.read'"
        )
    return get_all_roles_metadata()

@router.get("/meta/security-events")
def get_security_events(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not has_permission(current_user, "security_events.read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'security_events.read'"
        )

    security_actions = [
        "ACCOUNT_LOCKED_AUTO",
        "ACCOUNT_UNLOCKED_ADMIN",
        "ACCOUNT_ACTIVATED_ADMIN",
        "ACCOUNT_DEACTIVATED_ADMIN",
        "LOGIN_FAILED",
        "LOGIN_REJECTED_LOCKED_ACCOUNT",
        "STAFF_CREATED_ADMIN",
        "STAFF_UPDATED_ADMIN",
        "PASSWORD_RESET_ADMIN"
    ]
    
    logs = db.query(AuditLog).filter(
        AuditLog.action.in_(security_actions)
    ).order_by(AuditLog.created_at.desc()).limit(limit).all()

    results = []
    for log in logs:
        details_obj = {}
        try:
            details_obj = json.loads(log.details) if log.details else {}
        except Exception:
            details_obj = {"raw": log.details}

        results.append({
            "id": log.id,
            "action": log.action,
            "actor_id": log.actor_id,
            "actor_name": log.actor_name,
            "actor_role": log.actor_role,
            "ticket_id": log.ticket_id,
            "details": details_obj,
            "created_at": log.created_at
        })
    return results

# ----------------- 3. Create Staff Identity & Provision Account -----------------
@router.post("", response_model=StaffResponse)
def create_staff(
    payload: StaffCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not has_permission(current_user, "staff.create"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'staff.create'"
        )

    # Prevent Privilege Escalation
    if payload.role in ["admin", "super_admin"] and current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Privilege escalation prevented: Only Super Administrators can grant Super Admin role."
        )

    # Department scope enforcement for supervisors
    if current_user.role == "supervisor":
        if payload.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You can only provision personnel for your assigned department: '{current_user.department_id}'"
            )

    # Unique Checks
    clean_email = payload.email.lower().strip()
    clean_emp_id = payload.employee_id.strip()

    if db.query(User).filter(User.email == clean_email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with work email '{clean_email}' already exists."
        )

    if db.query(User).filter(User.employee_id == clean_emp_id).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Employee ID '{clean_emp_id}' is already registered to another staff member."
        )

    # Verify department exists
    dept = db.query(Department).filter(Department.id == payload.department_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Hospital department '{payload.department_id}' does not exist."
        )

    initial_pw = getattr(payload, "password", None) or payload.initial_password or "TempPass2026!"
    pw_hash = get_password_hash(initial_pw)

    # Mandatory mobile number for Supervisors
    if payload.role == "supervisor" and (not payload.phone or len(payload.phone.strip()) < 7):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile phone number is mandatory for Supervisor accounts to enable staff calling and operational coordination."
        )

    perms_override = json.dumps(payload.permissions) if payload.permissions else None

    new_user = User(
        name=payload.name.strip(),
        employee_id=clean_emp_id,
        email=clean_email,
        phone=payload.phone.strip() if payload.phone else None,
        department_id=payload.department_id,
        designation=payload.designation.strip(),
        role=payload.role,
        supervisor_id=payload.supervisor_id,
        permissions_override=perms_override,
        account_status="active",
        is_active=True,
        failed_login_attempts=0,
        hashed_password=pw_hash,
        must_change_password=payload.require_password_change,
        avatar_url=None
    )

    db.add(new_user)
    db.flush()

    # Immutable Audit Log
    audit = AuditLog(
        action="STAFF_CREATED_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "created_user_id": new_user.id,
            "employee_id": new_user.employee_id,
            "name": new_user.name,
            "email": new_user.email,
            "department": new_user.department_id,
            "designation": new_user.designation,
            "role": new_user.role,
            "supervisor_id": new_user.supervisor_id,
            "require_pw_change": payload.require_password_change
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(new_user)

    # Automatically dispatch secure staff onboarding invitation & credentials
    try:
        EmailService.send_staff_invitation_email(
            db=db,
            user=new_user,
            temporary_password=initial_pw
        )
        logger.info(f"Staff onboarding email dispatched successfully to {new_user.email}")
    except Exception as e:
        logger.error(f"Failed to dispatch staff invitation email to {new_user.email}: {e}")

    return format_staff_response(new_user, db)

# ----------------- 4. Staff Details Inspection Drawer -----------------
@router.get("/{user_id}", response_model=StaffResponse)
def get_staff_detail(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not has_permission(current_user, "staff.read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'staff.read'"
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    # Scope check for supervisor
    if current_user.role == "supervisor" and current_user.department_id != target_user.department_id and current_user.id != target_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted: Target personnel belongs to a different hospital department."
        )

    return format_staff_response(target_user, db)

# ----------------- 5. Update Staff Employment & Role -----------------
@router.put("/{user_id}", response_model=StaffResponse)
def update_staff(
    user_id: int,
    payload: StaffUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not has_permission(current_user, "staff.update"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'staff.update'"
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    # Prevent Privilege Escalation
    if payload.role:
        if payload.role in ["superadmin", "super_admin"] and current_user.role != "superadmin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Privilege escalation prevented: Only Super Administrators can grant Super Administrator role."
            )
        if payload.role == "admin" and current_user.role not in ["admin", "superadmin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Privilege escalation prevented: Only Administrators or Super Administrators can grant Admin role."
            )

    # Prevent demoting the last active Super Admin / Admin
    if target_user.role in ["admin", "superadmin", "super_admin"] and payload.role and payload.role not in ["admin", "superadmin", "super_admin"]:
        active_admins = db.query(User).filter(
            User.role.in_(["admin", "superadmin", "super_admin"]),
            User.is_active == True,
            User.id != target_user.id
        ).count()
        if active_admins == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operation blocked: Cannot demote the last active Administrator in the hospital system."
            )

    # Enforce supervisor mobile number only if a non-empty phone is being provided or was already provided
    if payload.role == "supervisor" and payload.phone is not None and len(payload.phone.strip()) > 0 and len(payload.phone.strip()) < 7:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile phone number must be at least 7 digits for Supervisor accounts."
        )

    updates = {}
    if payload.employee_id:
        clean_emp = payload.employee_id.strip()
        existing = db.query(User).filter(User.employee_id == clean_emp, User.id != target_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Employee ID '{clean_emp}' is already assigned to another staff member.")
        target_user.employee_id = clean_emp
        updates["employee_id"] = clean_emp
        target_user.token_version = getattr(target_user, "token_version", 1) + 1

    if payload.email:
        clean_email = payload.email.strip().lower()
        existing = db.query(User).filter(User.email == clean_email, User.id != target_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Email '{clean_email}' is already in use by another user.")
        old_email = target_user.email
        if old_email != clean_email:
            target_user.email = clean_email
            updates["email"] = clean_email
            updates["old_email"] = old_email
            target_user.token_version = getattr(target_user, "token_version", 1) + 1
            email_audit = AuditLog(
                action="STAFF_EMAIL_ASSIGNMENT_UPDATED",
                actor_id=current_user.id,
                actor_name=current_user.name,
                actor_role=current_user.role,
                details=json.dumps({
                    "target_user_id": target_user.id,
                    "old_email": old_email,
                    "new_email": clean_email
                })
            )
            db.add(email_audit)
            try:
                EmailService.send_staff_email_updated_notice(
                    db=db,
                    user=target_user,
                    old_email=old_email,
                    new_email=clean_email
                )
            except Exception as e:
                logger.error(f"Error dispatching staff email update notice: {e}")

    if payload.name:
        target_user.name = payload.name.strip()
        updates["name"] = target_user.name
    if payload.phone is not None:
        target_user.phone = payload.phone.strip() if payload.phone else None
        updates["phone"] = target_user.phone
    if payload.department_id:
        target_user.department_id = payload.department_id
        updates["department_id"] = target_user.department_id
    if payload.designation:
        target_user.designation = payload.designation.strip()
        updates["designation"] = target_user.designation
    if payload.role:
        if payload.role != target_user.role:
            target_user.role = payload.role
            target_user.permissions_override = None  # Reset overrides to adopt new role defaults
            target_user.token_version = getattr(target_user, "token_version", 1) + 1
            updates["role"] = target_user.role
            updates["permissions_override"] = "reset_to_role_defaults"
    if payload.supervisor_id is not None:
        target_user.supervisor_id = payload.supervisor_id if payload.supervisor_id > 0 else None
        updates["supervisor_id"] = target_user.supervisor_id

    audit = AuditLog(
        action="STAFF_UPDATED_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "target_user_id": target_user.id,
            "target_email": target_user.email,
            "updates": updates
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(target_user)

    return format_staff_response(target_user, db)

# ----------------- 6. Account Lifecycle: Activate -----------------
@router.post("/{user_id}/activate", response_model=StaffResponse)
def activate_staff_account(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not has_permission(current_user, "staff.activate"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'staff.activate'"
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    target_user.is_active = True
    target_user.account_status = "active"
    target_user.failed_login_attempts = 0
    target_user.locked_at = None
    target_user.locked_reason = None

    audit = AuditLog(
        action="ACCOUNT_ACTIVATED_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "target_user_id": target_user.id,
            "target_email": target_user.email,
            "target_employee_id": target_user.employee_id
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(target_user)

    return format_staff_response(target_user, db)

# ----------------- 7. Account Lifecycle: Deactivate -----------------
@router.post("/{user_id}/deactivate", response_model=StaffResponse)
def deactivate_staff_account(
    user_id: int,
    payload: StaffActionReason,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not has_permission(current_user, "staff.deactivate"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'staff.deactivate'"
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    # Protection: Prevent deactivating the last active Super Admin
    if target_user.role in ["admin", "super_admin"]:
        active_admins = db.query(User).filter(
            User.role.in_(["admin", "super_admin"]),
            User.is_active == True,
            User.id != target_user.id
        ).count()
        if active_admins == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operation blocked: Cannot deactivate the last active Super Administrator in the hospital system."
            )

    target_user.is_active = False
    target_user.account_status = "inactive"
    target_user.token_version = getattr(target_user, "token_version", 1) + 1

    audit = AuditLog(
        action="ACCOUNT_DEACTIVATED_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "target_user_id": target_user.id,
            "target_email": target_user.email,
            "reason": payload.reason.strip()
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(target_user)

    return format_staff_response(target_user, db)

# ----------------- 8. Account Security: Unlock Account -----------------
@router.post("/{user_id}/unlock", response_model=StaffResponse)
def unlock_staff_account(
    user_id: int,
    payload: StaffActionReason,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not has_permission(current_user, "staff.unlock"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'staff.unlock'"
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    if target_user.account_status != "locked" and (target_user.failed_login_attempts or 0) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account is not currently locked."
        )

    prev_failures = target_user.failed_login_attempts
    prev_locked_at = str(target_user.locked_at) if target_user.locked_at else None

    # Reset consecutive failure counter and clear lock state
    target_user.failed_login_attempts = 0
    target_user.locked_at = None
    target_user.locked_reason = None

    # CRITICAL SECURITY RULE: Unlocking an inactive account must never activate it automatically!
    if target_user.is_active:
        target_user.account_status = "active"
    else:
        target_user.account_status = "inactive"

    audit = AuditLog(
        action="ACCOUNT_UNLOCKED_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "target_user_id": target_user.id,
            "target_email": target_user.email,
            "cleared_failures": prev_failures,
            "was_locked_at": prev_locked_at,
            "restored_status": target_user.account_status,
            "reason": payload.reason.strip()
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(target_user)

    return format_staff_response(target_user, db)

# ----------------- 9. Account Security: Password Reset -----------------
@router.post("/{user_id}/reset-password")
def reset_staff_password(
    user_id: int,
    payload: StaffPasswordResetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not has_permission(current_user, "staff.password_reset"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires permission: 'staff.password_reset'"
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    # Generate high-entropy temporary password or use provided
    if payload.temporary_password and len(payload.temporary_password.strip()) >= 8:
        temp_password = payload.temporary_password.strip()
    else:
        alphabet = string.ascii_letters + string.digits + "!@#$%"
        temp_password = "CareOps!" + "".join(secrets.choice(alphabet) for _ in range(8))

    target_user.hashed_password = get_password_hash(temp_password)
    target_user.must_change_password = payload.require_change
    target_user.token_version = getattr(target_user, "token_version", 1) + 1
    target_user.failed_login_attempts = 0
    target_user.locked_at = None
    target_user.locked_reason = None
    if target_user.account_status == "locked":
        target_user.account_status = "active" if target_user.is_active else "inactive"

    # Never log plaintext passwords!
    audit = AuditLog(
        action="PASSWORD_RESET_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "target_user_id": target_user.id,
            "target_email": target_user.email,
            "require_change_on_login": payload.require_change
        })
    )
    db.add(audit)
    db.commit()

    # Dispatch email notice with reset credentials to staff email
    try:
        EmailService.send_staff_invitation_email(
            db=db,
            user=target_user,
            temporary_password=temp_password
        )
        logger.info(f"Password reset email sent to staff member {target_user.email}")
    except Exception as e:
        logger.error(f"Failed to dispatch password reset email to {target_user.email}: {e}")

    return {
        "status": "success",
        "message": f"Password reset successfully for {target_user.name}. Notification sent to registered work email.",
        "temporary_password": temp_password,
        "require_change_on_login": payload.require_change
    }

# ----------------- 10. Supervisor Roster & Team Coordination -----------------
@router.get("/supervisors/list")
def list_supervisors(
    department_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns active department supervisors for assignment dropdowns."""
    query = db.query(User).filter(User.role == "supervisor", User.is_active == True)
    if department_id and department_id != "all":
        query = query.filter(User.department_id == department_id)
    sups = query.order_by(User.name.asc()).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "email": s.email,
            "phone": s.phone,
            "department_id": s.department_id,
            "employee_id": s.employee_id,
            "designation": s.designation
        }
        for s in sups
    ]

@router.get("/supervisors/{supervisor_id}/team")
def get_supervisor_team(
    supervisor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns staff members assigned to the designated supervisor."""
    sup = db.query(User).filter(User.id == supervisor_id).first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    team = db.query(User).filter(
        or_(User.supervisor_id == supervisor_id, User.department_id == sup.department_id),
        User.id != supervisor_id,
        User.is_active == True
    ).all()

    return [
        {
            "id": m.id,
            "name": m.name,
            "email": m.email,
            "phone": m.phone,
            "role": m.role,
            "designation": m.designation,
            "employee_id": m.employee_id,
            "department_id": m.department_id,
            "supervisor_id": m.supervisor_id,
            "active_tickets_count": db.query(Ticket).filter(
                Ticket.assigned_staff_id == m.id,
                Ticket.status.in_(["assigned", "acknowledged", "in_progress"])
            ).count()
        }
        for m in team
    ]

# ----------------- 11. Granular Permission Matrix Configuration -----------------
@router.get("/permissions/catalog")
def get_permission_catalog_matrix(current_user: User = Depends(get_current_user)):
    """Returns the master module x action permission matrix catalog."""
    return {
        "catalog": get_permission_matrix_catalog(is_superadmin=(current_user.role == "superadmin"))
    }

@router.get("/{user_id}/permissions")
def get_user_permissions_matrix(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve full permission matrix, base role defaults, and persistent active permissions for a user."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Staff member not found")

    effective = get_user_permissions(target)
    base_perms = get_role_permissions(target.role)
    catalog = get_permission_matrix_catalog(is_superadmin=False)

    return {
        "user_id": target.id,
        "name": target.name,
        "role": target.role,
        "effective_permissions": effective,
        "base_permissions": base_perms,
        "matrix_catalog": catalog
    }

@router.put("/{user_id}/permissions")
def update_user_permissions_matrix(
    user_id: int,
    payload: UserPermissionsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Admin updates granular permission matrix for a staff/supervisor member."""
    if not (current_user.role in ["admin", "superadmin"] or has_permission(current_user, "staff.update")):
        raise HTTPException(status_code=403, detail="Access denied: Only Administrators can configure permissions.")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Staff member not found")

    # Protection: Prevent non-superadmin from granting superadmin privileges or editing superadmin
    if target.role == "superadmin" and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Cannot modify Superadmin permissions.")

    forbidden = {"db_maintenance.execute", "admin.create", "admin.deactivate", "admin.permissions_manage"}
    sanitized = [p for p in payload.permissions if p not in forbidden]

    target.permissions_override = json.dumps(sanitized)

    audit = AuditLog(
        action="PERMISSIONS_UPDATED_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "target_user_id": target.id,
            "target_email": target.email,
            "granted_count": len(sanitized),
            "permissions": sanitized
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(target)

    return {
        "success": True,
        "message": f"Updated permissions matrix for {target.name}.",
        "effective_permissions": get_user_permissions(target)
    }

# ----------------- 14. Permanent Staff Account Deletion (Superadmin Only) -----------------
@router.delete("/{user_id}")
def delete_staff_account(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Permanently deletes a hospital staff account.
    Restricted strictly to System Superadmin.
    Safely detaches assigned tickets and supervisor references.
    """
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Permanent deletion of personnel accounts is strictly restricted to System Superadmin. Hospital Administrators may inactivate accounts."
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    if current_user.id == target_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security policy: Superadmin cannot delete their own active session account."
        )

    if target_user.role == "superadmin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security policy: Root Superadmin accounts cannot be deleted."
        )

    # Detach tickets and subordinate supervisor linkages
    db.query(Ticket).filter(Ticket.assigned_staff_id == user_id).update({"assigned_staff_id": None}, synchronize_session=False)
    db.query(Ticket).filter(Ticket.assigned_supervisor_id == user_id).update({"assigned_supervisor_id": None}, synchronize_session=False)
    db.query(User).filter(User.supervisor_id == user_id).update({"supervisor_id": None}, synchronize_session=False)

    # Log immutable audit event
    audit = AuditLog(
        action="STAFF_DELETED_SUPERADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "deleted_user_id": target_user.id,
            "deleted_user_name": target_user.name,
            "deleted_employee_id": target_user.employee_id,
            "deleted_email": target_user.email,
            "deleted_role": target_user.role,
            "deleted_department": target_user.department_id
        })
    )
    db.add(audit)

    db.delete(target_user)
    db.commit()

    return {
        "status": "success",
        "message": f"Staff member {target_user.name} ({target_user.employee_id or target_user.email}) has been permanently deleted by Superadmin."
    }

# ----------------- 15. Admin Patient Account Management -----------------

@router.get("/patients/list")
def list_patients(
    search: Optional[str] = Query(None, description="Search by name, patient ID, email, or phone"),
    account_status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin inspects registered patient accounts."""
    if current_user.role not in ["admin", "superadmin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    query = db.query(User).filter(User.role == "patient")
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.name.ilike(s),
                User.email.ilike(s),
                User.patient_id.ilike(s),
                User.phone.ilike(s)
            )
        )
    if account_status and account_status != "all":
        query = query.filter(User.account_status == account_status)

    total = query.count()
    items = query.order_by(desc(User.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [
            {
                "id": p.id,
                "patient_id": p.patient_id or f"PAT-{p.id:04d}",
                "name": p.name,
                "email": p.email,
                "phone": p.phone,
                "account_status": p.account_status,
                "is_active": p.is_active,
                "submissions_count": db.query(Ticket).filter(
                    or_(Ticket.patient_user_id == p.id, Ticket.patient_contact == p.phone, Ticket.patient_email == p.email)
                ).count(),
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "last_login_at": p.last_login_at.isoformat() if p.last_login_at else None
            }
            for p in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 1
    }

class AdminPatientCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    initial_password: Optional[str] = "CareOpsPatient2026!"

@router.post("/patients")
def create_patient_account_admin(
    payload: AdminPatientCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin manually provisions a patient account and generates credentials."""
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    clean_email = payload.email.strip().lower()
    if db.query(User).filter(User.email == clean_email).first():
        raise HTTPException(status_code=400, detail=f"Email '{clean_email}' is already registered.")

    import random
    pat_id = f"PAT-{random.randint(10000, 99999)}"
    while db.query(User).filter(User.patient_id == pat_id).first():
        pat_id = f"PAT-{random.randint(10000, 99999)}"

    initial_pw = payload.initial_password or "CareOpsPatient2026!"
    pw_hash = get_password_hash(initial_pw)

    patient = User(
        name=payload.name.strip(),
        email=clean_email,
        phone=payload.phone.strip() if payload.phone else None,
        patient_id=pat_id,
        employee_id=pat_id,
        role="patient",
        designation="Hospital Patient",
        hashed_password=pw_hash,
        account_status="active",
        is_active=True,
        token_version=1
    )
    db.add(patient)
    db.flush()

    audit = AuditLog(
        action="PATIENT_CREATED_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"patient_id": pat_id, "email": clean_email, "name": patient.name})
    )
    db.add(audit)
    db.commit()
    db.refresh(patient)

    return {
        "success": True,
        "patient": {
            "id": patient.id,
            "patient_id": patient.patient_id,
            "name": patient.name,
            "email": patient.email,
            "phone": patient.phone,
            "initial_password": initial_pw
        }
    }

@router.post("/patients/{patient_id}/reset-password")
def reset_patient_password_admin(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin resets patient account password."""
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    patient = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient account not found.")

    alphabet = string.ascii_letters + string.digits + "!@#"
    temp_pw = "CareOps!" + "".join(secrets.choice(alphabet) for _ in range(6))
    patient.hashed_password = get_password_hash(temp_pw)
    patient.token_version = getattr(patient, "token_version", 1) + 1
    patient.failed_login_attempts = 0

    audit = AuditLog(
        action="PATIENT_PASSWORD_RESET_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"patient_id": patient.id, "email": patient.email})
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "message": f"Password reset for {patient.name}",
        "temporary_password": temp_pw
    }

@router.post("/patients/{patient_id}/deactivate")
def deactivate_patient_admin(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    patient = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient account not found.")

    patient.is_active = False
    patient.account_status = "inactive"
    patient.token_version = getattr(patient, "token_version", 1) + 1

    audit = AuditLog(
        action="PATIENT_DEACTIVATED_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"patient_id": patient.id, "email": patient.email})
    )
    db.add(audit)
    db.commit()

    return {"success": True, "message": f"Patient account {patient.name} deactivated."}

@router.post("/patients/{patient_id}/activate")
def activate_patient_admin(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    patient = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient account not found.")

    patient.is_active = True
    patient.account_status = "active"

    audit = AuditLog(
        action="PATIENT_ACTIVATED_ADMIN",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"patient_id": patient.id, "email": patient.email})
    )
    db.add(audit)
    db.commit()

    return {"success": True, "message": f"Patient account {patient.name} activated."}


