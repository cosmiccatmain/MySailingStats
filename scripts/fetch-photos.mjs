// Downloads the site's photographs from Wikimedia Commons at build time (they're
// openly licensed and credited on the page). A failed download never fails the
// build: the layout falls back to a plain colour.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PHOTOS = {
  // "Passage de bouée en régate d'Optimist", Loctudy 2012 — jakez29120, CC BY-SA 2.0
  "hero.jpg": "https://upload.wikimedia.org/wikipedia/commons/3/31/005-_Optimist_%28Loctudy_2012%29.jpg",
};

const dir = join(process.cwd(), "public", "photos");
mkdirSync(dir, { recursive: true });
for (const [name, url] of Object.entries(PHOTOS)) {
  const file = join(dir, name);
  if (existsSync(file)) continue;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MySailingStats/1.0 (https://mysailingstats.vercel.app; build-time photo fetch)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a JPEG");
    writeFileSync(file, buf);
    console.log(`photos: saved ${name} (${Math.round(buf.length / 1024)} KB)`);
  } catch (e) {
    console.warn(`photos: couldn't fetch ${name}: ${e.message}`);
  }
}
