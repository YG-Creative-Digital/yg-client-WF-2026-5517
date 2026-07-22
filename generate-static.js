#!/usr/bin/env node
/*
 * Zero-dependency static site generator for YG client previews.
 *
 * Reads site-data.json (captured at intake submit — fully-rendered page HTML,
 * complete CSS, font URL, frame attributes) and writes a static ./out folder
 * ready to deploy to Cloudflare Pages. No npm install, no framework build.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const DATA_PATH = path.join(ROOT, 'site-data.json');

// ── Load + validate ───────────────────────────────────────────────────────────
if (!fs.existsSync(DATA_PATH)) {
  console.error('::error::site-data.json not found');
  process.exit(1);
}
let data;
try {
  data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
} catch (e) {
  console.error('::error::site-data.json is not valid JSON:', e.message);
  process.exit(1);
}
if (!data.pages || !data.pageOrder || !data.pageOrder.length) {
  console.error('::error::site-data.json missing pages/pageOrder');
  process.exit(1);
}

const SITE_TITLE = process.env.SITE_TITLE || 'Website preview';

// ── CSS preparation ───────────────────────────────────────────────────────────
function prepareCSS(css) {
  if (!css) return '';
  return css
    .replace(/\.wf-frame\b/g, '.yg-page')
    .replace(/#wfFrame\b/g, '.yg-page')
    .replace(/#wfBody\b/g, '.yg-page')
    .replace(/@media[^{]*prefers-color-scheme\s*:\s*dark\s*\{[\s\S]*?\}\s*\}/g, '');
}

const FORCE_VISIBLE =
  '.yg-page{overflow:visible!important}' +
  '.yg-page .wf-section{opacity:1!important;transform:none!important;' +
  'animation:none!important;transition:none!important;visibility:visible!important}' +
  '.yg-page .wf-reveal,.yg-page .wf-reveal-stagger{opacity:1!important;transform:none!important}';

// The intake renders inside its own overlay, so the wireframe CSS never resets the
// document body — on the standalone deploy the browser's default 8px body margin
// showed as a white frame around the full-bleed page. Reset it here.
const BASE_RESET = 'html,body{margin:0;padding:0}';

// Base font stack loaded by intake.html itself (public/intake.html:12) — backs every
// fallback/accent font used by templates, not just the submission's chosen font(s).
// Without this the deploy renders fallback text in a system font while the intake
// draft (and src/lib/render-site.ts in-app preview) shows the real font — the
// "differing fonts" parity bug. Keep in sync with render-site.ts BASE_FONT_IMPORT.
const BASE_FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&family=Delicious+Handrawn&family=VT323&family=Fredoka:wght@500;600;700&family=Space+Mono:wght@400;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800&family=Space+Grotesk:wght@500;700&display=swap');";

// ── Client runtime: widget (note mode + self-serve edit mode) ─────────────────
// _widget.js is read at build time so widget-only updates need only that file.
const WIDGET_CODE = fs.readFileSync(path.join(ROOT, '_widget.js'), 'utf8');

function clientScript(siteRef) {
  const ref = JSON.stringify(siteRef || '');
  // Inject the site ref before the widget IIFE so window.__YG_REF is available.
  return '\n<script>window.__YG_REF=' + ref + ';\n' + WIDGET_CODE + '\n</script>';
}

// ── Page template ─────────────────────────────────────────────────────────────
function escAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }

function varsToStyle(vars) {
  if (!vars) return '';
  return Object.keys(vars)
    .filter(k => vars[k])
    .map(k => `${k}:${String(vars[k]).trim()}`)
    .join(';');
}

// Nav safety net. Pages captured from intake edit mode keep the live inline
// handler onclick="wfGoPage('x')" — but wfGoPage only exists in the intake, so
// those nav items are dead on the deploy (the widget only wires [data-route]).
// Rewrite them to data-route here so every page navigates regardless of whether
// it was edited. Pages captured normally already carry data-route and are untouched.
function wireNav(html) {
  // [^"]* tail: post-C3 handlers may carry a suffix ("…;return false",
  // "…;wf2CloseNav()") — strip the whole handler either way. Post-C3 captures
  // ship real <a href> anchors (data-route kept as a hint), so this stays a
  // safety net for edit-mode captures only. Keep in sync with
  // src/lib/render-site.ts and .claude/skills/preview-draft/render.js.
  return (html || '').replace(
    /\s*onclick="wfGoPage\((['"])([^'"]+)\1\)[^"]*"/g,
    (_m, _q, pg) => ` data-route="${pg === 'home' ? '/' : '/' + pg}"`
  );
}

function pageHtml(bodyHtml) {
  const m = data.frameMeta || {};
  const styleAttr = varsToStyle(m.vars);
  const hrefs = (Array.isArray(data.fontHrefs) && data.fontHrefs.length)
    ? data.fontHrefs
    : (data.fontHref ? [data.fontHref] : []);
  const fontLink = hrefs.map(h => `<link rel="stylesheet" href="${escAttr(h)}">`).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${SITE_TITLE.replace(/</g, '&lt;')}</title>
${fontLink}
<style>${BASE_FONT_IMPORT}</style>
<style>${BASE_RESET}</style>
<style>${prepareCSS(data.css)}</style>
<style>${FORCE_VISIBLE}</style>
</head>
<body>
<div class="yg-page"${m.dataFont ? ` data-font="${escAttr(m.dataFont)}"` : ''}${m.dataLayout ? ` data-layout="${escAttr(m.dataLayout)}"` : ''}${m.dataHero ? ` data-hero="${escAttr(m.dataHero)}"` : ''}${m.dataMood ? ` data-mood="${escAttr(m.dataMood)}"` : ''}${styleAttr ? ` style="${escAttr(styleAttr)}"` : ''}>
${wireNav(bodyHtml)}
${clientScript(data.ref)}
</body>
</html>`;
}

// ── Write out/ ────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let written = 0;
for (const key of data.pageOrder) {
  const html = data.pages[key];
  if (html == null) {
    console.warn(`::warning::no captured HTML for page "${key}" — skipping`);
    continue;
  }
  const filePath = key === 'home'
    ? path.join(OUT, 'index.html')
    : path.join(OUT, ...key.split('/'), 'index.html');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pageHtml(html), 'utf8');
  written++;
}

const favSrc = path.join(ROOT, 'app', 'favicon.ico');
if (fs.existsSync(favSrc)) {
  try { fs.copyFileSync(favSrc, path.join(OUT, 'favicon.ico')); } catch {}
}

if (written === 0) {
  console.error('::error::no pages written');
  process.exit(1);
}
console.log(`Generated ${written} page(s) into ./out`);
