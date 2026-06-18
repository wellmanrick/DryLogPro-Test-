(function () {
  const rootEl = document.getElementById('app');
  const toastRoot = document.getElementById('toast-root');

  window.root = rootEl;
  const urlParams = new URLSearchParams(window.location.search);
  const apiFromUrl = urlParams.get('api');
  if (apiFromUrl) localStorage.setItem('drylog_api_base', apiFromUrl);
  window.API = window.DRYLOG_API_BASE || apiFromUrl || localStorage.getItem('drylog_api_base') || '/api';
  window.token = localStorage.getItem('drylog_token') || '';
  window.selectedJob = null;
  window.myDay = {};
  window.__dlpTasks = [];
  window.__dlpZones = [];
  window.__dlpActiveDeploys = [];
  window.__dlpAlertsOpen = [];
  window.__dlpWizState = null;
  window.__dlpVisitId = null;
  window.__dlpCad = null;

  window.DLP_SOURCE_OF_LOSS_OPTIONS = [
    'Supply line', 'Drain line', 'Water heater', 'Appliance leak',
    'Roof leak', 'Storm intrusion', 'Sewer backup', 'Groundwater',
    'Fire suppression', 'Unknown', 'Other'
  ];

  window.DLP_ALERT_REMEDIES = {
    dehu_underperforming: 'Check dehu placement, filters, power, containment, and available capacity.',
    grain_depression_low: 'Verify probe placement, clean filters, inspect coils, and consider swapping the unit.',
    condensation_risk: 'Raise surface temperature or lower dew point before condensation forms.',
    moisture_regressed: 'Recheck the point, inspect for hidden moisture, and verify containment.',
    visit_overdue: 'Schedule a reading visit before the file goes stale.',
    zone_ready_to_close: 'Capture final readings, pull equipment, and close the zone.',
    cat3_no_hepa: 'Deploy HEPA filtration or document why it is not required.',
    outdoor_humidity_spike: 'Note weather impact and verify containment is holding.',
    equipment_overstay: 'Review equipment need and remove idle units.'
  };

  window.DLP_ROOM_PRESETS = [
    'Kitchen', 'Living Room', 'Dining Room', 'Bedroom', 'Bathroom',
    'Laundry Room', 'Hallway', 'Basement', 'Crawlspace', 'Garage',
    'Utility Room', 'Office'
  ];

  window.DLP_DEMO_CATALOG = [
    'Removed baseboard', 'Removed drywall', 'Removed insulation',
    'Pulled carpet', 'Removed pad', 'Detached cabinet toe kick',
    'Removed flooring', 'Flood cut'
  ];

  window.DLP_CONSUMABLE_CATALOG = [
    'Poly sheeting', 'Tape', 'Antimicrobial', 'Containment zipper',
    'Filter', 'Trash bags', 'Floor protection', 'Desiccant'
  ];

  window.DLP_WORK_UNITS = ['ea', 'lf', 'sf', 'bag', 'gal', 'hr'];

  window.DLP_DRY_GOAL_CLASSES = [
    { material: 'drywall', label: 'Drywall', unit: '%MC', meter_type: 'pin' },
    { material: 'wood', label: 'Wood / framing', unit: '%MC', meter_type: 'pin' },
    { material: 'subfloor', label: 'Subfloor', unit: '%MC', meter_type: 'pin' },
    { material: 'concrete', label: 'Concrete / masonry', unit: '%WME', meter_type: 'non-pin' },
    { material: 'plaster', label: 'Plaster', unit: '%MC', meter_type: 'pin' },
    { material: 'carpet', label: 'Carpet', unit: '%WME', meter_type: 'non-pin' },
    { material: 'pad', label: 'Carpet pad', unit: '%WME', meter_type: 'non-pin' },
    { material: 'insulation', label: 'Insulation', unit: '%WME', meter_type: 'non-pin' },
    { material: 'tile', label: 'Tile assembly', unit: '%WME', meter_type: 'non-pin' },
    { material: 'resilient', label: 'Vinyl / laminate', unit: '%WME', meter_type: 'non-pin' },
    { material: 'other', label: 'Other', unit: '%MC', meter_type: null }
  ];

  window.DLP_MATERIALS_BY_SURFACE_TYPE = {
    wall: ['drywall', 'plaster', 'wood paneling', 'insulation', 'tile', 'other'],
    floor: ['hardwood', 'subfloor', 'concrete', 'tile', 'lvp', 'laminate', 'carpet', 'pad', 'other'],
    ceiling: ['drywall', 'plaster', 'insulation', 'wood', 'other'],
    baseboard: ['mdf', 'wood', 'vinyl', 'other'],
    cabinet: ['plywood', 'mdf', 'particleboard', 'wood', 'other'],
    trim: ['wood', 'mdf', 'vinyl', 'other'],
    subfloor: ['plywood', 'osb', 'concrete', 'other'],
    insulation: ['fiberglass insulation', 'cellulose insulation', 'spray foam', 'other'],
    other: ['drywall', 'wood', 'concrete', 'tile', 'other']
  };

  window.DLP_CAD_VERSION = 1;
  window.DLP_CAD_PX_PER_FT = 24;
  window.DLP_CAD_GRID_FT = 1;
  window.DLP_CAD_SUBGRID_FT = 0.5;
  window.DLP_CAD_ENDPT_SNAP_PX = 12;
  window.DLP_CAD_TAP_THRESHOLD = 5;

  window.DLP_TASK_HINTS = {
    source_of_loss: 'Confirm the source before documenting dry-out conditions.',
    cat_of_water: 'Set category on the drying zone during setup.',
    class_of_water: 'Set class on the drying zone during setup.',
    room_inventory: 'Create or confirm the affected rooms.',
    define_zones: 'Build drying zones for the affected areas.',
    define_surfaces: 'Add wet surfaces and set dry goals.',
    define_reading_points: 'Add repeatable meter locations on each surface.',
    equipment_placed: 'Deploy and assign equipment to zones.',
    baseline_outdoor: 'Capture outdoor or baseline atmosphere.',
    baseline_unaffected: 'Capture unaffected indoor atmosphere.',
    zone_atmosphere: 'Capture temp and RH inside each drying zone.',
    hvac_atmosphere: 'Capture supply, return, or plenum readings.',
    moisture_readings: 'Capture moisture at each reading point.',
    dehu_performance: 'Capture intake and exhaust readings for dehus.',
    daily_visit_complete: 'Review the visit before leaving.',
    containment_documented: 'Document containment for compliance.',
    antimicrobial_log: 'Log antimicrobial application where required.',
    dry_goal_hit: 'Confirm surfaces are at or below dry goals.',
    equipment_removed: 'Return equipment once the zone is closed.',
    final_walkthrough: 'Complete final review and closeout.'
  };

  window.DLP_TASK_PURPOSE = {
    source_of_loss: 'Locks down what caused the loss so the file reads clearly later.',
    room_inventory: 'Creates the stable room list used by photos, work logs, and reports.',
    define_zones: 'Groups affected areas into drying volumes for readings and equipment.',
    define_surfaces: 'Identifies what is wet and what dry target applies.',
    define_reading_points: 'Makes readings repeatable across visits.',
    equipment_placed: 'Connects equipment to the drying record.',
    moisture_readings: 'Builds the trend that proves drying progress.',
    dehu_performance: 'Shows whether equipment is actually removing moisture.',
    daily_visit_complete: 'Creates a complete daily record.'
  };

  window.DLP_CAD_TOOLS = [
    { id: 'select', icon: 'SEL', label: 'Select' },
    { id: 'pan', icon: 'PAN', label: 'Pan' },
    { id: 'wall', icon: 'WALL', label: 'Wall' },
    { id: 'room', icon: 'ROOM', label: 'Room' },
    { id: 'door', icon: 'DOOR', label: 'Door' },
    { id: 'window', icon: 'WIN', label: 'Window' },
    { id: 'opening', icon: 'OPEN', label: 'Opening' },
    { id: 'connector', icon: 'CONN', label: 'Connector' },
    { id: 'water', icon: 'WET', label: 'Wet Area' },
    { id: 'text', icon: 'TXT', label: 'Text' },
    { id: 'air_mover', icon: 'AM', label: 'Air Mover' },
    { id: 'dehu', icon: 'DH', label: 'Dehu' },
    { id: 'air_scrubber', icon: 'AS', label: 'Scrubber' },
    { id: 'point', icon: 'PT', label: 'Reading Point' }
  ];

  window.el = function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key === 'class') node.className = value;
      else if (key === 'style') node.setAttribute('style', value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child == null) continue;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  window.sv = function sv(tag, attrs, ...children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    attrs = attrs || {};
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      node.setAttribute(key, String(value));
    }
    for (const child of children.flat()) {
      if (child == null) continue;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  window.clear = function clear() {
    rootEl.innerHTML = '';
  };

  window.enableInactivity = function enableInactivity() {};
  window.resetInactivity = function resetInactivity() {};

  window.tcLiveSet = function tcLiveSet(state, title) {
    document.title = title ? title + ' - DryLog PRO' : 'DryLog PRO';
    window.__drylogLiveState = state || {};
  };

  window.buildTopbar = function buildTopbar(label, onBack) {
    const bar = el('div', { class: 'shell-topbar' });
    const back = el('button', { type: 'button' }, label || 'Back');
    back.addEventListener('click', () => {
      if (typeof onBack === 'function') onBack();
      else renderActionPicker();
    });
    const title = el('div', { class: 'shell-topbar-title' }, selectedJob ? (selectedJob.customer || 'DryLog PRO') : 'DryLog PRO');
    const status = el('div', { class: 'shell-status' },
      el('i', { class: 'shell-dot' + (navigator.onLine ? '' : ' offline') }),
      el('span', {}, navigator.onLine ? 'Online' : 'Offline')
    );
    bar.append(back, title, status);
    return bar;
  };

  async function request(path, options) {
    const headers = Object.assign({ 'Accept': 'application/json' }, options && options.headers ? options.headers : {});
    if (!(options && options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const resp = await fetch(API + path, Object.assign({}, options, { headers }));
    const data = await window._tcApiRead(resp);
    if (!resp.ok || data.ok === false || data.success === false) {
      throw new Error(data.error || data.message || ('HTTP ' + resp.status));
    }
    return Object.prototype.hasOwnProperty.call(data, 'data') ? data.data : data;
  }

  window._tcApiRead = async function _tcApiRead(resp) {
    const text = await resp.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch (err) { return { ok: false, error: text.slice(0, 500) }; }
  };

  window.apiGet = (path) => request(path, { method: 'GET' });
  window.apiPost = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) });
  window.apiPut = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) });
  window.apiDelete = (path) => request(path, { method: 'DELETE' });
  window.apiPostOrQueue = async function apiPostOrQueue(path, body, label) {
    try {
      return await window.apiPost(path, body);
    } catch (error) {
      if (!window.tcIsNetworkError(error)) throw error;
      window.tcQueueAdd({
        kind: 'api_post',
        label: label || ('POST ' + path),
        path,
        body: body || {},
        attempts: 0,
        last_error: null
      });
      return { __queued: true };
    }
  };

  window.tcQueueRead = function tcQueueRead() {
    try { return JSON.parse(localStorage.getItem('drylog_queue') || '[]'); }
    catch (e) { return []; }
  };

  window.tcQueueWrite = function tcQueueWrite(items) {
    localStorage.setItem('drylog_queue', JSON.stringify(Array.isArray(items) ? items : []));
  };

  window.tcQueueAdd = function tcQueueAdd(item) {
    const q = tcQueueRead();
    q.push(Object.assign({
      id: 'q_' + Date.now() + '_' + Math.random().toString(16).slice(2),
      queued_at: new Date().toISOString()
    }, item));
    tcQueueWrite(q);
  };

  window.tcCompressFile = async function tcCompressFile(file) {
    return file;
  };

  window.tcIsNetworkError = function tcIsNetworkError(error) {
    return !navigator.onLine || /network|fetch/i.test(String(error && error.message || error));
  };

  window.tcFileToDataUrl = function tcFileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  window.tcPhotoNewId = () => 'photo_' + Date.now() + '_' + Math.random().toString(16).slice(2);
  window.tcPhotoPut = async function tcPhotoPut(id, dataUrl) {
    localStorage.setItem('drylog_photo_' + id, dataUrl);
  };
  window.tcPhotoSrc = async function tcPhotoSrc(id) {
    return localStorage.getItem('drylog_photo_' + id);
  };

  window.tcToast = function tcToast(message, kind) {
    const toast = el('div', { class: 'toast ' + (kind || 'info') }, message);
    toastRoot.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  };

  window.tcScanBarcode = function tcScanBarcode(callback) {
    const code = prompt('Enter asset tag or QR code');
    if (code && callback) callback(code);
  };

  window.renderActionPicker = function renderActionPicker() {
    clear();
    root.appendChild(buildTopbar('Jobs', null));
    const screen = el('div', { class: 'screen' });
    screen.appendChild(el('div', { class: 'shell-hero' },
      el('div', { class: 'kicker' }, 'Field Console'),
      el('div', { class: 'h1' }, 'DryLog PRO'),
      el('div', { class: 'sub', style: 'color:#d9e4e8;' }, 'Pick a claim, then document the dry-out from setup through final closeout.')
    ));

    const list = el('div', { class: 'shell-job-grid' });
    const loading = el('div', { class: 'dlp-empty' }, 'Loading claims...');
    screen.appendChild(loading);
    screen.appendChild(list);

    const panel = buildCreateJobPanel();
    screen.appendChild(panel);
    root.appendChild(screen);

    apiGet('/jobs?status=open').then((jobs) => {
      loading.remove();
      if (!Array.isArray(jobs) || jobs.length === 0) {
        list.appendChild(el('div', { class: 'dlp-empty' }, 'No open claims yet. Create one below to start building the dry-out record.'));
        return;
      }
      jobs.forEach((job) => list.appendChild(jobCard(job)));
    }).catch((err) => {
      loading.textContent = 'Could not load claims: ' + (err.message || err);
    });
  };

  function jobCard(job) {
    const card = el('button', { type: 'button', class: 'shell-card' },
      el('div', { class: 'shell-card-title' }, job.customer || ('Claim #' + job.id)),
      el('div', { class: 'shell-card-meta' }, [
        job.claim_no ? 'Claim ' + job.claim_no : null,
        job.address,
        job.loss_type
      ].filter(Boolean).join(' | ') || 'DryLog claim')
    );
    card.addEventListener('click', () => {
      window.selectedJob = {
        job_id: job.id,
        customer: job.customer,
        address: job.address,
        claim_no: job.claim_no
      };
      window.__dlpVisitId = null;
      renderDrylogPro();
    });
    return card;
  }

  function buildCreateJobPanel() {
    const panel = el('div', { class: 'shell-panel' });
    panel.appendChild(el('div', { class: 'dlp-section-h', style: 'margin-top:0;' }, 'New claim'));
    const grid = el('div', { class: 'shell-form-grid' });
    const customer = el('input', { class: 'shell-input', placeholder: 'Customer' });
    const address = el('input', { class: 'shell-input', placeholder: 'Address' });
    const claim = el('input', { class: 'shell-input', placeholder: 'Claim number' });
    const loss = el('input', { class: 'shell-input', placeholder: 'Loss type' });
    grid.append(customer, address, claim, loss);
    const actions = el('div', { class: 'shell-actions' });
    const create = el('button', { type: 'button', class: 'shell-primary' }, 'Create Claim');
    create.addEventListener('click', async () => {
      create.disabled = true;
      try {
        const job = await apiPost('/jobs', {
          customer: customer.value.trim() || 'New DryLog Claim',
          address: address.value.trim() || null,
          claim_no: claim.value.trim() || null,
          loss_type: loss.value.trim() || 'Water mitigation'
        });
        selectedJob = { job_id: job.id, customer: job.customer, address: job.address, claim_no: job.claim_no };
        __dlpVisitId = null;
        renderDrylogPro();
      } catch (err) {
        tcToast('Create failed: ' + (err.message || err), 'error');
        create.disabled = false;
      }
    });
    const byId = el('button', { type: 'button', class: 'shell-secondary' }, 'Open by ID');
    byId.addEventListener('click', async () => {
      const id = prompt('Claim/job ID');
      if (!id) return;
      try {
        const job = await apiGet('/jobs/' + encodeURIComponent(id));
        selectedJob = { job_id: job.id, customer: job.customer, address: job.address, claim_no: job.claim_no };
        __dlpVisitId = null;
        renderDrylogPro();
      } catch (err) {
        tcToast('Open failed: ' + (err.message || err), 'error');
      }
    });
    actions.append(create, byId);
    panel.append(grid, actions);
    return panel;
  }

  window.addEventListener('online', () => tcToast('Back online', 'info'));
  window.addEventListener('offline', () => tcToast('Offline mode', 'info'));
  document.addEventListener('DOMContentLoaded', () => renderActionPicker());
})();
