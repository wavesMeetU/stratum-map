import type { ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Layout from "@theme/Layout";

export default function TextLabelsDemoPage(): ReactNode {
  const src = useBaseUrl("/demos/text/index.html");
  return (
    <Layout title="GPU text labels demo" description="WebGPU glyph labels with bitmap or MSDF atlas and declutter">
      <iframe
        title="stratum-map GPU text labels demo"
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
