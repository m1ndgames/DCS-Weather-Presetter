# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DCS-Weather-Presetter takes a DCS (Digital Combat Simulator) mission file (`.miz`) as input and saves new versions with different weather and date/season parameters next to the original. Seasons and presets are configured via `config.yaml`.

## Running

```bash
# Apply all presets from config.yaml to a mission file
.venv/Scripts/python.exe main.py path/to/mission.miz

# Use a custom config
.venv/Scripts/python.exe main.py path/to/mission.miz --config my_config.yaml

# Install dependencies
.venv/Scripts/pip.exe install -r requirements.txt
```

Output files are written next to the source `.miz`, named `<stem>_<suffix>.miz` per preset.

## Architecture

`main.py` is the single entry point. Flow: parse `config.yaml` → read source `.miz` (a ZIP) → for each preset, regex-replace the `["date"]`, `["weather"]`, and `["start_time"]` fields in the `mission` Lua file → write a new `.miz` ZIP.

- `build_date_block()` / `build_weather_block()` regenerate their entire Lua blocks from scratch. Replacement targets blocks delimited by `-- end of ["date"]` / `-- end of ["weather"]` comments, which DCS serialization always emits.
- `start_time` (seconds since midnight) is a simple scalar replaced with a single-tab-anchored regex (`^\t\["start_time"\]`) to avoid touching the identically named per-unit fields nested deeper in the file.
- The `time` key in a preset is optional; omitting it leaves the source mission's time unchanged.

## DCS Mission File Format

`.miz` files are ZIP archives. The `mission` entry is UTF-8 Lua-table-literal serialization (DCS-specific, not runnable Lua). Indentation uses tabs; opening braces sit at the same tab level as their key, not indented further. The `-- end of ["key"]` comments are reliable block terminators used for regex boundaries.
