import json
import random
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import User, AuditLog, Department
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.services.auth_service import (
    verify_password, get_password_hash, create_access_token,
    get_current_user, needs_rehash
)
from app.services.rbac_service import get_user_permissions

from sqlalchemy import func, or_
import secrets
from datetime import timedelta
from app.schemas import (
    LoginRequest, RegisterRequest, TokenResponse, UserResponse,
    ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordWithTokenRequest,
    ProfileUpdateRequest
)
from app.services.email_service import EmailService

router = APIRouter(prefix="/auth", tags=["Authentication"])

def utc_now():
    return datetime.now(timezone.utc)

@router.post("/login", response_model=TokenResponse)
def login(creds: LoginRequest, db: Session = Depends(get_db)):
    raw_id = (creds.login_identifier or creds.email or "").strip()
    if not raw_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Login identifier (email, staff ID, or patient ID) is required."
        )

    # Centralized identity lookup: authoritative database check across email, staff ID, patient ID, and phone
    id_lower = raw_id.lower()
    user = db.query(User).filter(
        or_(
            func.lower(User.email) == id_lower,
            func.lower(User.employee_id) == id_lower,
            func.lower(User.patient_id) == id_lower,
            User.phone == raw_id
        )
    ).first()
    
    # Generic rejection for unknown user to prevent enumeration
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify your login identifier and password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Portal isolation check
    if creds.portal_hint == "admin" and user.role not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted: This portal is for Hospital Administrators only. Please log in through the Staff Portal or Patient Portal."
        )
    if creds.portal_hint == "staff" and user.role == "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted: This portal is for Hospital Staff members only. Please log in through the Patient Portal."
        )
    
    # 1. Check if account is locked
    if getattr(user, "account_status", "active") == "locked" or (user.failed_login_attempts and user.failed_login_attempts >= 3):
        # Record security event
        audit = AuditLog(
            action="LOGIN_REJECTED_LOCKED_ACCOUNT",
            actor_id=user.id,
            actor_name=user.name,
            actor_role=user.role,
            details=json.dumps({
                "email": user.email,
                "reason": "Login rejected because account is in locked state",
                "locked_at": str(user.locked_at) if user.locked_at else None
            })
        )
        db.add(audit)
        db.commit()
        
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is locked due to consecutive failed authentication attempts. Please contact a hospital administrator to unlock."
        )
        
    # 2. Check if account is inactive
    if not user.is_active or getattr(user, "account_status", "active") == "inactive":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact hospital administration."
        )
        
    # 3. Verify password
    if not verify_password(creds.password, user.hashed_password):
        # Atomic server-side increment of failed attempts
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        failures = user.failed_login_attempts
        
        if failures >= 3:
            user.account_status = "locked"
            user.locked_at = utc_now()
            user.locked_reason = "Exceeded 3 consecutive failed authentication attempts"
            
            audit = AuditLog(
                action="ACCOUNT_LOCKED_AUTO",
                actor_id=user.id,
                actor_name=user.name,
                actor_role=user.role,
                details=json.dumps({
                    "email": user.email,
                    "consecutive_failures": failures,
                    "threshold": 3,
                    "locked_at": str(user.locked_at)
                })
            )
            db.add(audit)
            db.commit()
            
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account has been locked after 3 consecutive failed login attempts. Please contact a hospital administrator to unlock."
            )
        else:
            audit = AuditLog(
                action="LOGIN_FAILED",
                actor_id=user.id,
                actor_name=user.name,
                actor_role=user.role,
                details=json.dumps({
                    "email": user.email,
                    "consecutive_failures": failures,
                    "attempts_remaining": 3 - failures
                })
            )
            db.add(audit)
            db.commit()
            
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
    # 4. Authentication Succeeded!
    # Transparent upgrade to bcrypt if legacy SHA-256 hash
    if needs_rehash(user.hashed_password):
        user.hashed_password = get_password_hash(creds.password)

    # Reset failure counter and update last login
    user.failed_login_attempts = 0
    user.last_login_at = utc_now()
    db.commit()
    
    token = create_access_token(data={
        "sub": str(user.id),
        "role": user.role,
        "dept": user.department_id,
        "v": getattr(user, "token_version", 1)
    })
    user_perms = get_user_permissions(user)
    
    user_dict = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "department_id": user.department_id,
        "phone": user.phone,
        "avatar_url": None,
        "is_active": user.is_active,
        "employee_id": user.employee_id,
        "patient_id": getattr(user, "patient_id", None),
        "token_version": getattr(user, "token_version", 1),
        "designation": user.designation,
        "account_status": user.account_status,
        "failed_login_attempts": user.failed_login_attempts,
        "locked_at": user.locked_at,
        "locked_reason": user.locked_reason,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "permissions": user_perms
    }
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_dict
    }

