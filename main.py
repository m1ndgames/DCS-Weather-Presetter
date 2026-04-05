#!/usr/bin/env python3
"""DCS Weather Presetter — applies weather/date presets from config.yaml to a .miz file."""

import argparse
import io
import re
import zipfile
from pathlib import Path

import yaml


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
