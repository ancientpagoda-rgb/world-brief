#!/usr/bin/env python3

import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from eccodes import (
    codes_get,
    codes_get_values,
    codes_grib_new_from_file,
    codes_release,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "noaa-weather-grid.json"

# Coarse sampling grid (must match app.js)
LAT_STEP = 20
LON_STEP = 20
LAT_MIN = -70
LAT_MAX = 70


@dataclass(frozen=True)
class GfsRun:
    ymd: str  # YYYYMMDD
    cycle: str  # 00/06/12/18

    @property
    def dir_param(self) -> str:
        return f"/gfs.{self.ymd}/{self.cycle}/atmos"

    @property
    def file_name(self) -> str:
        return f"gfs.t{self.cycle}z.pgrb2.1p00.f000"


def http_head_ok(url: str) -> bool:
    req = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def pick_latest_gfs_run(now: datetime) -> GfsRun:
    # Try recent cycles for today, then yesterday.
    cycles = ["18", "12", "06", "00"]
    for day_offset in [0, 1]:
        day = (now - timedelta(days=day_offset)).strftime("%Y%m%d")
        for cycle in cycles:
            test_url = (
                "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/"
                f"gfs.{day}/{cycle}/atmos/gfs.t{cycle}z.pgrb2.1p00.f000"
            )
            if http_head_ok(test_url):
                return GfsRun(ymd=day, cycle=cycle)
    raise RuntimeError("Could not find an available GFS run on NOMADS")


def build_filter_url(run: GfsRun) -> str:
    params = {
        "file": run.file_name,
        "lev_2_m_above_ground": "on",
        "lev_10_m_above_ground": "on",
        "lev_entire_atmosphere": "on",
        "lev_surface": "on",
        "var_TMP": "on",
        "var_UGRD": "on",
        "var_VGRD": "on",
        "var_TCDC": "on",
        "var_PRATE": "on",
        "subregion": "",
        "leftlon": "0",
        "rightlon": "360",
        "toplat": "90",
        "bottomlat": "-90",
        "dir": run.dir_param,
    }
    return "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?" + urllib.parse.urlencode(
        params
    )


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (World/NOAAGridBuilder)"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    if not data:
        raise RuntimeError("Empty response downloading NOAA data")
    dest.write_bytes(data)


def parse_grib_fields(path: Path) -> dict[str, np.ndarray]:
    fields: dict[str, np.ndarray] = {}
    with path.open("rb") as f:
        while True:
            gid = codes_grib_new_from_file(f)
            if gid is None:
                break

            try:
                short = codes_get(gid, "shortName")
                type_of_level = codes_get(gid, "typeOfLevel")
                level = int(codes_get(gid, "level"))
                ni = int(codes_get(gid, "Ni"))
                nj = int(codes_get(gid, "Nj"))
                values = np.array(codes_get_values(gid), dtype=np.float64)
                if values.size != ni * nj:
                    continue
                grid = values.reshape((nj, ni))

                # Keep only what we need.
                if short == "2t" and type_of_level == "heightAboveGround" and level == 2:
                    fields["t2m_k"] = grid
                elif short == "10u" and type_of_level == "heightAboveGround" and level == 10:
                    fields["u10"] = grid
                elif short == "10v" and type_of_level == "heightAboveGround" and level == 10:
                    fields["v10"] = grid
                elif short == "prate" and type_of_level == "surface":
                    fields["prate"] = grid
                elif short == "tcc" and type_of_level == "atmosphere":
                    fields["tcc"] = grid
            finally:
                codes_release(gid)

    required = {"t2m_k", "u10", "v10", "prate", "tcc"}
    missing = required - set(fields.keys())
    if missing:
        raise RuntimeError(f"Missing expected fields in GRIB: {sorted(missing)}")
    return fields


def sample_field(field: np.ndarray, lat: float, lon: float) -> float:
    # GRIB is regular_ll with Ni=360 lon 0..359, Nj=181 lat -90..90.
    lon360 = lon if lon >= 0 else lon + 360
    i = int(round(lon360)) % 360
    j = int(round(lat + 90))
    j = max(0, min(180, j))
    return float(field[j, i])


def build_grid(fields: dict[str, np.ndarray]) -> list[dict]:
    rows: list[dict] = []
    for lat in range(LAT_MIN, LAT_MAX + 1, LAT_STEP):
        for lon in range(-180, 180, LON_STEP):
            t_k = sample_field(fields["t2m_k"], lat, lon)
            u = sample_field(fields["u10"], lat, lon)
            v = sample_field(fields["v10"], lat, lon)
            pr = sample_field(fields["prate"], lat, lon)
            cc = sample_field(fields["tcc"], lat, lon)

            # Units:
            # - temperature K -> C
            # - precipitation rate kg m^-2 s^-1 -> mm/h
            temp_c = t_k - 273.15
            precip_mmh = pr * 3600.0
            speed = math.sqrt(u * u + v * v)
            direction_from = (math.degrees(math.atan2(u, v)) + 180.0) % 360.0

            rows.append(
                {
                    "lat": lat,
                    "lon": lon,
                    "temperatureC": temp_c,
                    "precipMmPerHr": precip_mmh,
                    "cloudCoverPct": cc,
                    "windU": u,
                    "windV": v,
                    "windSpeed": speed,
                    "windDirection": direction_from,
                }
            )
    return rows


def main() -> int:
    now = datetime.now(timezone.utc)
    run = pick_latest_gfs_run(now)
    url = build_filter_url(run)

    tmp_path = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "world-noaa" / "gfs.grb2"
    download(url, tmp_path)

    fields = parse_grib_fields(tmp_path)
    grid = build_grid(fields)

    payload = {
        "source": "NOAA GFS 1.0° (NOMADS filter_gfs_1p00)",
        "run": {"ymd": run.ymd, "cycle": run.cycle, "forecastHour": 0},
        "generatedAt": now.isoformat().replace("+00:00", "Z"),
        "validTime": f"{run.ymd}T{run.cycle}:00Z",
        "grid": grid,
    }

    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=True) + "\n")
    print(f"Wrote {OUTPUT_PATH} ({len(grid)} points)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
