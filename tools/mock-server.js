#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = path.resolve(__dirname, '..');
const frontendRoot = path.join(root, 'frontend');
const port = Number(process.env.PORT || 5173);

const state = {
  nextId: 100,
  jobs: [
    {
      id: 1,
      company_id: 1,
      customer: 'Miller Residence',
      address: '42 Maple Street',
      claim_no: 'DL-1001',
      loss_type: 'Water mitigation',
      source_of_loss: 'Supply line',
      status: 'open',
      updated_at: nowSql()
    }
  ],
  visits: [],
  rooms: [],
  zones: [],
  zoneRooms: [],
  surfaces: [],
  points: [],
  tasks: [],
  alerts: [],
  standards: [],
  workItems: [],
  referenceReadings: [],
  zoneAtmosphereReadings: [],
  hvacReadings: [],
  dehuReadings: [],
  moistureReadings: [],
  attachments: [],
  equipment: [
    { id: 1, company_id: 1, type: 'LGR Dehu', make: 'Phoenix', model: 'R200', serial_no: 'PX-200-01', asset_tag: 'DEHU-01' },
    { id: 2, company_id: 1, type: 'Air Mover', make: 'Dri-Eaz', model: 'Velo', serial_no: 'AM-302', asset_tag: 'AM-01' },
    { id: 3, company_id: 1, type: 'Air Scrubber', make: 'Dri-Eaz', model: 'HEPA 500', serial_no: 'AS-118', asset_tag: 'AS-01' }
  ],
  deploys: []
};

const taskDefs = [
  ['source_of_loss', 'Source of Loss', 'setup'],
  ['cat_of_water', 'Category of Water', 'setup'],
  ['class_of_water', 'Class of Water', 'setup'],
  ['room_inventory', 'Room Inventory', 'setup'],
  ['define_zones', 'Define Drying Zones', 'setup'],
  ['define_surfaces', 'Define Surfaces & Dry Goals', 'setup'],
  ['define_reading_points', 'Define Reading Points', 'setup'],
  ['equipment_placed', 'Equipment Placed', 'setup'],
  ['baseline_outdoor', 'Capture Outdoor Baseline', 'capture'],
  ['zone_atmosphere', 'Capture Zone Atmosphere', 'capture'],
  ['moisture_readings', 'Capture Moisture Readings', 'capture'],
  ['dehu_performance', 'Capture Dehu Performance', 'capture'],
  ['daily_visit_complete', 'Daily Visit Complete', 'capture'],
  ['dry_goal_hit', 'Dry Goal Hit', 'closeout'],
  ['equipment_removed', 'Equipment Removed', 'closeout'],
  ['final_walkthrough', 'Final Walkthrough', 'closeout']
];

const prereqs = {
  cat_of_water: ['source_of_loss'],
  class_of_water: ['cat_of_water'],
  define_zones: ['room_inventory'],
  define_surfaces: ['define_zones'],
  define_reading_points: ['define_surfaces'],
  equipment_placed: ['define_zones'],
  zone_atmosphere: ['define_zones'],
  moisture_readings: ['define_reading_points'],
  dehu_performance: ['equipment_placed', 'zone_atmosphere'],
  daily_visit_complete: ['moisture_readings', 'zone_atmosphere'],
  dry_goal_hit: ['moisture_readings'],
  equipment_removed: ['dry_goal_hit'],
  final_walkthrough: ['equipment_removed']
};

seedDemo();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message || String(err) });
  }
});

server.listen(port, () => {
  console.log(`DryLog PRO mock server running at http://localhost:${port}`);
});

