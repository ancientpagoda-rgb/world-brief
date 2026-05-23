const populationFormatter = new Intl.NumberFormat("en-US");
const COUNTRY_META_URL = "https://api.worldbank.org/v2/country/all?format=json&per_page=400";
const POPULATION_URL =
  "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1";

function renderCountries(countries) {
  const root = document.querySelector("#country-list");

  root.innerHTML = countries
    .map(
      (item, index) => `
        <article class="country-row">
          <div class="country-rank">#${index + 1}</div>
          <div>
            <p class="country-headline">${item.name}</p>
            <span class="country-code">${item.iso3}</span>
          </div>
          <div class="country-population">${populationFormatter.format(item.population)}</div>
        </article>
      `,
    )
    .join("");
}

function renderLoading() {
  const root = document.querySelector("#country-list");
  root.innerHTML = `
    <article class="country-row">
      <div class="country-rank">...</div>
      <div>
        <p class="country-headline">Loading country population ranking</p>
        <span class="country-code">WORLD BANK</span>
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
  const [metaResponse, populationResponse] = await Promise.all([
    fetch(COUNTRY_META_URL),
    fetch(POPULATION_URL),
  ]);

  const metaPayload = await metaResponse.json();
  const populationPayload = await populationResponse.json();

  const metaRows = metaPayload[1] || [];
  const populationRows = populationPayload[1] || [];

  const metaMap = new Map(
    metaRows
      .filter((row) => row.region?.value !== "Aggregates")
      .map((row) => [row.iso2Code, row]),
  );

  const countries = populationRows
    .filter((row) => row.value !== null && metaMap.has(row.country.id))
    .map((row) => ({
      iso3: row.countryiso3code,
      name: metaMap.get(row.country.id).name,
      population: row.value,
    }))
    .sort((left, right) => right.population - left.population);

  renderCountries(countries);
}

renderLoading();
loadCountries().catch(() => {
  renderError();
});