@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid email address is required."
        )
    if not payload.password or len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )
    if not any(c.isupper() for c in payload.password) or not any(c.islower() for c in payload.password) or not any(c.isdigit() for c in payload.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one uppercase letter, one lowercase letter, and one digit."
        )

    # Check if user already exists
    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{clean_email}' already exists. Please sign in."
        )

    # Generate employee ID
    dept_id = payload.department_id or "maintenance"
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        first_dept = db.query(Department).first()
        dept_id = first_dept.id if first_dept else None

    rand_suffix = str(random.randint(1000, 9999))
    emp_prefix = (dept_id[:3] if dept_id else "ADM").upper()
    emp_id = f"EMP-{emp_prefix}-{rand_suffix}"
    while db.query(User).filter(User.employee_id == emp_id).first():
        emp_id = f"EMP-{emp_prefix}-{random.randint(1000, 9999)}"

    valid_roles = ["patient", "supervisor", "staff", "doctor", "nurse", "it_admin", "billing", "pharmacy", "housekeeping", "auditor"]
    chosen_role = payload.role.lower().strip() if payload.role else "patient"
    if chosen_role not in valid_roles:
        chosen_role = "staff"

    # Security rule: Public self-registration can never claim admin or superadmin privileges
    if chosen_role in ["admin", "superadmin", "super_admin"]:
        chosen_role = "staff"

    pw_hash = get_password_hash(payload.password)
    
    pat_id = None
    if chosen_role == "patient":
        dept_id = None
        emp_id = None
        pat_id = f"PAT-{random.randint(10000, 99999)}"
        default_designation = "Hospital Patient"
    else:
        default_designation = "Hospital Personnel"

    new_user = User(
        name=payload.name.strip() if payload.name else "Hospital User",
        email=clean_email,
        employee_id=emp_id,
        patient_id=pat_id,
        hashed_password=pw_hash,
        role=chosen_role,
        department_id=dept_id,
        designation=payload.designation.strip() if payload.designation else default_designation,
        phone=payload.phone.strip() if payload.phone else None,
        account_status="active",
        is_active=True,
        failed_login_attempts=0,
        avatar_url=None
    )
    db.add(new_user)
    db.flush()

    audit = AuditLog(
        action="USER_SELF_REGISTERED",
        actor_id=new_user.id,
        actor_name=new_user.name,
        actor_role=new_user.role,
        details=json.dumps({
            "email": new_user.email,
            "role": new_user.role,
            "department": new_user.department_id,
            "employee_id": new_user.employee_id
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(data={"sub": str(new_user.id), "role": new_user.role, "dept": new_user.department_id})
    user_perms = get_user_permissions(new_user)

    user_dict = {
        "id": new_user.id,
        "email": new_user.email,
        "name": new_user.name,
        "role": new_user.role,
        "department_id": new_user.department_id,
        "phone": new_user.phone,
        "avatar_url": None,
        "is_active": new_user.is_active,
        "employee_id": new_user.employee_id,
        "designation": new_user.designation,
        "account_status": new_user.account_status,
        "failed_login_attempts": 0,
        "locked_at": None,
        "locked_reason": None,
        "last_login_at": None,
        "created_at": new_user.created_at,
        "permissions": user_perms
    }

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_dict
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    user_perms = get_user_permissions(current_user)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "department_id": current_user.department_id,
        "phone": current_user.phone,
        "avatar_url": None,
        "is_active": current_user.is_active,
        "employee_id": current_user.employee_id,
        "patient_id": getattr(current_user, "patient_id", None),
        "token_version": getattr(current_user, "token_version", 1),
        "designation": current_user.designation,
        "account_status": current_user.account_status,
        "failed_login_attempts": current_user.failed_login_attempts,
        "locked_at": current_user.locked_at,
        "locked_reason": current_user.locked_reason,
        "last_login_at": current_user.last_login_at,
        "created_at": current_user.created_at,
        "permissions": user_perms
    }

@router.put("/profile", response_model=UserResponse)
@router.put("/me", response_model=UserResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Authoritative profile update endpoint for the currently logged-in user.
    Preserves user ID, email, role, department, employee_id, and permissions.
    Validates updated name and updates PostgreSQL database.
    Writes audit log and returns refreshed canonical user record.
    """
    old_name = current_user.name
    if payload.name is not None:
        clean_name = payload.name.strip()
        if len(clean_name) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name must be at least 2 characters long."
            )
        if len(clean_name) > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name cannot exceed 100 characters."
            )
        current_user.name = clean_name

    if payload.phone is not None:
        current_user.phone = payload.phone.strip() if payload.phone else None

    if payload.designation is not None:
        current_user.designation = payload.designation.strip() if payload.designation else None

    audit = AuditLog(
        action="USER_PROFILE_UPDATED",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({
            "user_id": current_user.id,
            "email": current_user.email,
            "old_name": old_name,
            "new_name": current_user.name
        })
    )
    db.add(audit)
    db.commit()
    db.refresh(current_user)

    user_perms = get_user_permissions(current_user)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "department_id": current_user.department_id,
        "phone": current_user.phone,
        "avatar_url": current_user.avatar_url,
        "is_active": current_user.is_active,
        "employee_id": current_user.employee_id,
        "patient_id": getattr(current_user, "patient_id", None),
        "token_version": getattr(current_user, "token_version", 1),
        "designation": current_user.designation,
        "account_status": current_user.account_status,
        "failed_login_attempts": current_user.failed_login_attempts,
        "locked_at": current_user.locked_at,
        "locked_reason": current_user.locked_reason,
        "last_login_at": current_user.last_login_at,
        "created_at": current_user.created_at,
        "permissions": user_perms
    }

@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allows authenticated user (Admin, Staff, or Patient) to securely change their password."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password verification failed. Please verify your existing password."
        )

    if not payload.new_password or len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long."
        )

    # Hash new password with bcrypt
    current_user.hashed_password = get_password_hash(payload.new_password)
    # Increment token_version to invalidate any other existing sessions across devices
    current_user.token_version = getattr(current_user, "token_version", 1) + 1
    current_user.must_change_password = False

    audit = AuditLog(
        action="USER_PASSWORD_CHANGED",
        actor_id=current_user.id,
        actor_name=current_user.name,
        actor_role=current_user.role,
        details=json.dumps({"user_id": current_user.id, "email": current_user.email})
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "message": "Password updated successfully. Other active sessions have been revoked."
    }

@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """Generates secure reset token and sends email instructions."""
    raw_id = payload.identifier.strip().lower()
    user = db.query(User).filter(
        or_(
            func.lower(User.email) == raw_id,
            func.lower(User.employee_id) == raw_id,
            func.lower(User.patient_id) == raw_id
        )
    ).first()

    # Always return success message to prevent user enumeration
    if not user or not user.is_active or not user.email:
        return {
            "success": True,
            "message": "If an active account matches the provided identifier, password reset instructions have been dispatched to the registered email address."
        }

    reset_token = secrets.token_urlsafe(32)
    user.password_reset_token = reset_token
    user.password_reset_expires_at = utc_now() + timedelta(minutes=60)
    db.commit()

    frontend_base = (getattr(settings, "FRONTEND_URL", "") or "http://localhost:3000").rstrip("/")
    reset_url = f"{frontend_base}/reset-password?token={reset_token}"

    try:
        EmailService.send_password_reset_email(db, user, reset_url)
    except Exception as e:
        logger.error(f"Error dispatching password reset email: {e}")

    return {
        "success": True,
        "message": "If an active account matches the provided identifier, password reset instructions have been dispatched to the registered email address."
    }

@router.post("/reset-password-with-token")
def reset_password_with_token(
    payload: ResetPasswordWithTokenRequest,
    db: Session = Depends(get_db)
):
    """Validates single-use reset token and assigns new password."""
    if not payload.token or not payload.new_password:
        raise HTTPException(status_code=400, detail="Reset token and new password are required.")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")

    user = db.query(User).filter(
        User.password_reset_token == payload.token,
        User.password_reset_expires_at > utc_now()
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The password reset link is invalid or has expired. Please request a new link."
        )

    user.hashed_password = get_password_hash(payload.new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    user.token_version = getattr(user, "token_version", 1) + 1
    user.failed_login_attempts = 0
    if user.account_status == "locked":
        user.account_status = "active"

    audit = AuditLog(
        action="PASSWORD_RESET_TOKEN_EXECUTED",
        actor_id=user.id,
        actor_name=user.name,
        actor_role=user.role,
        details=json.dumps({"email": user.email})
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "message": "Your password has been reset successfully. You may now log in with your new password."
    }

@router.get("/simulation-accounts")
def get_simulation_accounts(db: Session = Depends(get_db)):
    """
    Returns real, dynamically configured hospital personnel records for role simulation.
    Strictly queries the live database so any staff edits or renaming immediately reflect in workspace.
    """
    accounts = []
    seen_emails = set()

    def add_user(u: Optional[User], role_badge: Optional[str] = None, fallback_desc: str = ""):
        if not u or u.email in seen_emails:
            return
        seen_emails.add(u.email)
        
        dept_name = None
        if u.department_id:
            dept = db.query(Department).filter(Department.id == u.department_id).first()
            dept_name = dept.name if dept else u.department_id.capitalize()

        badge = role_badge or (dept_name.upper() if dept_name and u.role in ["supervisor", "staff"] else u.role.upper())
        desc = u.designation or fallback_desc or (f"{dept_name} {u.role.capitalize()}" if dept_name else f"Hospital {u.role.capitalize()}")

        accounts.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "badge": badge,
            "employee_id": u.employee_id,
            "department_id": u.department_id,
            "department_name": dept_name,
            "designation": u.designation,
            "desc": desc
        })

    # 1. Superadmin (Root)
    superadmins = db.query(User).filter(User.role.in_(["superadmin", "super_admin"]), User.is_active == True).order_by(User.id.asc()).limit(2).all()
    for sa in superadmins:
        add_user(sa, role_badge="SUPERADMIN", fallback_desc="Database purge & root platform authority")

    # 2. Administrator
    admins = db.query(User).filter(User.role == "admin", User.is_active == True).order_by(User.id.asc()).limit(2).all()
    for a in admins:
        add_user(a, role_badge="ADMINISTRATOR", fallback_desc="Full hospital controls & policies")

    # 3. Department Supervisors (e.g. Maintenance, Medical, Dietitian)
    supervisors = db.query(User).filter(User.role == "supervisor", User.is_active == True).order_by(User.id.asc()).limit(4).all()
    for s in supervisors:
        add_user(s, fallback_desc="AI review sign-offs & SLA escalations")

    # 4. Department Staff / Specialists
    staff_members = db.query(User).filter(User.role == "staff", User.is_active == True).order_by(User.id.asc()).limit(4).all()
    for sm in staff_members:
        add_user(sm, fallback_desc="Acknowledge, capture evidence & resolve")

    return accounts

@router.get("/demo-users")
def get_demo_users(db: Session = Depends(get_db)):
    """Returns quick login credentials for demonstration - ONLY accessible in DEBUG_MODE"""
    if not settings.DEBUG_MODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo users endpoint is disabled in production mode."
        )
    users = db.query(User).filter(User.is_active == True).all()
    return [
        {
            "id": u.id,
            "employee_id": u.employee_id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "department_id": u.department_id,
            "designation": u.designation,
            "account_status": u.account_status,
            "demo_password": "password123"
        }
        for u in users
    ]