function seedDemo() {
  const visit = makeVisit(1, today(), 0, 'initial');
  state.visits.push(visit);
  const room = makeRoom(1, 'Kitchen', 1);
  const hall = makeRoom(1, 'Hallway', 2);
  state.rooms.push(room, hall);
  const zone = makeZone(1, 'Kitchen Drying Zone', [room.id, hall.id], 2, 2);
  state.zones.push(zone);
  const surface = makeSurface(zone.id, 'wall', 'Kitchen sink wall', 'drywall');
  surface.dry_goal = 16;
  const subfloor = makeSurface(zone.id, 'floor', 'Kitchen subfloor seam', 'subfloor');
  subfloor.dry_goal = 14;
  const baseboard = makeSurface(zone.id, 'baseboard', 'Hallway baseboard', 'wood');
  baseboard.dry_goal = 12;
  state.surfaces.push(surface, subfloor, baseboard);
  const point = makePoint(surface.id, 'P1');
  const point2 = makePoint(subfloor.id, 'S1');
  const point3 = makePoint(baseboard.id, 'B1');
  state.points.push(point, point2, point3);
  state.deploys.push(makeDeploy(1, 1, zone.id));
  state.standards.push(
    { id: nextId(), company_id: 1, claim_id: 1, material: 'drywall', dry_goal: 16, dry_goal_unit: '%MC', meter_type: 'pin' },
    { id: nextId(), company_id: 1, claim_id: 1, material: 'subfloor', dry_goal: 14, dry_goal_unit: '%MC', meter_type: 'pin' },
    { id: nextId(), company_id: 1, claim_id: 1, material: 'wood', dry_goal: 12, dry_goal_unit: '%MC', meter_type: 'pin' }
  );
  seedTasks(1, 'cat2');
  for (const code of ['source_of_loss', 'cat_of_water', 'class_of_water', 'room_inventory', 'define_zones']) {
    const task = state.tasks.find(t => t.claim_id === 1 && t.code === code);
    if (task) task.state = 'complete';
  }
  recomputeTasks(1);
  state.zoneAtmosphereReadings.push(
    makeZoneAtmosphereReading({ drying_zone_id: zone.id, visit_id: visit.id, temp_f: 76.5, rh_pct: 61.0, reading_at: hoursAgoSql(52) }),
    makeZoneAtmosphereReading({ drying_zone_id: zone.id, visit_id: visit.id, temp_f: 75.0, rh_pct: 54.0, reading_at: hoursAgoSql(28) }),
    makeZoneAtmosphereReading({ drying_zone_id: zone.id, visit_id: visit.id, temp_f: 74.2, rh_pct: 48.5, reading_at: hoursAgoSql(2) })
  );
  state.moistureReadings.push(
    makeMoistureReading({ reading_point_id: point.id, visit_id: visit.id, moisture_value: 27.5, moisture_unit: '%MC', reading_at: hoursAgoSql(52) }),
    makeMoistureReading({ reading_point_id: point.id, visit_id: visit.id, moisture_value: 23.8, moisture_unit: '%MC', reading_at: hoursAgoSql(2) }),
    makeMoistureReading({ reading_point_id: point2.id, visit_id: visit.id, moisture_value: 19.2, moisture_unit: '%MC', reading_at: hoursAgoSql(52) }),
    makeMoistureReading({ reading_point_id: point2.id, visit_id: visit.id, moisture_value: 15.1, moisture_unit: '%MC', reading_at: hoursAgoSql(2) }),
    makeMoistureReading({ reading_point_id: point3.id, visit_id: visit.id, moisture_value: 14.4, moisture_unit: '%MC', reading_at: hoursAgoSql(52) }),
    makeMoistureReading({ reading_point_id: point3.id, visit_id: visit.id, moisture_value: 11.8, moisture_unit: '%MC', reading_at: hoursAgoSql(2) })
  );
  state.dehuReadings.push(
    makeDehuReading({ drying_zone_id: zone.id, equipment_deploy_id: state.deploys[0].id, visit_id: visit.id, intake_temp_f: 75, intake_rh_pct: 54, exhaust_temp_f: 92, exhaust_rh_pct: 24, reading_at: hoursAgoSql(28) }),
    makeDehuReading({ drying_zone_id: zone.id, equipment_deploy_id: state.deploys[0].id, visit_id: visit.id, intake_temp_f: 74, intake_rh_pct: 48, exhaust_temp_f: 91, exhaust_rh_pct: 22, reading_at: hoursAgoSql(2) })
  );
  state.workItems.push({
    id: nextId(), company_id: 1, claim_room_id: room.id, visit_id: visit.id,
    item_type: 'demo', label: 'Removed sink base toe kick and wet baseboard',
    qty: 1, unit: 'ea', notes: 'Documented affected wall cavity.', created_at: hoursAgoSql(3)
  });
  state.alerts.push({
    id: nextId(), company_id: 1, claim_id: 1, drying_zone_id: zone.id,
    alert_type: 'moisture_regressed', severity: 'warning', state: 'open',
    title: 'Kitchen sink wall still elevated',
    message: 'P1 remains above the drywall dry goal. Recheck after next equipment cycle.',
    created_at: hoursAgoSql(1)
  });
  state.attachments.push(
    makeAttachment(visit.id, 'Arrival: exterior and access path', 'mock-photo.svg', hoursAgoSql(5)),
    makeAttachment(visit.id, 'Source area under sink', 'mock-photo.svg', hoursAgoSql(4)),
    makeAttachment(visit.id, 'Equipment placement in kitchen', 'mock-photo.svg', hoursAgoSql(2))
  );
}

