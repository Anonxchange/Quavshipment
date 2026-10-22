---
name: Imported artifact preview routing
description: Placement of imported web artifacts in an initialized Replit workspace.
---

Imported web artifacts may run successfully on their own local port while remaining unreachable through the shared preview proxy when left inside a nested Git clone. Place the artifact in the workspace's root `artifacts/<slug>` directory and use the workspace's package setup.

**Why:** The nested workflow served the app directly but the preview proxy returned a no-previewable-artifacts 404.

**How to apply:** When importing a repo into an initialized Replit workspace, integrate its artifact into the root artifact layout instead of running it from a nested repository folder.
