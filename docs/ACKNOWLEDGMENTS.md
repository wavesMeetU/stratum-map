# Acknowledgments

## OpenLayers

**stratum-map** is designed to integrate cleanly with **[OpenLayers](https://openlayers.org/)** map applications: the demo and documentation follow OpenLayers conventions for **`FrameState`**, view transforms, and map canvas overlays. OpenLayers provides the interactive map, layers, and projection stack; this project adds a **WebGPU** rendering path for large point sets, labels, and related GPU work.

OpenLayers is developed by the OpenLayers contributors and distributed under its own license (see the [OpenLayers repository](https://github.com/openlayers/openlayers)). **stratum-map** is a separate project and is not affiliated with or endorsed by the OpenLayers project.

When you ship a product that embeds OpenLayers, follow [OpenLayers attribution guidance](https://openlayers.org/) for your deployment.

## WebGPU

Rendering uses the browser **WebGPU** API (WGSL shaders, `GPUDevice`, canvas context). Implementations and validation messages vary by engine (e.g. Chromium/Dawn).

## Community libraries

Runtime and tooling dependencies are listed in **`package.json`** (e.g. GeoJSON workers, optional GeoArrow paths). Thank you to the authors of those libraries.
