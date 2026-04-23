# WebGPU Layer — System Overview

## 🧠 Core Principle

This system is a **GPU-first geospatial rendering pipeline** built as an extension to OpenLayers.

It separates:

* user interaction
* data management
* parsing
* rendering

---

## 🧱 Architecture

```text
User API (Features, Queries)
        ↓
Feature Store (metadata + indexing)
        ↓
Parser Layer (JS Worker)
        ↓
Geometry Buffers (TypedArrays)
        ↓
WebGPU Renderer
```

---

## 🔹 Responsibilities

### 1. User API

* Add/remove/update features
* Query features (click, hover)
* Apply simple styles

---

### 2. Feature Store

* Maintains:

  * featureId → buffer index
  * index → featureId
  * featureId → properties
* Provides O(1) lookup and updates
* Acts as bridge between user data and GPU buffers

---

### 3. Parser Layer (Worker)

* Parses input formats:

  * GeoJSON
  * WKB
  * FlatGeobuf (streaming)
  * GeoArrow (adapter)
* Outputs GPU-ready TypedArrays
* Runs off main thread

---

### 4. Geometry Buffers

* Core internal format
* Uses:

  * Float32Array (positions)
  * Uint32Array (featureIds)
  * Uint16Array (styleIds)
* Optimized for GPU upload

---

### 5. WebGPU Renderer

* Handles:

  * buffer uploads
  * rendering
  * hit detection
* Does NOT know about input formats

---

## 🎨 Styling Model

* Simple, OpenLayers-like styling
* Example:

```json
{
  "type": "circle",
  "color": [1, 0, 0, 1],
  "size": 5
}
```

* Internally mapped to style buffer (styleId)

---

## 🔄 Data Flow

### Loading

```text
Map View Change
   ↓
Worker parses data
   ↓
TypedArrays (chunked)
   ↓
FeatureStore updates
   ↓
GPU buffers updated
   ↓
Render
```

---

### Query

```text
User Click
   ↓
GPU Hit Detection
   ↓
featureId
   ↓
FeatureStore lookup
   ↓
Return Feature
```

---

### Update

```text
User Update
   ↓
FeatureStore finds index
   ↓
TypedArray mutation
   ↓
Partial GPU update
```

---

## ⚠️ Constraints

* No OpenLayers Feature objects internally
* No WASM (unless proven necessary)
* No object-based rendering
* No parsing on main thread

---

## 🧠 Design Principles

* Data-oriented design
* Zero/minimal memory copies
* Worker-first processing
* GPU-first rendering
* Clear separation of concerns
