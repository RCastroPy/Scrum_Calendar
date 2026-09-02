"""Build the static Vercel frontend from the deployed AdminLTE source."""

import json
import os
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "ScrumV2" / "dist"
OUTPUT = ROOT / ".vercel-static"
DEFAULT_RENDER_API_URL = "https://scrumia-api-rcastropy.onrender.com"


def websocket_base(api_url: str) -> str:
    parsed = urlsplit(api_url.rstrip("/"))
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("RENDER_API_URL must be an absolute HTTP(S) URL")
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return urlunsplit((scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def inject_runtime_config(html: str) -> str:
    script = '<script src="/ui/runtime-config.js"></script>\n    '
    pattern = re.compile(r'(<script\s+src=["\'](?:\./)?app\.js(?:\?[^"\']*)?["\']></script>)')
    return pattern.sub(script + r"\1", html, count=1)


def main() -> int:
    api_url = os.getenv("RENDER_API_URL", DEFAULT_RENDER_API_URL).strip().rstrip("/")
    ws_url = websocket_base(api_url)

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(SOURCE, OUTPUT / "ui")

    runtime_config = (
        "// Generated during the Vercel build.\n"
        f"window.SCRUMIA_WS_BASE = {json.dumps(ws_url)};\n"
    )
    (OUTPUT / "ui" / "runtime-config.js").write_text(runtime_config, encoding="utf-8")

    injected = 0
    for html_path in (OUTPUT / "ui").glob("*.html"):
        original = html_path.read_text(encoding="utf-8")
        updated = inject_runtime_config(original)
        if updated != original:
            html_path.write_text(updated, encoding="utf-8")
            injected += 1

    if injected == 0:
        raise RuntimeError("No frontend page loaded app.js; runtime config was not injected")

    print(f"Built {OUTPUT} with {injected} configured HTML pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
