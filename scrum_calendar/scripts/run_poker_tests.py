#!/usr/bin/env python3
import sys

import pytest


class SummaryPlugin:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.skipped = 0

    def pytest_runtest_logreport(self, report):
        if report.when != "call":
            return
        if report.passed:
            self.passed += 1
        elif report.failed:
            self.failed += 1
        elif report.skipped:
            self.skipped += 1

    def pytest_sessionfinish(self, session, exitstatus):
        total = self.passed + self.failed + self.skipped
        print(
            f"POKER TESTS | total={total} passed={self.passed} "
            f"failed={self.failed} skipped={self.skipped}"
        )


def main() -> int:
    plugin = SummaryPlugin()
    return pytest.main(["-q", "tests/test_poker_e2e.py"], plugins=[plugin])


if __name__ == "__main__":
    sys.exit(main())
