import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import clsx from "clsx";
import styles from "./index.module.css";

const features = [
  {
    title: "WebGPU point rendering",
    text: "Instanced triangle quads, compact style table, column-major map→clip matrix compatible with OpenLayers frame math.",
  },
  {
    title: "GPU picking",
    text: "Optional offscreen id pass; decode feature id at a canvas pixel without scanning all vertices on CPU.",
  },
  {
    title: "Chunked streaming geometry",
    text: "Per-chunk GPU slots, LRU-style eviction, and bridges from worker chunks to partial buffer uploads.",
  },
  {
    title: "MSDF labels",
    text: "Distance-field atlases with predictable edge softness; optional bitmap atlas path for prototyping.",
  },
  {
    title: "Label decluttering",
    text: "Screen-space collision resolution with priorities, zoom gates, and optional debug rects.",
  },
  {
    title: "OpenLayers compatible",
    text: "Same projection and canvas sizing conventions; integrate as an overlay canvas driven from `postrender`.",
  },
  {
    title: "Worker ingest pipelines",
    text: "GeoJSON and bbox ingest workers emit TypedArray-ready chunks for the main thread and GPU.",
  },
  {
    title: "TypedArray-first design",
    text: "Dense geometry buffers end-to-end; avoid per-frame object graphs on the render path.",
  },
];

export default function Home(): ReactNode {
  return (
    <Layout
      title="Home"
      description="GPU-first WebGPU renderer for high-performance browser maps — points, picking, MSDF text, declutter, OpenLayers-friendly."
    >
      <header className={clsx("hero hero--primary", styles.hero)}>
        <div className="container">
          <Heading as="h1" className={styles.heroTitle}>
            stratum-map
          </Heading>
          <p className={styles.heroSubtitle}>
            GPU-first WebGPU engine for geospatial visualization: OpenLayers-compatible transforms, point splats, GPU
            picking, bitmap/MSDF labels, and label decluttering.
          </p>
          <div className={styles.ctaRow}>
            <Link className="button button--primary button--lg" to="/docs/getting-started">
              Get started
            </Link>
            <Link className="button button--secondary button--lg" to="/demo">
              Live demo
            </Link>
            <Link className="button button--secondary button--lg" to="/examples">
              Examples hub
            </Link>
            <Link className="button button--outline button--secondary button--lg" href="https://github.com/wavesMeetU/stratum-map">
              GitHub
            </Link>
          </div>
          <p className="text--muted" style={{ fontSize: "0.85rem" }}>
            npm package: <code>stratum-map</code> · Repository directory is often cloned as <code>wgpu-ol-renderer</code>.
          </p>
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className="container">
            <Heading as="h2" className={styles.sectionTitle}>
              Capabilities
            </Heading>
            <div className={styles.grid}>
              {features.map((f) => (
                <article key={f.title} className={styles.card}>
                  <Heading as="h3">{f.title}</Heading>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className="container">
            <Heading as="h2" className={styles.sectionTitle}>
              Benchmarks
            </Heading>
            <p className={styles.teaser}>
              Playwright-driven pan/zoom scenarios ship in-repo. Run <code>npm run verify:pan-zoom</code> after{" "}
              <code>npm run build:bench</code>. Numbers are hardware-specific — treat them as regression guards, not marketing absolutes.
            </p>
            <p className={styles.teaser} style={{ marginTop: "1rem" }}>
              <Link className="button button--outline button--primary" to="/docs/benchmarks">
                Benchmark notes
              </Link>
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <div className="container">
            <Heading as="h2" className={styles.sectionTitle}>
              Architecture
            </Heading>
            <p className={styles.teaser}>
              Workers normalize inputs to TypedArrays; the feature store indexes metadata; WebGPU pipelines own draw
              and pick passes; text is an optional layered pass with its own atlas contract.
            </p>
            <p className={styles.teaser} style={{ marginTop: "1rem" }}>
              <Link className="button button--outline button--primary" to="/docs/architecture">
                Read architecture
              </Link>
            </p>
          </div>
        </section>
      </main>
    </Layout>
  );
}
