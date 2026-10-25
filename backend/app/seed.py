from datetime import datetime, timedelta, timezone
import json
from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app.models import (
    Department, User, Room, Ticket, Evidence, AIVerificationJob,
    SLAPolicy, EscalationLog, TicketNote, AuditLog,
    GoogleIntegration, GoogleLocation, GoogleReview, ReviewAlert,
    ReviewAIAnalysis, ReviewCorrectiveAction,
    NPSResponse, SystemSecuritySetting
)
from app.services.auth_service import get_password_hash

def utc_now():
    return datetime.now(timezone.utc)

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # Check if already seeded
        if db.query(Department).first():
            # Ensure superadmin exists even on previously seeded databases
            if not db.query(User).filter(User.email == "superadmin@careops.hospital").first():
                pw_hash = get_password_hash("password123")
                superadmin = User(
                    email="superadmin@careops.hospital",
                    name="System Superadmin",
                    role="superadmin",
                    department_id=None,
                    phone="+91 98765 00000",
                    avatar_url=None,
                    hashed_password=pw_hash
                )
                db.add(superadmin)
                db.commit()
                print("Added missing superadmin account.")
            
            # Ensure Google Business Profile & Reviews are seeded
            if not db.query(GoogleIntegration).first():
                seed_google_reviews(db)

            # Ensure NPS & Security Settings are initialized
            seed_nps_and_security(db)

            print("Database already contains data, skipping full seed.")
            return

        print("Seeding CareOps AI enterprise database...")
        now = utc_now()
        pw_hash = get_password_hash("password123")

        # 1. Seed Users (Admin & Supervisors first so foreign keys work)
        admin = User(
            email="admin@careops.hospital",
            name="Dr. Pavithra",
            role="admin",
            department_id=None,
            phone="+91 98765 43210",
            avatar_url=None,
            hashed_password=pw_hash
        )
        superadmin = User(
            email="superadmin@careops.hospital",
            name="System Superadmin",
            role="superadmin",
            department_id=None,
            phone="+91 98765 00000",
            avatar_url=None,
            hashed_password=pw_hash
        )
        db.add_all([admin, superadmin])
        db.flush()

        sup_mnt = User(
            email="supervisor.mnt@careops.hospital",
            name="Vikramaditya Rao",
            role="supervisor",
            department_id=None,
            phone="+91 98765 11111",
            avatar_url=None,
            hashed_password=pw_hash
        )
        sup_nur = User(
            email="supervisor.nur@careops.hospital",
            name="Sister Mary Thomas",
            role="supervisor",
            department_id=None,
            phone="+91 98765 22222",
            avatar_url=None,
            hashed_password=pw_hash
        )
        db.add_all([sup_mnt, sup_nur])
        db.flush()

        # 2. Seed 6 Departments
        departments_data = [
            Department(
                id="maintenance",
                name="Facilities & Biomedical Engineering",
                code="MNT",
                description="Ceiling fans, lighting, plumbing, medical gas outlets, HVAC, and room equipment.",
                icon="Wrench",
                supervisor_id=sup_mnt.id
            ),
            Department(
                id="doctors",
                name="Physicians & Duty Doctors",
                code="DOC",
                description="Attending physician consultations, urgent rounds, clinical symptom inquiries.",
                icon="Stethoscope",
                supervisor_id=admin.id
            ),
            Department(
                id="nursing",
                name="Clinical Nursing Staff",
                code="NUR",
                description="Nurse call assistance, vitals check, IV drip monitoring, patient mobility.",
                icon="HeartPulse",
                supervisor_id=sup_nur.id
            ),
            Department(
                id="housekeeping",
                name="Housekeeping & Sanitation",
                code="HSK",
                description="Room sanitization, spill cleanup, waste disposal, fresh bed linen replacements.",
                icon="Sparkles",
                supervisor_id=sup_mnt.id
            ),
            Department(
                id="billing",
                name="Patient Accounts & Billing",
                code="BIL",
                description="Insurance pre-authorization, pharmacy bill clarification, interim invoice reviews.",
                icon="Receipt",
                supervisor_id=admin.id
            ),
            Department(
                id="pharmacy",
                name="Inpatient Clinical Pharmacy",
                code="PHM",
                description="Discharge prescription dispatch, STAT medication requests, IV consumables.",
                icon="Pill",
                supervisor_id=admin.id
            )
        ]
        db.add_all(departments_data)
        db.flush()

        # Link supervisors to their departments now that departments exist
        sup_mnt.department_id = "maintenance"
        sup_nur.department_id = "nursing"
        db.flush()

        # 3. Staff Users
        staff_members = [
            User(
                email="technician.rajesh@careops.hospital",
                name="Rajesh Sharma",
                role="staff",
                department_id="maintenance",
                phone="+91 98765 33301",
                avatar_url=None,
                hashed_password=pw_hash
            ),
            User(
                email="technician.kiran@careops.hospital",
                name="Kiran Patel",
                role="staff",
                department_id="maintenance",
                phone="+91 98765 33302",
                avatar_url=None,
                hashed_password=pw_hash
            ),
            User(
                email="nurse.priya@careops.hospital",
                name="Staff Nurse Priya Nair",
                role="staff",
                department_id="nursing",
                phone="+91 98765 33303",
                avatar_url=None,
                hashed_password=pw_hash
            ),
            User(
                email="nurse.arun@careops.hospital",
                name="Staff Nurse Arun Kumar",
                role="staff",
                department_id="nursing",
                phone="+91 98765 33304",
                avatar_url=None,
                hashed_password=pw_hash
            ),
            User(
                email="hk.suresh@careops.hospital",
                name="Suresh Yadav",
                role="staff",
                department_id="housekeeping",
                phone="+91 98765 33305",
                avatar_url=None,
                hashed_password=pw_hash
            ),
            User(
                email="billing.anita@careops.hospital",
                name="Anita Deshmukh",
                role="staff",
                department_id="billing",
                phone="+91 98765 33306",
                avatar_url=None,
                hashed_password=pw_hash
            ),
            User(
                email="pharmacy.rahul@careops.hospital",
                name="Rahul Sen",
                role="staff",
                department_id="pharmacy",
                phone="+91 98765 33307",
                avatar_url=None,
                hashed_password=pw_hash
            )
        ]
        db.add_all(staff_members)
        db.flush()

        # 4. Seed Hospital Rooms with QR Tokens
        rooms = [
            Room(room_number="Room 204", floor="Floor 2", wing="East Wing (Cardiology)", qr_token="CARE-RM204-7X9Q", bed_count=1),
            Room(room_number="Room 205", floor="Floor 2", wing="East Wing (Cardiology)", qr_token="CARE-RM205-2M4K", bed_count=1),
            Room(room_number="Room 312", floor="Floor 3", wing="West Wing (General Med)", qr_token="CARE-RM312-9A8L", bed_count=2),
            Room(room_number="ICU Bed 04", floor="Floor 1", wing="Critical Care Unit", qr_token="CARE-ICU04-3V7P", bed_count=1),
            Room(room_number="Deluxe Suite 501", floor="Floor 5", wing="VIP Pavilion", qr_token="CARE-DLX501-8T2R", bed_count=1),
            Room(room_number="Post-Op Ward 108", floor="Floor 1", wing="Surgical Recovery", qr_token="CARE-POP108-5N1W", bed_count=4)
        ]
        db.add_all(rooms)
        db.flush()

        # 5. SLA Policies
        sla_policies = [
            # Maintenance
            SLAPolicy(department_id="maintenance", priority="critical", ack_target_minutes=15, resolution_target_minutes=60, reminder_1_minutes_before=20, reminder_2_minutes_before=5),
            SLAPolicy(department_id="maintenance", priority="high", ack_target_minutes=30, resolution_target_minutes=120, reminder_1_minutes_before=30, reminder_2_minutes_before=10),
            SLAPolicy(department_id="maintenance", priority="medium", ack_target_minutes=60, resolution_target_minutes=240, reminder_1_minutes_before=60, reminder_2_minutes_before=15),
            SLAPolicy(department_id="maintenance", priority="low", ack_target_minutes=120, resolution_target_minutes=480, reminder_1_minutes_before=90, reminder_2_minutes_before=30),
            # Nursing
            SLAPolicy(department_id="nursing", priority="critical", ack_target_minutes=5, resolution_target_minutes=20, reminder_1_minutes_before=10, reminder_2_minutes_before=3),
            SLAPolicy(department_id="nursing", priority="high", ack_target_minutes=15, resolution_target_minutes=45, reminder_1_minutes_before=15, reminder_2_minutes_before=5),
            SLAPolicy(department_id="nursing", priority="medium", ack_target_minutes=30, resolution_target_minutes=90, reminder_1_minutes_before=20, reminder_2_minutes_before=5),
            # Housekeeping
            SLAPolicy(department_id="housekeeping", priority="high", ack_target_minutes=15, resolution_target_minutes=45, reminder_1_minutes_before=15, reminder_2_minutes_before=5),
            SLAPolicy(department_id="housekeeping", priority="medium", ack_target_minutes=30, resolution_target_minutes=90, reminder_1_minutes_before=20, reminder_2_minutes_before=10),
            # Doctors
            SLAPolicy(department_id="doctors", priority="critical", ack_target_minutes=10, resolution_target_minutes=30, reminder_1_minutes_before=10, reminder_2_minutes_before=3),
            SLAPolicy(department_id="doctors", priority="high", ack_target_minutes=20, resolution_target_minutes=60, reminder_1_minutes_before=15, reminder_2_minutes_before=5),
            # Billing
            SLAPolicy(department_id="billing", priority="medium", ack_target_minutes=60, resolution_target_minutes=180, reminder_1_minutes_before=30, reminder_2_minutes_before=10),
            # Pharmacy
            SLAPolicy(department_id="pharmacy", priority="critical", ack_target_minutes=10, resolution_target_minutes=30, reminder_1_minutes_before=10, reminder_2_minutes_before=5),
            SLAPolicy(department_id="pharmacy", priority="high", ack_target_minutes=20, resolution_target_minutes=60, reminder_1_minutes_before=15, reminder_2_minutes_before=5)
        ]
        db.add_all(sla_policies)
        db.flush()

        # 6. Realistic Sample Tickets across states
        seed_demo_tickets(db)

        print("Successfully seeded CareOps AI database with 6 departments, staff, rooms, and live tickets!")

    except Exception as e:
        db.rollback()
        print(f"Error during database seed: {e}")
        raise e
    finally:
        db.close()


