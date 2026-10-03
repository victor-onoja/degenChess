// Downloads the soundtrack from Wikimedia Commons (public domain, CC0 and CC BY recordings; the MP3
// versions Commons makes of each file) into public/music, and writes src/lib/music.json with the
// title, performer, licence and source of every track for the credits.
//   node tools/music/fetch.mjs
import { writeFileSync } from "node:fs";

const TRACKS = [
  ["File:Richard Wagner - Ride of the Valkyries.ogg", "Ride of the Valkyries", "Richard Wagner", "orchestra"],
  ["File:Musopen - In the Hall Of The Mountain King.ogg", "In the Hall of the Mountain King", "Edvard Grieg, Musopen Symphony Orchestra", "orchestra"],
  ["File:PhiladelphiaSymphonyOrchestra-DanseMacabre.ogg", "Danse macabre", "Camille Saint-Saëns, Philadelphia Orchestra, Leopold Stokowski", "orchestra"],
  ["File:Holst, The Planets, Op. 32 - I. Mars, the Bringer of War.ogg", "Mars, the Bringer of War", "Gustav Holst, Skidmore College Orchestra", "orchestra"],
  ["File:Shikanotoone.ogg", "Shika no Tōne (shakuhachi)", "Araki Kodō III", "world"],
  ["File:Dances With Erhu (Antti Luode).mp3", "Dances With Erhu", "Antti Luode", "world"],
  ["File:Guzheng Morning (Antti Luode).mp3", "Guzheng Morning", "Antti Luode", "world"],
  ["File:Koto performance.ogg", "Koto performance", "Torsodog", "world"],
  ["File:Drums and flute at Sanja Matsuri.ogg", "Drums and flute at Sanja Matsuri", "Torsodog", "world"],
  ["File:Rythmes du balafon traditionnel.ogg", "Rythmes du balafon traditionnel", "KONE IF", "world"],
  ["File:Village Drums of Freedom – Black Africa(djembe mix).ogg", "Village Drums of Freedom (djembe mix)", "Gerald Achee", "world"],
];
const UA = { "User-Agent": "DegenChess soundtrack fetcher (github.com/victor-onoja/degenChess)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = [];
for (const [title, name, by, kind] of TRACKS) {
  await sleep(2500);
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&titles=${encodeURIComponent(title)}`;
  const page = Object.values((await (await fetch(api, { headers: UA })).json()).query.pages)[0];
  const info = page.imageinfo[0];
  const original = info.url.split("?")[0];
  const licence = info.extmetadata.LicenseShortName?.value ?? "unknown";
  // Commons serves an MP3 of every audio file next to the original; MP3 plays in every browser.
  const url = original.endsWith(".mp3") ? original : original.replace("/commons/", "/commons/transcoded/") + "/" + original.split("/").pop() + ".mp3";
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    console.log("skip", name, res.status);
    continue;
  }
  const file = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".mp3";
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(`public/music/${file}`, bytes);
  out.push({ file, title: name, by, kind, licence, source: info.descriptionurl });
  console.log(`${file}  ${(bytes.length / 1e6).toFixed(1)} MB  ${licence}`);
}
writeFileSync("src/lib/music.json", JSON.stringify(out, null, 2) + "\n");
