# F18 — DryLog PRO Rebuild

> **Status:** Plan draft, awaiting approval. No code written yet beyond F17a (which still applies and feeds into this).
>
> **Date:** 2026-05-24
>
> **Decisions baked in (from chat with Rick):**
> - **Scope:** Best in class — most defensible drying platform in the industry, multi-month build OK
> - **Cutover:** Parallel — jobs in flight stay on the old flow until they close; new jobs go to the new model
> - **Historical data:** Forward-only — no backfill of existing jobs
> - **Entity model:** Full 5-level hierarchy (Claim → Room → Drying Zone → Surface → Reading Point)
> - **Product name:** **DryLog PRO** (our brand for the system)
> - **Vocabulary:** Our own brand voice (not Encircle's "Hydro" / "Drying Chamber" / "Moisture Point")
> - **Smart features:** Task engine + Alerts engine, both in v1
> - **Per-room GPP + air mover count recommendation:** in core build (not deferred)
> - **Cut from F18.11:** Bluetooth meter ingestion, standalone equipment sizing calculator
> - **Plain-English customer summary:** rolled into the broader cross-cutting "AI summary on all jobs" initiative (not F18-exclusive)

---

## Context

We're rebuilding the dry-log data layer to replace Encircle (per-seat SaaS we currently pay for) and exceed it on the customer-facing side. The PDF samples + mobile-app screenshots showed three architectural realities about Encircle that our current schema can't match:

1. **Five distinct entity levels** for restoration data (we have two)
2. **A task engine** that guides the tech through claim-specific data capture with dependency rules (we have form fields)
3. **A live alerts engine** that flags anomalous readings as they're entered (we have none)

The F17 Final Report builder (in progress) depends on this. The carrier-edition PDF can't match Encircle's output without the data Encircle captures, and we're not capturing it yet.

---

## Vocabulary (proposed — open for Rick to refine)

| Industry / Encircle term | Our brand | Notes |
|---|---|---|
| Hydro | **DryLog PRO** | Product name for the whole system |
| Drying Chamber | **Drying Zone** | "Zone" is clearer for non-IICRC eyes |
| Material | **Surface** | Matches our existing `surface_type` schema |
| Moisture Point | **Reading Point** | What it actually is |
| Dry Standard | **Dry Goal** | Matches existing `drying_goal` column |
| Affected Area Reading | **Zone Atmosphere** | What it measures |
| Unaffected Area Reading | **Baseline Atmosphere** | "Reference" is jargon-y |
| HVAC Reading | **HVAC Atmosphere** | Symmetry with the above |
| Dehumidifier Reading | **Dehu Performance Reading** | Implies the "is it working" angle |

In the **carrier-facing PDF only**, the report uses industry-standard IICRC terms (Affected Area, Unaffected Area, Drying Chamber) so adjusters pattern-match instantly. Brand voice lives in the office UI, field app, and customer-facing PDF.

---

## Entity Model (5 levels)

```
Claim                  (existing — `jobs` table)
 └── Room              (new — `claim_rooms`, persistent across visits)
      └── Drying Zone  (new — `drying_zones`, may span multiple rooms)
           └── Surface (new — `claim_surfaces`, what's being tracked)
                └── Reading Point (new — `reading_points`, specific spot)
                     └── Moisture Reading (per-visit time series)
```

**Why first-class entities, not just rows-grouped-at-render-time:**
- Reading Point persistence across visits → continuity time series (no typo-splits)
- Drying Zone as a thing means equipment can be attributed to it
- Surface (material) tracking → "we dried 12 surfaces over 9 days" stats
- Each level can carry attributes (Room → photos/sketch; Zone → containment notes; Surface → material type, dry goal; Point → meter type, location notes)

**Reading types as their own tables** (Encircle's pattern, and cleaner than one polymorphic `readings` table):
- `reference_readings` (exterior or baseline)
- `zone_atmosphere_readings`
- `hvac_atmosphere_readings`
- `dehu_performance_readings` (intake + exhaust + hours running → grain depression computed)
- `moisture_readings` (per Reading Point, per visit)

Each carries computed psychrometric derivatives (gpp, dew point, grain depression) at write time so reads are cheap.

---

## Task Engine

Per-claim configurable task list with dependency rules.

**Tables:**
- `task_definitions` — library of standard tasks (Source of Loss, Category of Water, Exterior Reading, Affected Area Reading, Equipment Placement, etc.) with prerequisite IDs
- `claim_task_configs` — which tasks apply to THIS claim, in what order
- `claim_task_states` — completion state per (claim, task): locked / available / in-progress / complete

**Behavior:**
- Office sets the task list when the claim is opened (or accepts a default template per Category of Water + Type of Loss)
- Field tech sees only the tasks that are unlocked
- Server-side: when a task completes, evaluate dependents → flip them to available

**Seed templates** (built into the system, office can customize per claim):
- Cat 1 / Class 1 — Minimal (drying chamber, moisture readings, equipment)
- Cat 2 / Class 2 — Standard (+ Exterior, Unaffected baseline, Dry Standard)
- Cat 3 — Full (+ HVAC readings, Containment documentation, Antimicrobial application log)

---

## Alerts Engine

Real-time anomaly detection on reading INSERT.

**Tables:**
- `alert_rule_definitions` — rule library (temp range, RH range, grain depression min, dehu underperforming, dew point differential, equipment-not-deployed-after-N-hours, reading-overdue)
- `claim_alert_configs` — which rules apply to THIS claim + per-rule thresholds (e.g., grain depression min could be 5 gpp for one claim, 8 for another)
- `alerts` — triggered events with context (which reading, which rule, severity, ack state)

**Behavior:**
- Hook fires on every reading INSERT in the relevant tables
- Evaluates active rules for that claim
- Surfaces alert in field app (tech sees it before leaving the property) AND office UI (PM sees the queue)
- Optional SMS/email push for critical alerts

**Seed rules** (initial library, office can add custom):
1. Zone RH above 60% with dehu deployed → "Dehu underperforming"
2. Grain depression below 5 gpp → "Dehu likely failing"
3. Dew point differential between zone and surface < 5°F → "Condensation risk"
4. Moisture reading regressed (today > yesterday) → "Reading trended wet"
5. No reading captured in 48hr on an active job → "Visit overdue"
6. Dry goal hit on all points in a zone → "Zone ready to close" (positive alert, prompts a final-readings visit)
7. Cat 3 job without HEPA scrubber deployed → "Compliance flag"
8. Exterior RH spiked > 20% above baseline → "Outside weather event, expect drying slowdown"
9. New surface added on visit 4+ → "Possible scope creep"
10. Equipment deployed > 14 days without removal → "Equipment-on-rent overstay"

---

## Phased Build

Each phase is independently deployable. F17 Final Report builder continues in parallel where it doesn't depend on F18 (F17b–c can ship against the old data model; F17d–e wait for F18.9).

### F18.0 — Foundation (spec + naming lock)
- Write developer-facing spec doc (this file becomes the source of truth)
- Lock vocabulary so subsequent phases stay consistent
- Build ER diagram for the 5-level hierarchy + supporting tables
- **No code, ~1 day**

### F18.1 — Schema: entity hierarchy
- New tables: `claim_rooms`, `drying_zones`, `claim_surfaces`, `reading_points`
- New reading-type tables: `reference_readings`, `zone_atmosphere_readings`, `hvac_atmosphere_readings`, `dehu_performance_readings`, `moisture_readings`
- Bridge columns on existing tables: `visit_rooms.claim_room_id`, `equipment_deploys.drying_zone_id`, `room_readings.reading_point_id` — all nullable so legacy flow keeps working
- Patch: `api/config/patch_drylog_v2_entities_v1.php`

### F18.2 — Schema: task + alerts engines
- `task_definitions`, `claim_task_configs`, `claim_task_states`, `task_dependencies`
- `alert_rule_definitions`, `claim_alert_configs`, `alerts`
- Seed data for both libraries
- Patch: `api/config/patch_drylog_v2_engines_v1.php`

### F18.3 — Backend API: CRUD for new entities
- `/api/claims/{id}/rooms` (CRUD)
- `/api/claims/{id}/zones` (CRUD)
- `/api/zones/{id}/surfaces` (CRUD)
- `/api/surfaces/{id}/points` (CRUD)

### F18.4 — Backend API: reading capture
- `POST /api/readings/reference`
- `POST /api/readings/zone-atmosphere`
- `POST /api/readings/hvac`
- `POST /api/readings/dehu`
- `POST /api/readings/moisture` (per Reading Point)
- All compute psychrometric derivatives at write time using existing `tc_psychro()` in `api/lib/psychro.php`
- All trigger the alerts engine inline

### F18.5 — Task engine logic
- `api/lib/tasks.php` — dependency evaluation, state transitions
- Office UI: per-claim task config (`frontend/totalops.html` — new Drylog tab on the job page)
- Seed templates (Cat 1 / Cat 2 / Cat 3)

### F18.6 — Alerts engine logic
- `api/lib/alerts.php` — rule evaluation on reading INSERT
- Office UI: alert queue + per-claim rule config
- Field app: in-context alert banners when readings violate rules
- Notification fanout via existing mailer + Twilio

### F18.7 — Field app: new DryLog PRO flow
- New "DryLog PRO" tab on the visit screen in `frontend/field.html`
- Dashboard mirroring Encircle's tile layout — Tasks · Alerts · Atmosphere · Surfaces · Equipment · Summary (with our naming)
- Task-driven setup workflow — tech is guided, not handed a blank form
- Per-reading-type capture forms with live psychrometric calculation (reuses the calculator widget already at `field.html` ~line 2327, extract into helper)
- Drag-or-tap equipment-to-zone placement
- **Per-room GPP + air mover count recommendation** — at zone-setup time, tech enters room L × W × H + class of water; system computes current GPP from the freshest zone atmosphere reading and recommends air mover count (IICRC S500 formula: 1 air mover per ~50–60 sqft of wet floor, scaled by class). Result is a suggestion the tech can override, not a hard gate. Lives next to the equipment-placement UI in this same tab.

### F18.8 — Office app: DryLog PRO management
- Claim-level DryLog PRO dashboard in `frontend/totalops.html`
- Drill-down: Zones → Surfaces → Reading Points with sparkline time series (reuses `tc_sparkline` from F17a)
- Per-claim task config editor
- Per-claim alerts rule config editor
- Live alerts queue

### F18.9 — PDF rebuild (Carrier + Customer)
- Rewrite `api/lib/chamber_grouping.php` (F17a draft) to read from the new model
- Rewrite `tc_render_drying_report_html` in `api/lib/visit_pdf.php` to use the new structure + sparkline + Dry badges
- F17b's Carrier Edition consumes this
- F17d's Customer Edition consumes this

### F18.10 — Parallel cutover support
**Resolved 2026-05-25:** Rick chose "just flip it on, no dual-write." The
chamber_grouping auto-dispatcher shipped in F18.9a already handles the
"jobs in flight stay on legacy / new jobs use DryLog PRO" requirement:
each claim's report path is chosen by whether it has any `drying_zones`
rows at render time. No feature flag, no dual-write to `room_readings`,
no separate field-app tab toggle. New claims just use the new flow;
legacy claims keep rendering from `room_readings` indefinitely until
their drying period ends naturally.

### F18.11 — Differentiators (beyond Encircle)
These are the "best in class" features that put us past Encircle. Each is independently shippable after F18.10:

- **Customer live-progress portal** — branded URL per claim showing drying status, photos, alerts (filtered to customer-appropriate ones), expected completion date
- **Predictive dry-end-date** — fit a curve to existing moisture trajectory + IICRC norms → "Expected dry by Wed" — refreshes daily
- **IICRC S500 auto-compliance block** — generated boilerplate certification language for the carrier report, citing standard sections

**Cut from this list per Rick (2026-05-24):**
- ~~Standalone equipment sizing calculator~~ — the per-room GPP + air mover recommendation that matters is now in core build at F18.7
- ~~Bluetooth meter ingestion~~ — not wanted, removed entirely
- ~~Plain-English customer summary generator~~ — not F18-scoped; rolled into a separate cross-cutting "AI summary on all jobs" initiative that applies to every job type, not just dry-outs. Will use existing `ai_gateway.php`. Tracked separately.

### F18.12 — Polish + retire legacy
- **Floor sketch with arrow callouts** (Rick's must-have v2 item, finally landing here)
- Photo-per-reading inline (attach a photo to a specific Reading Point)
- Drag-create reading points on the chamber sketch
- Sunset legacy field UI

---

## Critical Files (high-level)

**Schema patches** (per phase):
- `api/config/patch_drylog_pro_entities_v1.php` (F18.1)
- `api/config/patch_drylog_pro_engines_v1.php` (F18.2)
- `api/config/patch_drylog_pro_*.php` (each subsequent phase)

**Backend libs** (new):
- `api/lib/tasks.php` (task engine)
- `api/lib/alerts.php` (alerts engine)
- `api/lib/drylog_pro_model.php` (data-access helpers for the 5-level hierarchy)
- `api/lib/sizing.php` (per-room GPP + air mover count helper for F18.7)

**Backend libs** (rewrite / extend):
- `api/lib/chamber_grouping.php` — adapt to new entity model
- `api/lib/visit_pdf.php` — drying-report renderer
- `api/lib/psychro.php` — already has what we need, no changes expected

**Backend routes** (new):
- `api/routes/claim_rooms.php`
- `api/routes/drying_zones.php`
- `api/routes/claim_surfaces.php`
- `api/routes/reading_points.php`
- `api/routes/readings_*.php` (one per reading type)
- `api/routes/claim_tasks.php`
- `api/routes/alerts.php`

**Frontend** (new tabs/screens within existing single-file apps):
- `frontend/field.html` — new "DryLog PRO" tab on visit screen, task-driven capture flow, per-room GPP + air mover recommender
- `frontend/totalops.html` — new DryLog PRO management on the job page, alerts queue, task config

**Existing helpers to reuse:**
- `tc_psychro()` in `api/lib/psychro.php` — psychrometric math, already correct
- `tc_sparkline()` in `api/lib/sparkline.php` (F17a) — chart rendering
- `tc_weather_for_job()` in `api/lib/weather.php` (F17a) — exterior atmosphere from Open-Meteo

---

## Verification

**Per schema patch:**
- Run via `tools/run-patches.sh` on staging
- Verify tables/columns exist with `DESCRIBE`
- Re-run patch — confirm idempotent ("already" notes only)

**Per API endpoint:**
- curl tests with sample payloads
- Negative cases: bad data, missing required fields, wrong company_id scoping

**Per engine (tasks + alerts):**
- Unit-style tests against seed data: define a task with prereqs, confirm it stays locked until prereqs complete; trigger a rule, confirm an alert row lands

**End-to-end smoke test** (per phase milestone):
1. Create a fresh test claim
2. Walk through the task list as a field tech (mobile)
3. Capture every reading type
4. Force an alert (set RH high, leave dehu off)
5. Verify office sees the alert
6. Generate a carrier-edition PDF
7. Compare side-by-side with an Encircle PDF on the same job type

**Cutover validation:**
- Take a real in-flight job; verify legacy field flow still works unchanged
- Take a fresh job; verify it lands on the new flow
- Cross-feed: verify a tech can't accidentally write to the wrong model

---

## Pending Research (in flight)

Competitive analysis agent is still running, surveying:
- MICA / Next Gear Solutions
- Restoration Manager (Service Software)
- Albi Restoration
- DASH / Symbility
- Xactimate / Xactanalysis integration patterns
- DocuSketch
- CompanyCam
- IICRC S500 documented requirements (the actual list of defensible-file data elements)
- ~~Bluetooth-enabled moisture meter ecosystem~~ (dropped per Rick — not interested)
- Customer-facing portal patterns from adjacent industries

Results will be appended as **F18 Research Findings** in a follow-up section once complete. Anything that materially changes the plan (e.g., a competitor has a killer feature we should match) will be called out for Rick's review before code is written.

---

## What this plan does NOT cover

- **F17 Final Report builder** — separate plan, in flight (F17a shipped; F17b–e queued). F17 and F18 share the chamber-grouping helper and PDF renderer; F18.9 unifies them.
- **Equipment master data improvements** — out of scope here; covered by F16/F17 work
- **Mobile native apps** — staying with PWA (`field.html`) until/unless Rick wants to invest in native iOS/Android

---

## Sign-off needed before code

**Resolved 2026-05-24:**
- ✅ Product name: **DryLog PRO**
- ✅ Per-room GPP + air mover count recommender → in core build (F18.7)
- ✅ Bluetooth meter ingestion → dropped
- ✅ Standalone equipment sizing calculator → dropped (the part that mattered moved to F18.7)
- ✅ Plain-English customer summary → split out into separate cross-cutting AI-summary-on-all-jobs initiative
- ✅ Nothing else missing from the screenshots
- ✅ Phase order accepted

**Still pending:**
- Vocabulary table — Rick hasn't explicitly approved each row of the Drying Zone / Surface / Reading Point / Dry Goal / Zone Atmosphere / Baseline Atmosphere / HVAC Atmosphere / Dehu Performance Reading naming. Default = accept as written unless changed before F18.0 spec lock.
- Competitive-research agent results — still in flight. If it surfaces anything material, append to "F18 Research Findings" and flag for Rick before code starts.
