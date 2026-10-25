"""
Automated Migration & Enterprise Personnel Backfill Utility
Ensures SQLite / PostgreSQL tables have all required IAM & RBAC columns,
ensures canonical departments exist, backfills existing seed users with valid Employee IDs,
and seeds cross-department personnel without foreign key violations.
"""

import logging
from sqlalchemy import text, inspect, or_
from app.database import engine, Base, SessionLocal
from app.models import User, Department, Ticket, Notification
from app.services.auth_service import get_password_hash

logger = logging.getLogger("careops.migrations")

def run_migrations():
    logger.info("Executing enterprise IAM database schema migrations...")

    # Step 1: Ensure all base tables exist
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        logger.warning(f"Base.metadata.create_all notice: {e}")

    is_postgres = engine.dialect.name == "postgresql"
    datetime_type = "TIMESTAMP WITH TIME ZONE" if is_postgres else "DATETIME"
    bool_type = "BOOLEAN DEFAULT FALSE" if is_postgres else "BOOLEAN DEFAULT 0"
    bool_true_type = "BOOLEAN DEFAULT TRUE" if is_postgres else "BOOLEAN DEFAULT 1"

    # Step 2: Ensure all required columns exist across tables
    table_columns = {
        "departments": [
            ("supervisor_id", "INTEGER"),
            ("categories", "TEXT"),
            ("is_active", bool_true_type),
        ],
        "users": [
            ("employee_id", "VARCHAR(50)"),
            ("designation", "VARCHAR(100)"),
            ("account_status", "VARCHAR(30) DEFAULT 'active'"),
            ("failed_login_attempts", "INTEGER DEFAULT 0"),
            ("locked_at", datetime_type),
            ("locked_reason", "VARCHAR(255)"),
            ("last_login_at", datetime_type),
            ("must_change_password", bool_type),
            ("password_reset_token", "VARCHAR(255)"),
            ("password_reset_expires_at", datetime_type),
            ("permissions_override", "TEXT"),
            ("supervisor_id", "INTEGER"),
            ("mobile_number", "VARCHAR(50)"),
            ("is_demo", bool_type),
            ("token_version", "INTEGER DEFAULT 1"),
            ("patient_id", "VARCHAR(50)"),
        ],
        "tickets": [
            ("patient_user_id", "INTEGER"),
            ("patient_email", "VARCHAR(150)"),
            ("patient_tracking_token", "VARCHAR(100)"),
            ("assigned_at", datetime_type),
            ("en_route_at", datetime_type),
            ("work_started_at", datetime_type),
            ("work_completed_at", datetime_type),
            ("estimated_arrival_minutes", "INTEGER"),
            ("estimated_arrival_at", datetime_type),
            ("is_demo", bool_type),
        ],
        "rooms": [
            ("is_demo", bool_type),
        ],
        "evidences": [
            ("is_demo", bool_type),
        ],
        "ai_verifications": [
            ("is_demo", bool_type),
            ("provider_selected", "VARCHAR(50) DEFAULT 'mock'"),
            ("model_name_selected", "VARCHAR(100) DEFAULT 'careops-vision-default'"),
        ],
        "google_reviews": [
            ("is_demo", bool_type),
        ],
        "nps_responses": [
            ("source", "VARCHAR(100) DEFAULT 'Bedside QR Code'"),
            ("investigation_notes", "TEXT"),
            ("corrective_action", "TEXT"),
            ("resolution_status", "VARCHAR(50) DEFAULT 'unresolved'"),
            ("resolved_by", "VARCHAR(100)"),
            ("resolved_at", datetime_type),
        ],
        "escalation_settings": [
            ("resend_api_key", "VARCHAR(255)"),
        ]
    }

    if is_postgres:
        # In PostgreSQL, execute each ADD COLUMN IF NOT EXISTS in autocommit mode so failed commands do not abort transaction
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            for tbl, cols in table_columns.items():
                for col_name, col_def in cols:
                    try:
                        conn.exec_driver_sql(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col_name} {col_def}")
                    except Exception as ex:
                        logger.warning(f"PostgreSQL column migration notice {tbl}.{col_name}: {ex}")

            # Foreign key handling for audit_logs
            try:
                conn.exec_driver_sql("""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM information_schema.table_constraints
                            WHERE constraint_name = 'audit_logs_ticket_id_fkey'
                        ) THEN
                            ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_ticket_id_fkey;
                            ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_ticket_id_fkey 
                                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
                        END IF;
                    END $$;
                """)
            except Exception as e:
                logger.warning(f"Could not update audit_logs constraint: {e}")
    else:
        # In SQLite, inspect columns and add missing ones
        with engine.connect() as conn:
            inspector = inspect(conn)
            for tbl, cols in table_columns.items():
                try:
                    existing_cols = {col["name"] for col in inspector.get_columns(tbl)}
                except Exception:
                    existing_cols = set()
                for col_name, col_def in cols:
                    if col_name not in existing_cols:
                        try:
                            conn.exec_driver_sql(f"ALTER TABLE {tbl} ADD COLUMN {col_name} {col_def}")
                        except Exception as ex:
                            logger.warning(f"SQLite column migration notice {tbl}.{col_name}: {ex}")
            conn.commit()

    # Step 3: Seed Canonical Departments FIRST so foreign keys work
    db = SessionLocal()
    try:
        canonical_depts = [
            {
                "id": "maintenance",
                "name": "Maintenance",
                "code": "MNT",
                "icon": "Wrench",
                "description": "Electrical and lighting, AC and climate control, plumbing and restroom, general facilities."
            },
            {
                "id": "housekeeping",
                "name": "Housekeeping",
                "code": "HSK",
                "icon": "Sparkles",
                "description": "Room turnover & cleaning, waste disposal, spill & sanitation, amenities restock."
            },
            {
                "id": "linen",
                "name": "Linen",
                "code": "LIN",
                "icon": "Shirt",
                "description": "Bed sheet exchange, pillow & blanket request, towel restock, patient gown replacement."
            },
            {
                "id": "medical",
                "name": "Medical",
                "code": "MED",
                "icon": "Stethoscope",
                "description": "Attending physician assistance, clinical inquiries, vitals check, and nurse calls."
            },
            {
                "id": "it",
                "name": "IT",
                "code": "IT",
                "icon": "Laptop",
                "description": "Bedside TVs and screens, patient Wi-Fi, room network and telephony equipment."
            }
        ]

        for cd in canonical_depts:
            dept_obj = db.query(Department).filter(Department.id == cd["id"]).first()
            if not dept_obj:
                dept_obj = Department(
                    id=cd["id"],
                    name=cd["name"],
                    code=cd["code"],
                    icon=cd["icon"],
                    description=cd["description"],
                    is_active=True
                )
                db.add(dept_obj)
            else:
                dept_obj.name = cd["name"]
                dept_obj.code = cd["code"]
                dept_obj.icon = cd["icon"]
                dept_obj.description = cd["description"]
                dept_obj.is_active = True
                db.add(dept_obj)

        db.commit()

        # Step 4: Migrate legacy departments on tickets and users to canonical departments
        dept_mappings = {
            "biomedical": "maintenance",
            "doctors": "medical",
            "nursing": "medical",
            "billing": "medical",
            "pharmacy": "medical"
        }

        for old_id, new_id in dept_mappings.items():
            db.query(Ticket).filter(Ticket.department_id == old_id).update({Ticket.department_id: new_id}, synchronize_session=False)
            db.query(User).filter(User.department_id == old_id).update({User.department_id: new_id}, synchronize_session=False)
            old_dept = db.query(Department).filter(Department.id == old_id).first()
            if old_dept:
                old_dept.is_active = False

        db.commit()

        # Step 5: Backfill / Ensure Core Personnel
        pw_hash = get_password_hash("password123")
        core_personnel = [
            {
                "email": "admin@careops.hospital",
                "name": "Dr. Pavithra",
                "emp_id": "EMP-ADM-0001",
                "designation": "Chief Medical Officer & Hospital Administrator",
                "role": "admin",
                "department_id": None,
                "phone": "+91 98765 43210"
            },
            {
                "email": "superadmin@careops.hospital",
                "name": "System Superadmin",
                "emp_id": "EMP-ROOT-0001",
                "designation": "Root Platform & Security Super Administrator",
                "role": "superadmin",
                "department_id": None,
                "phone": "+91 98765 00000"
            },
            {
                "email": "supervisor.mnt@careops.hospital",
                "name": "Vikramaditya Rao",
                "emp_id": "EMP-MNT-0100",
                "designation": "Head of Facilities & Maintenance Engineering",
                "role": "supervisor",
                "department_id": "maintenance",
                "phone": "+91 98765 11111"
            },
            {
                "email": "supervisor.nur@careops.hospital",
                "name": "Sister Mary Thomas",
                "emp_id": "EMP-NUR-0100",
                "designation": "Inpatient Nursing Superintendent",
                "role": "supervisor",
                "department_id": "medical",
                "phone": "+91 98765 22222"
            },
            {
                "email": "technician.rajesh@careops.hospital",
                "name": "Rajesh Sharma",
                "emp_id": "EMP-MNT-1001",
                "designation": "Senior Facilities & Electrical Technician",
                "role": "staff",
                "department_id": "maintenance",
                "phone": "+91 98765 33333"
            },
            {
                "email": "technician.kiran@careops.hospital",
                "name": "Kiran Patel",
                "emp_id": "EMP-MNT-1002",
                "designation": "HVAC & Climate Control Specialist",
                "role": "staff",
                "department_id": "maintenance",
                "phone": "+91 98765 33334"
            },
            {
                "email": "nurse.priya@careops.hospital",
                "name": "Priya Nair",
                "emp_id": "EMP-NUR-1001",
                "designation": "Critical Care & Medical Staff Nurse",
                "role": "staff",
                "department_id": "medical",
                "phone": "+91 98765 33335"
            },
            {
                "email": "nurse.arun@careops.hospital",
                "name": "Arun Kumar",
                "emp_id": "EMP-NUR-1002",
                "designation": "Clinical Ward Care Nurse",
                "role": "staff",
                "department_id": "medical",
                "phone": "+91 98765 33336"
            },
            {
                "email": "hk.suresh@careops.hospital",
                "name": "Suresh Yadav",
                "emp_id": "EMP-HSK-1001",
                "designation": "Sanitation & Ward Hygiene Lead",
                "role": "staff",
                "department_id": "housekeeping",
                "phone": "+91 98765 33337"
            },
            {
                "email": "itadmin@careops.hospital",
                "name": "Amit Verma",
                "emp_id": "EMP-IT-0050",
                "designation": "IT Systems & Room Connectivity Lead",
                "role": "staff",
                "department_id": "it",
                "phone": "+91 98765 44401"
            }
        ]

        for p in core_personnel:
            u = db.query(User).filter(or_(User.email == p["email"], User.employee_id == p["emp_id"])).first()
            if not u:
                u = User(
                    email=p["email"],
                    name=p["name"],
                    employee_id=p["emp_id"],
                    designation=p["designation"],
                    role=p["role"],
                    department_id=p["department_id"],
                    phone=p["phone"],
                    hashed_password=pw_hash,
                    is_active=True,
                    account_status="active",
                    failed_login_attempts=0
                )
                db.add(u)
                logger.info(f"Created personnel: {p['name']} ({p['email']})")
            else:
                u.email = p["email"]
                if not u.employee_id:
                    u.employee_id = p["emp_id"]
                if not u.name:
                    u.name = p["name"]
                if not u.designation:
                    u.designation = p["designation"]
                if p["department_id"] and not u.department_id:
                    u.department_id = p["department_id"]
                if p["phone"] and not u.phone:
                    u.phone = p["phone"]
                u.is_active = True
                if not u.account_status:
                    u.account_status = "active"

        db.commit()

        # Step 7: Department Categories & Multi-Supervisor Standardization (Section 3 & 7)
        import json
        from app.models import DepartmentSupervisor

        DEFAULT_CATEGORIES = {
            "maintenance": [
                "Electrical issue",
                "Plumbing issue",
                "Air conditioning",
                "Equipment repair",
                "General maintenance"
            ],
            "nursing": [
                "Nursing assistance",
                "Bedside support",
                "Ward-related service request",
                "Other approved nursing request"
            ],
            "dietitian": [
                "Diet consultation",
                "Diet-plan query",
                "Food-related dietary concern"
            ],
            "food_services": [
                "Meal not received",
                "Food quality concern",
                "Incorrect meal",
                "Other approved food-service request"
            ],
            "housekeeping": [
                "Room cleaning",
                "Spill cleanup",
                "Trash disposal",
                "Linen change",
                "Disinfection"
            ],
            "billing": [
                "Billing query",
                "Insurance claim inquiry",
                "Discharge billing estimate",
                "Receipt copy"
            ]
        }

        # Populate categories for existing and canonical departments
        all_depts = db.query(Department).all()
        for d in all_depts:
            if not d.categories:
                cats = DEFAULT_CATEGORIES.get(d.id, [
                    f"{d.name} Service Request",
                    f"{d.name} Urgent Assistance",
                    "General Inquiry"
                ])
                d.categories = json.dumps(cats)

        # Ensure canonical departments from master prompt exist
        canonical_prompts = [
            ("dietitian", "Dietitian", "DIET", "Nutrition and clinical dietary consultation", "HeartPulse"),
            ("food_services", "Food Services", "FOOD", "Hospital patient meal planning and food delivery", "UtensilsCrossed"),
        ]
        for c_id, c_name, c_code, c_desc, c_icon in canonical_prompts:
            if not db.query(Department).filter(Department.id == c_id).first():
                new_d = Department(
                    id=c_id,
                    name=c_name,
                    code=c_code,
                    description=c_desc,
                    icon=c_icon,
                    categories=json.dumps(DEFAULT_CATEGORIES.get(c_id, ["General Inquiry"])),
                    is_active=True
                )
                db.add(new_d)
                logger.info(f"Created canonical department: {c_name} ({c_id})")

        db.flush()

        # Seed illustrative supervisors and staff from master prompt (Section 5)
        # Supervisors: Mohan, Younus for Maintenance
        # Staff: Ashif, Sathya, Syed for Maintenance
        prompt_personnel = [
            # Supervisors
            {"email": "mohan.supervisor@careops.hospital", "name": "Mohan", "role": "supervisor", "dept": "maintenance", "emp_id": "EMP-MNT-SUP1", "desig": "Senior Maintenance Supervisor"},
            {"email": "younus.supervisor@careops.hospital", "name": "Younus", "role": "supervisor", "dept": "maintenance", "emp_id": "EMP-MNT-SUP2", "desig": "Operations Supervisor"},
            {"email": "dietitian.lead@careops.hospital", "name": "Dr. Sarah Rao", "role": "supervisor", "dept": "dietitian", "emp_id": "EMP-DIE-SUP1", "desig": "Chief Clinical Dietitian"},
            {"email": "food.lead@careops.hospital", "name": "Chef Anand Kumar", "role": "supervisor", "dept": "food_services", "emp_id": "EMP-FOD-SUP1", "desig": "Food Services Supervisor"},
            # Staff
            {"email": "ashif.staff@careops.hospital", "name": "Ashif", "role": "staff", "dept": "maintenance", "emp_id": "EMP-MNT-001", "desig": "HVAC & Electrical Specialist"},
            {"email": "sathya.staff@careops.hospital", "name": "Sathya", "role": "staff", "dept": "maintenance", "emp_id": "EMP-MNT-002", "desig": "Plumbing & Fixture Specialist"},
            {"email": "syed.staff@careops.hospital", "name": "Syed", "role": "staff", "dept": "maintenance", "emp_id": "EMP-MNT-003", "desig": "Biomedical Equipment Specialist"},
        ]

        for p in prompt_personnel:
            user = db.query(User).filter(or_(User.email == p["email"], User.employee_id == p["emp_id"])).first()
            if not user:
                user = User(
                    email=p["email"],
                    name=p["name"],
                    role=p["role"],
                    department_id=p["dept"],
                    employee_id=p["emp_id"],
                    designation=p["desig"],
                    hashed_password=pw_hash,
                    account_status="active",
                    is_active=True
                )
                db.add(user)
                db.flush()
                logger.info(f"Seeded prompt personnel: {p['name']} ({p['email']}, role={p['role']})")
            else:
                user.email = p["email"]
                user.employee_id = p["emp_id"]
                user.name = p["name"]
                user.role = p["role"]
                user.department_id = p["dept"]
                user.designation = p["desig"]
                user.hashed_password = pw_hash
                user.is_active = True
                user.account_status = "active"
                user.failed_login_attempts = 0

        db.flush()

        # Step 8: Sync department_supervisors table
        desired_links = set()
        for d in db.query(Department).all():
            if d.supervisor_id:
                desired_links.add((d.id, d.supervisor_id))

        supervisors = db.query(User).filter(User.role == "supervisor", User.is_active == True).all()
        for s in supervisors:
            if s.department_id:
                desired_links.add((s.department_id, s.id))

        for dept_id, user_id in desired_links:
            existing_rel = db.query(DepartmentSupervisor).filter(
                DepartmentSupervisor.department_id == dept_id,
                DepartmentSupervisor.user_id == user_id
            ).first()
            if not existing_rel:
                db.add(DepartmentSupervisor(department_id=dept_id, user_id=user_id))
                logger.info(f"Linked supervisor #{user_id} to department {dept_id}")

        db.commit()
        logger.info("Enterprise IAM and Department standardization completed successfully.")
    except Exception as e:
        db.rollback()
        logger.error(f"Error during migration backfill: {e}", exc_info=True)
    finally:
        db.close()
