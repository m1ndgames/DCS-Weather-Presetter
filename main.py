#!/usr/bin/env python3
"""DCS Weather Presetter — applies weather/date presets from config.yaml to a .miz file."""

import argparse
import io
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests
import yaml

THEATRE_COORDS = {
    "GermanyCW":      (51.0,   8.0),
    "Caucasus":       (41.7,  44.8),
    "PersianGulf":    (25.0,  56.0),
    "Nevada":         (36.6, -115.0),
    "Normandy":       (49.2,  -0.5),
    "TheChannel":     (51.0,   2.0),
    "Syria":          (33.5,  36.3),
    "MarianaIslands": (13.5, 144.8),
    "SouthAtlantic":  (-51.7, -59.0),
    "Sinai":          (29.0,  34.0),
    "Afghanistan":    (34.5,  69.2),
    "Iraq":           (33.3,  44.4),
    "Kola":           (69.0,  33.0),
}


def lua_bool(v: bool) -> str:
    return "true" if v else "false"


def build_date_block(date: dict) -> str:
    return (
        '["date"] = \n'
        '\t{\n'
        f'\t\t["Year"] = {date["year"]},\n'
        f'\t\t["Day"] = {date["day"]},\n'
        f'\t\t["Month"] = {date["month"]},\n'
        '\t}, -- end of ["date"]'
    )


def build_weather_block(w: dict) -> str:
    wind = w["wind"]
    clouds = w["clouds"]
    fog = w["fog"]
    vis = w["visibility"]
    season = w["season"]
    halo = w["halo"]

    lines = [
        '["weather"] = ',
        '\t{',
        '\t\t["wind"] = ',
        '\t\t{',
    ]
    for level in ("at8000", "atGround", "at2000"):
        lines += [
            f'\t\t\t["{level}"] = ',
            '\t\t\t{',
            f'\t\t\t\t["speed"] = {wind[level]["speed"]},',
            f'\t\t\t\t["dir"] = {wind[level]["dir"]},',
            f'\t\t\t}}, -- end of ["{level}"]',
        ]
    lines += [
        '\t\t}, -- end of ["wind"]',
        f'\t\t["enable_fog"] = {lua_bool(w["enable_fog"])},',
        '\t\t["season"] = ',
        '\t\t{',
        f'\t\t\t["temperature"] = {season["temperature"]},',
        '\t\t}, -- end of ["season"]',
        f'\t\t["qnh"] = {w["qnh"]},',
        '\t\t["cyclones"] = {},',
        f'\t\t["dust_density"] = {w["dust_density"]},',
        f'\t\t["enable_dust"] = {lua_bool(w["enable_dust"])},',
        '\t\t["clouds"] = ',
        '\t\t{',
        f'\t\t\t["thickness"] = {clouds["thickness"]},',
        f'\t\t\t["density"] = {clouds["density"]},',
        f'\t\t\t["preset"] = "{clouds["preset"]}",',
        f'\t\t\t["base"] = {clouds["base"]},',
        f'\t\t\t["iprecptns"] = {clouds["iprecptns"]},',
        '\t\t}, -- end of ["clouds"]',
        f'\t\t["atmosphere_type"] = {w["atmosphere_type"]},',
        f'\t\t["groundTurbulence"] = {w["groundTurbulence"]},',
        '\t\t["halo"] = ',
        '\t\t{',
        f'\t\t\t["preset"] = "{halo["preset"]}",',
        '\t\t}, -- end of ["halo"]',
        f'\t\t["type_weather"] = {w["type_weather"]},',
        f'\t\t["modifiedTime"] = {lua_bool(w["modifiedTime"])},',
        f'\t\t["name"] = "{w["name"]}",',
        '\t\t["fog"] = ',
        '\t\t{',
        f'\t\t\t["visibility"] = {fog["visibility"]},',
        f'\t\t\t["thickness"] = {fog["thickness"]},',
        '\t\t}, -- end of ["fog"]',
        '\t\t["visibility"] = ',
        '\t\t{',
        f'\t\t\t["distance"] = {vis["distance"]},',
        '\t\t}, -- end of ["visibility"]',
        '\t}, -- end of ["weather"]',
    ]
    return "\n".join(lines)


def _cloud_preset_from_conditions(cloud_cover: float, weather_code: int) -> tuple[str, int]:
    is_thunderstorm = weather_code >= 95
    is_precip = (51 <= weather_code <= 67) or (80 <= weather_code <= 82)
    if is_thunderstorm:
        return "RainyPreset1", 2
    if is_precip:
        return ("RainyPreset2", 1) if cloud_cover > 80 else ("RainyPreset4", 1)
    if cloud_cover <  6: return "Preset1",  0
    if cloud_cover < 12: return "Preset2",  0
    if cloud_cover < 25: return "Preset5",  0
    if cloud_cover < 37: return "Preset7",  0
    if cloud_cover < 50: return "Preset9",  0
    if cloud_cover < 62: return "Preset13", 0
    if cloud_cover < 75: return "Preset16", 0
    if cloud_cover < 87: return "Preset19", 0
    return "Preset21", 0


def _weather_name(weather_code: int, cloud_cover: float) -> str:
    if weather_code >= 95: return "Thunderstorm"
    if weather_code >= 80: return "Rain showers"
    if weather_code >= 61: return "Rain"
    if weather_code >= 51: return "Drizzle"
    if weather_code in (45, 48): return "Fog"
    if cloud_cover <  6: return "Clear sky"
    if cloud_cover < 25: return "Few clouds"
    if cloud_cover < 50: return "Scattered clouds"
    if cloud_cover < 87: return "Broken clouds"
    return "Overcast"


