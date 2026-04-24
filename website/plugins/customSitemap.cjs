/**
 * Writes sitemap.xml as minimal, pretty-printed XML (single pass).
 * Replaces @docusaurus/plugin-sitemap stream output when disabled in preset.
 */
const path = require("node:path");
const fs = require("fs-extra");
const { flattenRoutes, createMatcher, normalizeUrl } = require("@docusaurus/utils");
const { applyTrailingSlash } = require("@docusaurus/utils-common");

/** @param {{ routesBuildMetadata: Record<string, { noIndex?: boolean }>; route: string }} p */
function isNoIndexMetaRoute({ routesBuildMetadata, route }) {
  const meta = routesBuildMetadata[route];
  if (meta) return Boolean(meta.noIndex);
  return false;
}

/** @param {string} s */
function escapeXmlText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = function customSitemapPlugin(_context, options) {
  const {
    ignorePatterns = [],
    changefreq = "weekly",
    priority = 0.5,
    filename = "sitemap.xml",
  } = options;

  return {
    name: "custom-sitemap-plugin",
    async postBuild({ siteConfig, routes, outDir, routesBuildMetadata }) {
      if (siteConfig.noIndex) return;

      const ignoreMatcher = createMatcher(ignorePatterns);
      const sitemapRoutes = flattenRoutes(routes).filter((route) => {
        if (ignoreMatcher(route.path)) return false;
        if (isNoIndexMetaRoute({ routesBuildMetadata, route: route.path })) return false;
        return true;
      });

      if (sitemapRoutes.length === 0) return;

      const lines = [];
      lines.push('<?xml version="1.0" encoding="UTF-8"?>');
      lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

      for (const route of sitemapRoutes) {
        const loc = normalizeUrl([
          siteConfig.url,
          applyTrailingSlash(route.path, {
            trailingSlash: siteConfig.trailingSlash,
            baseUrl: siteConfig.baseUrl,
          }),
        ]);
        lines.push("  <url>");
        lines.push(`    <loc>${escapeXmlText(loc)}</loc>`);
        lines.push(`    <changefreq>${escapeXmlText(changefreq)}</changefreq>`);
        lines.push(`    <priority>${Number(priority)}</priority>`);
        lines.push("  </url>");
      }

      lines.push("</urlset>");
      lines.push("");

      await fs.outputFile(path.join(outDir, filename), lines.join("\n"), "utf8");
    },
  };
};
