# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DCS-Weather-Presetter modifies DCS mission files (`.miz`) to apply custom weather, date, and time settings. It ships as three independent tools that share core JS logic:

| Component | Entry point | Hosting |
|-----------|-------------|---------|
| Python script | `main.py` | Local |
| Web app | `webapp/` → builds to `docs/` | GitHub Pages |
| HTTP API | `worker/` | Cloudflare Workers |

## Python Script

```bash
# Install (Windows venv)
.venv/Scripts/pip.exe install -r requirements.txt

# Run
.venv/Scripts/python.exe main.py path/to/mission.miz
.venv/Scripts/python.exe main.py path/to/mission.miz --config my_config.yaml
```

`main.py` flow: parse `config.yaml` → read `.miz` (ZIP) → for each preset, apply → write new `.miz`.

If a preset has `real_weather: true`, the theatre is read from the mission Lua and current weather is fetched from Open-Meteo before applying.

## Web App

```bash
cd webapp
npm install
npm run dev       # dev server
npm run build     # builds to ../docs/
```

Vite + Svelte. `base` is set to `/DCS-Weather-Presetter/` for GitHub Pages. Build output goes to `docs/` (served by GitHub Pages from the `main` branch). The `.nojekyll` file lives in `webapp/public/` so it survives clean builds.

## Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login   # one-time browser auth
npm run deploy       # deploys to *.workers.dev
```

`POST /convert` — multipart form data with `mission` (file) and `preset` (JSON string). Returns the converted `.miz`. Imports `mission.js` and `realWeather.js` directly from `../webapp/src/lib/`.

## Architecture

### Shared JS logic (`webapp/src/lib/`)

These modules are used by both the webapp and the worker:

- **`mission.js`** — `parseMission()`, `parseTheatre()`, `applyPreset()`. Parses/writes the DCS Lua format using regex on the `-- end of ["key"]` block terminators. `start_time` replacement uses a single-tab-anchored regex to avoid touching per-unit `start_time` fields nested deeper in the file.
- **`realWeather.js`** — `fetchRealWeather(lat, lon)`. Calls Open-Meteo (no API key), maps cloud cover % and WMO weather codes to DCS presets, converts hPa → mmHg for QNH, uses 850 hPa / 300 hPa wind levels for 2000 m / 8000 m wind.
- **`cloudPresets.js`** — static list of all 34 DCS cloud preset names and labels (sourced from `DCS/Config/Effects/clouds.lua`).

### Python (`main.py`)

Duplicates the mapping logic from `realWeather.js` (Python can't import JS). The `THEATRE_COORDS` dict and all weather-mapping functions mirror the JS equivalents exactly.

## DCS Mission File Format

`.miz` files are ZIP archives. The `mission` entry is UTF-8 Lua-table-literal serialization (DCS-specific, not runnable Lua). Key properties:
- Indentation uses tabs; opening braces are at the **same** tab level as their key
- `-- end of ["key"]` comments terminate every table block — used as reliable regex boundaries
- `["start_time"]` at one-tab indent is the mission start time in seconds since midnight; identically named fields nested deeper belong to individual units and must not be touched
