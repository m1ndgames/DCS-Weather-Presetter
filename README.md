# DCS-Weather-Presetter

A toolset for modifying DCS (Digital Combat Simulator) mission files (`.miz`) to apply custom weather, date, and time settings. Available in three forms:

- **Python script** — batch-process a mission against multiple presets defined in `config.yaml`
- **Web app** — browser-based editor hosted on GitHub Pages, no installation needed
- **HTTP API** — Cloudflare Worker endpoint for programmatic use

---

## Web App

**URL:** https://m1ndgames.github.io/DCS-Weather-Presetter/

1. Click **Choose .miz file** and upload your mission
2. All current weather values are pre-filled from the mission
3. Edit any fields (date, time, clouds, wind, atmosphere)
4. Optionally click **⛅ Use current weather** to auto-fill with live real-world weather for the mission's theatre (fetched from Open-Meteo — no account needed)
5. Click **Download modified mission** — the new `.miz` is generated in your browser and downloaded instantly

Nothing is uploaded to any server. The entire conversion runs client-side.

---

## HTTP API

**Base URL:** `https://dcs-weather-presetter.dcs-weather.workers.dev`

### `POST /convert`

Converts a mission file using a preset supplied as JSON.

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `mission` | file | The source `.miz` file |
| `preset` | string (JSON) | Preset configuration (see format below) |

**Response:** The converted `.miz` file as a download (`application/octet-stream`).

**Example — manual preset:**
```bash
curl -X POST https://dcs-weather-presetter.dcs-weather.workers.dev/convert \
  -F "mission=@my_mission.miz" \
  -F 'preset={
    "suffix": "summer_morning",
    "date": {"year": 2000, "month": 7, "day": 15},
    "time": {"hour": 8, "minute": 0},
    "weather": {
      "name": "Summer, clear sky",
      "qnh": 760,
      "atmosphere_type": 0,
      "type_weather": 0,
      "groundTurbulence": 0,
      "modifiedTime": false,
      "enable_fog": false,
      "enable_dust": false,
      "dust_density": 0,
      "season": {"temperature": 28},
      "visibility": {"distance": 80000},
      "fog": {"visibility": 0, "thickness": 0},
      "wind": {
        "atGround": {"speed": 2, "dir": 270},
        "at2000":   {"speed": 4, "dir": 270},
        "at8000":   {"speed": 6, "dir": 270}
      },
      "clouds": {"preset": "Preset1", "base": 3000, "density": 0, "thickness": 200, "iprecptns": 0},
      "halo": {"preset": "auto"}
    }
  }' \
  --output result.miz
```

**Example — real-world weather** (theatre is read from the mission automatically):
```bash
curl -X POST https://dcs-weather-presetter.dcs-weather.workers.dev/convert \
  -F "mission=@my_mission.miz" \
  -F 'preset={"suffix": "real_weather", "real_weather": true}' \
  --output result.miz
```

**Error responses** are JSON: `{"error": "description"}`.

---

## Python Script

### Installation

Requires Python 3.7+.

```bash
# Clone the repo, then create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Usage

```bash
# Apply all presets from config.yaml to a mission file
python main.py path/to/your_mission.miz

# Use a custom config file
python main.py path/to/your_mission.miz --config path/to/config.yaml
```

One output file is created per preset, saved next to the source file as `<mission>_<suffix>.miz`.

### Configuration

Presets are defined in `config.yaml`.

```yaml
presets:
  - name: "Summer Morning"       # Human-readable label (not used by DCS)
    suffix: "summer_morning"     # Appended to the output filename

    date:
      year: 2000                 # Mission year
      month: 7                   # 1–12
      day: 15                    # Day of month

    time:                        # Optional — omit to keep the source mission's time
      hour: 8                    # 0–23
      minute: 0                  # 0–59 (optional, default 0)
      second: 0                  # 0–59 (optional, default 0)

    weather:
      name: "Summer, clear sky"  # Weather name shown in the DCS mission editor
      atmosphere_type: 0         # 0 = static weather, 1 = dynamic weather
      type_weather: 0            # 0 = fair, 1 = bad (legacy field)
      groundTurbulence: 0        # Turbulence at ground level (m/s)
      modifiedTime: false        # Whether DCS has auto-modified the time
      qnh: 760                   # Barometric pressure (mmHg)
      enable_fog: false          # Toggle fog
      enable_dust: false         # Toggle dust/sandstorm
      dust_density: 0            # Dust density (only relevant if enable_dust: true)

      season:
        temperature: 28          # Ground temperature (°C)

      visibility:
        distance: 80000          # Horizontal visibility (metres)

      fog:
        visibility: 0            # Fog visibility range (metres)
        thickness: 0             # Fog layer thickness (metres)

      wind:
        atGround:
          speed: 2               # Wind speed (m/s)
          dir: 270               # Wind direction in degrees (direction wind comes FROM)
        at2000:
          speed: 4               # Wind at 2000 m
          dir: 270
        at8000:
          speed: 6               # Wind at 8000 m
          dir: 270

      clouds:
        preset: "Preset1"        # DCS cloud preset name (see list below)
        base: 3000               # Cloud base altitude (metres)
        density: 0               # Cloud density 0–10
        thickness: 200           # Cloud layer thickness (metres)
        iprecptns: 0             # Precipitation: 0 = none, 1 = rain, 2 = thunderstorm

      halo:
        preset: "auto"           # Halo/atmospheric effect preset
```

#### Real-world weather preset

Setting `real_weather: true` fetches current weather from [Open-Meteo](https://open-meteo.com) (free, no API key) and fills all weather, date, and time fields automatically. The theatre is read from the mission file — no coordinates to configure.

```yaml
presets:
  - name: "Real Weather"
    suffix: "real_weather"
    real_weather: true
```

#### Cloud presets

| Preset | Description |
|--------|-------------|
| `Preset1` – `Preset12` | Clear to scattered clouds |
| `Preset13` – `Preset20` | Broken clouds |
| `Preset21` – `Preset27` | Overcast |
| `RainyPreset1` – `RainyPreset3` | Overcast with rain |
| `RainyPreset4` – `RainyPreset6` | Light rain |
| `NEWRAINPRESET4` | Light rain 4 |

#### Supported theatres (for real-world weather)

| Theatre key | Location |
|-------------|----------|
| `GermanyCW` | Germany, Central/West |
| `Caucasus` | Georgia / Russia border |
| `PersianGulf` | UAE / Oman |
| `Nevada` | Nevada (NTTR) |
| `Normandy` | Normandy, France |
| `TheChannel` | English Channel |
| `Syria` | Syria / Lebanon |
| `MarianaIslands` | Guam |
| `SouthAtlantic` | Falkland Islands |
| `Sinai` | Sinai Peninsula |
| `Afghanistan` | Afghanistan |
| `Iraq` | Iraq |
| `Kola` | Kola Peninsula |
