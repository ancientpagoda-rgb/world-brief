async function toDaDisplay(input = "", language = "") {
  const text = String(input || "");
  if (!text) return "";

  // Remove <span> wrapping temporarily to restore functionality:
  if (language === "hi" || DEVANAGARI_RE.test(text)) {
    return transliterateDevanagari(text); // Original logic, no color spans.
  }
  if (language === "zh" || HAN_RE.test(text)) {
    return transliterateChinese(text);
  }
  return toDaCore(text); // Original logic.
}