import type { ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";

export default function PickingDemoPage(): ReactNode {
  const src = useBaseUrl("/demos/picking/index.html");
  return (
    <Layout title="GPU picking demo" description="Click map to pick points via GPU id buffer">
      <iframe
        title="stratum-map GPU picking demo"
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
