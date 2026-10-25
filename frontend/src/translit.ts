// Devanagari (Marathi) -> English Latin transliteration, character-level, per spec section 6.
const VOWELS: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai",
  "ओ": "o", "औ": "au", "ऋ": "ru", "ऑ": "o", "ॲ": "a",
};
const CONS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
};
const CONJUNCTS: [string, string][] = [["क्ष", "ksh"], ["ज्ञ", "dny"]];
const MATRA: Record<string, string> = {
  "ा": "a", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
  "ृ": "ru", "ॅ": "e", "ॉ": "o",
};
const VIRAMA = "्";
const NUKTA = "़";
const LABIALS = new Set(["प", "फ", "ब", "भ", "म"]);
const DIGITS = "०१२३४५६७८९";

const isDeva = (c: string | undefined) => !!c && c >= "\u0900" && c <= "\u097F";

export const hasDevanagari = (s: string) => /[\u0900-\u097F]/.test(s);

function convertWord(word: string): string {
  let out = "";
  let syllables = 0;
  let lastImplicit = false;
  let i = 0;
  while (i < word.length) {
    const c = word[i];
    let base: string | null = null;
    for (const [k, v] of CONJUNCTS) {
      if (word.startsWith(k, i)) {
        base = v;
        i += k.length;
        break;
      }
    }
    if (base === null && CONS[c]) {
      base = CONS[c];
      i += 1;
    }
    if (base !== null) {
      if (word[i] === NUKTA) i += 1;
      const n = word[i];
      if (n && MATRA[n]) {
        out += base + MATRA[n];
        i += 1;
        lastImplicit = false;
        syllables++;
      } else if (n === VIRAMA) {
        out += base;
        i += 1;
        lastImplicit = false;
      } else {
        out += base + "a";
        lastImplicit = true;
        syllables++;
      }
      continue;
    }
    if (VOWELS[c]) {
      out += VOWELS[c];
      lastImplicit = false;
      syllables++;
      i += 1;
      continue;
    }
    if (c === "ं") {
      const next = word[i + 1];
      out += next && CONS[next] && !LABIALS.has(next) ? "n" : "m";
      lastImplicit = false;
      i += 1;
      continue;
    }
    if (c === "ः") { out += "h"; lastImplicit = false; i += 1; continue; }
    if (c === "ँ") { out += "n"; lastImplicit = false; i += 1; continue; }
    const d = DIGITS.indexOf(c);
    if (d >= 0) { out += String(d); lastImplicit = false; i += 1; continue; }
    if (c === "।" || c === "॥") { out += "."; i += 1; continue; }
    if (isDeva(c)) { i += 1; continue; }
    out += c;
    lastImplicit = false;
    i += 1;
  }
  // Marathi drops the inherent vowel at word end: "गणेश" -> "Ganesh"
  if (lastImplicit && syllables > 1) out = out.slice(0, -1);
  return out;
}

export function transliterate(text: string): string {
  if (!text || !hasDevanagari(text)) return text;
  return text
    .split(/(\s+|[,/()\-.])/)
    .map((part) => {
      if (!hasDevanagari(part)) return part;
      const w = convertWord(part);
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}
