import os

import pytest


pytest.importorskip("playwright.sync_api")

if os.getenv("PLAYWRIGHT_E2E") != "1":
    pytest.skip(
        "Playwright skeleton: set PLAYWRIGHT_E2E=1 to enable.",
        allow_module_level=True,
    )

from playwright.sync_api import sync_playwright  # noqa: E402


def test_poker_public_smoke():
    base_url = os.getenv("POKER_PUBLIC_URL")
    assert base_url, "Set POKER_PUBLIC_URL to run Playwright smoke test."
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base_url, wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        assert page.title() != ""
        browser.close()