async function handleApi(req, res, url) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const resource = parts[0] || 'health';
  const id = /^\d+$/.test(parts[1] || '') ? Number(parts[1]) : null;
  const action = id ? parts[2] : parts[1];
  const body = await readJson(req);

  if (resource === 'health') return sendOk(res, { service: 'DryLog PRO mock API', status: 'ok' });
  if (resource === 'jobs') return jobs(req, res, id, body);
  if (resource === 'visits') return visits(req, res, id, url, body);
  if (resource === 'claim-tasks') return claimTasks(req, res, action, url, body);
  if (resource === 'claim-rooms') return claimRooms(req, res, id, url, body);
  if (resource === 'drying-zones') return dryingZones(req, res, id, action, url, body);
  if (resource === 'claim-surfaces') return claimSurfaces(req, res, id, url, body);
  if (resource === 'reading-points') return readingPoints(req, res, id, url, body);
  if (resource === 'claim-material-standards') return standards(req, res, url, body);
  if (resource === 'room-work-items') return workItems(req, res, id, url, body);
  if (resource === 'equipment') return equipment(req, res, id, body);
  if (resource === 'equipment-deploys') return equipmentDeploys(req, res, id, url, body);
  if (resource === 'alerts') return alerts(req, res, id, action, url, body);
  if (resource === 'readings') return readings(req, res, parts.slice(1), url, body);
  if (resource === 'entity-attachments') return attachments(req, res, id, url, body);
  if (resource === 'sizing') return sizing(req, res, action, body);
  return sendJson(res, 404, { ok: false, error: 'Mock route not found' });
}

function jobs(req, res, id, body) {
  if (req.method === 'GET' && id) return sendOk(res, find(state.jobs, id));
  if (req.method === 'GET') return sendOk(res, state.jobs.filter(j => !j.status || j.status === 'open'));
  if (req.method === 'POST') {
    const job = {
      id: nextId(), company_id: 1,
      customer: body.customer || 'New DryLog Claim',
      address: body.address || null,
      claim_no: body.claim_no || null,
      loss_type: body.loss_type || 'Water mitigation',
      source_of_loss: body.source_of_loss || null,
      status: body.status || 'open',
      updated_at: nowSql()
    };
    state.jobs.unshift(job);
    return sendOk(res, job, 201);
  }
  if (req.method === 'PUT' && id) {
    const job = find(state.jobs, id);
    Object.assign(job, body, { updated_at: nowSql() });
    return sendOk(res, job);
  }
  return send404(res);
}

function visits(req, res, id, url, body) {
  if (req.method === 'GET' && id) return sendOk(res, find(state.visits, id));
  if (req.method === 'GET') {
    const jobId = Number(url.searchParams.get('job_id'));
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    let rows = state.visits.filter(v => v.job_id === jobId);
    if (start) rows = rows.filter(v => v.visit_date >= start);
    if (end) rows = rows.filter(v => v.visit_date <= end);
    return sendOk(res, rows.sort((a, b) => b.visit_date.localeCompare(a.visit_date) || b.id - a.id));
  }
  if (req.method === 'POST') {
    const visit = makeVisit(Number(body.job_id), body.visit_date || today(), body.day_index ?? 0, body.visit_type || 'followup');
    state.visits.push(visit);
    return sendOk(res, visit, 201);
  }
  return send404(res);
}

function claimTasks(req, res, action, url, body) {
  if (req.method === 'GET' && !action) {
    const claimId = Number(url.searchParams.get('claim_id'));
    return sendOk(res, tasksForClaim(claimId));
  }
  if (req.method === 'GET' && action === 'definitions') {
    return sendOk(res, taskDefs.map((t, i) => ({ id: i + 1, code: t[0], name: t[1], category: t[2], display_order: (i + 1) * 10 })));
  }
  if (req.method === 'POST' && action === 'seed') {
    seedTasks(Number(body.claim_id), body.template || 'cat2');
    return sendOk(res, { tasks: tasksForClaim(Number(body.claim_id)) }, 201);
  }
  if (req.method === 'POST' && ['complete', 'skip', 'reopen'].includes(action)) {
    const task = state.tasks.find(t => t.claim_id === Number(body.claim_id) && t.code === body.code);
    if (!task) return sendJson(res, 404, { ok: false, error: 'Task not found' });
    if (action === 'complete') task.state = 'complete';
    if (action === 'skip') { task.state = 'skipped'; task.skip_reason = body.reason || 'Skipped'; }
    if (action === 'reopen') task.state = 'available';
    recomputeTasks(Number(body.claim_id));
    return sendOk(res, { tasks: tasksForClaim(Number(body.claim_id)), newly_available: [] });
  }
  return send404(res);
}