def fetch_real_weather(theatre: str) -> dict:
    coords = THEATRE_COORDS.get(theatre)
    if not coords:
        raise ValueError(f"Unknown theatre '{theatre}'. Add it to THEATRE_COORDS.")
    lat, lon = coords

    resp = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,"
                       "precipitation,surface_pressure,visibility,weather_code",
            "hourly": "wind_speed_850hPa,wind_direction_850hPa,wind_speed_300hPa,wind_direction_300hPa",
            "forecast_days": 1,
            "wind_speed_unit": "ms",
            "timezone": "UTC",
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    cur = data["current"]
    current_hour = cur["time"][:13]  # e.g. "2026-04-05T10"
    hourly_times = data["hourly"]["time"]
    try:
        hi = next(i for i, t in enumerate(hourly_times) if t.startswith(current_hour))
    except StopIteration:
        hi = 0

    cloud_cover = cur["cloud_cover"]
    weather_code = cur["weather_code"]
    is_fog = weather_code in (45, 48)
    cloud_preset, iprecptns = _cloud_preset_from_conditions(cloud_cover, weather_code)
    qnh = round(cur["surface_pressure"] * 0.750064)

    cloud_base = (3000 if cloud_cover < 25 else 2000 if cloud_cover < 50
                  else 1500 if cloud_cover < 75 else 900 if cloud_cover < 90 else 500)
    cloud_density = (0 if cloud_cover < 25 else 3 if cloud_cover < 50
                     else 5 if cloud_cover < 75 else 7 if cloud_cover < 87 else 9)
    cloud_thickness = (200 if cloud_cover < 25 else 400 if cloud_cover < 50
                       else 600 if cloud_cover < 75 else 800 if cloud_cover < 87 else 1000)

    now = datetime.now(timezone.utc)
    return {
        "date": {"year": now.year, "month": now.month, "day": now.day},
        "time": {"hour": now.hour, "minute": now.minute, "second": now.second},
        "weather": {
            "name": _weather_name(weather_code, cloud_cover),
            "atmosphere_type": 0,
            "groundTurbulence": 0,
            "modifiedTime": False,
            "type_weather": 1 if weather_code >= 95 else 0,
            "qnh": qnh,
            "enable_fog": is_fog or cur["visibility"] < 1000,
            "enable_dust": False,
            "dust_density": 0,
            "season": {"temperature": round(cur["temperature_2m"])},
            "fog": {
                "visibility": round(cur["visibility"]) if is_fog else 0,
                "thickness": 200 if is_fog else 0,
            },
            "visibility": {"distance": min(round(cur["visibility"]), 80000)},
            "wind": {
                "atGround": {
                    "speed": round(cur["wind_speed_10m"]),
                    "dir": cur["wind_direction_10m"],
                },
                "at2000": {
                    "speed": round(data["hourly"]["wind_speed_850hPa"][hi]),
                    "dir": data["hourly"]["wind_direction_850hPa"][hi],
                },
                "at8000": {
                    "speed": round(data["hourly"]["wind_speed_300hPa"][hi]),
                    "dir": data["hourly"]["wind_direction_300hPa"][hi],
                },
            },
            "clouds": {
                "preset": cloud_preset,
                "base": cloud_base,
                "density": cloud_density,
                "thickness": cloud_thickness,
                "iprecptns": iprecptns,
            },
            "halo": {"preset": "auto"},
        },
    }


def apply_preset(content: str, preset: dict) -> str:
    # Replace date block
    content = re.sub(
        r'\["date"\] = \n.*?-- end of \["date"\]',
        build_date_block(preset["date"]),
        content,
        flags=re.DOTALL,
    )
    # Replace weather block
    content = re.sub(
        r'\["weather"\] = \n.*?-- end of \["weather"\]',
        build_weather_block(preset["weather"]),
        content,
        flags=re.DOTALL,
    )
    # Replace top-level start_time (seconds since midnight).
    # Single-tab prefix distinguishes it from deeply nested per-unit start_time fields.
    if "time" in preset:
        t = preset["time"]
        seconds = t["hour"] * 3600 + t.get("minute", 0) * 60 + t.get("second", 0)
        content = re.sub(
            r'^\t\["start_time"\] = \d+,',
            f'\t["start_time"] = {seconds},',
            content,
            flags=re.MULTILINE,
        )
    return content


def process_miz(miz_path: Path, config_path: Path) -> None:
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    with zipfile.ZipFile(miz_path, "r") as src_zip:
        original_files = {name: src_zip.read(name) for name in src_zip.namelist()}

    mission_content = original_files["mission"].decode("utf-8")

    for preset in config["presets"]:
        if preset.get("real_weather"):
            theatre_match = re.search(r'\["theatre"\]\s*=\s*"([^"]+)"', mission_content)
            if not theatre_match:
                raise ValueError("Could not read theatre from mission file.")
            theatre = theatre_match.group(1)
            print(f"Fetching real weather for theatre '{theatre}'…")
            preset = {**preset, **fetch_real_weather(theatre)}

        modified = apply_preset(mission_content, preset)

        stem = miz_path.stem
        suffix = preset["suffix"]
        out_path = miz_path.parent / f"{stem}_{suffix}.miz"

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as out_zip:
            for name, data in original_files.items():
                if name == "mission":
                    out_zip.writestr(name, modified.encode("utf-8"))
                else:
                    out_zip.writestr(name, data)

        out_path.write_bytes(buf.getvalue())
        print(f"Written: {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply weather presets to a DCS .miz file.")
    parser.add_argument("miz_file", type=Path, help="Path to the source .miz file")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).parent / "config.yaml",
        help="Path to config.yaml (default: config.yaml next to this script)",
    )
    args = parser.parse_args()
    process_miz(args.miz_file, args.config)


if __name__ == "__main__":
    main()
