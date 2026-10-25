"""
Enterprise Role-Based Access Control (RBAC) & Granular Permission Matrix Service
Enforces strict healthcare SaaS authorization hierarchies, granular permissions,
and prevents privilege escalation.
"""

from typing import List, Dict, Any, Optional
import json

# ==============================================================================
# PERMISSION MATRIX CATALOG SPECIFICATION
# Matches exactly the module x action matrix: Read, Create, Edit, Delete, Assign, Export
# ==============================================================================

PERMISSION_MODULES = [
    {
        "id": "tickets",
        "name": "Tickets",
        "description": "Patient complaints, service orders, triage, and resolution workflows",
        "actions": [
            {"id": "read", "key": "tickets.read", "label": "Read", "description": "View service orders and complaints"},
            {"id": "create", "key": "tickets.create", "label": "Create", "description": "Create new service orders"},
            {"id": "update", "key": "tickets.update", "label": "Edit", "description": "Update ticket details, start work, resolve"},
            {"id": "delete", "key": "tickets.delete", "label": "Delete", "description": "Cancel or close service tickets"},
            {"id": "assign", "key": "tickets.assign", "label": "Assign", "description": "Assign tickets to staff or supervisors"},
            {"id": "export", "key": "tickets.export", "label": "Export", "description": "Export ticket datasets and reports"}
        ]
    },
    {
        "id": "staff",
        "name": "Staff",
        "description": "Hospital staff identities, accounts, contact details, and department linkage",
        "actions": [
            {"id": "read", "key": "staff.read", "label": "Read", "description": "View staff personnel directory"},
            {"id": "create", "key": "staff.create", "label": "Create", "description": "Provision new staff accounts"},
            {"id": "update", "key": "staff.update", "label": "Edit", "description": "Update staff designations, departments, contact"},
            {"id": "deactivate", "key": "staff.deactivate", "label": "Delete", "description": "Deactivate staff accounts"},
            {"id": "assign", "key": "staff.assign", "label": "Assign", "description": "Assign staff to supervisors and departments"},
            {"id": "export", "key": "staff.export", "label": "Export", "description": "Export staff directory records"}
        ]
    },
    {
        "id": "supervisors",
        "name": "Supervisors",
        "description": "Department lead accounts, team coordination, and escalated incident oversight",
        "actions": [
            {"id": "read", "key": "supervisors.read", "label": "Read", "description": "View supervisor profiles and roster"},
            {"id": "create", "key": "supervisors.create", "label": "Create", "description": "Provision department supervisor accounts"},
            {"id": "update", "key": "supervisors.update", "label": "Edit", "description": "Edit supervisor responsibilities and contact"},
            {"id": "deactivate", "key": "supervisors.deactivate", "label": "Delete", "description": "Deactivate supervisor accounts"},
            {"id": "assign", "key": "supervisors.assign", "label": "Assign", "description": "Assign supervisors to departments and staff"},
            {"id": "export", "key": "supervisors.export", "label": "Export", "description": "Export supervisor rosters"}
        ]
    },
    {
        "id": "departments",
        "name": "Departments",
        "description": "Hospital departments: Maintenance, Housekeeping, Linen, Medical, IT",
        "actions": [
            {"id": "read", "key": "departments.read", "label": "Read", "description": "View department performance and analytics"},
            {"id": "create", "key": "departments.create", "label": "Create", "description": "Create new hospital departments"},
            {"id": "update", "key": "departments.update", "label": "Edit", "description": "Update department details and policies"},
            {"id": "delete", "key": "departments.delete", "label": "Delete", "description": "Deactivate or archive departments"},
            {"id": "assign", "key": "departments.assign", "label": "Assign", "description": "Assign supervisor leads to departments"},
            {"id": "export", "key": "departments.export", "label": "Export", "description": "Export department analytics and stats"}
        ]
    },
    {
        "id": "qr",
        "name": "QR Management",
        "description": "Bedside room points, QR codes, placarding, and patient digital portals",
        "actions": [
            {"id": "read", "key": "qr.read", "label": "Read", "description": "View registered room points and QR tokens"},
            {"id": "create", "key": "qr.create", "label": "Create", "description": "Register bedside rooms and generate QR codes"},
            {"id": "update", "key": "qr.update", "label": "Edit", "description": "Edit room numbers, wings, and bed counts"},
            {"id": "delete", "key": "qr.delete", "label": "Delete", "description": "Deactivate or revoke room QR codes"}
        ]
    },
    {
        "id": "analytics",
        "name": "Analytics",
        "description": "Executive telemetry, operational metrics, SLA compliance, and trend reports",
        "actions": [
            {"id": "read", "key": "analytics.read", "label": "Read", "description": "View operational analytics and dashboards"},
            {"id": "export", "key": "analytics.export", "label": "Export", "description": "Export executive analytics reports"}
        ]
    },
    {
        "id": "audit",
        "name": "Audit Logs",
        "description": "Immutable security events, administrative actions, and staff activity trails",
        "actions": [
            {"id": "read", "key": "audit.read", "label": "Read", "description": "View immutable audit logs and timelines"},
            {"id": "export", "key": "audit.export", "label": "Export", "description": "Export compliance audit logs"}
        ]
    },
    {
        "id": "nps",
        "name": "NPS & Patient Experience",
        "description": "Patient emoji feedback (Unhappy, Okay, Happy), formal 0-10 NPS, and satisfaction telemetry",
        "actions": [
            {"id": "read", "key": "nps.read", "label": "Read", "description": "View patient satisfaction & NPS scores"},
            {"id": "create", "key": "nps.create", "label": "Create", "description": "Record patient feedback entries"},
            {"id": "update", "key": "nps.update", "label": "Edit", "description": "Acknowledge and action critical feedback alerts"},
            {"id": "export", "key": "nps.export", "label": "Export", "description": "Export patient satisfaction reports"}
        ]
    },
    {
        "id": "google_reviews",
        "name": "Google Reviews",
        "description": "Google Business Profile reviews, sub-3-star critical alerts, and AI draft responses",
        "actions": [
            {"id": "read", "key": "google_reviews.read", "label": "Read", "description": "View Google reviews and reputation telemetry"},
            {"id": "create", "key": "google_reviews.create", "label": "Create", "description": "Trigger review sync or ingest reviews"},
            {"id": "update", "key": "google_reviews.update", "label": "Edit", "description": "Regenerate draft replies and internal investigation notes"},
            {"id": "export", "key": "google_reviews.export", "label": "Export", "description": "Export Google reviews audit data"}
        ]
    },
    {
        "id": "cap",
        "name": "Corrective Action Plans",
        "description": "Root-cause investigations, CAP task tracking, preventive actions, and sign-offs",
        "actions": [
            {"id": "read", "key": "cap.read", "label": "Read", "description": "View corrective action plan registers"},
            {"id": "create", "key": "cap.create", "label": "Create", "description": "Initiate corrective action plan tasks"},
            {"id": "update", "key": "cap.update", "label": "Edit", "description": "Update CAP progress, root cause, and evidence"},
            {"id": "delete", "key": "cap.delete", "label": "Delete", "description": "Archive or dismiss CAP records"},
            {"id": "assign", "key": "cap.assign", "label": "Assign", "description": "Assign CAP tasks to department leads"},
            {"id": "export", "key": "cap.export", "label": "Export", "description": "Export CAP reports and compliance records"}
        ]
    }
]

