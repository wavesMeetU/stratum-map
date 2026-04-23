import type { ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";

/**
 * Full-viewport iframe to the Vite-bundled demo (served from `static/demos/flagship/`).
 * A real page route avoids Docusaurus broken-link checks on static HTML paths.
 */
export default function FlagshipDemoPage(): ReactNode {
  const src = useBaseUrl("/demos/flagship/index.html");
  return (
    <Layout title="Live demo" description="OpenLayers + WebGPU points (flagship)">
      <iframe
        title="stratum-map flagship demo"
        src={src}
        style={{
          display: "block",
          width: "100%",
          height: "calc(100vh - var(--ifm-navbar-height))",
          border: 0,
          background: "#0f1419",
        }}
      />
    </Layout>
  );
}
