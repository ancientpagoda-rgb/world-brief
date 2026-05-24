#!/usr/bin/env python3

import io
import json
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUT_IMG = ROOT / "earth-live.jpg"
OUT_META = ROOT / "earth-live.json"

# NASA Worldview Snapshots API (global, daily-ish imagery)
SNAPSHOT_ENDPOINT = "https://wvs.earthdata.nasa.gov/api/v1/snapshot"
BASE_LAYER = "BlueMarble_ShadedRelief_Bathymetry"
LIVE_LAYER = "VIIRS_SNPP_CorrectedReflectance_TrueColor"

# Keep it lofi (small + fast to download + good enough for the globe).
WIDTH = 1024
HEIGHT = 512


def try_fetch_for_date(day: str) -> tuple[bytes | None, dict[str, str]]:
    params = {
        "REQUEST": "GetSnapshot",
        "LAYERS": LIVE_LAYER,
        "CRS": "EPSG:4326",
        # EPSG:4326 uses latitude,longitude axis order.
        "BBOX": "-90,-180,90,180",
        "FORMAT": "image/jpeg",
        "WIDTH": str(WIDTH),
        "HEIGHT": str(HEIGHT),
        "TIME": day,
    }
    url = SNAPSHOT_ENDPOINT + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (WorldBuilder/earth-live)"},
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        headers = {k.lower(): v for k, v in resp.headers.items()}
        data_present = headers.get("data-present", "false").lower() == "true"
        body = resp.read()
        if not data_present or not body:
            return None, headers
        return body, headers


def main() -> int:
    now = datetime.now(timezone.utc)
    headers_last = {}
    image = None
    chosen_day = None

    # Worldview can lag behind by a day; search back a bit.
    for back in range(0, 7):
        day = (now - timedelta(days=back)).date().isoformat()
        try:
            image, headers_last = try_fetch_for_date(day)
        except Exception:
            image = None
            headers_last = {}
        if image:
            chosen_day = day
            break

    if not image or not chosen_day:
        raise SystemExit("Could not fetch a recent Worldview snapshot")

    # Always fetch a full-coverage base and composite the live swath on top.
    base_params = {
        "REQUEST": "GetSnapshot",
        "LAYERS": BASE_LAYER,
        "CRS": "EPSG:4326",
        "BBOX": "-90,-180,90,180",
        "FORMAT": "image/jpeg",
        "WIDTH": str(WIDTH),
        "HEIGHT": str(HEIGHT),
        "TIME": chosen_day,
    }
    base_url = SNAPSHOT_ENDPOINT + "?" + urllib.parse.urlencode(base_params)
    base_req = urllib.request.Request(
        base_url,
        headers={"User-Agent": "Mozilla/5.0 (WorldBuilder/earth-base)"},
    )
    with urllib.request.urlopen(base_req, timeout=60) as resp:
        base_bytes = resp.read()
    if not base_bytes:
        raise SystemExit("Could not fetch base BlueMarble snapshot")

    base_img = Image.open(io.BytesIO(base_bytes)).convert("RGB")
    live_img = Image.open(io.BytesIO(image)).convert("RGB")
    if base_img.size != live_img.size:
        live_img = live_img.resize(base_img.size, Image.BILINEAR)

    # Mask out missing/black swath pixels.
    gray = live_img.convert("L")
    mask = gray.point(lambda p: 255 if p > 10 else 0, mode="L")
    composite = Image.composite(live_img, base_img, mask)

    out_buf = io.BytesIO()
    composite.save(out_buf, format="JPEG", quality=82, optimize=True, progressive=True)
    out_bytes = out_buf.getvalue()

    OUT_IMG.write_bytes(out_bytes)
    OUT_META.write_text(
        json.dumps(
            {
                "source": "NASA Worldview Snapshots",
                "baseLayer": BASE_LAYER,
                "liveLayer": LIVE_LAYER,
                "requestedTime": chosen_day,
                "acquisitionTime": headers_last.get("acquisition-time", chosen_day),
                "dataPresent": True,
                "width": WIDTH,
                "height": HEIGHT,
                "generatedAt": now.isoformat().replace("+00:00", "Z"),
            },
            separators=(",", ":"),
            ensure_ascii=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT_IMG} ({len(out_bytes)} bytes) for {chosen_day}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