def seed_demo_tickets(db: Session):
    """Seeds or re-seeds 5 realistic demonstration tickets across hospital departments"""
    now = utc_now()
    rooms = db.query(Room).order_by(Room.id).all()
    if not rooms or len(rooms) < 5:
        return

    staff_members = db.query(User).filter(User.role == "staff").order_by(User.id).all()
    if not staff_members:
        return

    sup_mnt = db.query(User).filter(User.department_id == "maintenance", User.role == "supervisor").first()
    sup_nur = db.query(User).filter(User.department_id == "nursing", User.role == "supervisor").first()
    if not sup_mnt:
        sup_mnt = staff_members[0]
    if not sup_nur:
        sup_nur = staff_members[0]

    # Ticket 1: The flagship Ceiling Fan repair with AI verification
    t1 = Ticket(
        ticket_number="TKT-MNT-1001",
        title="Ceiling Fan Not Rotating - Room 204",
        description="Patient in Bed 1 reports the ceiling fan fails to start when regulator switch is turned to max. Whirring noise heard from the motor capacitor.",
        voice_recording_url="/uploads/audio/demo_fan_complaint.webm",
        voice_transcription="Hello nurse station, the overhead ceiling fan in room 204 isn't spinning even though the wall switch is on. It's getting quite warm.",
        department_id="maintenance",
        room_id=rooms[0].id,
        room_number=rooms[0].room_number,
        category="Ceiling Fan",
        priority="high",
        status="resolution_submitted",
        is_escalated=False,
        assigned_staff_id=staff_members[0].id,  # Rajesh
        assigned_supervisor_id=sup_mnt.id,
        sla_acknowledgement_deadline=now - timedelta(minutes=90),
        sla_resolution_deadline=now + timedelta(minutes=40),
        acknowledged_at=now - timedelta(minutes=100),
        in_progress_at=now - timedelta(minutes=80),
        resolution_submitted_at=now - timedelta(minutes=15),
        resolution_summary="Replaced faulty 3.15uF capacitor and re-lubricated motor ball bearing assembly. Fan inspected for balanced clearance.",
        parts_replaced="3.15uF Havells Motor Capacitor",
        functional_test_notes="Ran at Step 5 for 10 minutes without rattling or heat buildup. Blade clearance 34cm verified.",
        patient_contact="+91 98451 00293",
        created_at=now - timedelta(minutes=110)
    )
    db.add(t1)
    db.flush()

    # Evidences for T1
    ev_t1_before = Evidence(
        ticket_id=t1.id,
        stage="before",
        media_type="video",
        file_url="https://assets.mixkit.co/videos/preview/mixkit-ceiling-fan-in-a-white-room-42861-large.mp4",
        file_size_bytes=4210000,
        file_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        equipment_type="Ceiling Fan",
        uploaded_by_id=staff_members[0].id,
        notes="Before: Switch turned on, motor stationary. Video demonstrates complete absence of blade rotation."
    )
    ev_t1_after = Evidence(
        ticket_id=t1.id,
        stage="after",
        media_type="video",
        file_url="https://assets.mixkit.co/videos/preview/mixkit-ceiling-fan-rotating-in-a-room-42862-large.mp4",
        file_size_bytes=5180000,
        file_hash="ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
        equipment_type="Ceiling Fan",
        uploaded_by_id=staff_members[0].id,
        notes="After: Capacitor replaced, fan running smoothly at high speed. Blade motion clearly visible."
    )
    db.add_all([ev_t1_before, ev_t1_after])
    db.flush()

    ai_t1 = AIVerificationJob(
        ticket_id=t1.id,
        status="completed",
        before_evidence_id=ev_t1_before.id,
        after_evidence_id=ev_t1_after.id,
        evidence_relevance="high",
        equipment_match="confirmed_match",
        visible_fault_assessment="fault_cleared",
        after_repair_functional_evidence="movement_observed",
        media_quality="high",
        missing_evidence="[]",
        inconsistencies="[]",
        ai_recommendation="likely_resolved",
        review_requirement="standard_signoff",
        confidence_score=0.92,
        analysis_notes="Both before and after video streams clearly demonstrate identical Crompton ceiling fan fixture in Room 204. Pre-repair: stationary blades with energized switch circuit. Post-repair: continuous 320 RPM rotational motion detected with zero blade wobble. Operational criteria satisfied.",
        model_version="careops-vision-v2.4",
        analysis_timestamp=now - timedelta(minutes=14)
    )
    db.add(ai_t1)

    t1_note_pub = TicketNote(
        ticket_id=t1.id,
        author_id=staff_members[0].id,
        author_name=staff_members[0].name,
        content="Fan motor inspected. Capacitor replacement completed. Running operational test.",
        is_internal=False,
        created_at=now - timedelta(minutes=20)
    )
    t1_note_priv = TicketNote(
        ticket_id=t1.id,
        author_id=staff_members[0].id,
        author_name=staff_members[0].name,
        content="Internal: The old capacitor was bulged due to past grid surge. Replaced with genuine OEM stock from rack B4.",
        is_internal=True,
        created_at=now - timedelta(minutes=18)
    )
    db.add_all([t1_note_pub, t1_note_priv])

    # Ticket 2: Overdue Escalated Ticket (demonstrates SLA breach & alert)
    t2 = Ticket(
        ticket_number="TKT-MNT-1002",
        title="Bathroom Faucet Heavy Leakage - Room 205",
        description="Continuous high-pressure leak from hot water mixer tap creating slip hazard.",
        department_id="maintenance",
        room_id=rooms[1].id,
        room_number=rooms[1].room_number,
        category="Plumbing",
        priority="high",
        status="acknowledged",
        is_escalated=True,
        escalation_level=2,
        escalation_reason="Resolution SLA deadline breached. Immediate supervisor review required.",
        assigned_staff_id=staff_members[1].id if len(staff_members) > 1 else staff_members[0].id,
        assigned_supervisor_id=sup_mnt.id,
        sla_acknowledgement_deadline=now - timedelta(minutes=150),
        sla_resolution_deadline=now - timedelta(minutes=35),
        acknowledged_at=now - timedelta(minutes=140),
        delay_reason="Waiting for specialized ceramic cartridge shutoff valve from central store",
        revised_eta=now + timedelta(minutes=45),
        created_at=now - timedelta(minutes=180)
    )
    db.add(t2)
    db.flush()

    esc_t2 = EscalationLog(
        ticket_id=t2.id,
        escalation_level=2,
        trigger_reason="Resolution target time exceeded (120 mins). Ticket escalated to Operations Supervisor Vikramaditya Rao.",
        notified_supervisor_id=sup_mnt.id,
        delivery_status="delivered",
        created_at=now - timedelta(minutes=35)
    )
    db.add(esc_t2)

    # Ticket 3: Nursing STAT IV pump alert
    t3 = Ticket(
        ticket_number="TKT-NUR-1003",
        title="IV Infusion Pump Occlusion Alarm - ICU Bed 04",
        description="Infusion pump sounding downstream occlusion alarm. Patient experiencing mild discomfort.",
        department_id="nursing",
        room_id=rooms[3].id,
        room_number=rooms[3].room_number,
        category="Nurse Call",
        priority="critical",
        status="in_progress",
        is_escalated=False,
        assigned_staff_id=staff_members[2].id if len(staff_members) > 2 else staff_members[0].id,
        assigned_supervisor_id=sup_nur.id,
        sla_acknowledgement_deadline=now - timedelta(minutes=15),
        sla_resolution_deadline=now + timedelta(minutes=10),
        acknowledged_at=now - timedelta(minutes=18),
        in_progress_at=now - timedelta(minutes=12),
        created_at=now - timedelta(minutes=20)
    )
    db.add(t3)

    # Ticket 4: Housekeeping sanitization
    t4 = Ticket(
        ticket_number="TKT-HSK-1004",
        title="Post-Discharge Terminal Room Sanitization - Room 312",
        description="Patient discharged at 10:30 AM. Deep UV sanitization and linen reset required for next scheduled admission.",
        department_id="housekeeping",
        room_id=rooms[2].id,
        room_number=rooms[2].room_number,
        category="Housekeeping",
        priority="medium",
        status="assigned",
        is_escalated=False,
        assigned_staff_id=staff_members[4].id if len(staff_members) > 4 else staff_members[0].id,
        assigned_supervisor_id=sup_mnt.id,
        sla_acknowledgement_deadline=now + timedelta(minutes=25),
        sla_resolution_deadline=now + timedelta(minutes=85),
        created_at=now - timedelta(minutes=5)
    )
    db.add(t4)

    # Ticket 5: Closed Ticket with Full AI and Supervisor Verification
    t5 = Ticket(
        ticket_number="TKT-MNT-1000",
        title="Corridor Emergency Light Flickering - Floor 5",
        description="Ballast failure causing high frequency strobe in VIP Pavilion corridor.",
        department_id="maintenance",
        room_id=rooms[4].id,
        room_number=rooms[4].room_number,
        category="Lighting",
        priority="medium",
        status="closed",
        is_escalated=False,
        assigned_staff_id=staff_members[0].id,
        assigned_supervisor_id=sup_mnt.id,
        sla_acknowledgement_deadline=now - timedelta(hours=5),
        sla_resolution_deadline=now - timedelta(hours=2),
        acknowledged_at=now - timedelta(hours=4, minutes=50),
        in_progress_at=now - timedelta(hours=4, minutes=10),
        resolution_submitted_at=now - timedelta(hours=3),
        closed_at=now - timedelta(hours=2, minutes=40),
        resolution_summary="Installed new 18W Philips LED driver unit. Lux meter reading: 320 lux.",
        parts_replaced="18W Philips Constant Current Driver",
        functional_test_notes="Flicker index tested at 0.02 (standard < 0.05). Emergency battery backup verified.",
        created_at=now - timedelta(hours=5, minutes=10)
    )
    db.add(t5)
    db.flush()

    # Initial audit logs
    db.add_all([
        AuditLog(
            ticket_id=t1.id,
            action="TICKET_INITIAL_SUBMISSION",
            actor_name="Patient (Room 204)",
            actor_role="patient",
            details=json.dumps({"room": "Room 204", "category": "Ceiling Fan"}),
            created_at=now - timedelta(minutes=110)
        ),
        AuditLog(
            ticket_id=t1.id,
            action="RESOLUTION_SUBMITTED",
            actor_id=staff_members[0].id,
            actor_name=staff_members[0].name,
            actor_role="staff",
            details=json.dumps({"parts": "3.15uF Havells Motor Capacitor"}),
            created_at=now - timedelta(minutes=15)
        ),
        AuditLog(
            ticket_id=t2.id,
            action="SLA_RESOLUTION_BREACH",
            actor_name="SLA Monitor Engine",
            actor_role="system",
            details=json.dumps({"breach_level": 2, "overdue_minutes": 35}),
            created_at=now - timedelta(minutes=35)
        )
    ])

    db.commit()
    print("Demo tickets successfully seeded!")