function claimRooms(req, res, id, url, body) {
  if (req.method === 'GET' && id) return sendOk(res, find(state.rooms, id));
  if (req.method === 'GET') {
    const claimId = Number(url.searchParams.get('claim_id'));
    return sendOk(res, state.rooms.filter(r => r.claim_id === claimId && !r.deleted_at));
  }
  if (req.method === 'POST') {
    const room = makeRoom(Number(body.claim_id), body.name || 'Room', state.rooms.length + 1);
    Object.assign(room, pick(body, ['floor_level', 'length_ft', 'width_ft', 'height_ft', 'notes']));
    state.rooms.push(room);
    return sendOk(res, room, 201);
  }
  if (req.method === 'PUT' && id) {
    const room = find(state.rooms, id);
    Object.assign(room, body);
    return sendOk(res, room);
  }
  if (req.method === 'DELETE' && id) {
    find(state.rooms, id).deleted_at = nowSql();
    return sendOk(res, null);
  }
  return send404(res);
}

function dryingZones(req, res, id, action, url, body) {
  if (req.method === 'GET' && id && action === 'sketch-cad') return sendOk(res, { state_json: find(state.zones, id).sketch_cad_json || null, points: pointsForZone(id) });
  if (req.method === 'PUT' && id && action === 'sketch-cad') {
    find(state.zones, id).sketch_cad_json = body.state_json;
    return sendOk(res, { saved_at: nowSql() });
  }
  if (req.method === 'POST' && id && action === 'close') {
    const z = find(state.zones, id);
    z.is_closed = 1; z.closed_at = nowSql();
    return sendOk(res, z);
  }
  if (req.method === 'GET' && id) return sendOk(res, hydrateZone(find(state.zones, id)));
  if (req.method === 'GET') {
    const claimId = Number(url.searchParams.get('claim_id'));
    return sendOk(res, state.zones.filter(z => z.claim_id === claimId && !z.deleted_at && (url.searchParams.get('include_closed') || !z.is_closed)).map(hydrateZone));
  }
  if (req.method === 'POST') {
    const zone = makeZone(Number(body.claim_id), body.name, body.claim_room_ids || [], body.category_of_water, body.class_of_water);
    zone.containment_notes = body.containment_notes || null;
    state.zones.push(zone);
    return sendOk(res, hydrateZone(zone), 201);
  }
  if (req.method === 'PUT' && id) {
    const zone = find(state.zones, id);
    Object.assign(zone, pick(body, ['name', 'zone_index', 'category_of_water', 'class_of_water', 'containment_notes']));
    if (Array.isArray(body.claim_room_ids)) {
      state.zoneRooms = state.zoneRooms.filter(zr => zr.drying_zone_id !== id);
      body.claim_room_ids.forEach(roomId => state.zoneRooms.push({ drying_zone_id: id, claim_room_id: Number(roomId) }));
    }
    return sendOk(res, hydrateZone(zone));
  }
  if (req.method === 'DELETE' && id) {
    find(state.zones, id).deleted_at = nowSql();
    return sendOk(res, null);
  }
  return send404(res);
}

function claimSurfaces(req, res, id, url, body) {
  if (req.method === 'GET' && id) return sendOk(res, find(state.surfaces, id));
  if (req.method === 'GET') return sendOk(res, state.surfaces.filter(s => s.drying_zone_id === Number(url.searchParams.get('drying_zone_id')) && !s.deleted_at));
  if (req.method === 'POST') {
    const surface = makeSurface(Number(body.drying_zone_id), body.surface_type, body.surface_label, body.material);
    Object.assign(surface, pick(body, ['wall_index', 'dry_goal', 'dry_goal_unit', 'meter_type', 'notes', 'area_sf', 'linear_ft', 'ceiling_height_ft']));
    applyStandard(surface);
    state.surfaces.push(surface);
    return sendOk(res, surface, 201);
  }
  if (req.method === 'PUT' && id) {
    const surface = find(state.surfaces, id);
    Object.assign(surface, body);
    applyStandard(surface);
    return sendOk(res, surface);
  }
  if (req.method === 'DELETE' && id) {
    find(state.surfaces, id).deleted_at = nowSql();
    return sendOk(res, null);
  }
  return send404(res);
}

