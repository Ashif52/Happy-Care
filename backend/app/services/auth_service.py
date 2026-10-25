from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import uuid
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import User

import bcrypt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)

# Legacy SHA-256 hash for backward-compatible verification during migration
_LEGACY_SALT = "careops_salt_2026"

def _legacy_sha256_hash(password: str) -> str:
    """Legacy SHA-256 hash — used ONLY for verifying old passwords during migration."""
    return hashlib.sha256((_LEGACY_SALT + password).encode()).hexdigest()

def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt. All new passwords use this."""
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against a hash. Supports both:
    - bcrypt hashes (new, starts with $2b$ or $2a$)
    - Legacy SHA-256 hashes (64-char hex, for migration)
    """
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        pwd_bytes = plain_password.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed_password.encode("utf-8"))
    # Legacy SHA-256 fallback — verify but flag for rehash
    return _legacy_sha256_hash(plain_password) == hashed_password

def needs_rehash(hashed_password: str) -> bool:
    """Check if a password hash needs to be upgraded from legacy SHA-256 to bcrypt."""
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        return False
    # Any non-bcrypt hash (legacy SHA-256) needs rehash
    return True

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({
        "exp": expire,
        "jti": uuid.uuid4().hex,  # Unique token ID for future revocation support
        "iat": datetime.now(timezone.utc),
    })
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # Security boundary: Patient sessions must never access staff routes
        if payload.get("context") == "patient" or str(payload.get("role", "")).startswith("patient"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient sessions are strictly prohibited from accessing hospital staff routes."
            )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    
    try:
        numeric_user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user identifier in token")
        
    user = db.query(User).filter(User.id == numeric_user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account not found")
        
    if not user.is_active or getattr(user, "account_status", "active") == "inactive":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated. Access revoked.")

    # Check token version for immediate session invalidation on password reset / deactivation
    token_v = payload.get("v")
    if token_v is not None and token_v < getattr(user, "token_version", 1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or was revoked due to a security update or credential reset. Please sign in again."
        )
    return user

def get_current_patient(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Authenticated dependency for patient portal routes."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
        
    try:
        numeric_user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user identifier")

    user = db.query(User).filter(User.id == numeric_user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active or getattr(user, "account_status", "active") == "inactive":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated.")

    token_v = payload.get("v")
    if token_v is not None and token_v < getattr(user, "token_version", 1):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please sign in again.")

    return user

def require_roles(*roles: str):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == "superadmin" or current_user.role in roles:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Requires one of roles: {', '.join(roles)}"
        )
    return role_checker

def require_permission(permission_key: str):
    from app.services.rbac_service import has_permission
    def permission_checker(current_user: User = Depends(get_current_user)) -> User:
        if not has_permission(current_user, permission_key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Missing required permission: {permission_key}"
            )
        return current_user
    return permission_checker
