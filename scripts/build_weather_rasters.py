#!/usr/bin/env python3

import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Optional, Tuple

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
NOAA_GRID_PATH = ROOT / "noaa-weather-grid.json"
OUT_TEMP = ROOT / "weather-temp.png"
OUT_PRECIP = ROOT / "weather-precip.png"
OUT_META = ROOT / "weather-rasters.json"


# 2:1 equirectangular projection.
WIDTH = 1024
HEIGHT = 512


def _try_import_eccodes():
  try:
    import numpy as np  # type: ignore
    from eccodes import (  # type: ignore
      codes_get,
      codes_get_values,
      codes_grib_new_from_file,
      codes_release,
    )

    return {
      "np": np,
      "codes_get": codes_get,
      "codes_get_values": codes_get_values,
      "codes_grib_new_from_file": codes_grib_new_from_file,
      "codes_release": codes_release,
    }
  except Exception:
    return None


@dataclass(frozen=True)
class GfsRun:
  ymd: str
  cycle: str

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
    "lev_entire_atmosphere": "on",
    "lev_surface": "on",
    "var_TMP": "on",
    "var_TCDC": "on",
    "var_PRATE": "on",
    "subregion": "",
    "leftlon": "0",
    "rightlon": "360",
    "toplat": "90",
    "bottomlat": "-90",
    "dir": run.dir_param,
  }
  return "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?" + urllib.parse.urlencode(params)


def download(url: str, dest: Path) -> None:
  dest.parent.mkdir(parents=True, exist_ok=True)
  req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (World/weather-rasters)"})
  with urllib.request.urlopen(req, timeout=90) as resp:
    data = resp.read()
  if not data:
    raise RuntimeError("Empty response downloading NOAA data")
  dest.write_bytes(data)


def parse_grib_fields_1deg(ecc) -> Tuple[Dict[str, "ecc['np'].ndarray"], dict]:
  now = datetime.now(timezone.utc)
  run = pick_latest_gfs_run(now)
  url = build_filter_url(run)
  tmp_path = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "world-noaa" / "gfs-rasters.grb2"
  download(url, tmp_path)

  np = ecc["np"]
  codes_get = ecc["codes_get"]
  codes_get_values = ecc["codes_get_values"]
  codes_grib_new_from_file = ecc["codes_grib_new_from_file"]
  codes_release = ecc["codes_release"]

  fields: Dict[str, "ecc['np'].ndarray"] = {}
  with tmp_path.open("rb") as f:
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

        if short == "2t" and type_of_level == "heightAboveGround" and level == 2:
          fields["t2m_k"] = grid
        elif short == "prate" and type_of_level == "surface":
          fields["prate"] = grid
        elif short == "tcc" and type_of_level == "atmosphere":
          fields["tcc"] = grid
      finally:
        codes_release(gid)

  required = {"t2m_k", "prate", "tcc"}
  missing = required - set(fields.keys())
  if missing:
    raise RuntimeError(f"Missing expected fields in GRIB: {sorted(missing)}")

  meta = {
    "source": "NOAA GFS 1.0° (NOMADS filter_gfs_1p00)",
    "run": {"ymd": run.ymd, "cycle": run.cycle, "forecastHour": 0},
    "validTime": f"{run.ymd}T{run.cycle}:00Z",
    "generatedAt": now.isoformat().replace("+00:00", "Z"),
  }
  return fields, meta


def clamp(v: float, lo: float, hi: float) -> float:
  return lo if v < lo else hi if v > hi else v


def lerp(a: float, b: float, t: float) -> float:
  return a + (b - a) * t


def mix(a: Tuple[int, int, int], b: Tuple[int, int, int], t: float) -> Tuple[int, int, int]:
  return (
    int(round(lerp(a[0], b[0], t))),
    int(round(lerp(a[1], b[1], t))),
    int(round(lerp(a[2], b[2], t))),
  )


