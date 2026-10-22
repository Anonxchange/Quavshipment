---
name: Shell staging
description: Workspace-specific guidance for temporary files that must survive across shell tool calls.
---

In this workspace, `/tmp` files did not reliably persist between separate ShellExec calls. For multi-step work, place temporary staging data in an ignored workspace directory such as `.local/`, then remove it when finished.

**Why:** Imported source files staged under `/tmp` disappeared before a later shell call needed them, so the files had to be recovered from Git.

**How to apply:** Keep inter-call staging inside the workspace; reserve `/tmp` for one-call processing only.
