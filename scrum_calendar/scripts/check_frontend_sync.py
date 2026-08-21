"""Fail when runtime frontend copies diverge from their editable sources."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CANONICAL_PAIRS = (
    (ROOT / "frontend" / "app.js", ROOT / "ScrumV2" / "dist" / "app.js"),
)
LEGACY_BUNDLE_PAIRS = (
    (ROOT / "frontend" / "app.bundle.js", ROOT / "ScrumV2" / "dist" / "app.bundle.js"),
)


def check_html_runtime_references() -> list[str]:
    mismatches = []
    for root in (ROOT / "frontend", ROOT / "ScrumV2" / "dist"):
        for html_file in root.glob("*.html"):
            content = html_file.read_text(encoding="utf-8")
            if "app.bundle.js" in content:
                mismatches.append(f"legacy bundle referenced by {html_file}")
    return mismatches


def main() -> int:
    mismatches = check_html_runtime_references()
    for source, runtime in CANONICAL_PAIRS:
        if not source.exists() or not runtime.exists():
            mismatches.append(f"missing: {source} or {runtime}")
        elif source.read_bytes() != runtime.read_bytes():
            mismatches.append(f"different: {source} != {runtime}")
    if mismatches:
        print("Frontend copies are not synchronized:")
        print("\n".join(f"- {item}" for item in mismatches))
        return 1
    for source, runtime in LEGACY_BUNDLE_PAIRS:
        if source.exists() and runtime.exists() and source.read_bytes() != runtime.read_bytes():
            print("Warning: legacy app.bundle.js copies differ; use frontend/app.js as canonical runtime source.")
    print("Frontend sources and runtime copies are synchronized.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