def seed_google_reviews(db: Session):
    print("Seeding Google Business Profile and live reviews intelligence...")
    now = utc_now()

    # 1. Connected Integration
    integration = GoogleIntegration(
        account_email="hospital.relations@careops.hospital",
        account_name="CareOps Memorial Health System",
        status="connected",
        access_token_encrypted="sandbox_acc_verified_live_token_2026",
        refresh_token_encrypted="sandbox_ref_verified_live_token_2026",
        token_expires_at=now + timedelta(days=30),
        last_sync_at=now - timedelta(minutes=12),
        locations_count=3
    )
    db.add(integration)
    db.flush()

    # 2. Locations
    loc1 = GoogleLocation(
        integration_id=integration.id,
        google_location_id="locations/careops-main-101",
        location_name="CareOps University Hospital - Main Campus",
        address="100 Healthcare Boulevard, Metro Health District",
        phone_number="+91 98765 00100",
        average_rating=4.1,
        total_reviews_count=342,
        is_active=True
    )
    loc2 = GoogleLocation(
        integration_id=integration.id,
        google_location_id="locations/careops-cardio-202",
        location_name="CareOps Advanced Cardiology & Surgical Pavilion",
        address="104 Healthcare Boulevard, Building B (East Wing)",
        phone_number="+91 98765 00104",
        average_rating=4.5,
        total_reviews_count=188,
        is_active=True
    )
    loc3 = GoogleLocation(
        integration_id=integration.id,
        google_location_id="locations/careops-womens-303",
        location_name="CareOps Maternal & Pediatric Healthcare Center",
        address="120 CareOps Park, South Ward",
        phone_number="+91 98765 00120",
        average_rating=3.8,
        total_reviews_count=94,
        is_active=True
    )
    db.add_all([loc1, loc2, loc3])
    db.flush()

    # Staff & Supervisors
    admin = db.query(User).filter(User.role == "admin").first()
    admin_id = admin.id if admin else None

    # Review 1: 1-Star Critical Review (Emergency Triage Delay)
    r1 = GoogleReview(
        location_id=loc1.id,
        google_review_id="rev_google_1001",
        author_name="Kavita Ramachandran",
        author_photo_url="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100",
        star_rating=1,
        review_text="Emergency triage was completely neglected. Brought my elderly father with severe chest tightness and waited over 3 hours without a basic ECG or doctor consultation while staff conversed casually. Highly irresponsible conduct in what is advertised as a Level 1 Trauma center.",
        original_review_url="https://maps.google.com/?cid=careops_review_1001",
        review_created_at=now - timedelta(hours=3, minutes=20),
        is_low_rating_alert=True,
        alert_priority="critical",
        investigation_status="investigating",
        assigned_department_id="doctors",
        assigned_owner_id=admin_id,
        internal_notes="[Shift Medical Officer Note]: Registration log indicates patient arrived at 14:15 during mass-casualty highway accident influx. ECG technician was deployed in Resuscitation Bay 1. Triage nurse failed to explain priority delay to waiting family. Clinical Director notified.",
        public_reply_status="draft_ready",
        public_reply_draft="Dear Kavita Ramachandran, thank you for bringing your concerns regarding emergency wait time and medical consultation to our leadership's attention. At CareOps University Hospital, our priority is to provide attentive and prompt clinical care to every individual, and we deeply regret that your father's experience did not reflect our standards. Due to healthcare privacy laws, we cannot discuss specific clinical details publicly. Please contact our Medical Director directly at patient.relations@careops.hospital or call +91 98765 00100 so we can immediately review this incident with you."
    )
    db.add(r1)
    db.flush()

    alt1 = ReviewAlert(
        review_id=r1.id,
        star_rating=1,
        priority="critical",
        alert_status="acknowledged",
        acknowledged_at=now - timedelta(hours=2),
        acknowledged_by=admin_id,
        notification_status="delivered",
        notification_sent_at=now - timedelta(hours=3, minutes=19)
    )
    db.add(alt1)

    ai1 = ReviewAIAnalysis(
        review_id=r1.id,
        review_summary="1-star critical complaint regarding emergency triage delay and doctor availability for acute chest pain.",
        detected_topics=json.dumps(["Waiting time", "Doctor communication"]),
        sentiment="strongly_negative",
        severity="critical",
        suggested_department="doctors",
        possible_root_causes=json.dumps([
            "Concurrent mass-casualty triage surge causing bedside diversion",
            "Lack of proactive status communication from waiting area triage desk",
            "Delayed escalation to senior cardiology registrar on duty"
        ]),
        recommended_actions=json.dumps([
            "Audit emergency arrival-to-ECG door-to-needle timestamps for reported date",
            "Mandate immediate communication protocol for triage delays > 30 minutes",
            "Establish standby clinical registrar roster for chest pain fast-track"
        ]),
        evidence_needed=json.dumps(["Emergency registration timestamps", "Triage nurse duty log"]),
        suggested_public_reply=r1.public_reply_draft,
        confidence=0.94,
        human_review_required=True,
        model_version="careops-reputation-ai-v1.0"
    )
    db.add(ai1)

    cap1 = ReviewCorrectiveAction(
        task_number="CAP-2026-0001",
        review_id=r1.id,
        issue_summary="Emergency Chest Pain Triage Door-to-ECG Protocol Enforcement",
        department_id="doctors",
        assigned_to_id=admin_id,
        priority="critical",
        due_date=now + timedelta(days=1),
        status="investigating",
        investigation_notes="Chief Medical Officer reviewing audio logs and triage register.",
        root_cause="Triage priority communication breakdown during mass trauma event.",
        corrective_action="Implement mandatory 10-minute ECG benchmark for all chest pain arrivals regardless of casualty influx.",
        preventive_action="Digital triage board integrated with CareOps alert chime in doctor duty room.",
        completion_evidence=None
    )
    db.add(cap1)

    # Review 2: 2-Star High Alert (Billing & Discharge Coordination Delay)
    r2 = GoogleReview(
        location_id=loc1.id,
        google_review_id="rev_google_1002",
        author_name="Vikram Sengupta",
        author_photo_url="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
        star_rating=2,
        review_text="Discharge process took almost 5 hours after the physician signed the discharge summary. The billing counter could not explain insurance pre-auth deductions and staff were defensive. Nursing care was good, but discharge coordination is terribly frustrating.",
        original_review_url="https://maps.google.com/?cid=careops_review_1002",
        review_created_at=now - timedelta(hours=6, minutes=40),
        is_low_rating_alert=True,
        alert_priority="high",
        investigation_status="action_taken",
        assigned_department_id="billing",
        assigned_owner_id=admin_id,
        internal_notes="[Billing Supervisor Note]: TPA portal was offline for 90 minutes. Physical bill dispatch from pharmacy delayed final tally. Discharged patient waited unnecessarily in corridor.",
        public_reply_status="approved",
        public_reply_draft="Dear Vikram Sengupta, thank you for sharing your feedback. While we are glad you experienced good nursing care, we sincerely apologize for the prolonged wait and lack of clarity at the billing counter during discharge. We take billing transparency very seriously. Our Patient Accounts Manager has been tasked with auditing this incident. Please reach out to patient.relations@careops.hospital so we can directly share a clarified statement of your account."
    )
    db.add(r2)
    db.flush()

    alt2 = ReviewAlert(
        review_id=r2.id,
        star_rating=2,
        priority="high",
        alert_status="acknowledged",
        acknowledged_at=now - timedelta(hours=5),
        acknowledged_by=admin_id,
        notification_status="delivered",
        notification_sent_at=now - timedelta(hours=6, minutes=38)
    )
    db.add(alt2)

    ai2 = ReviewAIAnalysis(
        review_id=r2.id,
        review_summary="2-star high-priority review regarding 5-hour discharge delay and insurance billing opacity.",
        detected_topics=json.dumps(["Billing", "Waiting time", "Nursing service"]),
        sentiment="negative",
        severity="high",
        suggested_department="billing",
        possible_root_causes=json.dumps([
            "Third-party administrator (TPA) insurance gateway downtime",
            "Manual paper routing between pharmacy dispensing and billing cashier"
        ]),
        recommended_actions=json.dumps([
            "Audit discharge cycle time from physician sign-off to final invoice",
            "Enable digital pre-discharge settlement while patient rests in room"
        ]),
        evidence_needed=json.dumps(["TPA submission log", "Pharmacy invoice clearance timestamp"]),
        suggested_public_reply=r2.public_reply_draft,
        confidence=0.91,
        human_review_required=True,
        model_version="careops-reputation-ai-v1.0"
    )
    db.add(ai2)

    cap2 = ReviewCorrectiveAction(
        task_number="CAP-2026-0002",
        review_id=r2.id,
        issue_summary="Discharge Billing Turnaround Time SLA Optimization",
        department_id="billing",
        assigned_to_id=admin_id,
        priority="high",
        due_date=now + timedelta(days=2),
        status="action_required",
        investigation_notes="Billing manager verified 95-minute gap between physician sign-off and cashier receipt.",
        root_cause="Manual paper voucher transit between pharmacy and main billing.",
        corrective_action="Institute automated API push from hospital pharmacy straight into patient discharge ledger.",
        preventive_action="Hard SLA cap: Maximum 90 minutes from physician sign-off to discharge folder handover.",
        completion_evidence=None
    )
    db.add(cap2)

    # Review 3: 3-Star Review (Normal - Proves Rule: NO Low-Rating Alert by Default)
    r3 = GoogleReview(
        location_id=loc1.id,
        google_review_id="rev_google_1003",
        author_name="Ananya Iyer",
        author_photo_url="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100",
        star_rating=3,
        review_text="Doctors and treatment were very competent. However, the night shift in 4th floor ward was quite noisy with constant call bells and maintenance staff moving trolleys. Room cleanliness was satisfactory.",
        original_review_url="https://maps.google.com/?cid=careops_review_1003",
        review_created_at=now - timedelta(days=1, hours=2),
        is_low_rating_alert=False,
        alert_priority="none",
        investigation_status="uninvestigated",
        assigned_department_id="nursing",
        public_reply_status="draft_ready",
        public_reply_draft="Dear Ananya Iyer, thank you for sharing your experience at CareOps University Hospital. We appreciate your balanced perspective and commendation of our doctors. We have notified our night nursing supervisor regarding nighttime noise levels to ensure restful healing for all patients."
    )
    db.add(r3)
    db.flush()

    ai3 = ReviewAIAnalysis(
        review_id=r3.id,
        review_summary="3-star review commending medical treatment but noting night ward noise from call bells and trolleys.",
        detected_topics=json.dumps(["Nursing service", "Maintenance", "Cleanliness"]),
        sentiment="neutral",
        severity="medium",
        suggested_department="nursing",
        possible_root_causes=json.dumps(["High night call bell volume", "Wheel bearing friction on floor utility trolleys"]),
        recommended_actions=json.dumps(["Enforce night quiet hours (22:00 - 06:00)", "Lubricate ward service trolley wheels"]),
        evidence_needed=json.dumps([]),
        suggested_public_reply=r3.public_reply_draft,
        confidence=0.86,
        human_review_required=False,
        model_version="careops-reputation-ai-v1.0"
    )
    db.add(ai3)

    # Review 4: 4-Star Review (Positive Experience)
    r4 = GoogleReview(
        location_id=loc2.id,
        google_review_id="rev_google_1004",
        author_name="Deepak Verma",
        author_photo_url="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100",
        star_rating=4,
        review_text="Smooth outpatient cardiology consultation with Dr. Varma. Clean premises, modern ECG equipment, and courteous nursing staff. Pharmacy line was slightly slow but overall very reassuring experience.",
        original_review_url="https://maps.google.com/?cid=careops_review_1004",
        review_created_at=now - timedelta(days=2, hours=4),
        is_low_rating_alert=False,
        alert_priority="none",
        investigation_status="resolved",
        assigned_department_id="doctors",
        public_reply_status="posted",
        public_reply_draft="Dear Deepak Verma, thank you for visiting CareOps Cardiology Pavilion. We are delighted to hear you had a reassuring consultation with Dr. Varma and our nursing team. We look forward to continuing to serve you."
    )
    db.add(r4)
    db.flush()

    ai4 = ReviewAIAnalysis(
        review_id=r4.id,
        review_summary="4-star positive review commending cardiology consultation and nursing, minor pharmacy wait.",
        detected_topics=json.dumps(["Doctor communication", "Nursing service", "Pharmacy"]),
        sentiment="positive",
        severity="low",
        suggested_department="doctors",
        possible_root_causes=json.dumps([]),
        recommended_actions=json.dumps(["Share positive commendation with Dr. Varma and cardiology nursing unit"]),
        evidence_needed=json.dumps([]),
        suggested_public_reply=r4.public_reply_draft,
        confidence=0.92,
        human_review_required=False,
        model_version="careops-reputation-ai-v1.0"
    )
    db.add(ai4)

    # Review 5: 5-Star Review (Exemplary In-Room Service, Linked to Internal Ticket)
    t5_ref = db.query(Ticket).first()
    r5 = GoogleReview(
        location_id=loc1.id,
        google_review_id="rev_google_1005",
        author_name="Sunita Menon",
        author_photo_url="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
        star_rating=5,
        review_text="Outstanding care from admission to discharge in Deluxe Suite 501. The in-room QR code for service requests worked like magic – technician Kiran fixed the AC remote in 12 minutes! World-class patient experience and accountable staff.",
        original_review_url="https://maps.google.com/?cid=careops_review_1005",
        review_created_at=now - timedelta(days=3),
        is_low_rating_alert=False,
        alert_priority="none",
        investigation_status="resolved",
        assigned_department_id="maintenance",
        linked_ticket_id=t5_ref.id if t5_ref else None,
        public_reply_status="posted",
        public_reply_draft="Dear Sunita Menon, thank you so much for your kind words! We are thrilled to hear that your stay in Deluxe Suite 501 was seamless and that our CareOps room QR system served you effectively. Wishing you radiant health!"
    )
    db.add(r5)
    db.flush()

    ai5 = ReviewAIAnalysis(
        review_id=r5.id,
        review_summary="5-star glowing commendation for deluxe suite care and rapid QR maintenance response.",
        detected_topics=json.dumps(["Maintenance", "General service"]),
        sentiment="positive",
        severity="low",
        suggested_department="maintenance",
        possible_root_causes=json.dumps([]),
        recommended_actions=json.dumps(["Commend technician Kiran and ward supervisor for exceptional turnaround"]),
        evidence_needed=json.dumps([]),
        suggested_public_reply=r5.public_reply_draft,
        confidence=0.98,
        human_review_required=False,
        model_version="careops-reputation-ai-v1.0"
    )
    db.add(ai5)

    db.commit()
    print("Google Business Profile and live reviews intelligence successfully seeded!")