function readingPoints(req, res, id, url, body) {
  if (req.method === 'GET' && id) return sendOk(res, find(state.points, id));
  if (req.method === 'GET') return sendOk(res, state.points.filter(p => p.claim_surface_id === Number(url.searchParams.get('claim_surface_id')) && !p.deleted_at));
  if (req.method === 'POST') {
    const point = makePoint(Number(body.claim_surface_id), body.point_label || 'P' + (state.points.length + 1));
    Object.assign(point, pick(body, ['location_notes', 'sketch_x_pct', 'sketch_y_pct']));
    state.points.push(point);
    return sendOk(res, point, 201);
  }
  if (req.method === 'PUT' && id) {
    const point = find(state.points, id);
    Object.assign(point, body);
    return sendOk(res, point);
  }
  if (req.method === 'DELETE' && id) {
    find(state.points, id).deleted_at = nowSql();
    return sendOk(res, null);
  }
  return send404(res);
}

function standards(req, res, url, body) {
  if (req.method === 'GET') return sendOk(res, state.standards.filter(s => s.claim_id === Number(url.searchParams.get('claim_id'))));
  if (req.method === 'POST') {
    const row = Object.assign({ id: nextId(), company_id: 1 }, body);
    const oldIdx = state.standards.findIndex(s => s.claim_id === row.claim_id && s.material === row.material);
    if (oldIdx >= 0) state.standards[oldIdx] = Object.assign(state.standards[oldIdx], row);
    else state.standards.push(row);
    state.surfaces.forEach(applyStandard);
    return sendOk(res, row, 201);
  }
  return send404(res);
}

function workItems(req, res, id, url, body) {
  if (req.method === 'GET') {
    const claimId = Number(url.searchParams.get('claim_id'));
    const roomId = Number(url.searchParams.get('claim_room_id') || 0);
    let rows = state.workItems.filter(w => roomClaim(w.claim_room_id) === claimId);
    if (roomId) rows = rows.filter(w => w.claim_room_id === roomId);
    return sendOk(res, rows);
  }
  if (req.method === 'POST') {
    const row = Object.assign({ id: nextId(), company_id: 1, created_at: nowSql() }, body);
    state.workItems.push(row);
    return sendOk(res, row, 201);
  }
  if (req.method === 'PUT' && id) {
    const row = find(state.workItems, id);
    Object.assign(row, body);
    return sendOk(res, row);
  }
  if (req.method === 'DELETE' && id) {
    state.workItems = state.workItems.filter(w => w.id !== id);
    return sendOk(res, null);
  }
  return send404(res);
}

function equipment(req, res, id, body) {
  if (req.method === 'GET' && id) return sendOk(res, find(state.equipment, id));
  if (req.method === 'GET') {
    return sendOk(res, state.equipment.map(eq => {
      const dep = state.deploys.find(d => d.equipment_id === eq.id && !d.returned_at);
      return Object.assign({}, eq, dep ? { deployed_job_id: dep.job_id, active_deploy_id: dep.id, drying_zone_id: dep.drying_zone_id } : {});
    }));
  }
  if (req.method === 'POST') {
    const eq = Object.assign({ id: nextId(), company_id: 1 }, body);
    state.equipment.push(eq);
    return sendOk(res, eq, 201);
  }
  return send404(res);
}

function equipmentDeploys(req, res, id, url, body) {
  if (req.method === 'GET' && id) return sendOk(res, hydrateDeploy(find(state.deploys, id)));
  if (req.method === 'GET') {
    const jobId = Number(url.searchParams.get('job_id'));
    let rows = state.deploys.filter(d => d.job_id === jobId);
    if (url.searchParams.get('active')) rows = rows.filter(d => !d.returned_at);
    return sendOk(res, rows.map(hydrateDeploy));
  }
  if (req.method === 'POST') {
    const dep = makeDeploy(Number(body.equipment_id), Number(body.job_id), body.drying_zone_id ? Number(body.drying_zone_id) : null);
    state.deploys.push(dep);
    return sendOk(res, dep, 201);
  }
  if (req.method === 'PUT' && id) {
    const dep = find(state.deploys, id);
    Object.assign(dep, body);
    if (body.return || body.returned) dep.returned_at = nowSql();
    return sendOk(res, hydrateDeploy(dep));
  }
  return send404(res);
}

function alerts(req, res, id, action, url, body) {
  if (req.method === 'GET' && action === 'config') return sendOk(res, []);
  if (req.method === 'GET') {
    const claimId = Number(url.searchParams.get('claim_id') || 0);
    let rows = state.alerts;
    if (claimId) rows = rows.filter(a => a.claim_id === claimId);
    return sendOk(res, rows);
  }
  if (req.method === 'POST' && id && ['ack', 'resolve', 'dismiss'].includes(action)) {
    const alert = find(state.alerts, id);
    alert.state = action === 'ack' ? 'acked' : action === 'resolve' ? 'resolved' : 'dismissed';
    return sendOk(res, alert);
  }
  return send404(res);
}

