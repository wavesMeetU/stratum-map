import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "getting-started",
    "installation",
    "quick-start",
    "openlayers-integration",
    "text-rendering",
    "label-decluttering",
    "gpu-picking",
    "gpu-text-labels",
    "architecture",
    "benchmarks",
    "roadmap",
    "contributing",
    {
      type: "category",
      label: "API reference",
      collapsed: false,
      items: [
        "api/points-renderer",
        "api/text-layer",
        "api/text-renderer",
        "api/glyph-atlas",
        "api/msdf-glyph-atlas",
        "api/feature-store",
        "api/point-hit-tester",
      ],
    },
  ],
};

export default sidebars;