def temp_color01(v: float) -> Tuple[int, int, int]:
  # Mirrors app.js getTemperatureColor().
  if v < 0.2:
    return mix((30, 60, 180), (50, 130, 230), v / 0.2)
  if v < 0.4:
    return mix((50, 130, 230), (80, 210, 240), (v - 0.2) / 0.2)
  if v < 0.5:
    return mix((80, 210, 240), (160, 230, 140), (v - 0.4) / 0.1)
  if v < 0.6:
    return mix((160, 230, 140), (230, 230, 100), (v - 0.5) / 0.1)
  if v < 0.75:
    return mix((230, 230, 100), (240, 170, 70), (v - 0.6) / 0.15)
  if v < 0.9:
    return mix((240, 170, 70), (230, 100, 60), (v - 0.75) / 0.15)
  return mix((230, 100, 60), (180, 40, 40), clamp((v - 0.9) / 0.1, 0, 1))


def rain_color_alpha01(v: float) -> Tuple[Optional[Tuple[int, int, int]], float]:
  # Mirrors app.js getRainRadarColor() (without LOFI multipliers).
  if v < 0.1:
    return None, 0.0
  if v < 0.2:
    return (80, 200, 255), 0.05
  if v < 0.35:
    return (60, 230, 130), 0.09
  if v < 0.5:
    return (255, 235, 70), 0.14
  if v < 0.7:
    return (255, 150, 40), 0.18
  return (255, 50, 50), 0.22


@dataclass(frozen=True)
class GridPoint:
  temperature_c: float
  precip_mmh: float


def load_noaa_grid() -> Tuple[Dict[Tuple[int, int], GridPoint], dict]:
  payload = json.loads(NOAA_GRID_PATH.read_text(encoding="utf-8"))
  grid: Dict[Tuple[int, int], GridPoint] = {}
  for row in payload.get("grid", []):
    lat = int(row.get("lat"))
    lon = int(row.get("lon"))
    t = float(row.get("temperatureC"))
    p = float(row.get("precipMmPerHr"))
    grid[(lat, lon)] = GridPoint(temperature_c=t, precip_mmh=p)
  return grid, payload


def snap(value: float, step: int, vmin: int, vmax: int) -> int:
  snapped = int(round(value / step) * step)
  if snapped < vmin:
    return vmin
  if snapped > vmax:
    return vmax
  return snapped


def norm_lon180(lon: float) -> float:
  while lon < -180:
    lon += 360
  while lon > 180:
    lon -= 360
  return lon


def snap_lon(lon: float, step: int) -> int:
  lon = norm_lon180(lon)
  snapped = int(round(lon / step) * step)
  if snapped >= 180:
    snapped -= 360
  if snapped < -180:
    snapped += 360
  return snapped


def bilinear_sample(grid: Dict[Tuple[int, int], GridPoint], lat: float, lon: float) -> Optional[GridPoint]:
  # Must match app.js coarse grid behavior.
  LAT_STEP = 20
  LON_STEP = 20
  LAT_MIN = -70
  LAT_MAX = 70

  lat0 = snap(lat - LAT_STEP / 2, LAT_STEP, LAT_MIN, LAT_MAX)
  lat1 = snap(lat + LAT_STEP / 2, LAT_STEP, LAT_MIN, LAT_MAX)
  lon0 = snap_lon(lon - LON_STEP / 2, LON_STEP)
  lon1 = snap_lon(lon + LON_STEP / 2, LON_STEP)

  def gv(la: int, lo: int) -> Optional[GridPoint]:
    return grid.get((la, lo))

  if lat0 == lat1 and lon0 == lon1:
    return gv(lat0, lon0)

  if lat0 == lat1:
    fx = 0.0
    lat_t = lat_b = lat0
  elif lat0 <= lat1:
    fx = (lat - lat0) / (lat1 - lat0)
    lat_t, lat_b = lat0, lat1
  else:
    fx = (lat - lat1) / (lat0 - lat1)
    lat_t, lat_b = lat1, lat0
  fx = clamp(fx, 0, 1)

  if lon0 == lon1:
    fy = 0.0
    lon_l = lon_r = lon0
  elif lon0 <= lon1:
    fy = (lon - lon0) / (lon1 - lon0)
    lon_l, lon_r = lon0, lon1
  else:
    fy = (lon - lon0) / (lon1 + 360 - lon0)
    lon_l, lon_r = lon0, lon1
  fy = clamp(fy, 0, 1)

  v00 = gv(lat_t, lon_l)
  v01 = gv(lat_t, lon_r)
  v10 = gv(lat_b, lon_l)
  v11 = gv(lat_b, lon_r)
  if not (v00 or v01 or v10 or v11):
    return None

  def lerp_pt(a: Optional[GridPoint], b: Optional[GridPoint], t: float) -> Optional[GridPoint]:
    if a is None and b is None:
      return None
    if a is None:
      return b
    if b is None:
      return a
    return GridPoint(
      temperature_c=a.temperature_c + (b.temperature_c - a.temperature_c) * t,
      precip_mmh=a.precip_mmh + (b.precip_mmh - a.precip_mmh) * t,
    )

  top = lerp_pt(v00, v01, fy)
  bot = lerp_pt(v10, v11, fy)
  return lerp_pt(top, bot, fx)