# Superadmin specific modules
SUPERADMIN_MODULES = [
    {
        "id": "admin_mgmt",
        "name": "Admin Account Management",
        "description": "Create, edit, activate, deactivate, and configure permissions for Admin accounts",
        "actions": [
            {"id": "read", "key": "admin.read", "label": "Read", "description": "View Admin accounts"},
            {"id": "create", "key": "admin.create", "label": "Create", "description": "Create Admin accounts"},
            {"id": "update", "key": "admin.update", "label": "Edit", "description": "Update Admin account details"},
            {"id": "deactivate", "key": "admin.deactivate", "label": "Delete", "description": "Deactivate Admin accounts"},
            {"id": "permissions_manage", "key": "admin.permissions_manage", "label": "Permissions", "description": "Configure permission matrix for Admins"}
        ]
    },
    {
        "id": "security_settings",
        "name": "System Security Settings",
        "description": "System-level security controls, lockout thresholds, and API configurations",
        "actions": [
            {"id": "read", "key": "security_settings.read", "label": "Read", "description": "View system security settings"},
            {"id": "update", "key": "security_settings.manage", "label": "Edit", "description": "Configure system security policies"}
        ]
    },
    {
        "id": "db_maintenance",
        "name": "Database Maintenance",
        "description": "Protected category-based demo data clearing and purge operations",
        "actions": [
            {"id": "execute", "key": "db_maintenance.execute", "label": "Execute", "description": "Execute database maintenance clearing"}
        ]
    }
]

