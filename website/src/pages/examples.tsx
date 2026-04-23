import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import styles from "./examples.module.css";

const examples = [
  {
    title: "Large point pan / zoom (hosted)",
    text: "OpenLayers OSM + WebGPU instanced points, FPS meter, 50k–400k points, color and size controls.",
    action: { label: "Open live demo", to: "/demo" },
  },
  {
    title: "GPU picking",
    text: "Single-pixel pick pass → feature id → `FeatureStore` metadata; selected vertex highlighted on GPU.",
    action: { label: "Live picking demo", to: "/examples/picking" },
  },
  {
    title: "GPU text labels (hosted)",
    text: "Coordinate strings over in-view points: bitmap vs MSDF atlas, optional declutter and collision debug overlay.",
    action: { label: "Live labels demo", to: "/examples/text" },
  },
  {
    title: "Decluttering",
    text: "Priority-aware screen-space collision; optional debug overlay of accepted vs rejected boxes.",
    action: { label: "Declutter guide", to: "/docs/label-decluttering" },
  },
  {
    title: "OpenLayers integration",
    text: "Overlay canvas, DPR, and `FrameState` → clip matrix wiring from `postrender` (reference implementation in demo).",
    action: { label: "Integration guide", to: "/docs/openlayers-integration" },
  },
];

export default function Examples(): ReactNode {
  return (
    <Layout title="Examples" description="Reference scenarios and where to run them in the stratum-map repository.">
      <div className="container margin-vert--lg">
        <Heading as="h1">Examples</Heading>
        <p>
          Runnable code lives in the{" "}
          <Link href="https://github.com/wavesMeetU/stratum-map">GitHub repository</Link> under{" "}
          <code>examples/</code>. Screenshots below are placeholders until captures are added under{" "}
          <code>docs/images/</code>.
        </p>
        <div className={styles.grid}>
          {examples.map((ex) => (
            <article key={ex.title} className={styles.card}>
              <div className={styles.placeholder}>Screenshot placeholder</div>
              <div className={styles.body}>
                <Heading as="h3">{ex.title}</Heading>
                <p>{ex.text}</p>
                <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                  {ex.action.href ? (
                    <Link className="button button--sm button--secondary" href={ex.action.href}>
                      {ex.action.label}
                    </Link>
                  ) : (
                    <Link className="button button--sm button--secondary" to={ex.action.to!}>
                      {ex.action.label}
                    </Link>
                  )}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Layout>
  );
}
