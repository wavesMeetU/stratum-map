import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import { themes as prismThemes } from "prism-react-renderer";

const org = "wavesMeetU";
const project = "stratum-map";

const config: Config = {
  title: "stratum-map",
  tagline: "GPU-first WebGPU renderer for high-performance browser maps.",
  favicon: "img/favicon.svg",

  url: `https://${org}.github.io`,
  baseUrl: `/${project}/`,

  organizationName: org,
  projectName: project,

  onBrokenLinks: "throw",
  trailingSlash: false,

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: `https://github.com/${org}/${project}/tree/main/website/`,
          routeBasePath: "docs",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
        sitemap: {
          changefreq: "weekly",
          priority: 0.5,
          filename: "sitemap.xml",
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ["@docusaurus/theme-mermaid"],

  markdown: {
    mermaid: true,
  },

  themeConfig: {
    image: "img/social-card.svg",
    metadata: [
      {
        name: "keywords",
        content:
          "webgpu, openlayers, maps, geospatial, rendering, typescript, MSDF, picking, WebGPU maps",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true,
      disableSwitch: false,
    },
    navbar: {
      title: "stratum-map",
      logo: {
        alt: "stratum-map",
        src: "img/logo.svg",
      },
      items: [
        { type: "docSidebar", sidebarId: "docs", position: "left", label: "Documentation" },
        {
          type: "dropdown",
          label: "Demos",
          position: "left",
          items: [
            { label: "Live demo", to: "/demo" },
            { label: "Examples hub", to: "/examples" },
            { label: "GPU picking", to: "/examples/picking" },
            { label: "GPU text labels", to: "/examples/text" },
          ],
        },
        {
          type: "dropdown",
          label: "Project",
          position: "left",
          items: [
            { label: "Benchmarks", to: "/docs/benchmarks" },
            { label: "Architecture", to: "/docs/architecture" },
            { label: "Roadmap", to: "/docs/roadmap" },
          ],
        },
        {
          href: `https://github.com/${org}/${project}`,
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting started", to: "/docs/getting-started" },
            { label: "API — Points renderer", to: "/docs/api/points-renderer" },
            { label: "API — Text layer", to: "/docs/api/text-layer" },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "Issues", href: `https://github.com/${org}/${project}/issues` },
            { label: "Contributing", to: "/docs/contributing" },
          ],
        },
        {
          title: "Legal",
          items: [
            {
              label: "License (Apache-2.0)",
              href: `https://github.com/${org}/${project}/blob/main/LICENSE`,
            },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} stratum-map contributors. Apache-2.0.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ["bash", "json", "wgsl"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
