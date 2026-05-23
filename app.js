const countries = [
  {
    code: "US",
    headline: 'Live updates: U.S. launches "self-defense strikes" after Tehran escalation',
    language: "English",
    age: "2m",
  },
  {
    code: "UK",
    headline: "Election 2026 live: votes counted as parties battle for a fractured mandate",
    language: "English",
    age: "3m",
  },
  {
    code: "AU",
    headline: "Australia briefs allies after arrests tied to a foreign-directed plot",
    language: "English",
    age: "5m",
  },
  {
    code: "MX",
    headline: "El gabinete mexicano acelera respuesta económica tras señal de presión comercial",
    language: "Spanish",
    age: "6m",
  },
  {
    code: "BR",
    headline: "Imprensa internacional repercute encontro de Lula com bloco regional",
    language: "Portuguese",
    age: "4m",
  },
  {
    code: "FR",
    headline: "En direct: Paris réévalue sa posture diplomatique après frappes américaines",
    language: "French",
    age: "7m",
  },
  {
    code: "DE",
    headline: 'Nur zwei Schritte durchgekommen: Koalition ringt um den nächsten außenpolitischen Kurs',
    language: "German",
    age: "8m",
  },
  {
    code: "UA",
    headline: 'Росія оголосила про "перемир’я" на тлі нового ракетного попередження',
    language: "Ukrainian",
    age: "9m",
  },
];

function renderCountries() {
  const root = document.querySelector("#country-list");

  root.innerHTML = countries
    .map(
      (item) => `
        <article class="country-row">
          <div class="country-code">[${item.code}]</div>
          <div>
            <p class="country-headline">${item.headline}</p>
            <span class="country-language">${item.language}</span>
          </div>
          <div class="country-age">${item.age}</div>
        </article>
      `,
    )
    .join("");
}

renderCountries();
