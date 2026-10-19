#!/usr/bin/env bash
# Serve the prototype locally (any static server works). Port 8437 by default.
cd "$(dirname "$0")" && python3 -m http.server "${1:-8437}" --bind 127.0.0.1