# Flatten catalog for key-to-description mapping
PERMISSIONS_CATALOG: Dict[str, str] = {}
for mod in PERMISSION_MODULES + SUPERADMIN_MODULES:
    for act in mod["actions"]:
        PERMISSIONS_CATALOG[act["key"]] = f"{mod['name']} - {act['label']}: {act['description']}"

# Backward Compatibility Aliases
PERMISSION_ALIASES = {
    "staff.activate": "staff.update",
    "staff.unlock": "staff.update",
    "staff.password_reset": "staff.update",
    "roles.read": "staff.read",
    "roles.manage": "staff.update",
    "roles.assign": "staff.assign",
    "permissions.manage": "staff.update",
    "security_events.read": "audit.read",
    "tickets.resolve": "tickets.update",
    "tickets.close": "tickets.delete",
    "rooms.manage": "qr.update",
    "sla.manage": "departments.update",
    "clinical.read": "tickets.read",
    "billing.manage": "tickets.read",
    "pharmacy.manage": "tickets.read"
}

# Base role definitions
HOSPITAL_ROLES: Dict[str, Dict[str, Any]] = {
    "superadmin": {
        "id": "superadmin",
        "name": "Super Administrator",
        "description": "System owner with root platform authority: full access to all operational modules, tickets, reviews, staff directory, plus exclusive admin provisioning, security settings, and database purge.",
        "protected_system_role": True,
        "permissions": [
            "tickets.read", "tickets.create", "tickets.update", "tickets.delete", "tickets.assign", "tickets.export",
            "staff.read", "staff.create", "staff.update", "staff.deactivate", "staff.assign", "staff.export",
            "supervisors.read", "supervisors.create", "supervisors.update", "supervisors.deactivate", "supervisors.assign", "supervisors.export",
            "departments.read", "departments.create", "departments.update", "departments.delete", "departments.assign", "departments.export",
            "qr.read", "qr.create", "qr.update", "qr.delete",
            "analytics.read", "analytics.export",
            "audit.read", "audit.export",
            "nps.read", "nps.create", "nps.update", "nps.export",
            "google_reviews.read", "google_reviews.create", "google_reviews.update", "google_reviews.export",
            "cap.read", "cap.create", "cap.update", "cap.delete", "cap.assign", "cap.export",
            "admin.read", "admin.create", "admin.update", "admin.deactivate", "admin.permissions_manage",
            "security_settings.read", "security_settings.manage",
            "db_maintenance.execute"
        ]
    },
    "admin": {
        "id": "admin",
        "name": "Hospital Administrator",
        "description": "Full operational administrator: manages supervisors and staff, department scopes, tickets, SLAs, QR codes, analytics, NPS, Google reviews, and corrective action plans. No database clearing.",
        "protected_system_role": True,
        "permissions": [
            "tickets.read", "tickets.create", "tickets.update", "tickets.delete", "tickets.assign", "tickets.export",
            "staff.read", "staff.create", "staff.update", "staff.deactivate", "staff.assign", "staff.export",
            "supervisors.read", "supervisors.create", "supervisors.update", "supervisors.deactivate", "supervisors.assign", "supervisors.export",
            "departments.read", "departments.create", "departments.update", "departments.delete", "departments.assign", "departments.export",
            "qr.read", "qr.create", "qr.update", "qr.delete",
            "analytics.read", "analytics.export",
            "audit.read", "audit.export",
            "nps.read", "nps.create", "nps.update", "nps.export",
            "google_reviews.read", "google_reviews.create", "google_reviews.update", "google_reviews.export",
            "cap.read", "cap.create", "cap.update", "cap.delete", "cap.assign", "cap.export"
        ]
    },
    "supervisor": {
        "id": "supervisor",
        "name": "Department Supervisor",
        "description": "Operational departmental lead: manages assigned staff, reviews department tickets, monitors SLAs, investigates critical reviews, and resolves department complaints.",
        "protected_system_role": True,
        "permissions": [
            "tickets.read", "tickets.create", "tickets.update", "tickets.assign", "tickets.export",
            "staff.read", "staff.update",
            "supervisors.read",
            "departments.read",
            "qr.read",
            "analytics.read", "analytics.export",
            "nps.read", "nps.update",
            "google_reviews.read", "google_reviews.update",
            "cap.read", "cap.create", "cap.update"
        ]
    },
    "staff": {
        "id": "staff",
        "name": "Department Staff Member",
        "description": "Operational frontline staff: accesses assigned department tickets, acknowledges tasks, captures evidence, and submits work completion.",
        "protected_system_role": False,
        "permissions": [
            "tickets.read", "tickets.update",
            "staff.read",
            "nps.read"
        ]
    }
}

