# DCS-Weather-Presetter

A script for DCS (Digital Combat Simulator) that takes a mission (`.miz`) file and produces new versions of it with different weather and date settings, one output file per preset defined in `config.yaml`.

## Usage

```bash
python main.py path/to/your_mission.miz
python main.py path/to/your_mission.miz --config path/to/config.yaml
```

Output files are saved next to the source file, named `<mission>_<suffix>.miz`.

## Installation

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

## Configuration

Presets are defined in `config.yaml`. Each preset produces one output `.miz` file.

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
      enable_dust: false         # Toggle dust/sand storm
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

### Cloud presets

DCS uses named cloud presets. The preset name must match exactly what DCS expects. Common values:

| Preset                          | Description               |
|---------------------------------|---------------------------|
| `Preset1` – `Preset12`          | Clear to scattered clouds |
| `RainyPreset1` – `RainyPreset3` | Overcast with rain        |

The full list of available presets depends on your DCS version and installed theatre. An invalid preset name will cause DCS to fall back to default clouds.
