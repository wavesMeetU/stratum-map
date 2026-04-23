# WebGPU Layer — Execution Guidelines

---

## 🧠 Development Rules

### 1. Separation of Concerns

* FeatureStore ≠ Parser ≠ Renderer
* Never mix responsibilities

---

### 2. TypedArrays Are Core

* All rendering data must be in TypedArrays
* No object-based rendering

---

### 3. Worker-First Processing

* All parsing happens in worker
* Main thread must stay lightweight

---

### 4. GPU Is the Target

* Optimize for GPU upload and rendering
* Avoid CPU-heavy loops during render

---

## ⚡ Performance Rules

### DO

* Use Transferable ArrayBuffers
* Process data in chunks
* Use partial GPU updates
* Reuse buffers where possible

### DO NOT

* Recreate buffers every frame
* Send JSON between threads
* Parse data on main thread
* Copy data unnecessarily

---

## 🎨 Styling Rules

* Keep styling simple (color + size)
* Avoid complex expressions
* Use styleId mapping internally

---

## 🔄 Data Flow Rules

* Normalize all input formats before rendering
* Renderer must not know data source format
* FeatureStore is the only bridge between data and GPU

---

## 🧪 Debugging Strategy

When something breaks:

1. Check FeatureStore mappings
2. Verify TypedArray structure
3. Validate worker output
4. Check GPU buffer upload
5. Verify shader inputs

---

## ⚠️ Common Pitfalls

* Mixing parsing with rendering
* Over-engineering early
* Premature optimization
* Ignoring chunking strategy
* Memory leaks from buffers

---

## 🚀 Development Strategy

Build in order:

1. FeatureStore
2. Worker parsing
3. Renderer
4. Integration
5. Interaction
6. Additional formats

---

## 🧠 Final Principle

> Keep the pipeline simple, predictable, and data-driven.

If complexity increases, it must be justified by measurable performance gains.
