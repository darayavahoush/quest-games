import sys
from pathlib import Path

# Ensures the repo root is importable regardless of how pytest is invoked,
# whether the editable install succeeded, or which Python version is running.
sys.path.insert(0, str(Path(__file__).resolve().parent))
