# DryLog PRO Roadmap

DryLog PRO should be simple in the field and deep in the file. The field tech
should be able to document a mitigation job with a small number of obvious
actions, while the platform quietly builds a carrier-ready record underneath:
rooms, drying zones, surfaces, reading points, psychrometrics, photos, work
performed, equipment, alerts, dry standards, and audit history.

## Product Principles

- Field first: the mobile flow must work with wet hands, poor signal, and a tech
  who is trying to leave the property with a complete file.
- Simple surface, rich record: hide the data model during capture, expose it in
  reports, QA, office review, and carrier documentation.
- Defensible by default: every reading should have time, visit, user, parent
  entity, derived psychrometrics when applicable, and edit history for office
  corrections.
- Guidance over gates: tasks, warnings, and recommendations should help the tech
  complete the job without trapping them in a rigid workflow.
- Homeowner clarity: the customer portal should show progress and confidence
  without exposing internal compliance flags or raw technical noise.

## Phase 1: Make The Snapshot Runnable

Goal: turn the archive into a coherent backend/frontend product skeleton.

- Add missing backend runtime files:
  - `backend/lib/tasks.php`
  - `backend/lib/alerts.php`
  - `backend/routes/readings_reference.php`
  - `backend/routes/readings_zone_atmosphere.php`
  - `backend/routes/readings_hvac.php`
  - `backend/routes/readings_dehu.php`
  - `backend/routes/readings_moisture.php`
- Add a minimal API bootstrap/router for local development.
- Add a minimal field app shell that provides the shared helpers currently
  expected by `frontend/drylog-pro.field-functions.js`.
- Add smoke tests for route loading, task transitions, psychrometric math, and
  reading inserts.
- Replace archive language in docs once the app is runnable.

## Phase 2: Field-Tech Daily Workflow

Goal: make daily use fast and hard to mess up.

- Primary mobile actions:
  - Start / resume dry-out
  - Set dry goals
  - Start daily visit
  - Capture atmosphere
  - Capture moisture
  - Capture dehu performance
  - Add photos
  - Log work
  - Review and submit
- Keep advanced setup available, but make the happy path one guided visit flow.
- Preserve offline queue behavior for readings, photos, and work log entries.
- Add clear incomplete-file indicators before a tech leaves the job.

## Phase 3: Office Review And QA

Goal: give PMs and admins a concise control center.

- Claim-level DryLog PRO dashboard.
- Alert queue across all active drying jobs.
- Reading edit tools with audit history.
- Missing-data review by claim and by visit.
- Dry goal management by material class.
- Equipment duration and performance review.

## Phase 4: Reports And Documentation

Goal: generate carrier-ready documentation without extra clerical work.

- Carrier drying report using the new entity model.
- Customer-friendly drying summary.
- IICRC compliance language generated from captured facts.
- Photo sections grouped by room, visit, and category.
- Moisture trend tables and simple sparklines.
- Exportable PDF package per claim.

## Phase 5: Differentiators

Goal: make DryLog PRO better than generic restoration documentation tools.

- Customer live-progress portal with tokenized links.
- Predictive dry-end-date with conservative confidence labels.
- Smart alerts for stalled drying, dehu underperformance, condensation risk,
  scope creep, overdue visits, and equipment overstay.
- CAD/sketch support that links reading points and water areas to the record.
- Practical recommendations for air movers and dehu capacity.

## Current Priority

The next engineering milestone is backend completeness: make every route already
referenced by the frontend resolve to real code, then add a small local runtime
so the platform can be exercised outside the original TotalOps codebase.
