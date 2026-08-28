#!/usr/bin/env python3
"""Dependency-free smoke check for the canonical Testagram site."""
from __future__ import annotations
import sys
import urllib.request

URL = "https://www.testagram.site/"
EXPECTED = ("Home", "Explore", "Threads", "Notifications", "Messages", "Spaces", "AI")

def main() -> int:
    request = urllib.request.Request(URL, headers={"User-Agent": "TestagramReplicaVerifier/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8", errors="replace")
            print(f"HTTP {response.status}: {URL}")
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    missing = [item for item in EXPECTED if item not in body]
    if missing:
        print("Missing navigation labels: " + ", ".join(missing))
        return 2
    print("OK: canonical Testagram navigation surface detected.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
