"""Create the baseline schema and apply all versioned migrations."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from alembic import command
from alembic.config import Config

from data.db import engine
from data.models import Base


def main() -> int:
    # The first migrations predate the complete baseline schema.
    Base.metadata.create_all(bind=engine)

    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "migrations"))
    command.upgrade(config, "head")
    print("Database schema is ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
