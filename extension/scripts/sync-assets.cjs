// Source artwork belongs to OddBrain. Package originals, never a replacement mascot.
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "../..");
const source = path.join(root, "apps/03_oddbrain/src/renderer/src/assets");
const target = path.join(root, "extension/assets");
fs.mkdirSync(path.join(target, "motion"), { recursive: true });
const files = fs
  .readdirSync(path.join(source, "motion"))
  .filter((f) => f.endsWith(".svg"));
for (const name of files)
  fs.copyFileSync(
    path.join(source, "motion", name),
    path.join(target, "motion", name),
  );
fs.copyFileSync(
  path.join(source, "wordmark.svg"),
  path.join(target, "wordmark.svg"),
);
fs.writeFileSync(
  path.join(target, "scenes.json"),
  JSON.stringify(files.map((f) => f.slice(0, -4))),
);
console.log(`Packaged ${files.length} original scenes.`);

const catalog = fs.readFileSync(
  path.join(root, "apps/03_oddbrain/src/shared/lib/motionKitData.ts"),
  "utf8",
);
const words = Object.fromEntries(
  [
    ...catalog.matchAll(/\{ id: "([^"]+)".*?defaultWord: ("(?:\\.|[^"\\])*")/g),
  ].map((match) => [match[1], JSON.parse(match[2])]),
);
const loader = catalog.match(/export const LOADER_ID = "([^"]+)"/)[1];
words[loader] = "Loading";
fs.writeFileSync(path.join(target, "scene-words.json"), JSON.stringify(words));
