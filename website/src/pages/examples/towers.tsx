import type { ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";

export default function TowersDemoPage(): ReactNode {
  const src = useBaseUrl("/demos/towers/index.html");
  return (
    <Layout title="Global Cell Towers" description="5.1M cell towers worldwide rendered with WebGPU">
      <iframe
        title="Global Cell Towers - WebGPU Demo"
        src={src}
        style={{
          display: "block",
          width: "100%",
          height: "calc(100vh - var(--ifm-navbar-height))",
          border: 0,
          background: "#020408",
        }}
      />
    </Layout>
  );
}