# Legacy role mappings for seed/demo data
LEGACY_ROLE_MAP = {
    "it_admin": "admin",
    "doctor": "staff",
    "nurse": "staff",
    "housekeeping": "staff",
    "billing": "staff",
    "pharmacy": "staff",
    "reception": "staff",
    "auditor": "supervisor"
}

def get_role_permissions(role_id: str) -> List[str]:
    """Retrieve default permissions for a designated role."""
    clean_role = LEGACY_ROLE_MAP.get(role_id, role_id)
    role = HOSPITAL_ROLES.get(clean_role)
    if not role:
        return ["staff.read", "tickets.read"]
    return role.get("permissions", [])

def get_user_permissions(user) -> List[str]:
    """
    Calculate effective permissions for a user, combining base role permissions
    and any custom authorized permissions overrides stored in PostgreSQL.
    """
    if not user:
        return []
    
    # Check if custom override exists
    if hasattr(user, "permissions_override") and user.permissions_override:
        try:
            overrides = json.loads(user.permissions_override)
            if isinstance(overrides, list) and len(overrides) > 0:
                # User has customized persistent permission set
                return sorted(list(set(overrides)))
        except Exception:
            pass
            
    # Default to base role permissions
    clean_role = LEGACY_ROLE_MAP.get(user.role, user.role)
    return sorted(list(set(get_role_permissions(clean_role))))

def has_permission(user, permission_key: str) -> bool:
    """Check if the given user holds the requested permission key."""
    if not user or not user.is_active or getattr(user, "account_status", "active") != "active":
        return False
    
    # Root superadmin holds all system and operational permissions
    if getattr(user, "role", "") == "superadmin":
        return True
    
    effective = set(get_user_permissions(user))
    
    # Direct check
    if permission_key in effective:
        return True
        
    # Check alias
    canonical = PERMISSION_ALIASES.get(permission_key)
    if canonical and canonical in effective:
        return True
        
    return False

def get_all_roles_metadata() -> List[Dict[str, Any]]:
    """Return all hospital roles formatted for administration view."""
    results = []
    for r_id, r_info in HOSPITAL_ROLES.items():
        results.append({
            "id": r_id,
            "name": r_info["name"],
            "description": r_info["description"],
            "protected_system_role": r_info["protected_system_role"],
            "permissions": r_info["permissions"],
            "permission_count": len(r_info["permissions"])
        })
    return results

def get_permission_matrix_catalog(is_superadmin: bool = False) -> List[Dict[str, Any]]:
    """Returns the permission modules structured for the UI matrix."""
    modules = list(PERMISSION_MODULES)
    if is_superadmin:
        modules.extend(SUPERADMIN_MODULES)
    return modules
