# DryLog PRO — Code Snapshot (Backup Archive)

**Generated:** 2026-06-16 15:28 UTC
**Source repo:** wellmanrick/totalops-backend @ `8e5e5fc` (`8e5e5fc35659011fed17c52dfbdee778c57cb7be`)

This is a **point-in-time backup** of all DryLog PRO code, pulled out of the
TotalOps codebase into one place. It is a faithful *archive*, **not an
independently runnable app** — DryLog PRO lives inside the field PWA
(`frontend/field.html`) and the shared PHP API, so this snapshot documents
and preserves the DryLog-specific pieces plus the shared dependencies they
need.

## What's in here

### `frontend/`
- **`drylog-pro.field-functions.js`** — all **80** DryLog PRO functions lifted
  verbatim from `frontend/field.html`. Entry point: **`renderDrylogPro()`**
  (the 6-tile dashboard). Includes the dashboard, task list, alerts, daily-visit
  wizard, atmosphere/moisture/dehu capture, surfaces & reading points, the
  in-app CAD floor-sketch editor (`_dlpCad*`), photos (room-bucketed), work log,
  dry goals, equipment, the legacy drying timeline, and the psychrometric calc.
- **`drylog-pro.css`** — best-effort extract of `.dlp-*` / `.drylog*` styles.

> These functions depend on the field app's shared plumbing, which is **not**
> DryLog-specific and is therefore **not** duplicated here:
> `el()`, `clear()`, `root`, `buildTopbar()`, `enableInactivity()`,
> `apiGet()`/`apiPost()`, `tcLiveSet()`, `tcUploadEntityPhoto()`, the offline
> queue, the `selectedJob`/`myDay` globals, and the service worker
> (`frontend/field-sw.js`).

### `backend/routes/` — DryLog-specific API endpoints
`readings.php` (sub-route dispatcher), `claim_rooms.php`, `drying_zones.php`,
`claim_surfaces.php`, `reading_points.php`, `room_readings.php` (legacy
timeline), `claim_tasks.php`, `alerts.php`, `sizing.php`,
`room_work_items.php`, `claim_material_standards.php`, `drylog_admin.php`
(office cross-claim aggregates), `drylog_portal.php` (customer live-progress
portal).

### `backend/lib/` — DryLog-specific helpers
`drylog_iicrc.php`, `drylog_predict.php`, `drylog_pro_model.php`,
`psychro.php` (temp+RH → GPP/dew point), `sizing.php`.

### `backend/patches/` — schema (run in this order via `tools/run-patches.sh`)
1. `patch_drylog_pro_entities_v1.php` — 5-level entity hierarchy + reading-type tables
2. `patch_drylog_pro_engines_v1.php` — task + alerts engine + seed libraries
3. `patch_drylog_pro_reading_edits_v1.php` — office-edit audit table
4. `patch_drylog_pro_portal_tokens_v1.php` — tokenized customer portal
5. `patch_drylog_pro_widen_material_v1.php` — widen claim_surfaces.material
6. `patch_drylog_pro_sketch_v1.php` — floor sketch + reading-point coords
7. `patch_drylog_pro_cad_sketch_v1.php` — in-app CAD sketch JSON state
8. `patch_drylog_pro_surface_dimensions_v1.php` — surface dimension columns

### `docs/`
`F18-drylog-pro-spec.md` (full spec), `F18-drylog-rebuild-plan.md`.

## Shared dependencies (referenced, NOT included — they're app-wide, not DryLog-only)
- Backend: `api/index.php` (route map — see `ROUTE-MAP.txt`), `api/lib/response.php`,
  `api/lib/auth.php`, `api/lib/settings.php`, `api/config/db.php`,
  and the shared routes `visits.php`, `entity_attachments.php`,
  `equipment_deploys.php`.
- Frontend: `frontend/field.html` (host shell) + `frontend/field-sw.js`.

## How to restore
This is a reference/backup copy. To rebuild DryLog PRO from it you'd paste the
frontend functions back into `field.html`, drop the route/lib files under
`api/routes` & `api/lib`, register the routes in `api/index.php`, run the
patches via `tools/run-patches.sh`, then deploy. See `ROUTE-MAP.txt` for the
exact `api/index.php` registrations.
