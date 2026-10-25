import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone, timedelta

from app.database import Base, engine, get_db
from app.main import app
from app.models import User, Department, Room, Ticket, Evidence, AIVerificationJob, TicketNote, SLAPolicy
from app.seed import seed_database
from app.services.ai_vision_service import AIVisionService
from app.services.sla_engine import SLAEngine

# Ensure tables and seed exist
Base.metadata.create_all(bind=engine)
seed_database()

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_departments_and_rooms_seeded():
    # Verify departments
    resp = client.get("/api/departments")
    assert resp.status_code == 200
    depts = resp.json()
    assert len(depts) >= 6
    dept_ids = [d["id"] for d in depts]
    for required in ["maintenance", "housekeeping", "linen", "medical", "it"]:
        assert required in dept_ids

    # Verify rooms
    resp_rooms = client.get("/api/rooms")
    assert resp_rooms.status_code == 200
    rooms = resp_rooms.json()
    assert len(rooms) >= 4

def test_auth_and_roles():
    # Valid login
    login_resp = client.post("/api/auth/login", json={
        "email": "admin@careops.hospital",
        "password": "password123"
    })
    assert login_resp.status_code == 200
    token_data = login_resp.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # Authenticated /me endpoint
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["role"] == "admin"

    # Bad password
    bad_resp = client.post("/api/auth/login", json={
        "email": "admin@careops.hospital",
        "password": "wrong_password"
    })
    assert bad_resp.status_code == 401

def test_patient_qr_portal_and_privacy_boundary():
    # 1. Resolve room context via QR token
    token = "CARE-RM204-7X9Q"
    room_resp = client.get(f"/api/patient/room/{token}")
    assert room_resp.status_code == 200
    room_data = room_resp.json()
    assert room_data["room_number"] == "Room 204"
    assert len(room_data["departments"]) >= 6

    # 2. Patient submits issue
    submit_resp = client.post("/api/patient/submit", json={
        "qr_token": token,
        "department_id": "maintenance",
        "category": "Lighting",
        "description": "Bedside reading lamp switch sparking when toggled.",
        "patient_contact": "+91 99999 88888"
    })
    assert submit_resp.status_code == 200
    created = submit_resp.json()
    ticket_num = created["ticket_number"]
    assert ticket_num.startswith("TKT-MNT-")

    # 3. Patient checks status - STRICT PRIVACY VERIFICATION
    track_resp = client.get(f"/api/patient/ticket/{ticket_num}")
    assert track_resp.status_code == 200
    track_data = track_resp.json()
    assert track_data["room_number"] == "Room 204"
    assert "updates" in track_data
    # Assert internal notes and staff identity details are NOT exposed
    assert "assigned_staff_name" not in track_data
    assert "internal_notes" not in track_data
    for update in track_data["updates"]:
        assert "Internal" not in update["message"]

def test_staff_ticket_workflow():
    # Login as maintenance technician Rajesh
    login_resp = client.post("/api/auth/login", json={
        "email": "technician.rajesh@careops.hospital",
        "password": "password123"
    })
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch tickets list
    t_list_resp = client.get("/api/tickets", headers=headers)
    assert t_list_resp.status_code == 200
    tickets = t_list_resp.json()
    if len(tickets) == 0:
        import uuid
        db = next(get_db())
        u = db.query(User).filter(User.email == "technician.rajesh@careops.hospital").first()
        tkt_obj = db.query(Ticket).filter(Ticket.assigned_staff_id == (u.id if u else 0)).first()
        if not tkt_obj:
            tkt_obj = Ticket(
                ticket_number=f"TKT-MNT-{uuid.uuid4().hex[:6].upper()}",
                category="Air Conditioner",
                title="Room 204 AC Compressor Inspection",
                description="AC not cooling properly.",
                room_number="204",
                department_id="maintenance",
                assigned_staff_id=u.id if u else None,
                priority="medium",
                status="submitted"
            )
            db.add(tkt_obj)
            db.commit()
            db.refresh(tkt_obj)
        t_list_resp = client.get("/api/tickets", headers=headers)
        tickets = t_list_resp.json()
    assert len(tickets) > 0

    tkt = tickets[0]
    tkt_id = tkt["id"]

    # Add internal note (permitted for staff)
    note_resp = client.post(f"/api/tickets/{tkt_id}/notes", json={
        "content": "Internal inspection note: checked breaker 4B.",
        "is_internal": True
    }, headers=headers)
    assert note_resp.status_code == 200

