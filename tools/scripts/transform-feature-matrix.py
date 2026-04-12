#!/usr/bin/env python3
"""Transform feature-matrix.md: add Wiring Status, split Frontend into List/Detail, add Events + Security gates.

Reads docs/company/product/feature-matrix.md, transforms the Feature Matrix table,
updates metadata sections, writes back in-place.
"""

import re
import sys
from pathlib import Path

INPUT = Path("docs/company/product/feature-matrix.md")
ORIGINAL = Path("tools/scripts/feature-matrix-original.md")  # Extracted from git HEAD for clean transform

# ──────────────────────────────────────────────────────────────────────────────
# Audit data — from entity detail wiring audits (2026-03-03 to 2026-03-07)
# ──────────────────────────────────────────────────────────────────────────────

AUDITED_GROUPS = {'Lead', 'Contact', 'Account', 'Deal'}

# (group, feature_name_prefix) -> wiring_status for features with status=done
# NOTE: Entries are checked BEFORE the AUDITED_GROUPS filter, so features in
# non-audited groups (e.g. Calendar, Platform) can still get per-feature status.
WIRING_AUDIT = {
    # Lead (2 done features)
    ('Lead', 'Lead to Contact Conversion Logic'): 'verified',
    ('Lead', 'Lead to Deal Conversion Logic'): 'issues',

    # Contact (9 done features)
    ('Contact', 'Account contacts panel'): 'issues',
    ('Contact', 'Contact 360 Page'): 'issues',
    ('Contact', 'Contact activity timeline'): 'issues',
    ('Contact', 'Contact Activity Tracking'): 'issues',
    ('Contact', 'Contact filters'): 'verified',
    ('Contact', 'Contact relationship view'): 'verified',
    ('Contact', 'Contact search'): 'verified',
    ('Contact', 'Contact tRPC Router'): 'issues',
    ('Contact', 'Contacts Module'): 'issues',

    # Account (3 done features)
    ('Account', 'Account hierarchy view'): 'verified',
    ('Account', 'Account opportunities panel'): 'issues',
    ('Account', 'Account revenue charts'): 'verified',

    # Deal (17 done features)
    ('Deal', 'Company & Product Master Brief'): 'verified',
    ('Deal', 'Deal forecast history'): 'verified',
    ('Deal', 'Deal forecast probability gauge'): 'verified',
    ('Deal', 'Deal forecast recommendations'): 'verified',
    ('Deal', 'Deal forecast risk factors'): 'verified',
    ('Deal', 'Deal Forecasting & Reporting'): 'issues',
    ('Deal', 'Deal Lost Closure Workflow'): 'issues',
    ('Deal', 'Deal pipeline Kanban board'): 'verified',
    ('Deal', 'Deal stage drag-drop'): 'verified',
    ('Deal', 'Deal Won Closure Workflow'): 'issues',
    ('Deal', 'Deal/Opportunity tRPC Router'): 'issues',
    ('Deal', 'Deals Pipeline - Kanban Board'): 'verified',
    ('Deal', 'Fix 6 broken Quick Action hrefs'): 'verified',
    ('Deal', 'LangChain Pipeline Design'): 'verified',
    ('Deal', 'Pipeline filtering'): 'issues',
    ('Deal', 'Pipeline Stage Customization'): 'verified',
    ('Deal', 'Ticket Stats Enhancement'): 'issues',

    # Task (7 done features — audit 2026-03-07, cross-group: Calendar + Platform)
    ('Calendar', 'Task calendar view'): 'issues',
    ('Calendar', 'Task tRPC Router'): 'issues',
    ('Platform', 'Task Aggregate and Value Objects'): 'verified',
    ('Platform', 'Task assignments'): 'issues',
    ('Platform', 'Task entity linking'): 'issues',
    ('Platform', 'Task list view'): 'issues',
    ('Platform', 'Task reminders'): 'issues',
}

# Group-level event handler coverage (from wiring audits)
GROUP_EVENTS = {
    'Lead': 'partial (3/5 handlers)',
    'Contact': 'partial (2/4 handlers)',
    'Account': 'not-wired (0/5 handlers)',
    'Deal': 'partial (1/4 handlers)',
}

# Per-feature event overrides for features in non-audited groups
FEATURE_EVENTS = {
    ('Calendar', 'Task calendar view'): 'partial (1/7 handlers)',
    ('Calendar', 'Task tRPC Router'): 'partial (1/7 handlers)',
    ('Platform', 'Task assignments'): 'partial (1/7 handlers)',
    ('Platform', 'Task entity linking'): 'partial (1/7 handlers)',
    ('Platform', 'Task list view'): 'partial (1/7 handlers)',
    ('Platform', 'Task reminders'): 'partial (1/7 handlers)',
}

