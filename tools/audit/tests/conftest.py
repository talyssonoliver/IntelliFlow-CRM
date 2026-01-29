from __future__ import annotations

import sys
from pathlib import Path


# Allow tests to import the repo-local audit scripts as modules.
AUDIT_DIR = Path(__file__).resolve().parents[1]
if str(AUDIT_DIR) not in sys.path:
    sys.path.insert(0, str(AUDIT_DIR))