def test_ai_verification_rules():
    """Validates the AI Vision analysis engine against real clinical maintenance rules"""
    db = next(get_db())
    
    fan_ticket = db.query(Ticket).filter(Ticket.category == "Ceiling Fan").first()
    if not fan_ticket:
        fan_ticket = Ticket(
            ticket_number="TKT-TEST-FAN-01",
            category="Ceiling Fan",
            title="Ceiling Fan Not Rotating",
            description="Ceiling fan stopped spinning and makes buzzing noise.",
            room_number="204",
            department_id="maintenance",
            priority="high",
            status="in_progress"
        )
        db.add(fan_ticket)
        db.commit()
        db.refresh(fan_ticket)
    
    before_ev = db.query(Evidence).filter(Evidence.ticket_id == fan_ticket.id, Evidence.stage == "before").first()
    if not before_ev:
        before_ev = Evidence(
            ticket_id=fan_ticket.id,
            stage="before",
            media_type="image",
            file_url="/uploads/baseline_fault_fan.jpg",
            equipment_type="Ceiling Fan"
        )
        db.add(before_ev)
        db.commit()
        db.refresh(before_ev)
    
    # 1. Test Static Photo for Fan: AI must recognize still photo cannot prove rotation!
    static_after = Evidence(
        ticket_id=fan_ticket.id,
        stage="after",
        media_type="image",  # STILL PHOTO
        file_url="/uploads/fake_still_fan.jpg",
        equipment_type="Ceiling Fan"
    )
    
    result = AIVisionService.analyze_ticket_evidence(fan_ticket, before_ev, static_after)
    assert result["after_repair_functional_evidence"] == "static_unverified"
    assert result["ai_recommendation"] == "inconclusive"
    assert "A still photograph cannot demonstrate rotation" in str(result["inconsistencies"])
    assert result["review_requirement"] == "mandatory_human_review"

    # 2. Test Video After: AI detects dynamic movement
    video_after = Evidence(
        ticket_id=fan_ticket.id,
        stage="after",
        media_type="video",  # VIDEO
        file_url="/uploads/fan_rotating.mp4",
        equipment_type="Ceiling Fan"
    )
    result_video = AIVisionService.analyze_ticket_evidence(fan_ticket, before_ev, video_after)
    assert result_video["after_repair_functional_evidence"] == "movement_observed"
    assert result_video["ai_recommendation"] == "likely_resolved"

def test_sla_escalation_engine():
    """Validates background SLA breach check cycle"""
    stats = SLAEngine.run_sla_check_cycle()
    assert "scanned" in stats
    assert stats["scanned"] >= 1


def test_superadmin_clear_database_security_and_execution():
    """Validates that only superadmin can trigger clear-database and that reset restores demo tickets safely"""
    # 1. Standard Admin cannot clear database (Must return 403 Forbidden)
    admin_login = client.post("/api/auth/login", json={
        "email": "admin@careops.hospital",
        "password": "password123"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    forbidden_resp = client.post("/api/system/clear-database", json={
        "mode": "reset_all",
        "confirm_phrase": "CONFIRM_CLEAR"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert forbidden_resp.status_code == 403

    # 2. Superadmin login
    superadmin_login = client.post("/api/auth/login", json={
        "email": "superadmin@careops.hospital",
        "password": "password123"
    })
    assert superadmin_login.status_code == 200
    superadmin_token = superadmin_login.json()["access_token"]
    sa_headers = {"Authorization": f"Bearer {superadmin_token}"}

    # 3. Bad confirmation phrase
    bad_phrase_resp = client.post("/api/system/clear-database", json={
        "mode": "reset_all",
        "confirm_phrase": "WRONG_PHRASE"
    }, headers=sa_headers)
    assert bad_phrase_resp.status_code == 400

    # 4. Successful reset_all by superadmin
    reset_resp = client.post("/api/system/clear-database", json={
        "mode": "reset_all",
        "confirm_phrase": "CONFIRM_CLEAR"
    }, headers=sa_headers)
    assert reset_resp.status_code == 200
    assert reset_resp.json()["success"] is True

    # 5. Verify demo tickets reseeded
    tickets_resp = client.get("/api/tickets", headers=sa_headers)
    assert tickets_resp.status_code == 200
    assert len(tickets_resp.json()) >= 5
