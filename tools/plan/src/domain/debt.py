"""Technical debt tracking domain entities."""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Optional
import uuid


class DebtCategory(Enum):
    """Category of technical debt."""
    SECURITY = "security"
    TESTS = "tests"
    ARCHITECTURE = "architecture"
    BUILD = "build"
    DOCS = "docs"
    PERFORMANCE = "perf"
    VALIDATION = "validation"


class DebtSeverity(Enum):
    """Severity of technical debt."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class DebtEntry:
    """
    Technical debt entry for tracking exceptions and waivers.

    Invariants:
    - expiry_date is mandatory for Tier A tasks
    - debt_id is auto-generated if not provided
    """
    task_id: str
    category: DebtCategory
    severity: DebtSeverity
    owner: str
    description: str
    remediation: str
    expiry_date: Optional[date] = None
    debt_id: str = field(default_factory=lambda: f"DEBT-{uuid.uuid4().hex[:8].upper()}")
    created_at: datetime = field(default_factory=datetime.utcnow)
    evidence_links: tuple[str, ...] = field(default_factory=tuple)
    resolved_at: Optional[datetime] = None
    resolution_notes: str = ""

    def is_expired(self, reference_date: Optional[date] = None) -> bool:
        """Check if this debt entry has expired."""
        if self.expiry_date is None:
            return False
        check_date = reference_date or date.today()
        return self.expiry_date < check_date

    def days_until_expiry(self, reference_date: Optional[date] = None) -> Optional[int]:
        """Calculate days until expiry, or None if no expiry set."""
        if self.expiry_date is None:
            return None
        check_date = reference_date or date.today()
        return (self.expiry_date - check_date).days

    def is_expiring_soon(self, days_threshold: int = 30, reference_date: Optional[date] = None) -> bool:
        """Check if debt is expiring within threshold days."""
        days = self.days_until_expiry(reference_date)
        if days is None:
            return False
        return 0 < days <= days_threshold

    def is_resolved(self) -> bool:
        """Check if debt has been resolved."""
        return self.resolved_at is not None

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "debt_id": self.debt_id,
            "task_id": self.task_id,
            "category": self.category.value,
            "severity": self.severity.value,
            "owner": self.owner,
            "description": self.description,
            "remediation": self.remediation,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "created_at": self.created_at.isoformat(),
            "evidence_links": list(self.evidence_links),
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolution_notes": self.resolution_notes,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "DebtEntry":
        """Create from dictionary."""
        return cls(
            debt_id=data.get("debt_id", f"DEBT-{uuid.uuid4().hex[:8].upper()}"),
            task_id=data["task_id"],
            category=DebtCategory(data["category"]),
            severity=DebtSeverity(data["severity"]),
            owner=data["owner"],
            description=data["description"],
            remediation=data["remediation"],
            expiry_date=date.fromisoformat(data["expiry_date"]) if data.get("expiry_date") else None,
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else datetime.utcnow(),
            evidence_links=tuple(data.get("evidence_links", [])),
            resolved_at=datetime.fromisoformat(data["resolved_at"]) if data.get("resolved_at") else None,
            resolution_notes=data.get("resolution_notes", ""),
        )


@dataclass
class DebtLedger:
    """Collection of debt entries with summary statistics."""
    entries: list[DebtEntry] = field(default_factory=list)

    def add(self, entry: DebtEntry) -> None:
        """Add a debt entry."""
        self.entries.append(entry)

    def get_by_task(self, task_id: str) -> list[DebtEntry]:
        """Get all debt entries for a task."""
        return [e for e in self.entries if e.task_id == task_id]

    def get_active(self) -> list[DebtEntry]:
        """Get all non-resolved debt entries."""
        return [e for e in self.entries if not e.is_resolved()]

    def get_expired(self, reference_date: Optional[date] = None) -> list[DebtEntry]:
        """Get all expired debt entries."""
        return [e for e in self.get_active() if e.is_expired(reference_date)]

    def get_expiring_soon(self, days_threshold: int = 30, reference_date: Optional[date] = None) -> list[DebtEntry]:
        """Get debt entries expiring within threshold."""
        return [e for e in self.get_active() if e.is_expiring_soon(days_threshold, reference_date)]

    def count_by_severity(self) -> dict[DebtSeverity, int]:
        """Count active entries by severity."""
        counts = {s: 0 for s in DebtSeverity}
        for entry in self.get_active():
            counts[entry.severity] += 1
        return counts

    def count_by_category(self) -> dict[DebtCategory, int]:
        """Count active entries by category."""
        counts = {c: 0 for c in DebtCategory}
        for entry in self.get_active():
            counts[entry.category] += 1
        return counts

    def summary(self) -> dict:
        """Generate summary statistics."""
        active = self.get_active()
        return {
            "total_active": len(active),
            "total_resolved": len(self.entries) - len(active),
            "expired": len(self.get_expired()),
            "expiring_soon": len(self.get_expiring_soon()),
            "by_severity": {s.value: c for s, c in self.count_by_severity().items()},
            "by_category": {c.value: cnt for c, cnt in self.count_by_category().items()},
        }
