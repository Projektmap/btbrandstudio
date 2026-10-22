// BT Brand Studio: návrh brandu přes Claude API. Klíč v ANTHROPIC_API_KEY (Vercel), volitelně BRAND_KOD (přístupový kód) a MODEL.
const MODEL = process.env.MODEL || "claude-sonnet-5-5";
const str = (v, n) => String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
function clean(z) {
  z = z || {};
  return {
    obory: (Array.isArray(z.obory) ? z.obory : []).map(x => str(x, 120)).filter(Boolean).slice(0, 12),
    barvy: (Array.isArray(z.barvy) ? z.barvy : []).filter(x => /^#[0-9a-f]{6}$/i.test(x)).slice(0, 5),
    barvySlovy: str(z.barvySlovy, 300),
    charakter: (Array.isArray(z.charakter) ? z.charakter : []).map(x => str(x, 40)).filter(Boolean).slice(0, 10),
    nazev: str(z.nazev, 60),
    popis: str(z.popis, 1500)
  };
}
function prompt(z) {
  return `Jsi brand manažer s 30 lety praxe (budování značek v ČR i v zahraničí). Navrhni kompletní brand koncept podle zadání. Piš česky, konkrétně, bez klišé a vaty.

ZADÁNÍ (JSON):
${JSON.stringify(z, null, 1)}

PRAVIDLA:
- Barvy ze zadání MUSÍ být v paletě (jako primární/akcent podle smyslu); doplň je na 5 barev (primární, sekundární, akcent, neutrální tmavá, neutrální světlá). Dodrž "barvySlovy". Podíly dohromady 100. Hlídej kontrast textu.
- Pokud chybí název, vymysli krátký, vyslovitelný český nebo mezinárodní název, použitelný jako doména .cz (bez diakritiky v doméně). Pokud název je zadán, použij ho.
- Písma vyber jen z Google Fonts s podporou češtiny (latin-ext), přesné názvy rodin.
- Logo navrhni jako jednoduché, čisté vektorové SVG: symbol_svg (viewBox "0 0 100 100", jen geometrické tvary) a logo_svg (viewBox "0 0 340 100": symbol vlevo + název jako <text> s font-family nadpisového písma). Povolené prvky: svg, g, path, circle, rect, ellipse, line, polyline, polygon, text, defs, linearGradient, stop. Žádné obrázky, styly, skripty ani externí odkazy. Barvy jen z palety. Symbol musí dávat smysl i v malé velikosti a vyjadřovat obor.
- Vrať POUZE JSON (bez dalšího textu a bez markdownu) tohoto tvaru:
{"nazev":"","alternativy":["",""],"claim":"","esence":"1–2 věty","pribeh":"2–3 věty","hodnoty":[{"nazev":"","popis":""},{"nazev":"","popis":""},{"nazev":"","popis":""}],"osobnost":["","","",""],"cilovaSkupina":"","tonHlasu":"","paleta":[{"nazev":"","hex":"#RRGGBB","role":"primární|sekundární|akcent|neutrální tmavá|neutrální světlá","podil":40,"pouziti":""}],"typografie":{"nadpisy":{"font":"","vaha":700,"proc":""},"text":{"font":"","vaha":400,"proc":""}},"logo":{"popis":"","konstrukce":"","symbol_svg":"<svg ...>","logo_svg":"<svg ...>"},"pouziti":{"web_headline":"","social_post":"","vizitka_pozice":""},"doporuceni":["","",""],"zakazy":["","",""],"komentar":"2–3 věty z pohledu zkušeného brand manažera: proč je koncept takto postavený a na co si dát pozor"}`;
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.ANTHROPIC_API_KEY, code = process.env.BRAND_KOD || "";
  if (req.method === "GET") return res.status(200).json({ configured: !!key, requiresCode: !!code });
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "method" }); }
  if (!key) return res.status(503).json({ error: "not_configured" });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (code && b.kod !== code) return res.status(403).json({ error: "bad_code" });
  const z = clean(b.zadani);
  if (!z.obory.length) return res.status(400).json({ error: "empty" });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt(z) }] })
    });
    if (r.status === 429) return res.status(429).json({ error: "rate_limited" });
    if (!r.ok) return res.status(502).json({ error: "api", status: r.status });
    const j = await r.json();
    const text = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    const brand = JSON.parse(text.slice(s, e + 1));
    return res.status(200).json({ brand });
  } catch (err) { return res.status(500).json({ error: "server" }); }
};