function readings(req, res, parts, url, body) {
  const type = parts[0];
  if (type === 'reference') return readingCollection(req, res, url, body, state.referenceReadings, makeReferenceReading);
  if (type === 'zone-atmosphere') return readingCollection(req, res, url, body, state.zoneAtmosphereReadings, makeZoneAtmosphereReading);
  if (type === 'hvac') return readingCollection(req, res, url, body, state.hvacReadings, makeHvacReading);
  if (type === 'dehu') return readingCollection(req, res, url, body, state.dehuReadings, makeDehuReading);
  if (type === 'moisture') return readingCollection(req, res, url, body, state.moistureReadings, makeMoistureReading);
  return send404(res);
}

function readingCollection(req, res, url, body, collection, maker) {
  if (req.method === 'GET') {
    let rows = collection.slice();
    for (const key of ['claim_id', 'drying_zone_id', 'claim_surface_id', 'reading_point_id']) {
      const value = Number(url.searchParams.get(key) || 0);
      if (value) rows = rows.filter(r => r[key] === value);
    }
    return sendOk(res, rows.sort((a, b) => String(b.reading_at).localeCompare(String(a.reading_at)) || b.id - a.id));
  }
  if (req.method === 'POST') {
    const row = maker(body);
    collection.push(row);
    return sendOk(res, { reading: row, alerts_fired: [] }, 201);
  }
  return send404(res);
}

function attachments(req, res, id, url, body) {
  if (req.method === 'GET') {
    const claimId = Number(url.searchParams.get('claim_id') || 0);
    if (claimId) {
      const visitIds = state.visits.filter(v => v.job_id === claimId).map(v => v.id);
      return sendOk(res, state.attachments.filter(a => a.entity_type === 'visit' && visitIds.includes(a.entity_id)));
    }
    return sendOk(res, state.attachments.filter(a => a.entity_type === url.searchParams.get('entity_type') && a.entity_id === Number(url.searchParams.get('entity_id'))));
  }
  if (req.method === 'POST') {
    const entityId = Number(url.searchParams.get('entity_id') || body.entity_id || 0);
    const row = {
      id: nextId(), company_id: 1, entity_type: body.entity_type || 'visit', entity_id: entityId,
      file_url: body.file_url || 'mock-photo.svg',
      original_name: body.original_name || 'mock-photo.svg',
      mime_type: body.mime_type || 'image/svg+xml',
      caption: body.caption || 'Mock upload',
      claim_room_id: body.claim_room_id ? Number(body.claim_room_id) : null,
      uploaded_at: nowSql()
    };
    state.attachments.push(row);
    return sendOk(res, row, 201);
  }
  if (req.method === 'PUT' && id) {
    const row = find(state.attachments, id);
    Object.assign(row, pick(body, ['caption', 'claim_room_id']));
    if (Object.prototype.hasOwnProperty.call(body, 'claim_room_id') && (body.claim_room_id === '' || body.claim_room_id === null)) {
      row.claim_room_id = null;
    }
    return sendOk(res, row);
  }
  if (req.method === 'DELETE' && id) {
    state.attachments = state.attachments.filter(a => a.id !== id);
    return sendOk(res, null);
  }
  return send404(res);
}

function sizing(req, res, action, body) {
  if (req.method !== 'POST' || action !== 'recommend') return send404(res);
  const sqft = Number(body.length_ft || 0) * Number(body.width_ft || 0);
  const classOfWater = Number(body.class_of_water || 2);
  const divisor = { 1: 70, 2: 60, 3: 50, 4: 40 }[classOfWater] || 60;
  return sendOk(res, {
    air_movers_recommended: Math.max(1, Math.ceil(sqft / divisor)),
    dehu_pints_per_day_recommended: Math.max(30, Math.ceil(sqft * Number(body.height_ft || 8) * 0.6)),
    wet_floor_sqft: sqft,
    rationale: `Based on ${Math.round(sqft)} sf and Class ${classOfWater}.`
  });
}

function seedTasks(claimId, template) {
  const codes = new Set(taskDefs.map(t => t[0]));
  if (template === 'cat1') ['baseline_unaffected', 'dehu_performance'].forEach(c => codes.delete(c));
  state.tasks = state.tasks.filter(t => t.claim_id !== claimId);
  taskDefs.filter(t => codes.has(t[0])).forEach((t, i) => {
    state.tasks.push({ id: nextId(), claim_id: claimId, code: t[0], name: t[1], category: t[2], state: i === 0 ? 'available' : 'locked', prereqs: prereqs[t[0]] || [] });
  });
  recomputeTasks(claimId);
}

