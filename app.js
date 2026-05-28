async function toDaDisplay(input = "", language = "") {
  const text = String(input || "");
  if (!text) return "";

  // Wrap words in <span> and dynamically apply colors.
  const wrapWithColor = (word, index) => {
    const colors = ["red", "blue", "green", "orange", "purple"]; // Example color palette
    const color = colors[index % colors.length];
    return `<span style="color: ${color}">${word}</span>`;
  };

  if (language === "hi" || DEVANAGARI_RE.test(text)) {
    return transliterateDevanagari(text)
      .split(" ") // Split text into words
      .map(wrapWithColor) // Wrap each word
      .join(" "); // Join wrapped words with spaces
  }

  if (language === "zh" || HAN_RE.test(text)) {
    return transliterateChinese(text)
      .split(" ")
      .map(wrapWithColor)
      .join(" ");
  }

  return toDaCore(text)
    .split(" ")
    .map(wrapWithColor)
    .join(" ");
}