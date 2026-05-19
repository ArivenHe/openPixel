const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const moderateText = (text, words) => {
  const normalized = text.trim();
  const matchedWords = words.filter((word) => normalized.includes(word));

  if (matchedWords.length === 0) {
    return {
      flagged: false,
      sanitizedText: normalized,
      matchedWords: []
    };
  }

  const pattern = new RegExp(matchedWords.map(escapeRegExp).join("|"), "gi");

  return {
    flagged: true,
    sanitizedText: normalized.replace(pattern, "***"),
    matchedWords
  };
};