# Group-level security assessment (from wiring audits)
GROUP_SECURITY = {
    'Lead': 'issues (no audit logging)',
    'Contact': 'issues (raw ctx.prisma, no audit logging)',
    'Account': 'critical (no tenantId, no audit logging)',
    'Deal': 'critical (no tenantId, no audit logging)',
}

# Per-feature security overrides for features in non-audited groups
FEATURE_SECURITY = {
    ('Calendar', 'Task calendar view'): 'issues (RBAC not enforced, no audit logging)',
    ('Calendar', 'Task tRPC Router'): 'issues (RBAC not enforced, no audit logging)',
    ('Platform', 'Task assignments'): 'issues (RBAC not enforced, no audit logging)',
    ('Platform', 'Task entity linking'): 'issues (RBAC not enforced, no audit logging)',
    ('Platform', 'Task list view'): 'issues (RBAC not enforced, no audit logging)',
    ('Platform', 'Task reminders'): 'issues (RBAC not enforced, no audit logging)',
}

# ──────────────────────────────────────────────────────────────────────────────
# Frontend split heuristics
# ──────────────────────────────────────────────────────────────────────────────

LIST_PATTERNS = [
    r'\blist\b',
    r'\bpipeline board\b',
    r'\bkanban board\b',
    r'\bimport\b',
    r'\bmerge\b',
    r'\bpipeline filtering\b',
    r'\bindex\b',
    r'\bqueue\b',
]

DETAIL_PATTERNS = [
    r'\bdetail\b',
    r'\b360\b',
    r'^edit\s',
    r'^new\s',
    r'\btimeline\b',
    r'\bhierarchy view\b',
    r'\bpanel\b',
    r'\bcharts\b',
    r'\bforecast history\b',
    r'\bforecast probability\b',
    r'\bforecast recommend\b',
    r'\bforecast risk\b',
]


def classify_frontend(feature: str, frontend_val: str) -> tuple:
    """Split Frontend into (Frontend-List, Frontend-Detail)."""
    if frontend_val in ('not_required', 'missing', ''):
        return (frontend_val, frontend_val)

    fl = feature.lower().strip()
    is_list = any(re.search(p, fl) for p in LIST_PATTERNS)
    is_detail = any(re.search(p, fl) for p in DETAIL_PATTERNS)

    if is_list and not is_detail:
        return (frontend_val, 'not_required')
    if is_detail and not is_list:
        return ('not_required', frontend_val)
    # Both or neither — keep original in both columns
    return (frontend_val, frontend_val)


def get_wiring_status(group: str, feature: str, status: str) -> str:
    """Determine wiring status for a feature."""
    if status in ('planned', 'in_progress'):
        return '-'
    if status != 'done':
        return '-'

    # Check per-feature audit mapping FIRST (prefix match) — allows features
    # in non-audited groups (e.g. Task in Calendar/Platform) to get status
    for (g, f_prefix), ws in WIRING_AUDIT.items():
        if g == group and feature.strip().startswith(f_prefix):
            return ws

    # Then check group-level audited status
    if group not in AUDITED_GROUPS:
        return '-'

    # In audited group, done, but no specific audit entry
    return 'unaudited'


def get_events_status(group: str, feature: str, adapter_val: str, router_val: str, domain_val: str) -> str:
    """Determine Events quality gate status."""
    if all(v in ('not_required', 'missing', '') for v in (adapter_val, router_val, domain_val)):
        return 'not_required'
    # Check per-feature override first (for cross-group features like Task)
    for (g, f_prefix), ev in FEATURE_EVENTS.items():
        if g == group and feature.strip().startswith(f_prefix):
            return ev
    if group in GROUP_EVENTS:
        return GROUP_EVENTS[group]
    if group not in AUDITED_GROUPS:
        return '-'
    return 'unaudited'


def get_security_status(group: str, feature: str, adapter_val: str, router_val: str) -> str:
    """Determine Security quality gate status."""
    if all(v in ('not_required', 'missing', '') for v in (adapter_val, router_val)):
        return 'not_required'
    # Check per-feature override first (for cross-group features like Task)
    for (g, f_prefix), sec in FEATURE_SECURITY.items():
        if g == group and feature.strip().startswith(f_prefix):
            return sec
    if group in GROUP_SECURITY:
        return GROUP_SECURITY[group]
    if group not in AUDITED_GROUPS:
        return '-'
    return 'unaudited'


# ──────────────────────────────────────────────────────────────────────────────
# Table parsing
# ──────────────────────────────────────────────────────────────────────────────

def parse_row(line: str) -> list:
    """Parse a markdown table row into cells (strips leading/trailing pipes)."""
    s = line.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    return [c.strip() for c in s.split('|')]


