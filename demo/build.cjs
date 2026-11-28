// Đóng gói các module thuần của dự án (esbuild → IIFE, biến __M) và ghép vào 1 trang HTML: node demo/build.cjs
const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const res = esbuild.buildSync({
  entryPoints: [path.join(__dirname, "modules.ts")],
  bundle: true,
  format: "iife",
  globalName: "__M",
  platform: "browser",
  target: "es2022",
  minify: true,
  write: false,
  external: ["exceljs"], // chỉ dùng kiểu (import type); ExcelJS lấy từ CDN
  logLevel: "error",
});
const modules = res.outputFiles[0].text;
const logo = fs.readFileSync(path.join(__dirname, "../public/logo.png")).toString("base64");
let html = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");
const portal = fs.readFileSync(path.join(__dirname, "portal.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8").replace("/*__PORTAL__*/", () => portal);
html = html
  .replace("/*__MODULES__*/", () => modules)
  .replace("/*__APP__*/", () => app)
  .replace("__LOGO__", "data:image/png;base64," + logo);
fs.writeFileSync(path.join(__dirname, "index.html"), html);
console.log("built", (html.length / 1024).toFixed(0) + " KB", "(modules", (modules.length / 1024).toFixed(0) + " KB)");
