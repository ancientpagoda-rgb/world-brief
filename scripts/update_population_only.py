#!/usr/bin/env python3

import json
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "world-data.json"

WORLD_BANK_COUNTRIES = "https://api.worldbank.org/v2/country/all?format=json&per_page=400"
WORLD_BANK_POPULATION = (
    "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1"
)


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=25) as response:
        return json.load(response)


def main() -> int:
    if not DATA_PATH.exists():
        raise SystemExit(f"Missing {DATA_PATH}")

    existing = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(existing, list):
        raise SystemExit("world-data.json is not a list")

    meta_rows = fetch_json(WORLD_BANK_COUNTRIES)[1]
    pop_rows = fetch_json(WORLD_BANK_POPULATION)[1]

    meta_by_iso2 = {
        row.get("iso2Code"): row
        for row in meta_rows
        if row.get("region", {}).get("value") != "Aggregates"
    }

    # Update by iso3 (more stable in our dataset).
    by_iso3 = {
        str(row.get("iso3")): row
        for row in existing
        if isinstance(row, dict) and row.get("iso3")
    }

    updated = 0
    for row in pop_rows:
        iso2 = row.get("country", {}).get("id")
        if not iso2 or iso2 not in meta_by_iso2:
            continue
        iso3 = row.get("countryiso3code")
        value = row.get("value")
        year = row.get("date")
        if not iso3 or value is None or year is None:
            continue
        target = by_iso3.get(iso3)
        if not target:
            continue
        target["population"] = int(value)
        target["year"] = str(year)
        # Keep name aligned with WB if present.
        if "name" in target and meta_by_iso2.get(iso2, {}).get("name"):
            target["name"] = meta_by_iso2[iso2]["name"]
        updated += 1

    # Re-rank by population desc.
    existing.sort(key=lambda r: (r.get("population") is None, -(r.get("population") or 0)))
    for idx, row in enumerate(existing, start=1):
        if isinstance(row, dict):
            row["rank"] = idx

    DATA_PATH.write_text(json.dumps(existing, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated population/year for {updated} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
