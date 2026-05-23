const populationFormatter = new Intl.NumberFormat("en-US");
const DATA_URL = "./world-brief-data.json";
const AD_INTERVAL = 12;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCountries(countries) {
  const root = document.querySelector("#country-list");
  const items = [];

  countries.forEach((item, index) => {
    items.push(`
        <article class="country-row">
          <div class="country-rank">#${index + 1}</div>
          <div>
            <p class="country-headline">${escapeHtml(item.name)}</p>
            <span class="country-code">${escapeHtml(item.iso3)} · ${escapeHtml(item.language)}</span>
            <p class="country-news">${escapeHtml(item.headline || "No cached headline available.")}</p>
          </div>
          <div class="country-population">
            ${populationFormatter.format(item.population)}
            <span>${escapeHtml(item.year)}</span>
          </div>
        </article>
      `);

    if ((index + 1) % AD_INTERVAL === 0 && index + 1 < countries.length) {
      items.push(`
        <article class="country-row country-row-ad">
          <div class="ad-card" aria-label="Sponsored placement">
            <span class="ad-label">Sponsored</span>
            <div>
              <p class="ad-title">In-feed ad slot</p>
              <p class="ad-copy">
                Sponsor placement inserted between country briefings. Replace this with AdSense,
                affiliate creative, or direct-sold campaign copy later.
              </p>
            </div>
          </div>
        </article>
      `);
    }
  });

  root.innerHTML = items.join("");
}

function renderLoading() {
  const root = document.querySelector("#country-list");
  root.innerHTML = `
    <article class="country-row">
      <div class="country-rank">...</div>
      <div>
        <p class="country-headline">Loading World Brief</p>
        <span class="country-code">HEADLINES + POPULATION</span>
      </div>
      <div class="country-population">...</div>
    </article>
  `;
}

function renderError() {
  const root = document.querySelector("#country-list");
  root.innerHTML = `
    <article class="country-row">
      <div class="country-rank">!</div>
      <div>
        <p class="country-headline">Population ranking is temporarily unavailable.</p>
        <span class="country-code">TRY AGAIN</span>
      </div>
      <div class="country-population">ERROR</div>
    </article>
  `;
}

async function loadCountries() {
  const response = await fetch(DATA_URL);
  const countries = await response.json();
  renderCountries(countries);
}

renderLoading();
loadCountries().catch(() => {
  renderError();
});