function recomputeTasks(claimId) {
  const rows = state.tasks.filter(t => t.claim_id === claimId);
  rows.forEach(t => {
    if (['complete', 'skipped'].includes(t.state)) return;
    t.state = (t.prereqs || []).every(code => {
      const pre = rows.find(x => x.code === code);
      return pre && ['complete', 'skipped'].includes(pre.state);
    }) ? 'available' : 'locked';
  });
}

function tasksForClaim(claimId) {
  recomputeTasks(claimId);
  return state.tasks.filter(t => t.claim_id === claimId);
}

function makeVisit(jobId, visitDate, dayIndex, visitType) {
  return { id: nextId(), company_id: 1, job_id: jobId, tech_user_id: 1, visit_date: visitDate, day_index: dayIndex, visit_type: visitType, created_at: nowSql() };
}

function makeRoom(claimId, name, index) {
  return { id: nextId(), company_id: 1, claim_id: claimId, name, room_index: index, length_ft: 12, width_ft: 10, height_ft: 8, created_at: nowSql() };
}

function makeZone(claimId, name, roomIds, cat, cls) {
  const zone = { id: nextId(), company_id: 1, claim_id: claimId, name: name || 'Drying Zone', zone_index: state.zones.length + 1, category_of_water: cat || 2, class_of_water: cls || 2, is_closed: 0, created_at: nowSql() };
  (roomIds || []).forEach(roomId => state.zoneRooms.push({ drying_zone_id: zone.id, claim_room_id: Number(roomId) }));
  return zone;
}

function hydrateZone(zone) {
  return Object.assign({}, zone, { claim_room_ids: state.zoneRooms.filter(zr => zr.drying_zone_id === zone.id).map(zr => zr.claim_room_id), has_sketch: !!zone.sketch_cad_json });
}

function makeSurface(zoneId, type, label, material) {
  return { id: nextId(), company_id: 1, drying_zone_id: zoneId, surface_type: type || 'wall', surface_label: label || null, material: material || null, dry_goal: null, dry_goal_unit: '%MC', is_dry: 0, created_at: nowSql() };
}

function makePoint(surfaceId, label) {
  return { id: nextId(), company_id: 1, claim_surface_id: surfaceId, point_label: label, created_at: nowSql() };
}

function makeDeploy(equipmentId, jobId, zoneId) {
  return { id: nextId(), company_id: 1, equipment_id: equipmentId, job_id: jobId, drying_zone_id: zoneId || null, deployed_at: nowSql(), returned_at: null };
}

function hydrateDeploy(dep) {
  const eq = find(state.equipment, dep.equipment_id);
  const hours = Math.max(0, Math.round((Date.now() - new Date(dep.deployed_at.replace(' ', 'T')).getTime()) / 3600000));
  return Object.assign({}, dep, eq, { id: dep.id, equipment_id: dep.equipment_id, hours_deployed: hours });
}

function pointsForZone(zoneId) {
  const surfaceIds = state.surfaces.filter(s => s.drying_zone_id === zoneId).map(s => s.id);
  return state.points.filter(p => surfaceIds.includes(p.claim_surface_id));
}

function makeReferenceReading(body) {
  return Object.assign({ id: nextId(), company_id: 1, reading_at: nowSql(), gpp: psychro(body.temp_f, body.rh_pct).gpp }, body);
}

function makeZoneAtmosphereReading(body) {
  const zone = find(state.zones, Number(body.drying_zone_id));
  return Object.assign({ id: nextId(), company_id: 1, claim_id: zone.claim_id, reading_at: nowSql() }, body, psychro(body.temp_f, body.rh_pct));
}

function makeHvacReading(body) {
  const zone = find(state.zones, Number(body.drying_zone_id));
  return Object.assign({ id: nextId(), company_id: 1, claim_id: zone.claim_id, reading_at: nowSql() }, body, psychro(body.temp_f, body.rh_pct));
}

function makeDehuReading(body) {
  const zone = find(state.zones, Number(body.drying_zone_id));
  const intake = psychro(body.intake_temp_f, body.intake_rh_pct);
  const exhaust = psychro(body.exhaust_temp_f, body.exhaust_rh_pct);
  return Object.assign({ id: nextId(), company_id: 1, claim_id: zone.claim_id, reading_at: nowSql(), intake_gpp: intake.gpp, exhaust_gpp: exhaust.gpp, grain_depression: round(intake.gpp - exhaust.gpp) }, body);
}

