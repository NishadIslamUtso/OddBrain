// Run from any directory. Real popup files, explicitly simulated browser APIs.
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.resolve(__dirname, ".."),
  repo = path.resolve(root, "..");
const esbuild = require(
  path.join(repo, "apps/03_oddbrain/node_modules/esbuild"),
);
const source = `import {lookTokens,DEFAULT_LOOK,presetSnapshot,DEFAULT_SIDEBAR} from './apps/03_oddbrain/src/renderer/src/state/look';import {DEFAULT_APPEARANCE} from './apps/03_oddbrain/src/renderer/src/state/appearance';import {LOOK_PRESETS} from './apps/03_oddbrain/src/renderer/src/ui/lookCatalog';import {normalizeExtensionAppearance} from './apps/03_oddbrain/src/shared/lib/extensionAppearance';module.exports=LOOK_PRESETS.map(p=>{const s=presetSnapshot(p.id,DEFAULT_APPEARANCE,DEFAULT_SIDEBAR);const tokens=lookTokens(s.appearance,s.look);return {id:p.id,name:p.name,appearance:normalizeExtensionAppearance({...s.look,version:1,tokens,scheme:tokens['--ob-scheme'],motion:s.appearance.motion})};});`;
const output = esbuild.buildSync({
  stdin: { contents: source, resolveDir: repo, loader: "ts" },
  bundle: true,
  platform: "node",
  write: false,
  alias: { "@shared": path.join(repo, "apps/03_oddbrain/src/shared") },
}).outputFiles[0].text;
const context = { module: { exports: {} }, console };
vm.runInNewContext(output, context);
const looks = context.module.exports;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
http
  .createServer((req, res) => {
    try {
      const url = new URL(req.url, "http://preview");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/preview/index.html";
      if (pathname === "/preview/looks.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(looks));
        return;
      }
      const file = path.resolve(root, "." + pathname);
      if (!file.startsWith(root + path.sep)) throw Error("not found");
      const descriptor = fs.openSync(
        file,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
      );
      let content;
      try {
        if (!fs.fstatSync(descriptor).isFile()) throw Error("not found");
        content = fs.readFileSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      if (pathname === "/popup/popup.html")
        content = content
          .toString()
          .replace(
            '<script src="../lib/appearance.js">',
            '<script src="/preview/browser.js"></script><script src="../lib/appearance.js">',
          );
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT || 5175), "0.0.0.0", () =>
    console.log(
      "OddBrain extension preview on port " + (process.env.PORT || 5175),
    ),
  );
