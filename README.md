# World

A browser-based celestial globe with live weather, near-real-time satellite imagery, HYG star catalog, and country headlines.

## What this is

- Celestial visualization with HYG star catalog and Keplerian planetary orbits
- NASA Worldview near-real-time satellite texture on the globe, fetched live in the browser with a CI fallback
- Live weather overlay (NOAA GFS, grid + raster overlays committed by CI)
- Country-by-country headlines with population data

## Run it

Open `index.html` in a browser.

## Data

- `world-data.json` — country dataset (name, iso3, population, headline)
- `stars.json` — HYG v3.8 star catalog (8921 stars with RA/Dec/magnitude/B-V color)
