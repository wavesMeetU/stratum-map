---
sidebar_position: 100
title: Third-party notices
description: OpenLayers (BSD-2-Clause) and other bundled software used by hosted demos.
---

# Third-party notices

The **stratum-map** documentation site and **hosted interactive demos** (live demo, GPU picking, GPU text labels) ship JavaScript bundles that include **OpenLayers** (`ol`).

The published **`stratum-map` npm package** (`dist/`) does **not** bundle OpenLayers; it is listed only as a development dependency for demos and tooling.

---

## OpenLayers (`ol`)

- **Package:** `ol` (npm)
- **Version at build time:** 10.8.0 (see repository `package.json` / lockfile for the exact resolved version)
- **Homepage:** https://openlayers.org/
- **License:** BSD 2-Clause License

Upstream license text (reproduced for redistribution of binary bundles per the license conditions):

```text
BSD 2-Clause License

Copyright 2005-present, OpenLayers Contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

Canonical upstream copy: https://github.com/openlayers/openlayers/blob/main/LICENSE.md
