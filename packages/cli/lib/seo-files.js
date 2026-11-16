"use strict";
// robots.txt, sitemap.xml and the crawler page for every LumenJS site (2026-10-31, Roxyon c1 queue item 8).
// Before: every site shipped `Sitemap: https://www.lumenjs.com/sitemap.xml` and no real sitemap, and link previews showed
// the SPA's generic shell. Now `lm build` writes, unless the project ships its own file in src/:
// - robots.txt: allow all, plus the site's own Sitemap line when the site's address is known;
// - sitemap.xml: the site's pages (its top-level views, and seo.json's fixed routes) when the address is known;
// - seo.php + seo.json: the page search engines and link previews get (title, description, image, canonical, JSON-LD),
//   per route, including item pages read from Roxyon Base (see files/seo/seo.php). The host sends crawlers to it.
// The site's address: config.json "domain"/"site", project_info.WebsiteURL, or src/seo.json "site".
const fs = require("fs");
const path = require("path");

const SKIP_VIEW = /^(_|404|index$|layout|header|footer|nav)|(\s|copy|_bu|_old|backup|\.bak|test)/i;

function siteUrl(config, seo) {
  const pick = [seo && seo.site, config && config.site, config && config.domain, config && config.project_info && config.project_info.WebsiteURL];
  for (const v of pick) {
    if (typeof v !== "string" || !v.trim()) continue;
    const s = /^https?:\/\//i.test(v.trim()) ? v.trim() : "https://" + v.trim();
    try {
      const u = new URL(s);
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return u.origin;
    } catch (e) {}
  }
  return "";
}

/** Top-level page views: src/views/<name>.view, minus partials, backups and copies; "home" is "/". */
function pageRoutes(projectPath) {
  const dir = path.join(projectPath, "src", "views");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".view")) continue;
    const name = f.slice(0, -5);
    if (SKIP_VIEW.test(name) || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) continue;
    out.push(name === "home" ? "" : name);
  }
  return [...new Set(out)].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
}

function readJson(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return j && typeof j === "object" ? j : null;
  } catch (e) {
    return null;
  }
}

const words = (s) => String(s).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Writes the files into the build output `dest`. Returns what it did, for the build log and tests.
 * The project's own src/robots.txt, src/sitemap.xml and src/seo.php always win (they were copied already).
 */
function writeSeoFiles(projectPath, dest, config) {
  const src = (f) => path.join(projectPath, "src", f);
  const own = readJson(src("seo.json")) || {};
  const info = (config && config.project_info) || {};
  const site = siteUrl(config, own);
  const routes = pageRoutes(projectPath);
  const name = own.name || info.Title || (site ? new URL(site).hostname : "");
  const done = { site, robots: false, sitemap: false, seo: false, pages: routes.length };

  if (!fs.existsSync(src("robots.txt"))) {
    fs.writeFileSync(path.join(dest, "robots.txt"), "User-agent: *\nAllow: /\n" + (site ? `\nSitemap: ${site}/sitemap.xml\n` : ""));
    done.robots = true;
  }
  if (!fs.existsSync(src("sitemap.xml"))) {
    const target = path.join(dest, "sitemap.xml");
    const fixed = Object.keys(own.routes || {}).map((r) => r.replace(/^\/+|\/+$/g, "")).filter((r) => !r.includes(":"));
    const all = [...new Set([...routes, ...fixed])];
    if (site) {
      const day = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(
        target,
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          all.map((r) => `  <url><loc>${xml(site + "/" + r)}</loc><lastmod>${day}</lastmod></url>`).join("\n") +
          "\n</urlset>\n"
      );
      done.sitemap = true;
    } else if (fs.existsSync(target)) {
      fs.unlinkSync(target); // a sitemap without the site's address would list someone else's pages
    }
  }
  if (!fs.existsSync(src("seo.php"))) {
    const defaults = {};
    for (const r of routes) {
      defaults[r] = { title: r === "" ? (info.Title || name) : `${words(r)} | ${name}` };
    }
    const meta = info.MetaTags || {};
    const seo = {
      site,
      name,
      title: own.title || info.Title || name,
      description: own.description || info.Description || "",
      image: own.image || meta["og:image"] || meta.image || "",
      lang: own.lang || "en",
      routes: Object.assign(defaults, own.routes || {}),
    };
    fs.copyFileSync(path.join(__dirname, "files", "seo", "seo.php"), path.join(dest, "seo.php"));
    fs.writeFileSync(path.join(dest, "seo.json"), JSON.stringify(seo, null, 2) + "\n");
    done.seo = true;
  }
  return done;
}

module.exports = { writeSeoFiles, siteUrl, pageRoutes };
