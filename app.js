const populationFormatter = new Intl.NumberFormat("en-US");
const DATA_URL = "./world-brief-data.json";
const AD_INTERVAL = 12;
const ADSENSE_CONFIG = {
  publisherId: "",
  topSlotId: "",
  inFeedSlotId: "",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hasAdSenseConfig() {
  return Boolean(
    ADSENSE_CONFIG.publisherId && ADSENSE_CONFIG.topSlotId && ADSENSE_CONFIG.inFeedSlotId,
  );
}

function renderTopAd() {
  if (hasAdSenseConfig()) {
    return `
      <aside class="ad-banner ad-banner-live" aria-label="Sponsored placement">
        <span class="ad-label">Sponsored</span>
        <ins
          class="adsbygoogle ad-unit"
          style="display:block"
          data-ad-client="${escapeHtml(ADSENSE_CONFIG.publisherId)}"
          data-ad-slot="${escapeHtml(ADSENSE_CONFIG.topSlotId)}"
          data-ad-format="auto"
          data-full-width-responsive="true"
        ></ins>
      </aside>
    `;
  }

  return `
    <aside class="ad-banner" aria-label="Sponsored placement">
      <span class="ad-label">Sponsored</span>
      <div>
        <p class="ad-title">Advertise on World Brief</p>
        <p class="ad-copy">
          Reach readers scanning headlines country by country. This slot is reserved for a sponsor
          placement.
        </p>
      </div>
    </aside>
  `;
}

function renderInFeedAd() {
  if (hasAdSenseConfig()) {
    return `
      <article class="country-row country-row-ad">
        <div class="ad-card ad-card-live" aria-label="Sponsored placement">
          <span class="ad-label">Sponsored</span>
          <ins
            class="adsbygoogle ad-unit"
            style="display:block"
            data-ad-client="${escapeHtml(ADSENSE_CONFIG.publisherId)}"
            data-ad-slot="${escapeHtml(ADSENSE_CONFIG.inFeedSlotId)}"
            data-ad-format="auto"
            data-full-width-responsive="true"
          ></ins>
        </div>
      </article>
    `;
  }

  return `
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
  `;
}

function renderTopAdPlacement() {
  const root = document.querySelector("#top-ad-slot");
  if (!root) return;
  root.innerHTML = renderTopAd();
}

function loadAdSenseScript() {
  if (!hasAdSenseConfig()) return Promise.resolve(false);

  const existing = document.querySelector('script[data-world-brief-adsense="true"]');
  if (existing) return Promise.resolve(true);

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
      ADSENSE_CONFIG.publisherId,
    )}`;
    script.crossOrigin = "anonymous";
    script.dataset.worldBriefAdsense = "true";
    script.onload = () => resolve(true);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function initializeAds() {
  if (!hasAdSenseConfig()) return;
  document.querySelectorAll(".adsbygoogle").forEach(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (_error) {
      // Leave empty ad containers in place if Google declines to fill them.
    }
  });
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
      items.push(renderInFeedAd());
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
  renderTopAdPlacement();
  renderCountries(countries);
  await loadAdSenseScript();
  initializeAds();
}

renderTopAdPlacement();
renderLoading();
loadCountries().catch(() => {
  renderError();
});