function makeMoistureReading(body) {
  const point = find(state.points, Number(body.reading_point_id));
  const surface = find(state.surfaces, point.claim_surface_id);
  const zone = find(state.zones, surface.drying_zone_id);
  const row = Object.assign({ id: nextId(), company_id: 1, claim_id: zone.claim_id, drying_zone_id: zone.id, claim_surface_id: surface.id, reading_at: nowSql(), dry_goal_snapshot: surface.dry_goal, is_dry_at_time: surface.dry_goal != null && Number(body.moisture_value) <= Number(surface.dry_goal) ? 1 : 0 }, body);
  if (row.is_dry_at_time) surface.is_dry = 1;
  return row;
}

function makeAttachment(visitId, caption, fileUrl, uploadedAt) {
  return {
    id: nextId(), company_id: 1, entity_type: 'visit', entity_id: visitId,
    file_url: fileUrl || 'mock-photo.svg', original_name: fileUrl || 'mock-photo.svg',
    mime_type: 'image/svg+xml', caption: caption || 'Job photo',
    uploaded_at: uploadedAt || nowSql()
  };
}

function applyStandard(surface) {
  const zone = state.zones.find(z => z.id === surface.drying_zone_id);
  if (!zone) return;
  const material = materialClass(surface.material);
  const std = state.standards.find(s => s.claim_id === zone.claim_id && s.material === material);
  if (std) {
    surface.dry_goal = Number(std.dry_goal);
    surface.dry_goal_unit = std.dry_goal_unit || '%MC';
    surface.meter_type = std.meter_type || null;
  }
}

function materialClass(label) {
  const s = String(label || '').toLowerCase();
  if (s.includes('drywall')) return 'drywall';
  if (s.includes('wood') || s.includes('plywood') || s.includes('osb')) return 'wood';
  if (s.includes('concrete')) return 'concrete';
  if (s.includes('carpet pad') || s === 'pad') return 'pad';
  if (s.includes('carpet')) return 'carpet';
  return 'other';
}

function roomClaim(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  return room ? room.claim_id : 0;
}

function psychro(tF, rh) {
  const temp = Number(tF);
  const pct = Number(rh);
  if (!Number.isFinite(temp) || !Number.isFinite(pct)) return { gpp: null, dew_point_f: null, vapor_pressure_kpa: null };
  const tC = (temp - 32) * 5 / 9;
  const svp = 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3));
  const vp = svp * (pct / 100);
  const w = 0.622 * vp / (101.325 - vp);
  const alpha = Math.log(Math.max(pct, 0.0001) / 100) + (17.27 * tC) / (tC + 237.3);
  const dpC = (237.3 * alpha) / (17.27 - alpha);
  return { gpp: round(w * 7000), dew_point_f: round(dpC * 9 / 5 + 32), vapor_pressure_kpa: round(vp, 4) };
}

function serveStatic(req, res, url) {
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === '/' || filePath === '') filePath = '/frontend/index.html';
  if (!filePath.startsWith('/frontend/') && !filePath.startsWith('/uploads/')) filePath = '/frontend' + filePath;
  const abs = path.normalize(path.join(root, filePath));
  if (!abs.startsWith(root)) return sendJson(res, 403, { ok: false, error: 'Forbidden' });
  fs.readFile(abs, (err, data) => {
    if (err) return sendJson(res, 404, { ok: false, error: 'Not found' });
    res.writeHead(200, { 'Content-Type': contentType(abs), 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  }[ext] || 'application/octet-stream';
}

async function readJson(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const type = req.headers['content-type'] || '';
  if (type.includes('multipart/form-data')) return {};
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); }
  catch { return {}; }
}

function sendOk(res, data, status = 200) {
  sendJson(res, status, { ok: true, data });
}

function send404(res) {
  sendJson(res, 404, { ok: false, error: 'Not found' });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function find(list, id) {
  const row = list.find(item => item.id === Number(id));
  if (!row) throw Object.assign(new Error('Not found'), { status: 404 });
  return row;
}

function pick(obj, keys) {
  const out = {};
  keys.forEach(k => { if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]; });
  return out;
}

function nextId() { return state.nextId++; }
function today() { return new Date().toISOString().slice(0, 10); }
function nowSql() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function hoursAgoSql(hours) { return new Date(Date.now() - Number(hours || 0) * 3600000).toISOString().slice(0, 19).replace('T', ' '); }
function round(n, places = 1) { return Math.round(Number(n) * Math.pow(10, places)) / Math.pow(10, places); }
