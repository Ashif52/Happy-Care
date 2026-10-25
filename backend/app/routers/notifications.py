from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, func

from app.database import get_db
from app.models import Notification, User
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/notifications", tags=["In-App Role-Aware Notifications"])

def utc_now():
    return datetime.now(timezone.utc)

class NotificationResponse(BaseModel):
    id: int
    recipient_id: int
    department_id: Optional[str] = None
    event_type: str
    title: str
    message: str
    ticket_id: Optional[int] = None
    ticket_number: Optional[str] = None
    destination_link: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class NotificationListResponse(BaseModel):
    total: int
    unread_count: int
    items: List[NotificationResponse]
    page: int = 1
    page_size: int = 50

@router.get("", response_model=NotificationListResponse)
def get_user_notifications(
    unread_only: bool = Query(False, description="Filter for unread notifications only"),
    search: Optional[str] = Query(None, description="Search notification title or message"),
    event_type: Optional[str] = Query(None, description="Filter by specific event type"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves in-app notifications strictly for the authenticated user.
    Enforces authorization: A user can never access another user's notifications.
    Supports unread filtering, search, and pagination.
    """
    base_query = db.query(Notification).filter(Notification.recipient_id == current_user.id)
    
    total = base_query.count()
    unread_count = db.query(Notification).filter(
        Notification.recipient_id == current_user.id,
        Notification.is_read == False
    ).count()

    query = base_query
    if unread_only:
        query = query.filter(Notification.is_read == False)
    if event_type:
        query = query.filter(Notification.event_type == event_type.strip())
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(Notification.title).like(term),
                func.lower(Notification.message).like(term),
                func.lower(Notification.ticket_number).like(term)
            )
        )

    current_total = query.count()
    items = query.order_by(desc(Notification.created_at)).offset(offset).limit(limit).all()

    current_page = (offset // limit) + 1 if limit > 0 else 1

    return {
        "total": current_total,
        "unread_count": unread_count,
        "items": items,
        "page": current_page,
        "page_size": limit
    }

@router.get("/unread-count")
def get_unread_notification_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, int]:
    """Returns the unread notifications count for the authenticated user."""
    count = db.query(Notification).filter(
        Notification.recipient_id == current_user.id,
        Notification.is_read == False
    ).count()
    return {"unread_count": count}

@router.post("/{notification_id}/mark-read", response_model=NotificationResponse)
def mark_notification_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Marks a single notification as read, validating ownership."""
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.recipient_id == current_user.id
    ).first()

    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found or access denied"
        )

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = utc_now()
        db.commit()
        db.refresh(notif)

    return notif

@router.post("/mark-all-read")
def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Marks all unread notifications for the authenticated user as read."""
    unread_notifs = db.query(Notification).filter(
        Notification.recipient_id == current_user.id,
        Notification.is_read == False
    ).all()

    now = utc_now()
    count = len(unread_notifs)
    for n in unread_notifs:
        n.is_read = True
        n.read_at = now

    db.commit()
    return {"success": True, "marked_read_count": count}

@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, bool]:
    """Deletes a notification, ensuring ownership."""
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.recipient_id == current_user.id
    ).first()

    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found or access denied"
        )

    db.delete(notif)
    db.commit()
    return {"success": True}
