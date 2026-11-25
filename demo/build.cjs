// Biên dịch các module thuần của dự án (TS → CommonJS) và ghép vào 1 trang HTML
const path = require("path");
let ts; try { ts = require("typescript"); } catch { ts = require("/opt/npm-tools/node_modules/typescript"); }
const fs = require("fs");
const ROOT = path.join(__dirname, "../lib/");
const MODS = {
  engine: "pricing/engine.ts",
  importExcel: "pricing/import-excel.ts",
  versioning: "pricing/versioning.ts",
  importParse: "orders/import-parse.ts",
  statementFmt: "statements/format.ts",
  receiptFmt: "receipts/format.ts",
  permissions: "auth/permissions.ts",
};
const REQ = { "../pricing/import-excel": "importExcel", "./engine": "engine" };
let out = "const __M = {};\nconst __req = (p) => __M[" + JSON.stringify(REQ) + "[p]];\n";
for (const [name, file] of Object.entries(MODS)) {
  const src = fs.readFileSync(ROOT + file, "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  out += `__M.${name} = (() => { const exports = {}; const module = { exports }; const require = __req;\n${js}\nreturn module.exports; })();\n`;
}
const logo = fs.readFileSync(path.join(__dirname, "../public/logo.png")).toString("base64");
let html = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
html = html.replace("/*__MODULES__*/", () => out).replace("/*__APP__*/", () => app).replace("__LOGO__", "data:image/png;base64," + logo);
fs.writeFileSync(path.join(__dirname, "index.html"), html);
console.log("built", (html.length / 1024).toFixed(0) + " KB");
