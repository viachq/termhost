const CYRILLIC_RE = /[Ѐ-ӿ]/;

export function detectLang(text: string): "uk" | "en" {
  const sample = text.slice(0, 120);
  let cyr = 0, lat = 0;
  for (const ch of sample) {
    if (CYRILLIC_RE.test(ch)) cyr++;
    else if (/[a-zA-Z]/.test(ch)) lat++;
  }
  return cyr > lat ? "uk" : "en";
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(". ", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt + 1));
    remaining = remaining.slice(splitAt + 1);
  }
  return chunks;
}

export async function translateText(text: string, srcLang?: "uk" | "en", tgtLang?: "uk" | "en"): Promise<string> {
  if (!text.trim()) return "";
  const sl = srcLang || detectLang(text);
  const tl = tgtLang || (sl === "uk" ? "en" : "uk");

  const chunks = splitText(text, 4000);
  const results: string[] = [];

  for (const chunk of chunks) {
    const params = new URLSearchParams({ client: "gtx", sl, tl, dt: "t", q: chunk });
    const resp = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const translated = (data[0] as [string, string][]).map((seg) => seg[0]).join("");
    results.push(translated);
  }

  return results.join("\n");
}
