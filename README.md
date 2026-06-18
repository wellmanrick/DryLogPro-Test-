# DryLog PRO

DryLog PRO is a mitigation drying documentation platform. The goal is a field
workflow that stays simple while producing a deep, defensible record for PMs,
carriers, homeowners, and internal QA.

This repository began as a DryLog PRO snapshot extracted from the larger
TotalOps codebase. It is now being rebuilt as a cleaner standalone platform.

## Product Direction

- Simple field workflow: start visit, capture readings, add photos, log work,
  review, submit.
- Rich documentation record: rooms, drying zones, surfaces, reading points,
  moisture history, atmosphere readings, dehu performance, equipment, photos,
  work performed, alerts, dry goals, and audit history.
- Carrier-ready outputs: defensible drying reports, IICRC language, trend data,
  photos, and final closeout documentation.
- Customer-friendly progress: tokenized portal with progress, updates, and
  conservative dry-date predictions.

See [ROADMAP.md](./ROADMAP.md) for the staged rebuild plan.

## Current Structure

```text
backend/
  api/              API front controller
  core/             Shared runtime: DB, auth, response helpers
  lib/              DryLog domain services and calculators
  patches/          MySQL schema patches
  public/           Web root for local/dev serving
  routes/           API route handlers
frontend/
  drylog-pro.field-functions.js
  drylog-pro.css
docs/
  F18-drylog-pro-spec.md
  F18-drylog-rebuild-plan.md
```

## Backend Runtime

The clean backend entrypoint is:

```text
backend/public/index.php
```

Routes are exposed under `/api`, for example:

```text
GET  /api/health
GET  /api/drying-zones?claim_id=123
POST /api/readings/moisture
GET  /api/alerts?claim_id=123
```

Configuration is environment-driven. Start from:

```text
backend/.env.example
```

The current auth shim expects one of:

- A live session with `$_SESSION['user_id']`
- `X-DryLog-User-Id` request header
- `DRYLOG_DEV_USER_ID` in local development

That shim is intentionally temporary; production auth should be replaced with
the final platform auth layer.

## Frontend Shell

The standalone field shell is:

```text
frontend/index.html
```

It hosts the extracted DryLog PRO field functions and supplies the app helpers
they expect: API client, topbar, job picker, upload helpers, queue stubs, CAD
defaults, catalogs, and task guidance.

By default it calls `/api`. To point it at a different backend while developing,
open it with:

```text
frontend/index.html?api=http://localhost:8000/api
```

## Local Mock Test App

PHP is not required for the first local walkthrough. The repository includes a
small Node mock server that serves the frontend and a seeded in-memory API:

```text
npm.cmd run check:js
npm.cmd run dev:mock
```

Then open:

```text
http://localhost:5173
```

The mock API includes a sample claim, visit, room, drying zone, surfaces,
equipment, readings, tasks, alerts, and attachment responses. It is meant for
fast workflow testing while the clean backend is still being rebuilt.

## Room Scan Import

The CAD sketch screen includes an Import Scan workflow for LiDAR / RoomPlan-style
room data. The current import contract is JSON with feet-based dimensions:

```text
tools/room-scan-demo.json
```

Supported fields include rooms, openings/connectors, doors, windows, equipment
markers, reading points, and wet-room flags. In the app, open:

```text
Sketch / CAD -> Import Scan
```

From there you can paste JSON, load a file, use the demo scan, download a demo,
or download the schema template. Imported scans become editable CAD rooms,
walls, connectors, equipment pins, and reading-point pins.

The CAD screen also includes an Export Package action. It can download:

- SVG sketch image
- CSV room measurement table
- JSON export package with totals, rooms, openings, equipment, and scan metadata

## Schema

Schema patches are in `backend/patches/`. They depend on the clean DB helper at
`backend/patches/db.php` and can be adapted into a real migration runner as the
platform matures.

Patch order:

1. `patch_drylog_core_platform_v1.php`
2. `patch_drylog_pro_entities_v1.php`
3. `patch_drylog_pro_engines_v1.php`
4. `patch_drylog_pro_reading_edits_v1.php`
5. `patch_drylog_pro_portal_tokens_v1.php`
6. `patch_drylog_pro_widen_material_v1.php`
7. `patch_drylog_pro_sketch_v1.php`
8. `patch_drylog_pro_cad_sketch_v1.php`
9. `patch_drylog_pro_surface_dimensions_v1.php`

## Known Rebuild Work

- Add local frontend shell around the extracted field functions.
- Expand the first-pass shared resource routes for office workflows:
  `jobs`, `visits`, `entity-attachments`, `equipment`, and
  `equipment-deploys`.
- Replace the temporary auth shim with real application auth.
- Add automated tests and PHP linting in CI.
- Clean up encoding artifacts left by the original archive extraction.