def seed_nps_and_security(db: Session):
    print("Seeding NPS responses and system security settings...")
    now = utc_now()

    # 1. Ensure SystemSecuritySetting row 1 exists
    sec = db.query(SystemSecuritySetting).filter(SystemSecuritySetting.id == 1).first()
    if not sec:
        sec = SystemSecuritySetting(
            id=1,
            max_failed_logins=3,
            lockout_duration_minutes=30,
            session_timeout_minutes=60,
            require_password_symbols=True,
            require_password_min_length=8,
            whatsapp_provider="meta_business_api",
            ai_vision_provider="mock",
            ai_vision_model="careops-vision-default"
        )
        db.add(sec)
        db.flush()

    # 2. NPS Responses across canonical departments
    if not db.query(NPSResponse).first():
        sample_responses = [
            {"dept": "maintenance", "room": "ICU-Bed-04", "emoji": "happy", "nps": 10, "comment": "AC fan repaired in under 15 minutes. Very quiet and courteous technician.", "crit": False, "days": 0},
            {"dept": "maintenance", "room": "Ward-102", "emoji": "happy", "nps": 9, "comment": "Bathroom tap leak fixed quickly. Excellent service.", "crit": False, "days": 1},
            {"dept": "maintenance", "room": "Room-204", "emoji": "okay", "nps": 7, "comment": "Work was completed but technician arrived 25 minutes after acknowledgement.", "crit": False, "days": 2},
            {"dept": "maintenance", "room": "Room-305", "emoji": "unhappy", "nps": 3, "comment": "Exhaust fan still making loud vibrating noise after technician left.", "crit": True, "days": 3},
            {"dept": "housekeeping", "room": "Room-401", "emoji": "happy", "nps": 10, "comment": "Spotless room cleaning and waste disposal. Very hygienic.", "crit": False, "days": 0},
            {"dept": "housekeeping", "room": "Room-208", "emoji": "happy", "nps": 9, "comment": "Prompt floor sanitization after accidental spill.", "crit": False, "days": 1},
            {"dept": "housekeeping", "room": "Ward-302", "emoji": "okay", "nps": 8, "comment": "Adequate cleaning. Arrived slightly late during shift handover.", "crit": False, "days": 3},
            {"dept": "linen", "room": "Room-105", "emoji": "happy", "nps": 9, "comment": "Fresh hypoallergenic bedsheets delivered within 10 minutes.", "crit": False, "days": 1},
            {"dept": "linen", "room": "Room-502", "emoji": "unhappy", "nps": 4, "comment": "Requested extra clean blanket, took over 45 minutes to arrive.", "crit": True, "days": 2},
            {"dept": "medical", "room": "ICU-Bed-02", "emoji": "happy", "nps": 10, "comment": "Nurse call response was rapid and doctor explained medication clearly.", "crit": False, "days": 0},
            {"dept": "medical", "room": "Room-310", "emoji": "happy", "nps": 9, "comment": "Doctor visited promptly and addressed chest discomfort with empathy.", "crit": False, "days": 2},
            {"dept": "medical", "room": "Ward-201", "emoji": "okay", "nps": 7, "comment": "Care was good but shift change caused a brief delay in scheduled vitals check.", "crit": False, "days": 4},
            {"dept": "it", "room": "Doctor-Consult-12", "emoji": "happy", "nps": 10, "comment": "Bedside patient monitoring display synced immediately.", "crit": False, "days": 1},
            {"dept": "it", "room": "Room-102", "emoji": "unhappy", "nps": 5, "comment": "Patient TV WiFi portal kept disconnecting throughout the evening.", "crit": True, "days": 2},
            {"dept": "it", "room": "Room-405", "emoji": "happy", "nps": 9, "comment": "Technician resolved the nurse call system network issue efficiently.", "crit": False, "days": 3},
        ]

        tickets = db.query(Ticket).all()
        ticket_map = {t.department_id: t.id for t in tickets}

        for idx, sr in enumerate(sample_responses):
            t_id = ticket_map.get(sr["dept"])
            resp = NPSResponse(
                ticket_id=t_id,
                patient_contact="+91 98765 111" + str(idx).zfill(2),
                department_id=sr["dept"],
                room_number=sr["room"],
                emoji_rating=sr["emoji"],
                nps_score=sr["nps"],
                feedback_comment=sr["comment"],
                is_critical=sr["crit"],
                is_demo=True,
                created_at=now - timedelta(days=sr["days"], hours=idx * 2)
            )
            db.add(resp)

    db.commit()
    print("NPS & Security settings successfully initialized!")



if __name__ == "__main__":
    seed_database()