def format_row(cells: list) -> str:
    """Format cells into a markdown table row."""
    return '| ' + ' | '.join(cells) + ' |'


def transform_data_row(cells: list) -> list:
    """Transform a 26-cell data row into a 30-cell row with new columns.

    Original layout (26 cols):
      0:Group  1:Feature  2:Status  3:ForecastRisk  ...
      15:Entity  16:Domain  17:Database  18:Adapter  19:Router  20:Frontend
      21:KPIRef  22:ValidationRef  23:EvidenceRef  24:Missing  25:Notes

    New layout (30 cols):
      0:Group  1:Feature  2:Status  3:WiringStatus  4:ForecastRisk  ...
      16:Entity  17:Domain  18:Database  19:Adapter  20:Router  21:FE-List  22:FE-Detail  23:Events  24:Security
      25:KPIRef  26:ValidationRef  27:EvidenceRef  28:Missing  29:Notes
    """
    if len(cells) < 26:
        # Pad to 26 if short
        cells.extend([''] * (26 - len(cells)))
    elif len(cells) > 26:
        # Truncate extras (trailing empty cells from split)
        cells = cells[:26]

    group = cells[0].strip()
    feature = cells[1].strip()
    status = cells[2].strip()
    domain_val = cells[16].strip()
    adapter_val = cells[18].strip()
    router_val = cells[19].strip()
    frontend_val = cells[20].strip()

    wiring = get_wiring_status(group, feature, status)
    fe_list, fe_detail = classify_frontend(feature, frontend_val)
    events = get_events_status(group, feature, adapter_val, router_val, domain_val)
    security = get_security_status(group, feature, adapter_val, router_val)

    # Build new array: insert Wiring Status after Status (idx 2),
    # replace Frontend (idx 20) with FE-List + FE-Detail + Events + Security
    new = []
    for i, cell in enumerate(cells):
        if i == 3:
            # Insert Wiring Status before Forecast Risk
            new.append(wiring)
        if i == 20:
            # Replace Frontend with 4 new columns
            new.append(fe_list)
            new.append(fe_detail)
            new.append(events)
            new.append(security)
            continue
        new.append(cell)

    return new


def transform_header(cells: list) -> list:
    """Transform 26-cell header into 30-cell header."""
    new = []
    for i, cell in enumerate(cells):
        if i == 3:
            new.append('Wiring Status')
        if i == 20:
            new.append('Frontend-List')
            new.append('Frontend-Detail')
            new.append('Events')
            new.append('Security')
            continue
        new.append(cell)
    return new


def transform_separator(cells: list) -> list:
    """Transform 26-cell separator into 30-cell separator."""
    sep = '---'
    new = []
    for i, cell in enumerate(cells):
        if i == 3:
            new.append(sep)
        if i == 20:
            new.extend([sep, sep, sep, sep])
            continue
        new.append(cell)
    return new


# ──────────────────────────────────────────────────────────────────────────────
# Metadata section updates
# ──────────────────────────────────────────────────────────────────────────────

WIRING_STATUS_RUBRIC = """
### Wiring Status (Audit Overlay)

Wiring status is determined by entity detail wiring audits (2026-03-03 to 2026-03-07).
Audited entities: Lead, Contact, Account, Deal, Task.

| Wiring Status | Definition |
|---|---|
| `verified` | Audit-confirmed: wiring is functional end-to-end for the primary user flow |
| `issues` | Audit found defects: functional but with gaps (no-op buttons, missing handlers, security issues) |
| `unaudited` | Feature is `done` but has not yet been audited for wiring correctness |
| `-` | Not applicable (feature is `planned` or `in_progress`) |

Audit documents: `docs/audit/{lead,contact,account,deal,task}-detail-wiring-audit.md`
Cross-reference: `docs/audit/feature-matrix-vs-audit-comparison.md`
"""

QUALITY_GATE_LEGEND = """
Quality gate legend (Events / Security columns):

- `verified` = audit-confirmed functional
- `issues (detail)` = audit found non-critical defects
- `critical (detail)` = audit found CRITICAL security/data issues
- `partial (N/M handlers)` = some event handlers implemented
- `not-wired (0/M handlers)` = events defined but zero handlers registered
- `not_required` = quality gate not applicable for this feature type
- `unaudited` = not yet audited
"""

COVERAGE_GATE_LINES = """  - Frontend-List: 0
  - Frontend-Detail: 0
  - Events: n/a (quality gate)
  - Security: n/a (quality gate)"""


# ──────────────────────────────────────────────────────────────────────────────
# Main transform
# ──────────────────────────────────────────────────────────────────────────────

