// Lowercase and without accents ("Épargne" -> "epargne"): what a search or a header match compares.
export function foldAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