def main() -> int:
  ecc = _try_import_eccodes()
  fields = None
  meta = None
  grid = None

  if ecc:
    try:
      fields, meta = parse_grib_fields_1deg(ecc)
    except Exception:
      fields = None
      meta = None

  if not fields:
    grid, meta = load_noaa_grid()

  temp_img = Image.new("RGBA", (WIDTH, HEIGHT))
  precip_img = Image.new("RGBA", (WIDTH, HEIGHT))
  tpix = temp_img.load()
  ppix = precip_img.load()

  def sample_field_1deg(field, lat: float, lon: float) -> float:
    # regular_ll with Ni=360 lon 0..359, Nj=181 lat -90..90
    lon360 = lon if lon >= 0 else lon + 360
    i = int(round(lon360)) % 360
    j = int(round(lat + 90))
    if j < 0:
      j = 0
    elif j > 180:
      j = 180
    return float(field[j, i])

  for y in range(HEIGHT):
    # Map y to latitude (+90..-90)
    lat = 90 - (y / (HEIGHT - 1)) * 180
    for x in range(WIDTH):
      lon = -180 + (x / (WIDTH - 1)) * 360
      if fields:
        t_k = sample_field_1deg(fields["t2m_k"], lat, lon)
        pr = sample_field_1deg(fields["prate"], lat, lon)
        temp_c = t_k - 273.15
        precip_mmh = pr * 3600.0
      else:
        assert grid is not None
        v = bilinear_sample(grid, lat, lon)
        if v is None:
          tpix[x, y] = (0, 0, 0, 0)
          ppix[x, y] = (0, 0, 0, 0)
          continue
        temp_c = v.temperature_c
        precip_mmh = v.precip_mmh

      # Temperature: normalize like app.js sampleTemperature()
      t01 = clamp((temp_c + 35) / 80, 0, 1)
      r, g, b = temp_color01(t01)
      a = int(round((0.18 + 0.22 * t01) * 255))
      tpix[x, y] = (r, g, b, a)

      # Precip: normalize like app.js sampleRainfall()
      p01 = clamp(precip_mmh / 5.0, 0, 1)
      col, alpha = rain_color_alpha01(p01)
      if col is None:
        ppix[x, y] = (0, 0, 0, 0)
      else:
        pr, pg, pb = col
        pa = int(round(alpha * 255))
        ppix[x, y] = (pr, pg, pb, pa)

  temp_img.save(OUT_TEMP, format="PNG", optimize=True)
  precip_img.save(OUT_PRECIP, format="PNG", optimize=True)

  out_meta = {
    "source": meta.get("source", "NOAA GFS") if isinstance(meta, dict) else "NOAA GFS",
    "validTime": meta.get("validTime", "") if isinstance(meta, dict) else "",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "width": WIDTH,
    "height": HEIGHT,
  }
  OUT_META.write_text(json.dumps(out_meta, separators=(",", ":"), ensure_ascii=True) + "\n", encoding="utf-8")
  print(f"Wrote {OUT_TEMP} and {OUT_PRECIP}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