def transform(content: str) -> str:
    lines = content.split('\n')
    out = []
    in_fm_table = False   # Inside Feature Matrix table
    fm_header_done = False
    fm_sep_done = False
    i = 0

    while i < len(lines):
        line = lines[i]

        # ── Status Rubric: insert wiring status after planned row ──
        if '| `planned`' in line and 'Backlog item' in line:
            out.append(line)
            out.append(WIRING_STATUS_RUBRIC.rstrip())
            i += 1
            continue

        # ── Layer cell legend: append quality gate legend ──
        if "layer has linked task" in line and "done/in_progress/planned/partial" in line:
            out.append(line)
            # Skip orphaned continuation line ("  coverage") if present
            if i + 1 < len(lines) and lines[i + 1].strip() == 'coverage':
                i += 1  # skip the continuation line
            out.append(QUALITY_GATE_LEGEND.rstrip())
            i += 1
            continue

        # ── Coverage Snapshot: add new layer counts after Frontend ──
        if line.strip().startswith('- Frontend:') and i > 0:
            # Check this is the "Missing required layers" section
            prev_lines = '\n'.join(lines[max(0, i-6):i])
            if 'Missing required layers' in prev_lines:
                out.append(line)
                out.append(COVERAGE_GATE_LINES)
                i += 1
                continue

        # ── Chain coverage description ──
        if 'Entity -> Domain -> Database -> Adapter -> Router -> Frontend' in line:
            line = line.replaceAll(
                'Entity -> Domain -> Database -> Adapter -> Router -> Frontend',
                'Entity -> Domain -> Database -> Adapter -> Router -> Frontend-List/Detail + Events/Security gates'
            )

        # ── Feature Matrix section ──
        if line.strip() == '## Feature Matrix':
            in_fm_table = True
            fm_header_done = False
            fm_sep_done = False
            out.append(line)
            i += 1
            continue

        # Feature Matrix header (cells are padded, so use parsed cell matching)
        if (in_fm_table and not fm_header_done
                and line.strip().startswith('|') and 'Group' in line and 'Frontend' in line):
            cells = parse_row(line)
            cell_names = [c.strip() for c in cells]
            if 'Group' in cell_names and 'Frontend' in cell_names and len(cells) >= 26:
                out.append(format_row(transform_header(cells)))
                fm_header_done = True
                i += 1
                continue

        # Feature Matrix separator (right after header)
        if in_fm_table and fm_header_done and not fm_sep_done and '---' in line and line.strip().startswith('|'):
            cells = parse_row(line)
            if len(cells) >= 26:
                out.append(format_row(transform_separator(cells)))
                fm_sep_done = True
                i += 1
                continue

        # Feature Matrix data rows
        if in_fm_table and fm_sep_done and line.strip().startswith('|') and line.strip():
            cells = parse_row(line)
            if len(cells) >= 26:
                out.append(format_row(transform_data_row(cells)))
                i += 1
                continue
            else:
                in_fm_table = False

        # End of Feature Matrix table
        if in_fm_table and fm_sep_done and (line.strip() == '' or line.startswith('#')):
            in_fm_table = False

        out.append(line)
        i += 1

    return '\n'.join(out)


if __name__ == '__main__':
    # Use original from git HEAD if available (avoids double-transform issues)
    source = ORIGINAL if ORIGINAL.exists() else INPUT
    content = source.read_text(encoding='utf-8')
    orig_lines = len(content.split('\n'))
    result = transform(content)
    new_lines = len(result.split('\n'))
    INPUT.write_text(result, encoding='utf-8')

    # Verify
    verify = INPUT.read_text(encoding='utf-8')
    verify_lines = verify.split('\n')

    # Count Feature Matrix data rows
    in_table = False
    data_rows = 0
    col_counts = set()
    for vl in verify_lines:
        if '## Feature Matrix' in vl:
            in_table = True
            continue
        if in_table and vl.startswith('| Group'):
            hdr_cells = parse_row(vl)
            print(f"Header columns: {len(hdr_cells)}")
            continue
        if in_table and '---' in vl and vl.strip().startswith('|'):
            continue
        if in_table and vl.strip().startswith('|') and vl.strip():
            data_rows += 1
            cc = len(parse_row(vl))
            col_counts.add(cc)
        elif in_table and (vl.strip() == '' or vl.startswith('#')):
            in_table = False

    print(f"Lines: {orig_lines} -> {new_lines}")
    print(f"Data rows: {data_rows}")
    print(f"Column counts in data rows: {col_counts}")
    if col_counts == {30}:
        print("OK: All data rows have 30 columns")
    else:
        print(f"WARNING: Expected all rows to have 30 columns, got: {col_counts}")
