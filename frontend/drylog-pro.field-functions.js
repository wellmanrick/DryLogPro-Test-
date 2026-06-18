// ============================================================================
// DryLog PRO — extracted frontend functions  (SNAPSHOT)
// Source: frontend/field.html  ·  Total Contracting TotalOps
// Generated: 2026-06-16 15:27 UTC
//
// This is an ARCHIVE EXTRACT, not a runnable module. These functions are the
// DryLog PRO surface lifted verbatim from the field app. They depend on the
// field app's shared plumbing (NOT included here):
//   el(), clear(), root, screen helpers, buildTopbar(), enableInactivity(),
//   resetInactivity(), apiGet()/apiPost(), tcLiveSet(), tcUploadEntityPhoto(),
//   the offline queue, selectedJob/myDay globals, and the service worker.
// Entry point: renderDrylogPro()  (the 6-tile dashboard).
// 80 functions extracted.
// ============================================================================


async function renderDrylogPro(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO');
  root.appendChild(buildTopbar('← Back', renderActionPicker, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);

  // ── Hero ─────────────────────────────────────────────────────────────────
  // Source-of-loss line gets populated below once jobMeta arrives — start
  // with placeholder so the hero doesn't re-flow on data load.
  const heroSourceEl = el('div',{style:'font-size:11px;color:#bae6fd;margin-top:4px;display:none;'});
  screen.appendChild(el('div',{class:'dlp-hero-banner'},
    el('div',{class:'icon'},'💧'),
    el('div',{class:'text'},
      el('div',{class:'title'}, selectedJob.customer || ('Claim #'+claim_id)),
      el('div',{class:'sub'}, [selectedJob.claim_no?'Claim '+selectedJob.claim_no:null, selectedJob.address].filter(Boolean).join(' · ') || 'DryLog PRO'),
      heroSourceEl
    )
  ));

  // Loading placeholder
  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  // ── Parallel fetch: tasks, zones, alerts, equipment, latest atmos ───────
  let tasks=[], zones=[], alertsOpen=[], deploys=[], atmosLatest=null, moistureLatest=null, moistureAll=[], jobMeta=null, photos=[], workItems=[], standards=[];
  try {
    const [t, z, a, d, atm, moi, jm, ph, wl, ms] = await Promise.all([
      apiGet(`/claim-tasks?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/drying-zones?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/alerts?claim_id=${claim_id}&state=open`).catch(()=>[]),
      apiGet(`/equipment-deploys?job_id=${claim_id}&active=1`).catch(()=>[]),
      apiGet(`/readings/zone-atmosphere?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/moisture?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/jobs/${claim_id}`).catch(()=>null),
      apiGet(`/entity-attachments?entity_type=visit&claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/room-work-items?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/claim-material-standards?claim_id=${claim_id}`).catch(()=>[]),
    ]);
    tasks = Array.isArray(t)?t:[];
    zones = Array.isArray(z)?z:[];
    alertsOpen = Array.isArray(a)?a:[];
    deploys = Array.isArray(d)?d:[];
    atmosLatest = (Array.isArray(atm) && atm.length>0) ? atm[0] : null;
    moistureAll = Array.isArray(moi) ? moi : [];
    moistureLatest = moistureAll.length > 0 ? moistureAll[0] : null;
    jobMeta = jm || null;
    photos = Array.isArray(ph) ? ph : [];
    workItems = Array.isArray(wl) ? wl : [];
    standards = Array.isArray(ms) ? ms : [];
  } catch(e) {}

  // Populate the hero source-of-loss line if the claim has it on file.
  if (jobMeta && jobMeta.source_of_loss) {
    heroSourceEl.textContent = '🩹 Source: ' + jobMeta.source_of_loss;
    heroSourceEl.style.display = 'block';
  }
  __dlpTasks = tasks; __dlpZones = zones; __dlpActiveDeploys = deploys; __dlpAlertsOpen = alertsOpen;

  loading.remove();

  // ── No tasks yet → seed wizard ───────────────────────────────────────────
  if (tasks.length === 0) {
    screen.appendChild(el('div',{class:'dlp-section-h'},'Start here'));
    const setup = el('div',{class:'dlp-empty'});
    setup.appendChild(el('div',{style:'font-weight:700;color:#0f172a;font-size:14px;margin-bottom:6px;'},'No task list yet'));
    setup.appendChild(el('div',{style:'margin-bottom:14px;'},'Pick the Category of Water to seed the standard task list for this dry-out.'));
    const grid = el('div',{class:'dlp-cat-pick'});
    for (const cat of [['cat1','Cat 1','Clean water'],['cat2','Cat 2','Greywater'],['cat3','Cat 3','Blackwater']]) {
      const b = el('button',{},
        el('div',{style:'font-size:14px;'},cat[1]),
        el('div',{style:'font-size:10px;color:#94a3b8;font-weight:500;margin-top:3px;'},cat[2])
      );
      b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = 'Seeding…';
        try {
          await apiPost(`/claim-tasks/seed`, {claim_id, template: cat[0]});
        } catch(e) {
          alert('Seed failed: ' + (e.message || e));
          renderDrylogPro(); return;
        }
        renderDrylogPro();
      });
      grid.appendChild(b);
    }
    setup.appendChild(grid);
    const buildBtn = el('button', { type: 'button', class: 'dlp-build-primary', style: 'margin-top:10px;' }, 'Open Buildout Workspace');
    buildBtn.addEventListener('click', renderDlpBuildoutStudio);
    setup.appendChild(buildBtn);
    screen.appendChild(setup);
    return;
  }

  // ── Next available task CTA ──────────────────────────────────────────────
  screen.appendChild(buildDlpCommandScreen({
    claim_id,
    tasks,
    zones,
    alertsOpen,
    deploys,
    atmosLatest,
    moistureAll,
    photos,
    workItems,
    standards,
    jobMeta,
  }));
  return;

  const next = tasks.find(t => t.state === 'available' || t.state === 'in_progress');
  if (next) {
    const cta = el('div',{class:'dlp-next-cta'},
      el('div',{class:'icon'},'▶️'),
      el('div',{class:'text'},
        el('div',{class:'lbl'},'Next task'),
        el('div',{class:'name'}, next.name),
        DLP_TASK_HINTS[next.code] ? el('div',{style:'font-size:11px;color:#475569;margin-top:3px;line-height:1.4;'}, DLP_TASK_HINTS[next.code]) : null
      ),
      (() => {
        const b = el('button',{},'Open');
        b.addEventListener('click', () => renderDlpTaskList(next.code));
        return b;
      })()
    );
    screen.appendChild(cta);
  } else {
    // All done!
    screen.appendChild(el('div',{class:'dlp-empty',style:'background:#dcfce7;border-color:#86efac;color:#166534;'},
      '✓ All tasks complete or skipped — generate the final report or close zones from the office app.'));
  }

  // ── Start Daily Visit (F18.7g) ───────────────────────────────────────────
  // Big primary action — wraps the routine "capture today's readings" walk
  // into a guided wizard so the tech doesn't have to navigate themselves.
  if (zones.length > 0) {
    const dvBtn = el('button',{class:'action-tile',style:'background:#dbeafe;border-color:#3b82f6;margin-bottom:14px;'},
      el('div',{class:'icon'},'🧭'),
      el('div',{class:'text'},
        el('div',{class:'title',style:'color:#1d4ed8;'},'Start Daily Visit'),
        el('div',{class:'desc',style:'color:#1e40af;'},'Guided walk-through · outdoor baseline → each chamber → done')
      )
    );
    dvBtn.addEventListener('click', () => renderDlpDailyVisitWizard());
    screen.appendChild(dvBtn);
  }

  // ── Chamber cards (promoted from Summary tab so they're a primary nav) ──
  // Bucket alerts + equipment + last-reading per zone client-side so each
  // card can render its own status pill + counts without N extra round-trips.
  if (zones.length > 0) {
    const alertsByZone = {};
    for (const a of alertsOpen) {
      const zid = parseInt(a.drying_zone_id || a.zone_id || 0, 10);
      if (!zid) continue;
      (alertsByZone[zid] = alertsByZone[zid] || []).push(a);
    }
    const deploysByZone = {};
    for (const d of deploys) {
      const zid = parseInt(d.drying_zone_id || 0, 10);
      if (!zid) continue;
      deploysByZone[zid] = (deploysByZone[zid] || 0) + 1;
    }
    const lastMoiByZone = {};
    for (const m of moistureAll) {
      const zid = parseInt(m.drying_zone_id || 0, 10);
      if (!zid) continue;
      if (!lastMoiByZone[zid] || (m.reading_at && m.reading_at > lastMoiByZone[zid])) {
        lastMoiByZone[zid] = m.reading_at;
      }
    }
    function relTime(ts){
      if (!ts) return null;
      const d = new Date(ts.replace(' ','T') + 'Z').getTime();
      if (!d) return null;
      const mins = Math.max(0, Math.floor((Date.now() - d) / 60000));
      if (mins < 60)        return mins + 'm ago';
      if (mins < 60*24)     return Math.floor(mins/60) + 'h ago';
      return Math.floor(mins/(60*24)) + 'd ago';
    }

    screen.appendChild(el('div',{class:'dlp-section-h'},'Chambers'));
    const chWrap = el('div',{style:'display:flex;flex-direction:column;gap:8px;margin-bottom:14px;'});
    for (const z of zones) {
      const zAlerts  = alertsByZone[z.id] || [];
      const zCrit    = zAlerts.filter(a => a.severity === 'critical').length;
      const zWarn    = zAlerts.filter(a => a.severity === 'warning').length;
      const zEq      = deploysByZone[z.id] || 0;
      const zLast    = lastMoiByZone[z.id];

      // Status pill — derived from open alerts + closed flag + activity. We
      // intentionally don't try to distinguish "Stable" vs "Drying" since the
      // signal is fuzzy at this stage — every active chamber is "Drying."
      let pillIcon = '🟡', pillText = 'Drying', pillBg = '#fef3c7', pillFg = '#92400e';
      if (z.is_closed) {
        pillIcon = '✅'; pillText = 'Closed'; pillBg = '#dcfce7'; pillFg = '#166534';
      } else if (zCrit > 0) {
        pillIcon = '⚠';  pillText = 'Alert';  pillBg = '#fee2e2'; pillFg = '#991b1b';
      } else if (zWarn > 0) {
        pillIcon = '⚠';  pillText = 'Watch';  pillBg = '#fef3c7'; pillFg = '#92400e';
      } else if (zEq === 0) {
        pillIcon = '🟢'; pillText = 'New';    pillBg = '#dcfce7'; pillFg = '#166534';
      }

      const card = el('button',{style:'width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:11px 13px;display:flex;flex-direction:column;gap:6px;cursor:pointer;'});
      const row1 = el('div',{style:'display:flex;align-items:center;gap:8px;'});
      row1.appendChild(el('div',{style:'flex:1;min-width:0;font-size:14px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}, z.name || ('Chamber '+z.id)));
      row1.appendChild(el('span',{style:`font-size:11px;padding:3px 8px;background:${pillBg};color:${pillFg};border-radius:5px;font-weight:700;letter-spacing:0.02em;`}, pillIcon + ' ' + pillText));
      if (z.category_of_water) {
        row1.appendChild(el('span',{style:'font-size:10px;padding:2px 6px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-weight:700;'}, 'CAT ' + z.category_of_water));
      }
      row1.appendChild(el('span',{style:'font-size:14px;color:#94a3b8;'},'›'));
      card.appendChild(row1);

      const metaBits = [];
      if (zEq > 0)         metaBits.push(zEq + ' equipment');
      if (zAlerts.length)  metaBits.push(zAlerts.length + ' alert' + (zAlerts.length === 1 ? '' : 's'));
      const lastTxt = relTime(zLast);
      if (lastTxt)         metaBits.push('last reading ' + lastTxt);
      if (metaBits.length === 0) metaBits.push('No readings yet');
      card.appendChild(el('div',{style:'font-size:11px;color:#64748b;'}, metaBits.join(' · ')));

      card.addEventListener('click', () => renderDlpZoneDetail(z.id));
      chWrap.appendChild(card);
    }
    screen.appendChild(chWrap);
  }

  // ── 6-tile dashboard ─────────────────────────────────────────────────────
  const grid = el('div',{class:'dlp-grid'});

  // Tasks tile
  const tasksDone = tasks.filter(t => t.state==='complete'||t.state==='skipped').length;
  const tasksTotal = tasks.length;
  grid.appendChild(buildDlpTile({
    icon:'✅', name:'Tasks',
    stat: `${tasksDone} / ${tasksTotal}`,
    desc: tasksDone === tasksTotal ? 'All done' : `${tasksTotal - tasksDone} remaining`,
    badge: tasksDone === tasksTotal ? {text:'DONE', cls:'ok'} : null,
    onClick: () => renderDlpTaskList(null),
  }));

  // Alerts tile
  const critCount = alertsOpen.filter(a => a.severity === 'critical').length;
  const warnCount = alertsOpen.filter(a => a.severity === 'warning').length;
  grid.appendChild(buildDlpTile({
    icon:'🚨', name:'Alerts',
    stat: String(alertsOpen.length),
    desc: critCount > 0 ? `${critCount} critical` : warnCount > 0 ? `${warnCount} warning` : 'No open alerts',
    badge: critCount > 0 ? {text:'!', cls:'crit'} : warnCount > 0 ? {text:'·', cls:'warn'} : null,
    onClick: () => renderDlpAlertsList(),
  }));

  // Atmosphere tile
  const atmosLabel = atmosLatest
    ? `${Number(atmosLatest.temp_f).toFixed(0)}°F / ${Number(atmosLatest.rh_pct).toFixed(0)}% · ${atmosLatest.gpp ? Number(atmosLatest.gpp).toFixed(0)+' gpp' : '—'}`
    : 'No reading yet';
  grid.appendChild(buildDlpTile({
    icon:'🌡️', name:'Atmosphere',
    stat: atmosLatest ? 'Last' : '—',
    desc: atmosLabel,
    onClick: () => renderDlpAtmosphereList(),
  }));

  // Setup tile (rooms + chambers + surfaces + reading points)
  grid.appendChild(buildDlpTile({
    icon:'📐', name:'Setup',
    stat: String(zones.length),
    desc: zones.length === 1 ? '1 drying chamber' : `${zones.length} drying chambers`,
    onClick: () => renderDlpSurfacesList(),
  }));

  // Equipment tile
  const byType = {};
  for (const d of deploys) {
    const t = (d.type || 'Equipment').toString();
    byType[t] = (byType[t]||0)+1;
  }
  const eqLabel = Object.keys(byType).length === 0
    ? 'None on site'
    : Object.entries(byType).map(([t,c])=>`${c} ${t}`).join(' · ');
  grid.appendChild(buildDlpTile({
    icon:'⚙️', name:'Equipment',
    stat: String(deploys.length),
    desc: eqLabel,
    onClick: () => renderDlpEquipmentList(),
  }));

  // Summary tile (overall progress)
  const sumPct = tasksTotal > 0 ? Math.round((tasksDone/tasksTotal)*100) : 0;
  grid.appendChild(buildDlpTile({
    icon:'📊', name:'Summary',
    stat: `${sumPct}%`,
    desc: 'Task progress',
    onClick: () => renderDlpSummary(),
  }));

  // Photos tile — always available (even with 0 chambers) so a tech can snap
  // arrival / source-of-loss photos on day one. Opens the room-bucketed Photos
  // screen.
  const photoCount = photos.filter(p => /^image\//.test(String(p.mime_type||'')) || /\.(jpe?g|png|gif|webp|heic)$/i.test(String(p.original_name||''))).length;
  grid.appendChild(buildDlpTile({
    icon:'📷', name:'Photos',
    stat: String(photoCount),
    desc: photoCount === 0 ? 'Add on arrival' : 'Arrival + by room',
    onClick: () => renderDlpPhotos(),
  }));

  // Work Log tile — per-room demo / consumables / notes the crew performed.
  grid.appendChild(buildDlpTile({
    icon:'🧰', name:'Work Log',
    stat: String(workItems.length),
    desc: workItems.length === 0 ? 'Log demo & consumables' : 'Demo · consumables · notes',
    onClick: () => renderDlpWorkLog(),
  }));

  // Dry Goals tile — property-wide dry standards per material.
  const goalsSet = standards.filter(s => s.dry_goal != null).length;
  grid.appendChild(buildDlpTile({
    icon:'🎯', name:'Dry Goals',
    stat: String(goalsSet),
    desc: goalsSet ? 'Per-material targets' : 'Set per-material targets',
    onClick: () => renderDlpDryGoals(),
  }));

  screen.appendChild(grid);
}


function buildDlpCommandScreen(ctx) {
  const tasks = ctx.tasks || [];
  const zones = ctx.zones || [];
  const alertsOpen = ctx.alertsOpen || [];
  const deploys = ctx.deploys || [];
  const moistureAll = ctx.moistureAll || [];
  const photos = ctx.photos || [];
  const workItems = ctx.workItems || [];
  const standards = ctx.standards || [];
  const next = tasks.find(t => t.state === 'available' || t.state === 'in_progress');
  const tasksDone = tasks.filter(t => t.state === 'complete' || t.state === 'skipped').length;
  const tasksTotal = tasks.length;
  const taskPct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  const photoCount = photos.filter(p => /^image\//.test(String(p.mime_type || '')) || /\.(jpe?g|png|gif|webp|heic)$/i.test(String(p.original_name || ''))).length;
  const goalsSet = standards.filter(s => s.dry_goal != null).length;
  const openZones = zones.filter(z => !z.is_closed).length;
  const critCount = alertsOpen.filter(a => a.severity === 'critical').length;
  const warnCount = alertsOpen.filter(a => a.severity === 'warning').length;

  const wrap = el('div', { class: 'dlp-command' });
  const primary = el('section', { class: 'dlp-command-primary' });
  const eyebrow = el('div', { class: 'dlp-command-eyebrow' }, 'Today on site');
  const title = el('div', { class: 'dlp-command-title' }, next ? next.name : 'Ready for review');
  const hint = el('div', { class: 'dlp-command-hint' },
    next && DLP_TASK_HINTS[next.code]
      ? DLP_TASK_HINTS[next.code]
      : 'All required tasks are complete or skipped. Review documentation before closeout.'
  );
  const mainAction = el('button', { class: 'dlp-command-main' }, zones.length > 0 ? 'Continue Daily Visit' : 'Finish Setup');
  mainAction.addEventListener('click', () => {
    if (zones.length > 0) renderDlpDailyVisitWizard();
    else if (next) renderDlpTaskList(next.code);
    else renderDlpDryingProgress();
  });
  const secondary = el('div', { class: 'dlp-command-actions' },
    dlpCommandButton('Buildout', zones.length + ' rooms/zones', renderDlpBuildoutStudio),
    dlpCommandButton('Photos', 'Capture', renderDlpPhotos),
    dlpCommandButton('Readings', 'Trends', renderDlpDryingProgress),
    dlpCommandButton('Sketch', 'CAD', () => zones.length ? renderDlpCadSketch(zones[0].id) : renderDlpSurfacesList()),
    dlpCommandButton('Equipment', String(deploys.length), renderDlpEquipmentList),
    dlpCommandButton('Report', taskPct + '%', renderDlpReportReview),
    dlpCommandButton('Share', 'Preview', renderDlpSharePreview)
  );
  primary.append(eyebrow, title, hint, mainAction, secondary);

  const metrics = el('section', { class: 'dlp-command-metrics' },
    dlpMetric('Task progress', taskPct + '%', tasksDone + ' of ' + tasksTotal, taskPct),
    dlpMetric('Open chambers', String(openZones), zones.length + ' total', zones.length ? Math.round((openZones / zones.length) * 100) : 0),
    dlpMetric('Photos', String(photoCount), photoCount ? 'Filed to visit' : 'Need arrival photos', Math.min(100, photoCount * 18)),
    dlpMetric('Dry goals', String(goalsSet), goalsSet ? 'Standards set' : 'Missing targets', goalsSet ? 100 : 0)
  );

  const body = el('div', { class: 'dlp-command-body' });
  const left = el('section', { class: 'dlp-command-panel dlp-command-zones' });
  left.appendChild(dlpPanelHeader('Chambers', zones.length ? openZones + ' active' : 'Setup needed', renderDlpSurfacesList));
  if (zones.length === 0) {
    left.appendChild(el('div', { class: 'dlp-command-empty' }, 'Build chambers before readings and equipment can be tied to the dry-out record.'));
  } else {
    const deploysByZone = {};
    for (const d of deploys) {
      const zid = parseInt(d.drying_zone_id || 0, 10);
      if (zid) deploysByZone[zid] = (deploysByZone[zid] || 0) + 1;
    }
    const alertsByZone = {};
    for (const a of alertsOpen) {
      const zid = parseInt(a.drying_zone_id || a.zone_id || 0, 10);
      if (zid) (alertsByZone[zid] = alertsByZone[zid] || []).push(a);
    }
    const latestByZone = {};
    for (const m of moistureAll) {
      const zid = parseInt(m.drying_zone_id || 0, 10);
      if (!zid) continue;
      if (!latestByZone[zid] || String(m.reading_at || '') > String(latestByZone[zid].reading_at || '')) latestByZone[zid] = m;
    }
    zones.slice(0, 5).forEach(z => {
      const zAlerts = alertsByZone[z.id] || [];
      const state = z.is_closed ? 'Closed' : zAlerts.length ? 'Needs review' : deploysByZone[z.id] ? 'Drying' : 'Setup';
      const row = el('button', { class: 'dlp-zone-row' },
        el('div', { class: 'dlp-zone-main' },
          el('div', { class: 'dlp-zone-name' }, z.name || ('Chamber ' + z.id)),
          el('div', { class: 'dlp-zone-meta' }, [
            deploysByZone[z.id] ? deploysByZone[z.id] + ' equipment' : 'No equipment',
            latestByZone[z.id] ? 'reading logged' : 'no moisture reading',
            z.category_of_water ? 'CAT ' + z.category_of_water : null
          ].filter(Boolean).join(' | '))
        ),
        el('span', { class: 'dlp-zone-state ' + state.toLowerCase().replace(/\s+/g, '-') }, state)
      );
      row.addEventListener('click', () => renderDlpZoneDetail(z.id));
      left.appendChild(row);
    });
  }

  const right = el('section', { class: 'dlp-command-panel' });
  right.appendChild(dlpPanelHeader('File readiness', critCount ? critCount + ' critical' : warnCount ? warnCount + ' warning' : 'No blockers', renderDlpDryingProgress));
  right.appendChild(dlpChecklistItem(alertsOpen.length === 0, 'Resolve open alerts', alertsOpen.length ? alertsOpen.length + ' open' : 'clear'));
  right.appendChild(dlpChecklistItem(photoCount > 0, 'Arrival/source photos', photoCount ? photoCount + ' photos' : 'missing'));
  right.appendChild(dlpChecklistItem(goalsSet > 0, 'Dry standards set', goalsSet ? goalsSet + ' goals' : 'missing'));
  right.appendChild(dlpChecklistItem(workItems.length > 0, 'Work log started', workItems.length ? workItems.length + ' entries' : 'empty'));
  right.appendChild(dlpChecklistItem(deploys.length > 0, 'Equipment documented', deploys.length ? deploys.length + ' active' : 'none'));

  const lower = el('div', { class: 'dlp-command-lower' });
  const queue = el('section', { class: 'dlp-command-panel' });
  queue.appendChild(dlpPanelHeader('Next queue', next ? 'Action required' : 'Ready', () => renderDlpTaskList(next ? next.code : null)));
  const queueTasks = tasks
    .filter(t => t.state === 'available' || t.state === 'in_progress' || t.state === 'locked')
    .slice(0, 4);
  if (queueTasks.length === 0) {
    queue.appendChild(el('div', { class: 'dlp-command-empty' }, 'No remaining field tasks. Move into review and closeout.'));
  } else {
    queueTasks.forEach(t => queue.appendChild(dlpQueueRow(t)));
  }

  const photoPanel = el('section', { class: 'dlp-command-panel dlp-photo-panel' });
  photoPanel.appendChild(dlpPanelHeader('Recent photos', photoCount ? photoCount + ' captured' : 'None yet', renderDlpPhotos));
  const recentPhotos = photos
    .filter(p => /^image\//.test(String(p.mime_type || '')) || /\.(jpe?g|png|gif|webp|svg|heic)$/i.test(String(p.original_name || p.file_url || '')))
    .slice(0, 4);
  if (recentPhotos.length === 0) {
    photoPanel.appendChild(el('button', { class: 'dlp-photo-empty', type: 'button' }, 'Add arrival and source photos'));
    photoPanel.querySelector('button.dlp-photo-empty').addEventListener('click', renderDlpPhotos);
  } else {
    const strip = el('div', { class: 'dlp-photo-strip' });
    recentPhotos.forEach(p => {
      const tile = el('button', { class: 'dlp-photo-thumb', type: 'button' },
        el('img', { src: p.file_url || 'mock-photo.svg', alt: p.caption || p.original_name || 'Job photo' }),
        el('span', {}, p.caption || 'Job photo')
      );
      tile.addEventListener('click', renderDlpPhotos);
      strip.appendChild(tile);
    });
    photoPanel.appendChild(strip);
  }

  const bottom = el('nav', { class: 'dlp-bottom-actions' },
    dlpBottomAction('Build', renderDlpBuildoutStudio),
    dlpBottomAction('Camera', renderDlpPhotos),
    dlpBottomAction('Readings', renderDlpDryingProgress),
    dlpBottomAction('Sketch', () => zones.length ? renderDlpCadSketch(zones[0].id) : renderDlpSurfacesList()),
    dlpBottomAction('Report', renderDlpReportReview),
    dlpBottomAction('Share', renderDlpSharePreview)
  );

  body.append(left, right);
  lower.append(queue, photoPanel);
  wrap.append(primary, metrics, body, lower, bottom);
  return wrap;
}

async function renderDlpBuildoutStudio() {
  clear(); enableInactivity();
  tcLiveSet({ current_screen: 'drylog-pro/buildout', current_job_id: selectedJob?.job_id || null }, 'DryLog PRO - Buildout');
  root.appendChild(buildTopbar('Dashboard', renderDrylogPro, { showClockLink: true }));

  const claim_id = selectedJob.job_id;
  const screen = el('div', { class: 'screen dlp-buildout' });
  screen.addEventListener('click', resetInactivity);
  const loading = el('div', { class: 'dlp-empty' }, 'Loading buildout workspace...');
  screen.appendChild(loading);
  root.appendChild(screen);

  let job = null, rooms = [], zones = [], standards = [], equipment = [], deploys = [], photos = [], workItems = [];
  try {
    [job, rooms, zones, standards, equipment, deploys, photos, workItems] = await Promise.all([
      apiGet(`/jobs/${claim_id}`).catch(() => null),
      apiGet(`/claim-rooms?claim_id=${claim_id}`).catch(() => []),
      apiGet(`/drying-zones?claim_id=${claim_id}&include_closed=1`).catch(() => []),
      apiGet(`/claim-material-standards?claim_id=${claim_id}`).catch(() => []),
      apiGet('/equipment').catch(() => []),
      apiGet(`/equipment-deploys?job_id=${claim_id}`).catch(() => []),
      apiGet(`/entity-attachments?entity_type=visit&claim_id=${claim_id}`).catch(() => []),
      apiGet(`/room-work-items?claim_id=${claim_id}`).catch(() => [])
    ]);
  } catch (err) {
    loading.textContent = 'Could not load buildout: ' + (err.message || err);
    return;
  }

  loading.remove();
  const openZones = zones.filter(z => !z.is_closed);
  const activeDeploys = deploys.filter(d => !d.returned_at);
  const draft = dlpReadLocalDraft(claim_id);

  screen.appendChild(el('section', { class: 'dlp-build-hero' },
    el('div', {},
      el('div', { class: 'dlp-build-kicker' }, 'Pre-database workspace'),
      el('h1', {}, job?.customer || selectedJob.customer || 'DryLog claim'),
      el('p', {}, 'Build the field file now: rooms, chambers, dry goals, reading points, equipment sizing, photo buckets, and QA readiness.')
    ),
    el('div', { class: 'dlp-build-score' },
      el('strong', {}, String(dlpBuildoutScore({ rooms, zones, standards, deploys, photos, workItems, draft }))),
      el('span', {}, 'readiness')
    )
  ));

  screen.appendChild(el('section', { class: 'dlp-build-metrics' },
    dlpBuildMetric('Rooms', rooms.length, rooms.length ? 'inventory started' : 'add affected rooms'),
    dlpBuildMetric('Chambers', openZones.length, zones.length + ' total'),
    dlpBuildMetric('Dry goals', standards.length, standards.length ? 'materials mapped' : 'set targets'),
    dlpBuildMetric('Equipment', activeDeploys.length, activeDeploys.length ? 'deployed' : 'size/deploy')
  ));

  const grid = el('div', { class: 'dlp-build-grid' });
  grid.append(
    dlpBuildRoomsPanel(claim_id, rooms),
    dlpBuildZonesPanel(claim_id, rooms, zones),
    await dlpBuildQuickCapturePanel(claim_id, rooms, zones),
    dlpBuildStandardsPanel(claim_id, standards),
    await dlpBuildSurfacesPanel(claim_id, zones),
    dlpBuildEquipmentPanel(claim_id, rooms, zones, equipment, activeDeploys),
    dlpBuildShotListPanel(rooms, zones, photos),
    dlpBuildQaPanel(claim_id, { rooms, zones, standards, deploys: activeDeploys, photos, workItems, draft })
  );
  screen.appendChild(grid);

  const footer = el('section', { class: 'dlp-build-footer' },
    dlpBuildFooterButton('Open Photos', renderDlpPhotos),
    dlpBuildFooterButton('Open Sketch', () => zones.length ? renderDlpCadSketch(zones[0].id) : renderDlpSurfacesList()),
    dlpBuildFooterButton('Open Report', renderDlpReportReview),
    dlpBuildFooterButton('Share Preview', renderDlpSharePreview)
  );
  screen.appendChild(footer);
}

function dlpBuildMetric(label, value, detail) {
  return el('div', { class: 'dlp-build-metric' },
    el('span', {}, label),
    el('strong', {}, String(value)),
    el('em', {}, detail || '')
  );
}

function dlpBuildPanel(title, note, ...children) {
  return el('section', { class: 'dlp-build-panel' },
    el('div', { class: 'dlp-build-panel-head' },
      el('div', {},
        el('h2', {}, title),
        note ? el('p', {}, note) : null
      )
    ),
    ...children
  );
}

function dlpBuildRoomsPanel(claimId, rooms) {
  const name = el('input', { placeholder: 'Room name' });
  const length = el('input', { type: 'number', min: '1', step: '0.5', placeholder: 'Length ft' });
  const width = el('input', { type: 'number', min: '1', step: '0.5', placeholder: 'Width ft' });
  const height = el('input', { type: 'number', min: '1', step: '0.5', placeholder: 'Height ft', value: '8' });
  const notes = el('textarea', { rows: 2, placeholder: 'Notes, affected walls, access limits' });
  const quick = el('div', { class: 'dlp-build-chip-row' });
  DLP_ROOM_PRESETS.slice(0, 8).forEach(label => {
    const b = el('button', { type: 'button' }, label);
    b.addEventListener('click', () => { name.value = label; });
    quick.appendChild(b);
  });
  const save = el('button', { type: 'button', class: 'dlp-build-primary' }, 'Add room');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await apiPost('/claim-rooms', {
        claim_id: claimId,
        name: name.value.trim() || 'Affected Room',
        length_ft: Number(length.value || 12),
        width_ft: Number(width.value || 10),
        height_ft: Number(height.value || 8),
        notes: notes.value.trim() || null
      });
      tcToast('Room added', 'info');
      renderDlpBuildoutStudio();
    } catch (err) {
      tcToast('Room save failed: ' + (err.message || err), 'error');
      save.disabled = false;
    }
  });
  const list = el('div', { class: 'dlp-build-list' });
  rooms.slice(0, 6).forEach(room => {
    const card = el('button', { type: 'button', class: 'dlp-build-row' },
      el('span', {}, room.name || ('Room ' + room.id)),
      el('em', {}, `${room.length_ft || '?'} x ${room.width_ft || '?'} x ${room.height_ft || 8} ft`)
    );
    card.addEventListener('click', () => renderDlpRoomWorkLog(room));
    list.appendChild(card);
  });
  return dlpBuildPanel('Rooms', 'Affected-area inventory used by photos, work logs, reports, and chamber mapping.',
    quick,
    el('div', { class: 'dlp-build-form four' }, name, length, width, height),
    notes,
    save,
    list
  );
}

function dlpBuildZonesPanel(claimId, rooms, zones) {
  const name = el('input', { placeholder: 'Chamber name' });
  const cat = dlpBuildSelect([['1', 'Category 1'], ['2', 'Category 2'], ['3', 'Category 3']], '2');
  const cls = dlpBuildSelect([['1', 'Class 1'], ['2', 'Class 2'], ['3', 'Class 3'], ['4', 'Class 4']], '2');
  const notes = el('textarea', { rows: 2, placeholder: 'Containment, barriers, pressure, access notes' });
  const roomChecks = el('div', { class: 'dlp-build-check-grid' });
  rooms.forEach(room => {
    const cb = el('input', { type: 'checkbox', value: String(room.id) });
    roomChecks.appendChild(el('label', {}, cb, el('span', {}, room.name || ('Room ' + room.id))));
  });
  const save = el('button', { type: 'button', class: 'dlp-build-primary' }, 'Create chamber');
  save.disabled = rooms.length === 0;
  save.addEventListener('click', async () => {
    const ids = Array.from(roomChecks.querySelectorAll('input:checked')).map(x => Number(x.value));
    save.disabled = true;
    try {
      await apiPost('/drying-zones', {
        claim_id: claimId,
        name: name.value.trim() || 'Drying Chamber',
        claim_room_ids: ids,
        category_of_water: Number(cat.value),
        class_of_water: Number(cls.value),
        containment_notes: notes.value.trim() || null
      });
      tcToast('Chamber created', 'info');
      renderDlpBuildoutStudio();
    } catch (err) {
      tcToast('Chamber save failed: ' + (err.message || err), 'error');
      save.disabled = false;
    }
  });
  const rows = el('div', { class: 'dlp-build-list' });
  zones.slice(0, 5).forEach(zone => {
    const row = el('button', { type: 'button', class: 'dlp-build-row' },
      el('span', {}, zone.name || ('Chamber ' + zone.id)),
      el('em', {}, `CAT ${zone.category_of_water || '-'} | Class ${zone.class_of_water || '-'} | ${(zone.claim_room_ids || []).length} rooms`)
    );
    row.addEventListener('click', () => renderDlpZoneDetail(zone.id));
    rows.appendChild(row);
  });
  return dlpBuildPanel('Chambers', rooms.length ? 'Group rooms into drying volumes for readings, equipment, alerts, and reports.' : 'Add rooms first, then create a chamber.',
    el('div', { class: 'dlp-build-form three' }, name, cat, cls),
    roomChecks,
    notes,
    save,
    rows
  );
}

async function dlpBuildQuickCapturePanel(claimId, rooms, zones) {
  const room = dlpBuildSelect(rooms.map(r => [String(r.id), r.name || ('Room ' + r.id)]), rooms[0]?.id ? String(rooms[0].id) : '');
  const zone = dlpBuildSelect(zones.map(z => [String(z.id), z.name || ('Chamber ' + z.id)]), zones[0]?.id ? String(zones[0].id) : '');
  const photoCaption = el('input', { placeholder: 'Photo caption', value: 'Source area / equipment placement' });
  const workLabel = el('input', { placeholder: 'Work item', value: 'Removed wet baseboard and documented cavity' });
  const temp = el('input', { type: 'number', step: '0.1', placeholder: 'Temp F', value: '74' });
  const rh = el('input', { type: 'number', step: '0.1', placeholder: 'RH %', value: '48' });
  const moisture = el('input', { type: 'number', step: '0.1', placeholder: 'Moisture', value: '18.2' });
  const status = el('div', { class: 'dlp-build-capture-status' }, 'Use these to create realistic demo records fast.');

  const photo = dlpBuildCaptureButton('Add mock photo', async () => {
    const visitId = await _dlpEnsureVisit(claimId);
    await apiPost('/entity-attachments?entity_id=' + encodeURIComponent(visitId), {
      entity_type: 'visit',
      entity_id: visitId,
      caption: photoCaption.value.trim() || 'Job photo',
      claim_room_id: room.value ? Number(room.value) : null,
      file_url: 'mock-photo.svg',
      original_name: 'mock-photo.svg',
      mime_type: 'image/svg+xml'
    });
    status.textContent = 'Photo attached to today\'s visit.';
  });

  const atmos = dlpBuildCaptureButton('Log chamber atmosphere', async () => {
    if (!zone.value) throw new Error('Create a chamber first.');
    const visitId = await _dlpEnsureVisit(claimId);
    await apiPost('/readings/zone-atmosphere', {
      drying_zone_id: Number(zone.value),
      visit_id: visitId,
      temp_f: Number(temp.value || 0),
      rh_pct: Number(rh.value || 0)
    });
    status.textContent = 'Atmosphere reading logged.';
  });

  const moist = dlpBuildCaptureButton('Log first moisture point', async () => {
    if (!zone.value) throw new Error('Create a chamber first.');
    const point = await dlpBuildFindFirstPoint(Number(zone.value));
    if (!point) throw new Error('Add a surface and reading point first.');
    const visitId = await _dlpEnsureVisit(claimId);
    await apiPost('/readings/moisture', {
      reading_point_id: point.id,
      visit_id: visitId,
      moisture_value: Number(moisture.value || 0),
      moisture_unit: point.dry_goal_unit || '%MC'
    });
    status.textContent = 'Moisture reading logged to ' + (point.point_label || 'first point') + '.';
  });

  const work = dlpBuildCaptureButton('Log work item', async () => {
    if (!room.value) throw new Error('Create a room first.');
    const visitId = await _dlpEnsureVisit(claimId);
    await apiPost('/room-work-items', {
      claim_room_id: Number(room.value),
      visit_id: visitId,
      item_type: 'demo',
      label: workLabel.value.trim() || 'Documented mitigation work',
      qty: 1,
      unit: 'ea',
      notes: 'Added from Buildout quick capture.'
    });
    status.textContent = 'Work item logged.';
  });

  const refresh = el('button', { type: 'button', class: 'dlp-build-secondary' }, 'Refresh dashboard data');
  refresh.addEventListener('click', renderDlpBuildoutStudio);

  return dlpBuildPanel('Quick Capture', 'Create today\'s demo documentation without leaving the buildout flow.',
    el('div', { class: 'dlp-build-form two' }, room, zone),
    el('div', { class: 'dlp-build-form two' }, photoCaption, workLabel),
    el('div', { class: 'dlp-build-form three' }, temp, rh, moisture),
    el('div', { class: 'dlp-build-capture-grid' }, photo, atmos, moist, work),
    status,
    refresh
  );
}

function dlpBuildCaptureButton(label, action) {
  const btn = el('button', { type: 'button', class: 'dlp-build-capture-btn' }, label);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Saving...';
    try {
      await action();
      tcToast(old + ' saved', 'info');
    } catch (err) {
      tcToast((err && err.message) || String(err), 'error');
    }
    btn.textContent = old;
    btn.disabled = false;
  });
  return btn;
}

async function dlpBuildFindFirstPoint(zoneId) {
  const surfaces = await apiGet('/claim-surfaces?drying_zone_id=' + encodeURIComponent(zoneId)).catch(() => []);
  for (const surface of (Array.isArray(surfaces) ? surfaces : [])) {
    const points = await apiGet('/reading-points?claim_surface_id=' + encodeURIComponent(surface.id)).catch(() => []);
    if (Array.isArray(points) && points.length) {
      return Object.assign({}, points[0], {
        surface_label: surface.surface_label,
        dry_goal_unit: surface.dry_goal_unit
      });
    }
  }
  return null;
}

function dlpBuildStandardsPanel(claimId, standards) {
  const material = dlpBuildSelect(DLP_DRY_GOAL_CLASSES.map(x => [x.material, x.label]), 'drywall');
  const goal = el('input', { type: 'number', step: '0.1', placeholder: 'Dry goal' });
  const unit = dlpBuildSelect([['%MC', '%MC'], ['%WME', '%WME'], ['GPP', 'GPP']], '%MC');
  const meter = dlpBuildSelect([['pin', 'Pin meter'], ['non-pin', 'Non-pin'], ['thermal', 'Thermal/IR'], ['', 'Not set']], 'pin');
  material.addEventListener('change', () => {
    const def = DLP_DRY_GOAL_CLASSES.find(x => x.material === material.value);
    if (def) {
      unit.value = def.unit || '%MC';
      meter.value = def.meter_type || '';
    }
  });
  const save = el('button', { type: 'button', class: 'dlp-build-primary' }, 'Save dry goal');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await apiPost('/claim-material-standards', {
        claim_id: claimId,
        material: material.value,
        dry_goal: Number(goal.value || 0),
        dry_goal_unit: unit.value,
        meter_type: meter.value || null
      });
      tcToast('Dry goal saved', 'info');
      renderDlpBuildoutStudio();
    } catch (err) {
      tcToast('Dry goal failed: ' + (err.message || err), 'error');
      save.disabled = false;
    }
  });
  const rows = el('div', { class: 'dlp-build-token-list' });
  standards.forEach(s => rows.appendChild(el('span', {}, `${s.material}: ${s.dry_goal}${s.dry_goal_unit || ''}`)));
  return dlpBuildPanel('Material Goals', 'Set material targets once, then surfaces inherit those standards.',
    el('div', { class: 'dlp-build-form four' }, material, goal, unit, meter),
    save,
    rows
  );
}

async function dlpBuildSurfacesPanel(claimId, zones) {
  const zone = dlpBuildSelect(zones.map(z => [String(z.id), z.name || ('Chamber ' + z.id)]), zones[0]?.id ? String(zones[0].id) : '');
  const type = dlpBuildSelect(Object.keys(DLP_MATERIALS_BY_SURFACE_TYPE).map(x => [x, x]), 'wall');
  const label = el('input', { placeholder: 'Surface label, ex: Sink wall' });
  const material = el('input', { placeholder: 'Material, ex: drywall' });
  const point = el('input', { placeholder: 'Point label, ex: P1' });
  const location = el('input', { placeholder: 'Point notes, ex: 24 in AFF left stud bay' });
  const save = el('button', { type: 'button', class: 'dlp-build-primary' }, 'Add surface + point');
  save.disabled = zones.length === 0;
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const surface = await apiPost('/claim-surfaces', {
        drying_zone_id: Number(zone.value),
        surface_type: type.value,
        surface_label: label.value.trim() || type.value,
        material: material.value.trim() || type.value
      });
      await apiPost('/reading-points', {
        claim_surface_id: surface.id,
        point_label: point.value.trim() || 'P1',
        location_notes: location.value.trim() || null
      });
      tcToast('Reading point added', 'info');
      renderDlpBuildoutStudio();
    } catch (err) {
      tcToast('Point save failed: ' + (err.message || err), 'error');
      save.disabled = false;
    }
  });
  const hint = zones.length ? 'Create repeatable meter points before daily readings.' : 'Create a chamber first.';
  return dlpBuildPanel('Surfaces + Points', hint,
    el('div', { class: 'dlp-build-form two' }, zone, type),
    el('div', { class: 'dlp-build-form two' }, label, material),
    el('div', { class: 'dlp-build-form two' }, point, location),
    save
  );
}

function dlpBuildEquipmentPanel(claimId, rooms, zones, equipment, activeDeploys) {
  const length = el('input', { type: 'number', min: '1', step: '0.5', placeholder: 'Length ft', value: rooms[0]?.length_ft || '' });
  const width = el('input', { type: 'number', min: '1', step: '0.5', placeholder: 'Width ft', value: rooms[0]?.width_ft || '' });
  const height = el('input', { type: 'number', min: '1', step: '0.5', placeholder: 'Height ft', value: rooms[0]?.height_ft || '8' });
  const cls = dlpBuildSelect([['1', 'Class 1'], ['2', 'Class 2'], ['3', 'Class 3'], ['4', 'Class 4']], String(zones[0]?.class_of_water || 2));
  const out = el('div', { class: 'dlp-build-recommend' }, 'Enter dimensions to calculate rough equipment need.');
  const calc = el('button', { type: 'button', class: 'dlp-build-secondary' }, 'Calculate need');
  calc.addEventListener('click', async () => {
    calc.disabled = true;
    try {
      const rec = await apiPost('/sizing/recommend', {
        length_ft: Number(length.value || 0),
        width_ft: Number(width.value || 0),
        height_ft: Number(height.value || 8),
        class_of_water: Number(cls.value)
      });
      out.textContent = `${rec.air_movers_recommended} air movers | ${rec.dehu_pints_per_day_recommended} PPD dehu capacity | ${rec.rationale}`;
    } catch (err) {
      out.textContent = 'Sizing failed: ' + (err.message || err);
    }
    calc.disabled = false;
  });
  const zone = dlpBuildSelect(zones.map(z => [String(z.id), z.name || ('Chamber ' + z.id)]), zones[0]?.id ? String(zones[0].id) : '');
  const asset = dlpBuildSelect(equipment.map(e => [String(e.id), `${e.asset_tag || e.id} - ${e.type || 'Equipment'}`]), equipment[0]?.id ? String(equipment[0].id) : '');
  const deploy = el('button', { type: 'button', class: 'dlp-build-primary' }, 'Deploy selected asset');
  deploy.disabled = !zones.length || !equipment.length;
  deploy.addEventListener('click', async () => {
    deploy.disabled = true;
    try {
      await apiPost('/equipment-deploys', { job_id: claimId, equipment_id: Number(asset.value), drying_zone_id: Number(zone.value) || null });
      tcToast('Equipment deployed', 'info');
      renderDlpBuildoutStudio();
    } catch (err) {
      tcToast('Deploy failed: ' + (err.message || err), 'error');
      deploy.disabled = false;
    }
  });
  const active = el('div', { class: 'dlp-build-token-list' });
  activeDeploys.forEach(d => active.appendChild(el('span', {}, `${d.asset_tag || d.equipment_id}: ${d.type || 'equipment'}`)));
  return dlpBuildPanel('Equipment Plan', 'Estimate need, then attach active equipment to the chamber record.',
    el('div', { class: 'dlp-build-form four' }, length, width, height, cls),
    calc,
    out,
    el('div', { class: 'dlp-build-form two' }, zone, asset),
    deploy,
    active
  );
}

function dlpBuildShotListPanel(rooms, zones, photos) {
  const imagePhotos = (photos || []).filter(p => /^image\//.test(String(p.mime_type || '')) || /\.(jpe?g|png|gif|webp|svg|heic)$/i.test(String(p.original_name || p.file_url || '')));
  const roomCounts = {};
  imagePhotos.forEach(p => {
    const rid = Number(p.claim_room_id || 0);
    if (rid) roomCounts[rid] = (roomCounts[rid] || 0) + 1;
  });
  const rows = el('div', { class: 'dlp-build-shot-list' });
  rows.appendChild(dlpBuildShotRow('Arrival / exterior', imagePhotos.some(p => /arrival|exterior|access/i.test(String(p.caption || p.original_name || ''))), 'Access, front elevation, loss area approach'));
  rows.appendChild(dlpBuildShotRow('Source / cause', imagePhotos.some(p => /source|cause|leak|supply|drain/i.test(String(p.caption || p.original_name || ''))), 'Cause of loss and affected assembly'));
  rows.appendChild(dlpBuildShotRow('Equipment layout', imagePhotos.some(p => /equipment|dehu|air mover|scrubber/i.test(String(p.caption || p.original_name || ''))), 'Show placement, cords, containment'));
  rows.appendChild(dlpBuildShotRow('Sketch / meter context', zones.some(z => z.has_sketch), 'CAD or room sketch saved'));
  rooms.slice(0, 6).forEach(room => {
    rows.appendChild(dlpBuildShotRow(room.name || ('Room ' + room.id), (roomCounts[room.id] || 0) > 0, (roomCounts[room.id] || 0) + ' room photos'));
  });
  return dlpBuildPanel('Photo Shot List', 'A quick carrier-style checklist for the photos that make reports easier to defend.',
    rows,
    (() => {
      const b = el('button', { type: 'button', class: 'dlp-build-primary' }, 'Open photo hub');
      b.addEventListener('click', renderDlpPhotos);
      return b;
    })()
  );
}

function dlpBuildShotRow(label, done, detail) {
  return el('div', { class: 'dlp-build-shot-row ' + (done ? 'done' : '') },
    el('span', { class: 'dlp-build-shot-dot' }, done ? 'OK' : 'Need'),
    el('div', {},
      el('strong', {}, label),
      el('em', {}, detail || '')
    )
  );
}

function dlpBuildQaPanel(claimId, ctx) {
  const key = 'drylog_buildout_qa_' + claimId;
  const saved = dlpReadLocalDraft(claimId);
  const items = [
    ['lossVerified', 'Source and category/class confirmed'],
    ['roomsReady', 'Affected rooms and chambers mapped'],
    ['dryGoals', 'Dry goals set for affected materials'],
    ['pointsReady', 'Repeatable reading points created'],
    ['equipmentReady', 'Equipment placement documented'],
    ['photoBuckets', 'Arrival, source, equipment, and room photos started'],
    ['reportNotes', 'Report notes drafted']
  ];
  let state = {};
  try { state = JSON.parse(localStorage.getItem(key) || '{}'); } catch (err) { state = {}; }
  const list = el('div', { class: 'dlp-build-qa' });
  items.forEach(([id, label]) => {
    const cb = el('input', { type: 'checkbox', checked: !!state[id] });
    cb.addEventListener('change', () => {
      state[id] = cb.checked;
      localStorage.setItem(key, JSON.stringify(state));
    });
    list.appendChild(el('label', {}, cb, el('span', {}, label)));
  });
  const notes = el('textarea', { rows: 4, placeholder: 'Draft report notes, customer concerns, adjuster notes, offline reminders', value: saved.notes || '' });
  const save = el('button', { type: 'button', class: 'dlp-build-primary' }, 'Save draft notes');
  save.addEventListener('click', () => {
    dlpWriteLocalDraft(claimId, { notes: notes.value, saved_at: new Date().toISOString() });
    tcToast('Draft saved in this browser', 'info');
    renderDlpBuildoutStudio();
  });
  const auto = el('div', { class: 'dlp-build-auto' },
    dlpChecklistItem(ctx.rooms.length > 0, 'Rooms exist', ctx.rooms.length + ' rooms'),
    dlpChecklistItem(ctx.zones.length > 0, 'Chambers exist', ctx.zones.length + ' chambers'),
    dlpChecklistItem(ctx.standards.length > 0, 'Goals exist', ctx.standards.length + ' standards'),
    dlpChecklistItem(ctx.photos.length > 0, 'Photos exist', ctx.photos.length + ' photos'),
    dlpChecklistItem(ctx.deploys.length > 0, 'Equipment active', ctx.deploys.length + ' active')
  );
  return dlpBuildPanel('QA + Draft', 'Local checklist and notes for the online prototype before database storage.',
    auto,
    list,
    notes,
    save
  );
}

function dlpBuildSelect(options, selected) {
  const select = el('select', {});
  (options || []).forEach(([value, label]) => select.appendChild(el('option', { value, selected: String(value) === String(selected) }, label)));
  return select;
}

function dlpBuildFooterButton(label, onClick) {
  const b = el('button', { type: 'button', class: 'dlp-build-footer-btn' }, label);
  b.addEventListener('click', onClick);
  return b;
}

function dlpReadLocalDraft(claimId) {
  try { return JSON.parse(localStorage.getItem('drylog_buildout_draft_' + claimId) || '{}'); }
  catch (err) { return {}; }
}

function dlpWriteLocalDraft(claimId, patch) {
  const next = Object.assign({}, dlpReadLocalDraft(claimId), patch || {});
  localStorage.setItem('drylog_buildout_draft_' + claimId, JSON.stringify(next));
  return next;
}

function dlpBuildoutScore(ctx) {
  let score = 0;
  if (ctx.rooms.length) score += 15;
  if (ctx.zones.length) score += 15;
  if (ctx.standards.length) score += 15;
  if ((ctx.deploys || []).length) score += 15;
  if ((ctx.photos || []).length) score += 15;
  if ((ctx.workItems || []).length) score += 10;
  if (ctx.draft && ctx.draft.notes) score += 15;
  return Math.min(100, score);
}

function dlpCommandButton(label, value, onClick) {
  const b = el('button', { class: 'dlp-command-chip' },
    el('span', {}, label),
    el('strong', {}, value)
  );
  b.addEventListener('click', onClick);
  return b;
}

function dlpMetric(label, value, detail, pct) {
  const card = el('div', { class: 'dlp-metric' },
    el('div', { class: 'dlp-metric-label' }, label),
    el('div', { class: 'dlp-metric-value' }, value),
    el('div', { class: 'dlp-metric-detail' }, detail),
    el('div', { class: 'dlp-meter' }, el('i', { style: 'width:' + Math.max(0, Math.min(100, pct)) + '%;' }))
  );
  return card;
}

function dlpPanelHeader(title, meta, onClick) {
  const head = el('div', { class: 'dlp-panel-head' },
    el('div', {}, el('div', { class: 'dlp-panel-title' }, title), el('div', { class: 'dlp-panel-meta' }, meta)),
    el('button', { type: 'button' }, 'Open')
  );
  head.querySelector('button').addEventListener('click', onClick);
  return head;
}

function dlpChecklistItem(done, label, meta) {
  return el('div', { class: 'dlp-check-row ' + (done ? 'done' : 'todo') },
    el('span', { class: 'dlp-check-dot' }, done ? '✓' : '!'),
    el('div', { class: 'dlp-check-text' }, label),
    el('div', { class: 'dlp-check-meta' }, meta)
  );
}

function dlpQueueRow(task) {
  const row = el('button', { class: 'dlp-queue-row ' + task.state, type: 'button' },
    el('span', { class: 'dlp-queue-state' }, task.state === 'locked' ? 'Wait' : task.state === 'in_progress' ? 'Now' : 'Next'),
    el('span', { class: 'dlp-queue-name' }, task.name),
    el('span', { class: 'dlp-queue-meta' }, task.category || '')
  );
  row.addEventListener('click', () => renderDlpTaskList(task.code));
  return row;
}

function dlpBottomAction(label, onClick) {
  const b = el('button', { type: 'button' }, label);
  b.addEventListener('click', onClick);
  return b;
}


// Single dashboard-tile builder. Args: {icon, name, stat, desc, badge?, onClick}.
function buildDlpTile(opts) {
  const tile = el('button',{class:'dlp-tile'},
    el('div',{class:'row'},
      el('div',{class:'icon'}, opts.icon),
      el('div',{class:'name'}, opts.name),
      opts.badge ? el('div',{class:'badge '+opts.badge.cls}, opts.badge.text) : null
    ),
    el('div',{class:'stat'}, opts.stat),
    el('div',{class:'desc'}, opts.desc)
  );
  if (opts.onClick) tile.addEventListener('click', opts.onClick);
  return tile;
}


// ─── Tasks tab ──────────────────────────────────────────────────────────────
// Full list of tasks for the claim with state dots, prereq notes, and
// complete/skip actions. focus_code (optional) scrolls the named task into
// view and pre-highlights it — used when the dashboard CTA jumps here.
async function renderDlpTaskList(focus_code) {
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/tasks', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Tasks');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);
  screen.appendChild(el('div',{class:'dlp-section-h'},'Tasks'));

  const loadingEl = el('div',{class:'dlp-empty'},'Loading tasks…');
  screen.appendChild(loadingEl);
  root.appendChild(screen);

  let tasks = [];
  try { tasks = await apiGet(`/claim-tasks?claim_id=${claim_id}`); } catch(e) {}
  if (!Array.isArray(tasks)) tasks = [];
  loadingEl.remove();

  if (tasks.length === 0) {
    screen.appendChild(el('div',{class:'dlp-empty'}, 'No tasks configured yet. Go back to the dashboard to seed a template.'));
    return;
  }

  const listWrap = el('div',{});
  for (const t of tasks) {
    const row = el('div',{class:'dlp-task '+t.state});
    row.appendChild(el('div',{class:'state-dot '+t.state}));
    const info = el('div',{class:'info'});
    info.appendChild(el('div',{class:'name'}, t.name));

    // "Why this matters" purpose line — renders for all states (available,
    // in_progress, locked, complete, skipped) since the operational reason
    // doesn't change with state. Comes BEFORE the where-to-go hint so a tech
    // grounds themselves in the WHY before the HOW.
    if (DLP_TASK_PURPOSE[t.code]) {
      const isMuted = (t.state === 'complete' || t.state === 'skipped' || t.state === 'locked');
      info.appendChild(el('div',{style:`font-size:11px;color:${isMuted?'#94a3b8':'#475569'};margin-top:3px;line-height:1.4;`}, DLP_TASK_PURPOSE[t.code]));
    }

    const metaBits = [];
    if (t.state === 'complete' && t.completed_at) {
      metaBits.push('✓ ' + new Date(t.completed_at.replace(' ','T')+'Z').toLocaleDateString());
    } else if (t.state === 'skipped' && t.skip_reason) {
      metaBits.push('Skipped: ' + t.skip_reason);
    } else if (t.state === 'locked' && t.prereqs && t.prereqs.length > 0) {
      const lockingNames = t.prereqs
        .map(c => (tasks.find(x => x.code === c) || {}).name || c)
        .filter(Boolean);
      metaBits.push('Waiting on: ' + lockingNames.join(', '));
    } else if (t.category) {
      metaBits.push(t.category);
    }
    if (metaBits.length) {
      const meta = el('div',{class:'meta'});
      for (const m of metaBits) meta.appendChild(el('span',{class:m.startsWith('Waiting')?'prereq':''}, m));
      info.appendChild(meta);
    }
    // F18.7g: surface the where-to-do-it hint inline for available/in_progress
    // tasks. Locked + complete + skipped don't need it.
    if ((t.state === 'available' || t.state === 'in_progress') && DLP_TASK_HINTS[t.code]) {
      info.appendChild(el('div',{style:'font-size:11px;color:#1d4ed8;margin-top:4px;background:#eff6ff;padding:5px 8px;border-radius:5px;line-height:1.4;'}, '👉 ' + DLP_TASK_HINTS[t.code]));
    }
    row.appendChild(info);

    const actions = el('div',{class:'actions'});
    if (t.state === 'available' || t.state === 'in_progress') {
      const doneBtn = el('button',{class:'primary'},'Done');
      doneBtn.addEventListener('click', async () => {
        // Tasks that capture a claim-level value get a picker BEFORE the task
        // is marked complete. Today: source_of_loss → jobs.source_of_loss.
        // (cat_of_water / class_of_water are captured per drying-zone when
        // the chamber is created, so they stay as plain checkboxes here.)
        if (t.code === 'source_of_loss') {
          _dlpSourceOfLossPicker(claim_id, async (value) => {
            doneBtn.disabled = true; doneBtn.textContent = '…';
            try {
              await apiPut(`/jobs/${claim_id}`, {source_of_loss: value});
              await apiPost('/claim-tasks/complete', {claim_id, code: t.code});
            } catch(e) {
              alert('Complete failed: ' + (e.message || e));
              doneBtn.disabled = false; doneBtn.textContent = 'Done'; return;
            }
            renderDlpTaskList(t.code);
          });
          return;
        }
        doneBtn.disabled = true; doneBtn.textContent = '…';
        try {
          await apiPost('/claim-tasks/complete', {claim_id, code: t.code});
        } catch(e) {
          alert('Complete failed: ' + (e.message || e));
          doneBtn.disabled = false; doneBtn.textContent = 'Done'; return;
        }
        renderDlpTaskList(t.code);
      });
      actions.appendChild(doneBtn);

      const skipBtn = el('button',{}, 'Skip');
      skipBtn.addEventListener('click', async () => {
        const reason = prompt('Why is this task being skipped?');
        if (!reason || !reason.trim()) return;
        skipBtn.disabled = true; skipBtn.textContent = '…';
        try {
          await apiPost('/claim-tasks/skip', {claim_id, code: t.code, reason: reason.trim()});
        } catch(e) {
          alert('Skip failed: ' + (e.message || e));
          skipBtn.disabled = false; skipBtn.textContent = 'Skip'; return;
        }
        renderDlpTaskList(t.code);
      });
      actions.appendChild(skipBtn);
    } else if (t.state === 'complete' || t.state === 'skipped') {
      // Reopen — clears the terminal state so the tech can re-do the task.
      // Downstream tasks that were unlocked by this completion flip back to
      // locked automatically (server-side recompute).
      const reopenBtn = el('button',{style:'background:#fff;color:#475569;border:1px solid #cbd5e1;'}, '↺ Reopen');
      reopenBtn.addEventListener('click', async () => {
        const verb = t.state === 'complete' ? 'completed' : 'skipped';
        if (!confirm(`Reopen "${t.name}"? This will clear the ${verb} state so you can re-do the task. Any downstream tasks that were unlocked will lock again.`)) return;
        reopenBtn.disabled = true; reopenBtn.textContent = '…';
        try {
          await apiPost('/claim-tasks/reopen', {claim_id, code: t.code});
        } catch(e) {
          alert('Reopen failed: ' + (e.message || e));
          reopenBtn.disabled = false; reopenBtn.textContent = '↺ Reopen'; return;
        }
        renderDlpTaskList(t.code);
      });
      actions.appendChild(reopenBtn);
    }
    row.appendChild(actions);

    if (focus_code === t.code) row.style.outline = '2px solid #3b82f6';
    listWrap.appendChild(row);
  }
  screen.appendChild(listWrap);

  if (focus_code) {
    setTimeout(() => {
      const hl = screen.querySelector('[style*="outline"]');
      if (hl) hl.scrollIntoView({behavior:'smooth', block:'center'});
    }, 50);
  }
}


async function renderDlpAlertsList(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/alerts', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Alerts');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);

  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  let alerts = [];
  try { alerts = await apiGet(`/alerts?claim_id=${claim_id}&state=open`); } catch(e){}
  if (!Array.isArray(alerts)) alerts = [];
  loading.remove();

  if (alerts.length === 0) {
    screen.appendChild(el('div',{class:'dlp-empty',style:'background:#dcfce7;border-color:#86efac;color:#166534;'},
      '✓ No open alerts on this claim.'));
    // Recently resolved (last 7 days) — quick context strip
    try {
      const recent = await apiGet(`/alerts?claim_id=${claim_id}&state=all`);
      const closed = (Array.isArray(recent) ? recent : [])
        .filter(a => a.state === 'resolved' || a.state === 'dismissed')
        .slice(0, 3);
      if (closed.length > 0) {
        screen.appendChild(el('div',{class:'dlp-section-h'},'Recently closed'));
        for (const a of closed) {
          screen.appendChild(_dlpAlertRow(a, () => {}));
        }
      }
    } catch(e){}
    return;
  }

  // Group by severity for visual triage
  const bySev = {critical:[], warning:[], info:[]};
  for (const a of alerts) (bySev[a.severity] || bySev.warning).push(a);

  for (const sev of ['critical','warning','info']) {
    if (bySev[sev].length === 0) continue;
    screen.appendChild(el('div',{class:'dlp-section-h'}, sev.toUpperCase() + ' · ' + bySev[sev].length));
    for (const a of bySev[sev]) {
      screen.appendChild(_dlpAlertRow(a, () => renderDlpAlertsList()));
    }
  }
}


function _dlpSourceOfLossPicker(claim_id, onPicked){
  let selected = '';
  let otherText = '';

  const overlay = el('div',{style:'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:1000;display:flex;align-items:flex-end;justify-content:center;padding:0;'});
  const sheet = el('div',{style:'background:#fff;border-radius:16px 16px 0 0;max-width:520px;width:100%;padding:18px 18px 14px;box-shadow:0 -12px 30px rgba(0,0,0,0.18);max-height:88vh;display:flex;flex-direction:column;'});

  sheet.appendChild(el('div',{style:'font-size:18px;font-weight:800;color:#0f172a;'}, 'Source of Loss'));
  sheet.appendChild(el('div',{style:'font-size:12px;color:#64748b;margin-top:4px;margin-bottom:12px;line-height:1.45;'}, 'What caused the damage on this claim? This is recorded once and shows up on reports + the carrier PDF.'));

  const list = el('div',{style:'display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;min-height:0;padding-bottom:6px;'});
  const otherWrap = el('div',{style:'display:none;margin-top:8px;'});
  const otherInput = el('input',{type:'text',placeholder:'Describe the source…',style:'width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;box-sizing:border-box;'});
  otherInput.addEventListener('input', e => { otherText = e.target.value; });
  otherWrap.appendChild(otherInput);

  function renderList(){
    list.innerHTML = '';
    for (const opt of DLP_SOURCE_OF_LOSS_OPTIONS) {
      const active = opt === selected;
      const btn = el('button',{style:`padding:11px 13px;border-radius:9px;background:${active?'#dbeafe':'#f8fafc'};border:1.5px solid ${active?'#3b82f6':'#e2e8f0'};text-align:left;font-size:14px;font-weight:${active?'600':'500'};color:${active?'#1d4ed8':'#0f172a'};cursor:pointer;`}, opt);
      btn.addEventListener('click', () => {
        selected = opt;
        otherWrap.style.display = (opt === 'Other') ? 'block' : 'none';
        if (opt === 'Other') setTimeout(() => otherInput.focus(), 0);
        renderList();
      });
      list.appendChild(btn);
    }
  }
  renderList();
  sheet.appendChild(list);
  sheet.appendChild(otherWrap);

  const actions = el('div',{style:'display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;'});
  const cancelBtn = el('button',{style:'flex:1;padding:11px;background:#fff;border:1px solid #cbd5e1;border-radius:9px;font-size:14px;font-weight:600;color:#475569;cursor:pointer;'}, 'Cancel');
  const saveBtn   = el('button',{style:'flex:2;padding:11px;background:#3b82f6;color:#fff;border:0;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;'}, 'Save & Complete Task');
  cancelBtn.addEventListener('click', () => overlay.remove());
  saveBtn.addEventListener('click', () => {
    const value = (selected === 'Other') ? otherText.trim() : selected;
    if (!value) { alert('Pick a source (or fill in Other).'); return; }
    overlay.remove();
    onPicked(value);
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  sheet.appendChild(actions);

  overlay.appendChild(sheet);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Pre-select existing value if one is already on file
  apiGet(`/jobs/${claim_id}`).then(j => {
    const cur = j && j.source_of_loss;
    if (!cur) return;
    if (DLP_SOURCE_OF_LOSS_OPTIONS.includes(cur)) {
      selected = cur;
    } else {
      selected = 'Other';
      otherText = cur;
      otherInput.value = cur;
      otherWrap.style.display = 'block';
    }
    renderList();
  }).catch(()=>{});
}


// Build one alert row card. onMutate is called after ack/resolve/dismiss
// completes so the parent screen can re-render.
function _dlpAlertRow(a, onMutate){
  const sev = a.severity || 'warning';
  const accent = sev === 'critical' ? '#dc2626' : sev === 'warning' ? '#f59e0b' : '#3b82f6';
  const bgAccent = sev === 'critical' ? '#fee2e2' : sev === 'warning' ? '#fef3c7' : '#dbeafe';
  const isOpen = a.state === 'new' || a.state === 'acked';

  const card = el('div',{style:`background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${accent};border-radius:8px;padding:11px 13px;margin-bottom:8px;${isOpen?'':'opacity:0.65;'}`});

  // Header: title + state pill
  const top = el('div',{style:'display:flex;align-items:start;gap:8px;'});
  const headBlock = el('div',{style:'flex:1;min-width:0;'});
  headBlock.appendChild(el('div',{style:`font-size:11px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:0.04em;`}, sev));
  headBlock.appendChild(el('div',{style:'font-size:14px;font-weight:700;color:#0f172a;margin-top:2px;line-height:1.3;'}, a.title));
  if (a.zone_name) headBlock.appendChild(el('div',{style:'font-size:11px;color:#64748b;margin-top:2px;'}, 'Chamber: ' + a.zone_name));
  top.appendChild(headBlock);
  if (!isOpen) {
    top.appendChild(el('div',{style:`font-size:9px;padding:3px 7px;background:${bgAccent};color:${accent};border-radius:4px;font-weight:700;letter-spacing:0.04em;height:fit-content;`}, a.state.toUpperCase()));
  } else if (a.state === 'acked') {
    top.appendChild(el('div',{style:`font-size:9px;padding:3px 7px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-weight:700;letter-spacing:0.04em;height:fit-content;`},'ACKED'));
  }
  card.appendChild(top);

  if (a.detail) card.appendChild(el('div',{style:'font-size:12px;color:#475569;margin-top:6px;line-height:1.45;'}, a.detail));

  // Remediation block — only on open alerts (resolved alerts don't need a
  // "what to do" anymore). Static lookup; alert codes without a remedy
  // entry just don't render the block, so adding more codes is opt-in.
  const remedy = isOpen && a.rule_code ? DLP_ALERT_REMEDIES[a.rule_code] : null;
  if (remedy) {
    const remedyWrap = el('div',{style:`margin-top:8px;padding:8px 10px;background:${bgAccent}55;border-left:3px solid ${accent};border-radius:5px;`});
    if (remedy.impact) {
      remedyWrap.appendChild(el('div',{style:`font-size:11px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;`},'Impact'));
      remedyWrap.appendChild(el('div',{style:'font-size:12px;color:#0f172a;line-height:1.45;'}, remedy.impact));
    }
    if (Array.isArray(remedy.suggested) && remedy.suggested.length) {
      remedyWrap.appendChild(el('div',{style:`font-size:11px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:0.04em;margin-top:6px;margin-bottom:3px;`},'Suggested'));
      const ul = el('div',{style:'font-size:12px;color:#0f172a;line-height:1.5;'});
      for (const step of remedy.suggested) {
        ul.appendChild(el('div',{style:'padding-left:12px;text-indent:-12px;'}, '· ' + step));
      }
      remedyWrap.appendChild(ul);
    }
    card.appendChild(remedyWrap);
  }

  // Footer: ts + actor
  const tsBits = [];
  if (a.fired_at) tsBits.push(new Date(a.fired_at.replace(' ','T')+'Z').toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));
  if (!isOpen && a.resolved_by_name) tsBits.push((a.state==='dismissed'?'Dismissed':'Resolved') + ' by ' + a.resolved_by_name);
  else if (a.state === 'acked' && a.acked_by_name) tsBits.push('Acked by ' + a.acked_by_name);
  if (tsBits.length) card.appendChild(el('div',{style:'font-size:10px;color:#94a3b8;margin-top:6px;'}, tsBits.join(' · ')));

  if (a.resolved_notes) {
    card.appendChild(el('div',{style:'font-size:11px;color:#475569;background:#f8fafc;border-radius:6px;padding:6px 8px;margin-top:6px;line-height:1.4;font-style:italic;'},
      '“' + a.resolved_notes + '”'));
  }

  // Action buttons (only on open alerts)
  if (isOpen) {
    const actions = el('div',{style:'display:flex;gap:6px;margin-top:10px;'});
    if (a.state === 'new') {
      const ackBtn = el('button',{style:'flex:1;padding:8px;background:#fff;border:1px solid #cbd5e1;color:#475569;border-radius:6px;font-size:12px;font-weight:700;'},'Ack');
      ackBtn.addEventListener('click', async () => {
        ackBtn.disabled = true;
        try { await apiPost(`/alerts/${a.id}/ack`, {}); } catch(e){ alert('Ack failed: '+(e.message||e)); ackBtn.disabled=false; return; }
        onMutate && onMutate();
      });
      actions.appendChild(ackBtn);
    }
    const resBtn = el('button',{style:'flex:1;padding:8px;background:#16a34a;color:#fff;border-radius:6px;font-size:12px;font-weight:700;'},'Resolve');
    resBtn.addEventListener('click', async () => {
      const notes = prompt('How was this resolved? (optional)') || '';
      resBtn.disabled = true;
      try { await apiPost(`/alerts/${a.id}/resolve`, {notes: notes.trim() || undefined}); } catch(e){ alert('Resolve failed: '+(e.message||e)); resBtn.disabled=false; return; }
      onMutate && onMutate();
    });
    actions.appendChild(resBtn);

    const dismissBtn = el('button',{style:'padding:8px 10px;background:#fff;border:1px solid #cbd5e1;color:#94a3b8;border-radius:6px;font-size:12px;font-weight:700;'},'Dismiss');
    dismissBtn.addEventListener('click', async () => {
      const notes = prompt('Reason for dismissing as a false positive? (optional)') || '';
      dismissBtn.disabled = true;
      try { await apiPost(`/alerts/${a.id}/dismiss`, {notes: notes.trim() || undefined}); } catch(e){ alert('Dismiss failed: '+(e.message||e)); dismissBtn.disabled=false; return; }
      onMutate && onMutate();
    });
    actions.appendChild(dismissBtn);

    card.appendChild(actions);
  }

  return card;
}


async function renderDlpSummary(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/summary', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Summary');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);

  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  let tasks=[], zones=[], alertsOpen=[], visits=[];
  try {
    const [t, z, a, v] = await Promise.all([
      apiGet(`/claim-tasks?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/drying-zones?claim_id=${claim_id}&include_closed=1`).catch(()=>[]),
      apiGet(`/alerts?claim_id=${claim_id}&state=open`).catch(()=>[]),
      apiGet(`/visits?job_id=${claim_id}`).catch(()=>[]),
    ]);
    tasks = Array.isArray(t)?t:[];
    zones = Array.isArray(z)?z:[];
    alertsOpen = Array.isArray(a)?a:[];
    visits = Array.isArray(v)?v:[];
  } catch(e){}

  // Surfaces aggregated across all zones (one round-trip per zone — usually <10)
  let surfaceTotal = 0, surfaceDry = 0;
  try {
    const surfList = await Promise.all(zones.map(z => apiGet(`/claim-surfaces?drying_zone_id=${z.id}`).catch(()=>[])));
    for (const arr of surfList) {
      if (!Array.isArray(arr)) continue;
      for (const s of arr) {
        surfaceTotal++;
        if (s.is_dry) surfaceDry++;
      }
    }
  } catch(e){}
  loading.remove();

  // Big overall % dry
  const pctDry = surfaceTotal > 0 ? Math.round((surfaceDry / surfaceTotal) * 100) : null;
  const heroBg = pctDry == null ? '#0c4a6e'
    : pctDry >= 100 ? '#15803d'
    : pctDry >= 50  ? '#a16207'
    : '#b91c1c';
  const hero = el('div',{style:`background:linear-gradient(135deg,${heroBg},${heroBg}dd);color:#fff;padding:18px;border-radius:14px;margin-bottom:14px;text-align:center;`});
  hero.appendChild(el('div',{style:'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;opacity:0.85;'}, 'Dry progress'));
  hero.appendChild(el('div',{style:'font-size:48px;font-weight:800;line-height:1;margin:6px 0;'}, pctDry == null ? '—' : (pctDry + '%')));
  hero.appendChild(el('div',{style:'font-size:13px;opacity:0.92;'},
    pctDry == null ? 'No surfaces tracked yet' : `${surfaceDry} of ${surfaceTotal} surfaces at goal`));
  screen.appendChild(hero);

  // Stat cards
  const stats = el('div',{style:'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;'});
  function statCard(val, label) {
    const c = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center;'});
    c.appendChild(el('div',{style:'font-size:24px;font-weight:800;color:#0f172a;line-height:1;'}, String(val)));
    c.appendChild(el('div',{style:'font-size:11px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.04em;'}, label));
    return c;
  }
  // Days since first visit
  let daysRunning = '—';
  if (visits.length > 0) {
    const earliest = visits.map(v => v.visit_date).sort()[0];
    if (earliest) {
      const days = Math.floor((Date.now() - new Date(earliest+'T12:00:00').getTime()) / (1000*60*60*24));
      daysRunning = String(days);
    }
  }
  stats.appendChild(statCard(daysRunning, 'Days drying'));
  stats.appendChild(statCard(String(visits.length), 'Visits'));
  const openZones = zones.filter(z => !z.is_closed).length;
  stats.appendChild(statCard(`${openZones}/${zones.length}`, 'Open zones'));
  const tasksDone = tasks.filter(t => t.state==='complete' || t.state==='skipped').length;
  stats.appendChild(statCard(`${tasksDone}/${tasks.length}`, 'Tasks done'));
  screen.appendChild(stats);

  // Open alerts callout
  if (alertsOpen.length > 0) {
    const critCount = alertsOpen.filter(a => a.severity === 'critical').length;
    const sev = critCount > 0 ? 'critical' : 'warning';
    const accent = sev === 'critical' ? '#dc2626' : '#f59e0b';
    const bg = sev === 'critical' ? '#fee2e2' : '#fef3c7';
    const callout = el('button',{style:`width:100%;background:${bg};border:1px solid ${accent};border-radius:10px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;text-align:left;`});
    callout.appendChild(el('div',{style:`font-size:22px;`},'⚠'));
    const txt = el('div',{style:'flex:1;'});
    txt.appendChild(el('div',{style:`font-weight:700;font-size:14px;color:${accent};`},
      `${alertsOpen.length} open alert${alertsOpen.length===1?'':'s'}` + (critCount > 0 ? ` (${critCount} critical)` : '')));
    txt.appendChild(el('div',{style:'font-size:11px;color:#64748b;margin-top:2px;'},'Tap to triage'));
    callout.appendChild(txt);
    callout.addEventListener('click', () => renderDlpAlertsList());
    screen.appendChild(callout);
  }

  // Per-zone status list
  if (zones.length > 0) {
    screen.appendChild(el('div',{class:'dlp-section-h'},'Zones'));
    for (const z of zones) {
      const card = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:11px 14px;margin-bottom:8px;'});
      const t = el('div',{style:'display:flex;align-items:center;gap:8px;margin-bottom:4px;'});
      t.appendChild(el('div',{style:'flex:1;font-weight:700;font-size:13px;color:#0f172a;'}, z.name));
      if (z.is_closed) t.appendChild(el('span',{style:'font-size:9px;padding:2px 6px;background:#dcfce7;color:#166534;border-radius:4px;font-weight:700;letter-spacing:0.04em;'},'CLOSED'));
      else if (z.category_of_water) t.appendChild(el('span',{style:'font-size:9px;padding:2px 6px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-weight:700;'},'CAT '+z.category_of_water));
      card.appendChild(t);
      card.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;'},
        (Array.isArray(z.claim_room_ids)?z.claim_room_ids.length:0) + ' room(s)'));
      screen.appendChild(card);
    }
  }

  // Final walkthrough nudge if everything is dry
  if (pctDry === 100 && tasks.find(t => t.code === 'final_walkthrough' && t.state === 'available')) {
    const nudge = el('div',{class:'dlp-next-cta',style:'background:#dcfce7;border-color:#86efac;'},
      el('div',{class:'icon'},'🎯'),
      el('div',{class:'text'},
        el('div',{class:'lbl',style:'color:#166534;'}, 'Job is dry'),
        el('div',{class:'name'}, 'Run the Final Walkthrough task')
      ),
      (() => {
        const b = el('button',{}, 'Open');
        b.addEventListener('click', () => renderDlpTaskList('final_walkthrough'));
        return b;
      })()
    );
    screen.appendChild(nudge);
  }
}


function _dlpStub(name, msg) {
  clear(); enableInactivity();
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));
  const s = el('div',{class:'screen'});
  s.appendChild(el('div',{class:'dlp-section-h'}, name));
  s.appendChild(el('div',{class:'dlp-empty'}, msg));
  root.appendChild(s);
}


async function renderDlpDryingProgress(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/drying-progress', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO - Drying Progress');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);
  const loading = el('div',{class:'dlp-empty'},'Building drying picture...');
  screen.appendChild(loading);
  root.appendChild(screen);

  let zones=[], rooms=[], moisture=[], atmos=[], dehu=[], deploys=[], standards=[];
  try {
    const [z, r, m, a, d, dep, std] = await Promise.all([
      apiGet(`/drying-zones?claim_id=${claim_id}&include_closed=1`).catch(()=>[]),
      apiGet(`/claim-rooms?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/moisture?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/zone-atmosphere?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/dehu?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/equipment-deploys?job_id=${claim_id}&active=1`).catch(()=>[]),
      apiGet(`/claim-material-standards?claim_id=${claim_id}`).catch(()=>[]),
    ]);
    zones = Array.isArray(z) ? z : [];
    rooms = Array.isArray(r) ? r : [];
    moisture = Array.isArray(m) ? m : [];
    atmos = Array.isArray(a) ? a : [];
    dehu = Array.isArray(d) ? d : [];
    deploys = Array.isArray(dep) ? dep : [];
    standards = Array.isArray(std) ? std : [];
  } catch(e){}

  let surfaces = [], points = [];
  try {
    const surfaceLists = await Promise.all(zones.map(z => apiGet(`/claim-surfaces?drying_zone_id=${z.id}`).catch(()=>[])));
    surfaces = surfaceLists.flat().filter(Boolean);
    const pointLists = await Promise.all(surfaces.map(s => apiGet(`/reading-points?claim_surface_id=${s.id}`).catch(()=>[])));
    points = pointLists.flat().filter(Boolean);
  } catch(e){}
  loading.remove();

  const surfaceById = Object.fromEntries(surfaces.map(s => [String(s.id), s]));
  const roomById = Object.fromEntries(rooms.map(r => [String(r.id), r]));
  const zoneById = Object.fromEntries(zones.map(z => [String(z.id), z]));
  const latestByPoint = {};
  for (const m of moisture) {
    const key = String(m.reading_point_id || '');
    if (!key) continue;
    if (!latestByPoint[key] || String(m.reading_at || '') > String(latestByPoint[key].reading_at || '')) latestByPoint[key] = m;
  }
  const latestMoisture = Object.values(latestByPoint);
  const dryLatest = latestMoisture.filter(m => {
    const goal = m.dry_goal_snapshot != null ? Number(m.dry_goal_snapshot) : Number((surfaceById[String(m.claim_surface_id)] || {}).dry_goal);
    return goal && Number(m.moisture_value) <= goal;
  }).length;
  const dryPct = latestMoisture.length ? Math.round((dryLatest / latestMoisture.length) * 100) : 0;
  const openZones = zones.filter(z => !z.is_closed).length;
  const latestAtmos = atmos[0] || null;
  const latestGpp = latestAtmos && latestAtmos.gpp != null ? Number(latestAtmos.gpp).toFixed(1) : '—';
  const avgMoist = latestMoisture.length ? (latestMoisture.reduce((sum,m)=>sum+Number(m.moisture_value||0),0)/latestMoisture.length).toFixed(1) : '—';

  screen.appendChild(el('section',{class:'dlp-progress-hero'},
    el('div',{},
      el('div',{class:'dlp-progress-kicker'},'Drying progress'),
      el('div',{class:'dlp-progress-title'}, dryPct + '% at goal'),
      el('div',{class:'dlp-progress-sub'}, `${dryLatest} of ${latestMoisture.length || points.length || 0} reading points currently at or below dry standard.`)
    ),
    el('div',{class:'dlp-progress-ring',style:`--pct:${dryPct};`}, el('span',{}, dryPct + '%'))
  ));

  screen.appendChild(el('section',{class:'dlp-progress-metrics'},
    dlpProgressMetric('Active chambers', String(openZones), zones.length + ' total'),
    dlpProgressMetric('Avg moisture', avgMoist, latestMoisture.length ? 'latest readings' : 'no readings'),
    dlpProgressMetric('Latest GPP', latestGpp, latestAtmos ? 'zone atmosphere' : 'no atmosphere'),
    dlpProgressMetric('Equipment', String(deploys.length), 'active on site')
  ));

  const chartGrid = el('section',{class:'dlp-progress-charts'});
  chartGrid.appendChild(dlpChartPanel('Moisture trend', 'Average latest moisture by reading date', dlpSeriesByDate(moisture, 'moisture_value'), '%MC'));
  chartGrid.appendChild(dlpChartPanel('Atmosphere GPP', 'Chamber air moisture load over time', dlpSeriesByDate(atmos, 'gpp'), 'gpp'));
  chartGrid.appendChild(dlpBarPanel('Dehu performance', 'Grain depression by reading', dehu.map(d => Number(d.grain_depression || 0)).filter(n => !isNaN(n)), 'gpp drop'));
  screen.appendChild(chartGrid);

  const body = el('section',{class:'dlp-progress-body'});
  const chamberPanel = el('div',{class:'dlp-progress-panel'});
  chamberPanel.appendChild(dlpProgressPanelHead('Chambers and rooms', 'Tap a chamber to capture or review points'));
  if (!zones.length) chamberPanel.appendChild(el('div',{class:'dlp-command-empty'},'No chambers yet.'));
  for (const z of zones) {
    const zSurfaces = surfaces.filter(s => String(s.drying_zone_id) === String(z.id));
    const zReadings = latestMoisture.filter(m => String(m.drying_zone_id) === String(z.id));
    const zDry = zReadings.filter(m => {
      const goal = m.dry_goal_snapshot != null ? Number(m.dry_goal_snapshot) : Number((surfaceById[String(m.claim_surface_id)] || {}).dry_goal);
      return goal && Number(m.moisture_value) <= goal;
    }).length;
    const zPct = zReadings.length ? Math.round((zDry / zReadings.length) * 100) : 0;
    const roomNames = (Array.isArray(z.claim_room_ids) ? z.claim_room_ids : [])
      .map(id => (roomById[String(id)] || {}).name)
      .filter(Boolean);
    const mats = Array.from(new Set(zSurfaces.map(s => materialClassClient(s.material || s.surface_type)).filter(Boolean)));
    const row = el('button',{type:'button',class:'dlp-progress-zone'},
      el('div',{class:'dlp-progress-zone-main'},
        el('div',{class:'dlp-progress-zone-name'}, z.name || ('Chamber '+z.id)),
        el('div',{class:'dlp-progress-zone-meta'}, [
          roomNames.join(', ') || 'No room linked',
          mats.join(', ') || 'No materials',
          zSurfaces.length + ' surfaces'
        ].join(' | '))
      ),
      el('div',{class:'dlp-progress-zone-score'}, zPct + '%')
    );
    row.addEventListener('click', () => renderDlpZoneDetail(z.id));
    chamberPanel.appendChild(row);
  }

  const materialPanel = el('div',{class:'dlp-progress-panel'});
  materialPanel.appendChild(dlpProgressPanelHead('Materials', 'Coverage across rooms and surfaces'));
  const materialRows = dlpMaterialRows(surfaces, latestMoisture, surfaceById, standards);
  if (!materialRows.length) materialPanel.appendChild(el('div',{class:'dlp-command-empty'},'No materials selected yet. Add surfaces and dry goals from Setup.'));
  for (const row of materialRows) {
    materialPanel.appendChild(el('div',{class:'dlp-material-row'},
      el('div',{},
        el('strong',{}, row.label),
        el('span',{}, `${row.surfaces} surfaces | ${row.points} readings | goal ${row.goal}`)
      ),
      el('em',{class: row.ready ? 'ready' : 'wet'}, row.ready ? 'At goal' : 'Drying')
    ));
  }

  const gaps = el('div',{class:'dlp-progress-panel'});
  gaps.appendChild(dlpProgressPanelHead('Documentation gaps', 'What to clean up before report'));
  gaps.appendChild(dlpProgressGap(latestMoisture.length >= points.length && points.length > 0, 'All reading points captured', `${latestMoisture.length}/${points.length || 0}`));
  gaps.appendChild(dlpProgressGap(standards.length > 0, 'Dry standards set', standards.length ? standards.length + ' standards' : 'missing'));
  gaps.appendChild(dlpProgressGap(atmos.length > 0, 'Atmosphere readings logged', atmos.length ? atmos.length + ' readings' : 'missing'));
  gaps.appendChild(dlpProgressGap(deploys.length === 0 || dehu.length > 0, 'Dehu performance logged', dehu.length ? dehu.length + ' readings' : 'recommended'));

  body.append(chamberPanel, materialPanel, gaps);
  screen.appendChild(body);
}


function dlpProgressMetric(label, value, meta) {
  return el('div',{class:'dlp-progress-metric'},
    el('span',{}, label),
    el('strong',{}, value),
    el('em',{}, meta)
  );
}


function dlpProgressPanelHead(title, meta) {
  return el('div',{class:'dlp-progress-panel-head'},
    el('strong',{}, title),
    el('span',{}, meta)
  );
}


function dlpSeriesByDate(rows, field) {
  const byDate = {};
  for (const r of rows || []) {
    const d = String(r.reading_at || '').slice(0,10) || 'Today';
    const v = Number(r[field]);
    if (isNaN(v)) continue;
    (byDate[d] = byDate[d] || []).push(v);
  }
  return Object.keys(byDate).sort().map(date => ({
    label: date.slice(5),
    value: byDate[date].reduce((a,b)=>a+b,0) / byDate[date].length
  }));
}


function dlpChartPanel(title, sub, series, unit) {
  return el('div',{class:'dlp-chart-panel'},
    el('div',{class:'dlp-chart-head'}, el('strong',{}, title), el('span',{}, sub)),
    dlpSparkline(series),
    el('div',{class:'dlp-chart-foot'}, series.length ? `${series[series.length-1].value.toFixed(1)} ${unit}` : 'No readings yet')
  );
}


function dlpBarPanel(title, sub, values, unit) {
  const max = Math.max(40, ...values, 1);
  const bars = el('div',{class:'dlp-bar-chart'});
  (values.length ? values.slice(-8) : [0]).forEach(v => bars.appendChild(el('i',{style:`height:${Math.max(6, (v/max)*100)}%;`,title:String(v)})));
  return el('div',{class:'dlp-chart-panel'},
    el('div',{class:'dlp-chart-head'}, el('strong',{}, title), el('span',{}, sub)),
    bars,
    el('div',{class:'dlp-chart-foot'}, values.length ? `${values[values.length-1].toFixed(1)} ${unit}` : 'No dehu readings yet')
  );
}


function dlpSparkline(series) {
  const w = 320, h = 120, pad = 14;
  if (!series.length) return el('div',{class:'dlp-chart-empty'},'No trend yet');
  const vals = series.map(p => Number(p.value));
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const pts = series.map((p,i) => {
    const x = pad + (series.length === 1 ? (w-pad*2)/2 : i * ((w-pad*2)/(series.length-1)));
    const y = h - pad - ((Number(p.value)-min)/span) * (h-pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const svg = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#087d8a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts} ${w-pad},${h-pad} ${pad},${h-pad}" fill="rgba(8,125,138,.12)" stroke="none"/></svg>`;
  const div = el('div',{class:'dlp-sparkline'});
  div.innerHTML = svg;
  return div;
}


function dlpMaterialRows(surfaces, latestMoisture, surfaceById, standards) {
  const byMat = {};
  const stdByMat = Object.fromEntries((standards || []).map(s => [String(s.material || '').toLowerCase(), s]));
  for (const s of surfaces || []) {
    const mat = materialClassClient(s.material || s.surface_type || 'other');
    byMat[mat] = byMat[mat] || { label: mat, surfaces:0, points:0, dry:0, goal:null };
    byMat[mat].surfaces++;
    byMat[mat].goal = s.dry_goal != null ? `${s.dry_goal} ${s.dry_goal_unit || ''}` : (stdByMat[mat]?.dry_goal ? `${stdByMat[mat].dry_goal} ${stdByMat[mat].dry_goal_unit || ''}` : 'unset');
  }
  for (const m of latestMoisture || []) {
    const s = surfaceById[String(m.claim_surface_id)] || {};
    const mat = materialClassClient(s.material || s.surface_type || 'other');
    byMat[mat] = byMat[mat] || { label: mat, surfaces:0, points:0, dry:0, goal:'unset' };
    byMat[mat].points++;
    const goal = m.dry_goal_snapshot != null ? Number(m.dry_goal_snapshot) : Number(s.dry_goal);
    if (goal && Number(m.moisture_value) <= goal) byMat[mat].dry++;
  }
  return Object.values(byMat).map(r => Object.assign(r, { ready: r.points > 0 && r.dry >= r.points }));
}


function dlpProgressGap(done, label, meta) {
  return el('div',{class:'dlp-progress-gap ' + (done ? 'done' : 'todo')},
    el('span',{}, done ? '✓' : '!'),
    el('strong',{}, label),
    el('em',{}, meta)
  );
}


function materialClassClient(label) {
  const s = String(label || '').toLowerCase();
  if (s.includes('drywall')) return 'drywall';
  if (s.includes('wood') || s.includes('osb') || s.includes('plywood')) return 'wood';
  if (s.includes('subfloor')) return 'subfloor';
  if (s.includes('concrete') || s.includes('masonry')) return 'concrete';
  if (s.includes('carpet')) return 'carpet';
  if (s.includes('pad')) return 'pad';
  if (s.includes('tile')) return 'tile';
  if (s.includes('insulation')) return 'insulation';
  return s || 'other';
}


async function renderDlpReportReview(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/report-review', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO - Report Review');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);
  const loading = el('div',{class:'dlp-empty'},'Checking report readiness...');
  screen.appendChild(loading);
  root.appendChild(screen);

  let job=null, visits=[], rooms=[], zones=[], tasks=[], alerts=[], photos=[], workItems=[], deploys=[], moisture=[], atmos=[], dehu=[], standards=[];
  try {
    const [j,v,r,z,t,a,p,w,d,m,atm,dh,std] = await Promise.all([
      apiGet(`/jobs/${claim_id}`).catch(()=>null),
      apiGet(`/visits?job_id=${claim_id}`).catch(()=>[]),
      apiGet(`/claim-rooms?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/drying-zones?claim_id=${claim_id}&include_closed=1`).catch(()=>[]),
      apiGet(`/claim-tasks?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/alerts?claim_id=${claim_id}&state=open`).catch(()=>[]),
      apiGet(`/entity-attachments?entity_type=visit&claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/room-work-items?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/equipment-deploys?job_id=${claim_id}&active=1`).catch(()=>[]),
      apiGet(`/readings/moisture?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/zone-atmosphere?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/dehu?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/claim-material-standards?claim_id=${claim_id}`).catch(()=>[]),
    ]);
    job = j || null;
    visits = Array.isArray(v)?v:[];
    rooms = Array.isArray(r)?r:[];
    zones = Array.isArray(z)?z:[];
    tasks = Array.isArray(t)?t:[];
    alerts = Array.isArray(a)?a:[];
    photos = Array.isArray(p)?p:[];
    workItems = Array.isArray(w)?w:[];
    deploys = Array.isArray(d)?d:[];
    moisture = Array.isArray(m)?m:[];
    atmos = Array.isArray(atm)?atm:[];
    dehu = Array.isArray(dh)?dh:[];
    standards = Array.isArray(std)?std:[];
  } catch(e){}

  let surfaces = [], points = [], sketches = [];
  try {
    const surfaceLists = await Promise.all(zones.map(z => apiGet(`/claim-surfaces?drying_zone_id=${z.id}`).catch(()=>[])));
    surfaces = surfaceLists.flat().filter(Boolean);
    const pointLists = await Promise.all(surfaces.map(s => apiGet(`/reading-points?claim_surface_id=${s.id}`).catch(()=>[])));
    points = pointLists.flat().filter(Boolean);
    const sketchLists = await Promise.all(zones.map(z => apiGet(`/drying-zones/${z.id}/sketch-cad`).catch(()=>null)));
    sketches = sketchLists.map((sk, i) => ({zone: zones[i], sketch: sk?.data || sk})).filter(x => x.sketch?.state_json);
  } catch(e){}
  loading.remove();

  const imagePhotos = photos.filter(p => /^image\//.test(String(p.mime_type||'')) || /\.(jpe?g|png|gif|webp|svg|heic)$/i.test(String(p.original_name||p.file_url||'')));
  const tasksDone = tasks.filter(t => t.state === 'complete' || t.state === 'skipped').length;
  const latestByPoint = {};
  for (const m of moisture) {
    const k = String(m.reading_point_id || '');
    if (!k) continue;
    if (!latestByPoint[k] || String(m.reading_at || '') > String(latestByPoint[k].reading_at || '')) latestByPoint[k] = m;
  }
  const latestMoisture = Object.values(latestByPoint);
  const cadRows = sketches.flatMap(x => dlpReportCadRowsFromState(x.sketch.state_json, x.zone));
  const cadTotals = cadRows.reduce((acc, row) => {
    acc.floor_sf += Number(row.floor_sf) || 0;
    acc.wall_sf += Number(row.wall_sf) || 0;
    if (row.wet_area === 'Yes') acc.wet_rooms += 1;
    return acc;
  }, {floor_sf:0, wall_sf:0, wet_rooms:0});
  const checks = [
    { label:'Open alerts resolved', done: alerts.length === 0, meta: alerts.length ? alerts.length + ' open' : 'clear', weight:14 },
    { label:'Rooms and chambers built', done: rooms.length > 0 && zones.length > 0, meta: `${rooms.length} rooms / ${zones.length} chambers`, weight:12 },
    { label:'Sketch / scan attached', done: sketches.length > 0 || cadRows.length > 0, meta: cadRows.length ? cadRows.length + ' measured rooms' : 'missing', weight:12 },
    { label:'Surfaces and materials selected', done: surfaces.length > 0, meta: surfaces.length + ' surfaces', weight:12 },
    { label:'Dry standards set', done: standards.length > 0, meta: standards.length ? standards.length + ' standards' : 'missing', weight:10 },
    { label:'Moisture readings captured', done: latestMoisture.length >= Math.max(1, points.length), meta: `${latestMoisture.length}/${points.length || 0} points`, weight:14 },
    { label:'Atmosphere readings captured', done: atmos.length > 0, meta: atmos.length + ' readings', weight:8 },
    { label:'Photos attached', done: imagePhotos.length >= 3, meta: imagePhotos.length + ' photos', weight:10 },
    { label:'Work log documented', done: workItems.length > 0, meta: workItems.length + ' entries', weight:8 },
  ];
  const totalWeight = checks.reduce((sum,c)=>sum+c.weight,0) || 1;
  const score = Math.round((checks.reduce((sum,c)=>sum+(c.done?c.weight:0),0) / totalWeight) * 100);
  const blockers = checks.filter(c => !c.done);
  const reportTitle = (job?.customer || selectedJob.customer || 'DryLog Claim') + ' Drying Report';
  const firstVisit = visits.map(v => v.visit_date).sort()[0] || '';
  const lastVisit = visits.map(v => v.visit_date).sort().slice(-1)[0] || '';
  const narrativeLines = dlpReportNarrativeLines({job, rooms, zones, surfaces, latestMoisture, imagePhotos, deploys, blockers, cadRows, cadTotals});
  const reportPackage = dlpBuildReportPackage({
    job, visits, rooms, zones, tasks, alerts, imagePhotos, workItems, deploys,
    moisture, atmos, dehu, standards, surfaces, points, checks, score,
    cadRows, cadTotals, narrativeLines
  });

  screen.appendChild(el('section',{class:'dlp-report-hero'},
    el('div',{},
      el('div',{class:'dlp-report-kicker'},'Report review'),
      el('div',{class:'dlp-report-title'}, score + '% ready'),
      el('div',{class:'dlp-report-sub'}, reportTitle + (job?.address ? ' | ' + job.address : ''))
    ),
    el('div',{class:'dlp-report-actions'},
      (() => { const b=el('button',{type:'button'},'Preview'); b.addEventListener('click',()=>window.print()); return b; })(),
      (() => { const b=el('button',{type:'button'},'Download JSON'); b.addEventListener('click',()=>_dlpCadDownloadJson('drylog-report-package.json', reportPackage)); return b; })(),
      (() => { const b=el('button',{type:'button'},'Readings'); b.addEventListener('click',renderDlpDryingProgress); return b; })()
    )
  ));

  screen.appendChild(el('section',{class:'dlp-report-stats'},
    dlpReportStat('Visits', String(visits.length), firstVisit && lastVisit ? `${firstVisit} to ${lastVisit}` : 'not started'),
    dlpReportStat('Photos', String(imagePhotos.length), 'report gallery'),
    dlpReportStat('Readings', String(moisture.length + atmos.length + dehu.length), 'moisture + psychro'),
    dlpReportStat('Sketch SF', String(_dlpCadRound(cadTotals.floor_sf, 1)), cadRows.length ? cadRows.length + ' measured rooms' : 'no sketch'),
    dlpReportStat('Tasks', `${tasksDone}/${tasks.length}`, 'workflow complete')
  ));

  const body = el('section',{class:'dlp-report-body'});
  const qa = el('div',{class:'dlp-report-panel'});
  qa.appendChild(dlpProgressPanelHead('QA checklist', blockers.length ? blockers.length + ' gaps before send' : 'Ready for review'));
  checks.forEach(c => qa.appendChild(dlpReportCheck(c.done, c.label, c.meta)));

  const contents = el('div',{class:'dlp-report-panel'});
  contents.appendChild(dlpProgressPanelHead('Report package', 'Sections that will be included'));
  [
    ['Job summary', true, job?.loss_type || 'Water mitigation'],
    ['Drying chambers', zones.length > 0, zones.length + ' chambers'],
    ['CAD sketch + measurements', cadRows.length > 0, cadRows.length ? `${_dlpCadRound(cadTotals.floor_sf,1)} floor sf` : 'missing'],
    ['Materials and dry goals', standards.length > 0, standards.length + ' standards'],
    ['Moisture trend tables', moisture.length > 0, moisture.length + ' readings'],
    ['Atmospheric readings', atmos.length > 0, atmos.length + ' readings'],
    ['Equipment history', deploys.length > 0, deploys.length + ' active units'],
    ['Work performed', workItems.length > 0, workItems.length + ' entries'],
    ['Photo appendix', imagePhotos.length > 0, imagePhotos.length + ' photos'],
  ].forEach(x => contents.appendChild(dlpReportCheck(x[1], x[0], x[2])));

  const measures = el('div',{class:'dlp-report-panel dlp-report-measures'});
  measures.appendChild(dlpProgressPanelHead('Sketch measurements', cadRows.length ? `${_dlpCadRound(cadTotals.floor_sf,1)} sf floor / ${_dlpCadRound(cadTotals.wall_sf,1)} sf walls` : 'No CAD package yet'));
  if (!cadRows.length) {
    measures.appendChild(el('div',{class:'dlp-command-empty'},'Import a scan or draw rooms in Sketch / CAD to include measurements in the report.'));
  } else {
    const table = el('div',{class:'dlp-report-table'},
      el('div',{class:'dlp-report-table-row head'}, el('span',{},'Room'), el('span',{},'Size'), el('span',{},'Floor'), el('span',{},'Walls'), el('span',{},'Wet'))
    );
    cadRows.slice(0, 8).forEach(row => table.appendChild(el('div',{class:'dlp-report-table-row'},
      el('strong',{}, row.room),
      el('span',{}, `${row.width_ft}' x ${row.length_ft}'`),
      el('span',{}, `${row.floor_sf} sf`),
      el('span',{}, `${row.wall_sf} sf`),
      el('span',{}, row.wet_area)
    )));
    measures.appendChild(table);
  }

  const narrative = el('div',{class:'dlp-report-panel dlp-report-narrative'});
  narrative.appendChild(dlpProgressPanelHead('Narrative draft', 'Carrier-facing summary starter'));
  narrativeLines.forEach(line => narrative.appendChild(el('p',{}, line)));

  body.append(qa, contents, measures, narrative);
  screen.appendChild(body);

  const packet = el('section',{class:'dlp-packet'});
  packet.appendChild(el('div',{class:'dlp-packet-cover'},
    el('div',{},
      el('div',{class:'dlp-packet-kicker'},'DryLog PRO Documentation Packet'),
      el('h1',{}, reportTitle),
      el('p',{}, job?.address || selectedJob.address || 'Job address pending')
    ),
    el('div',{class:'dlp-packet-score'},
      el('strong',{}, score + '%'),
      el('span',{}, blockers.length ? blockers.length + ' review gaps' : 'Ready for office review')
    )
  ));
  packet.appendChild(el('div',{class:'dlp-packet-grid'},
    dlpPacketMini('Visits', String(visits.length), firstVisit && lastVisit ? `${firstVisit} - ${lastVisit}` : 'not started'),
    dlpPacketMini('Photos', String(imagePhotos.length), 'appendix ready'),
    dlpPacketMini('Readings', String(moisture.length + atmos.length + dehu.length), 'field data'),
    dlpPacketMini('Sketch', cadRows.length ? `${_dlpCadRound(cadTotals.floor_sf,1)} sf` : 'Missing', cadRows.length ? 'measured floor' : 'needs CAD')
  ));
  packet.appendChild(dlpPacketSection('Narrative', narrativeLines.map(line => el('p',{}, line))));
  packet.appendChild(dlpPacketSection('Sketch Measurements',
    cadRows.length
      ? [dlpReportPacketTable(cadRows)]
      : [el('p',{},'No CAD sketch measurements are attached yet.')]
  ));
  packet.appendChild(dlpPacketSection('Readings Summary', [
    el('p',{}, `${latestMoisture.length} current moisture point${latestMoisture.length===1?'':'s'} are represented from ${moisture.length} total moisture reading${moisture.length===1?'':'s'}.`),
    el('p',{}, `${atmos.length} chamber atmosphere reading${atmos.length===1?'':'s'} and ${dehu.length} dehumidifier performance reading${dehu.length===1?'':'s'} are available for psychrometric review.`)
  ]));
  packet.appendChild(dlpPacketSection('Equipment And Work Performed', [
    el('p',{}, `${deploys.length} active equipment deployment${deploys.length===1?'':'s'} documented. ${workItems.length} work log entr${workItems.length===1?'y':'ies'} recorded.`)
  ]));
  const photoNodes = imagePhotos.slice(0, 8).map(p => el('figure',{class:'dlp-packet-photo'},
    el('img',{src:p.file_url ? ('/' + String(p.file_url).replace(/^\/+/, '')) : 'mock-photo.svg', alt:p.caption || p.original_name || 'Job photo'}),
    el('figcaption',{}, p.caption || p.original_name || 'Job photo')
  ));
  packet.appendChild(dlpPacketSection('Photo Appendix', photoNodes.length ? [el('div',{class:'dlp-packet-photos'}, ...photoNodes)] : [el('p',{},'No report photos attached yet.')]));
  screen.appendChild(packet);
}


function dlpReportStat(label, value, meta) {
  return el('div',{class:'dlp-report-stat'}, el('span',{},label), el('strong',{},value), el('em',{},meta));
}


function dlpReportCheck(done, label, meta) {
  return el('div',{class:'dlp-report-check ' + (done ? 'done':'todo')},
    el('span',{}, done ? '✓':'!'),
    el('strong',{},label),
    el('em',{},meta)
  );
}


function dlpReportCadRowsFromState(state, zone){
  if (!state || !Array.isArray(state.rooms)) return [];
  const water = Array.isArray(state.water) ? state.water : [];
  return state.rooms.map((room, idx) => {
    const widthFt = Number(room.w || 0) / DLP_CAD_PX_PER_FT;
    const lengthFt = Number(room.h || 0) / DLP_CAD_PX_PER_FT;
    const ceiling = Number(room.ceiling_height_ft) || 8;
    const area = room.area_sf != null ? Number(room.area_sf) : widthFt * lengthFt;
    const perimeter = room.linear_ft != null ? Number(room.linear_ft) : 2 * (widthFt + lengthFt);
    const wallSf = room.wall_sf != null ? Number(room.wall_sf) : perimeter * ceiling;
    return {
      zone: zone?.name || zone?.label || 'Drying chamber',
      room: room.label || `Room ${idx + 1}`,
      width_ft: _dlpCadRound(widthFt, 2),
      length_ft: _dlpCadRound(lengthFt, 2),
      ceiling_ft: _dlpCadRound(ceiling, 2),
      floor_sf: _dlpCadRound(area, 1),
      perimeter_lf: _dlpCadRound(perimeter, 1),
      wall_sf: _dlpCadRound(wallSf, 1),
      wet_area: water.some(w => w.roomIdx === idx) ? 'Yes' : 'No',
      source: room.scan_source || state.scan_meta?.source || 'Manual sketch',
    };
  });
}


function dlpReportNarrativeLines(ctx){
  const job = ctx.job || {};
  const rooms = ctx.rooms || [];
  const zones = ctx.zones || [];
  const surfaces = ctx.surfaces || [];
  const latestMoisture = ctx.latestMoisture || [];
  const imagePhotos = ctx.imagePhotos || [];
  const deploys = ctx.deploys || [];
  const blockers = ctx.blockers || [];
  const cadRows = ctx.cadRows || [];
  const cadTotals = ctx.cadTotals || {floor_sf:0, wall_sf:0};
  return [
    `${job?.customer || selectedJob.customer || 'The insured location'} was documented for ${job?.loss_type || 'water mitigation'}${job?.source_of_loss ? ' from ' + String(job.source_of_loss).toLowerCase() : ''}. The affected areas currently include ${rooms.map(r=>r.name || r.label).filter(Boolean).join(', ') || 'documented rooms'} with ${zones.length} drying chamber${zones.length===1?'':'s'}.`,
    `Technicians documented ${surfaces.length} affected surface${surfaces.length===1?'':'s'}, ${latestMoisture.length} active reading point${latestMoisture.length===1?'':'s'}, ${imagePhotos.length} job photo${imagePhotos.length===1?'':'s'}, and ${deploys.length} active equipment deployment${deploys.length===1?'':'s'}.`,
    cadRows.length ? `The sketch package includes ${cadRows.length} measured room${cadRows.length===1?'':'s'} totaling ${_dlpCadRound(cadTotals.floor_sf,1)} floor sf and ${_dlpCadRound(cadTotals.wall_sf,1)} wall sf for report review.` : 'No CAD sketch measurements have been attached yet; add a sketch or scan import before final report delivery.',
    blockers.length ? `Before issuing the final report, address: ${blockers.map(b=>b.label.toLowerCase()).join(', ')}.` : 'The file has no current report blockers and is ready for office review.'
  ];
}


function dlpBuildReportPackage(ctx){
  return {
    generated_at: new Date().toISOString(),
    claim: {
      id: selectedJob?.job_id || null,
      customer: ctx.job?.customer || selectedJob?.customer || selectedJob?.name || null,
      address: ctx.job?.address || selectedJob?.address || null,
      loss_type: ctx.job?.loss_type || 'Water mitigation',
      source_of_loss: ctx.job?.source_of_loss || null,
    },
    readiness: {
      score: ctx.score,
      checks: (ctx.checks || []).map(c => ({label:c.label, done:!!c.done, meta:c.meta, weight:c.weight})),
    },
    counts: {
      visits: (ctx.visits||[]).length,
      rooms: (ctx.rooms||[]).length,
      zones: (ctx.zones||[]).length,
      surfaces: (ctx.surfaces||[]).length,
      reading_points: (ctx.points||[]).length,
      moisture_readings: (ctx.moisture||[]).length,
      atmosphere_readings: (ctx.atmos||[]).length,
      dehu_readings: (ctx.dehu||[]).length,
      photos: (ctx.imagePhotos||[]).length,
      equipment: (ctx.deploys||[]).length,
      work_items: (ctx.workItems||[]).length,
      alerts_open: (ctx.alerts||[]).length,
    },
    sketch_measurements: {
      totals: {
        floor_sf: _dlpCadRound(ctx.cadTotals?.floor_sf || 0, 1),
        wall_sf: _dlpCadRound(ctx.cadTotals?.wall_sf || 0, 1),
        wet_rooms: ctx.cadTotals?.wet_rooms || 0,
      },
      rooms: ctx.cadRows || [],
    },
    narrative: ctx.narrativeLines || [],
  };
}


function dlpPacketMini(label, value, meta){
  return el('div',{class:'dlp-packet-mini'}, el('span',{},label), el('strong',{},value), el('em',{},meta));
}


function dlpPacketSection(title, children){
  const section = el('article',{class:'dlp-packet-section'}, el('h2',{}, title));
  (children || []).forEach(child => section.appendChild(child));
  return section;
}


function dlpReportPacketTable(rows){
  const table = el('div',{class:'dlp-packet-table'},
    el('div',{class:'dlp-packet-table-row head'}, el('span',{},'Room'), el('span',{},'Zone'), el('span',{},'Size'), el('span',{},'Floor'), el('span',{},'Walls'), el('span',{},'Wet'))
  );
  rows.forEach(row => table.appendChild(el('div',{class:'dlp-packet-table-row'},
    el('strong',{}, row.room),
    el('span',{}, row.zone),
    el('span',{}, `${row.width_ft}' x ${row.length_ft}'`),
    el('span',{}, `${row.floor_sf} sf`),
    el('span',{}, `${row.wall_sf} sf`),
    el('span',{}, row.wet_area)
  )));
  return table;
}

async function renderDlpSharePreview(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/share-preview', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO - Share Preview');
  root.appendChild(buildTopbar('Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen dlp-share'});
  screen.addEventListener('click', resetInactivity);
  const loading = el('div',{class:'dlp-empty'},'Building share preview...');
  screen.appendChild(loading);
  root.appendChild(screen);

  let job=null, visits=[], rooms=[], zones=[], alerts=[], photos=[], workItems=[], deploys=[], moisture=[], atmos=[], dehu=[], standards=[];
  try {
    const [j,v,r,z,a,p,w,d,m,atm,dh,std] = await Promise.all([
      apiGet(`/jobs/${claim_id}`).catch(()=>null),
      apiGet(`/visits?job_id=${claim_id}`).catch(()=>[]),
      apiGet(`/claim-rooms?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/drying-zones?claim_id=${claim_id}&include_closed=1`).catch(()=>[]),
      apiGet(`/alerts?claim_id=${claim_id}&state=open`).catch(()=>[]),
      apiGet(`/entity-attachments?entity_type=visit&claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/room-work-items?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/equipment-deploys?job_id=${claim_id}&active=1`).catch(()=>[]),
      apiGet(`/readings/moisture?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/zone-atmosphere?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/dehu?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/claim-material-standards?claim_id=${claim_id}`).catch(()=>[]),
    ]);
    job=j||null; visits=Array.isArray(v)?v:[]; rooms=Array.isArray(r)?r:[]; zones=Array.isArray(z)?z:[];
    alerts=Array.isArray(a)?a:[]; photos=Array.isArray(p)?p:[]; workItems=Array.isArray(w)?w:[];
    deploys=Array.isArray(d)?d:[]; moisture=Array.isArray(m)?m:[]; atmos=Array.isArray(atm)?atm:[]; dehu=Array.isArray(dh)?dh:[]; standards=Array.isArray(std)?std:[];
  } catch(e) {}

  let surfaces=[], points=[], sketches=[];
  try {
    const surfaceLists = await Promise.all(zones.map(z => apiGet(`/claim-surfaces?drying_zone_id=${z.id}`).catch(()=>[])));
    surfaces = surfaceLists.flat().filter(Boolean);
    const pointLists = await Promise.all(surfaces.map(s => apiGet(`/reading-points?claim_surface_id=${s.id}`).catch(()=>[])));
    points = pointLists.flat().filter(Boolean);
    const sketchLists = await Promise.all(zones.map(z => apiGet(`/drying-zones/${z.id}/sketch-cad`).catch(()=>null)));
    sketches = sketchLists.map((sk, i) => ({zone: zones[i], sketch: sk?.data || sk})).filter(x => x.sketch?.state_json);
  } catch(e) {}
  loading.remove();

  const imagePhotos = photos.filter(p => /^image\//.test(String(p.mime_type||'')) || /\.(jpe?g|png|gif|webp|svg|heic)$/i.test(String(p.original_name||p.file_url||'')));
  const latestByPoint = {};
  moisture.forEach(m => {
    const key = String(m.reading_point_id || '');
    if (key && (!latestByPoint[key] || String(m.reading_at || '') > String(latestByPoint[key].reading_at || ''))) latestByPoint[key] = m;
  });
  const latestMoisture = Object.values(latestByPoint);
  const dryPoints = latestMoisture.filter(m => Number(m.is_dry_at_time || 0) === 1).length;
  const openZones = zones.filter(z => !z.is_closed);
  const cadRows = sketches.flatMap(x => dlpReportCadRowsFromState(x.sketch.state_json, x.zone));
  const cadTotals = cadRows.reduce((acc, row) => {
    acc.floor_sf += Number(row.floor_sf) || 0;
    acc.wall_sf += Number(row.wall_sf) || 0;
    return acc;
  }, {floor_sf:0, wall_sf:0});
  const checks = [
    { label:'Rooms/chambers documented', done: rooms.length > 0 && zones.length > 0, meta:`${rooms.length} rooms / ${zones.length} chambers` },
    { label:'Readings captured', done: moisture.length > 0 || atmos.length > 0, meta:`${moisture.length + atmos.length + dehu.length} readings` },
    { label:'Photos attached', done: imagePhotos.length > 0, meta:`${imagePhotos.length} photos` },
    { label:'Work performed logged', done: workItems.length > 0, meta:`${workItems.length} entries` },
    { label:'Sketch/measurements included', done: cadRows.length > 0, meta: cadRows.length ? `${_dlpCadRound(cadTotals.floor_sf,1)} sf` : 'missing' },
    { label:'Open alerts clear', done: alerts.length === 0, meta: alerts.length ? `${alerts.length} open` : 'clear' },
  ];
  const readyPct = Math.round(checks.filter(c=>c.done).length / checks.length * 100);
  const shareSettings = dlpReadShareSettings(claim_id);
  const sharePayload = {
    generated_at: new Date().toISOString(),
    audience: shareSettings.audience || 'Adjuster / customer',
    claim: {
      id: claim_id,
      customer: job?.customer || selectedJob.customer || null,
      address: job?.address || selectedJob.address || null,
      claim_no: job?.claim_no || selectedJob.claim_no || null,
      loss_type: job?.loss_type || 'Water mitigation',
      source_of_loss: job?.source_of_loss || null,
    },
    summary: {
      readiness: readyPct,
      rooms: rooms.length,
      chambers: zones.length,
      open_chambers: openZones.length,
      photos: imagePhotos.length,
      moisture_readings: moisture.length,
      atmosphere_readings: atmos.length,
      active_equipment: deploys.length,
      work_items: workItems.length,
      measured_floor_sf: _dlpCadRound(cadTotals.floor_sf, 1),
      measured_wall_sf: _dlpCadRound(cadTotals.wall_sf, 1),
      dry_points: dryPoints,
      current_points: latestMoisture.length,
    },
    note: shareSettings.note || '',
    checks: checks.map(c => ({label:c.label, done:c.done, meta:c.meta})),
  };

  screen.appendChild(el('section',{class:'dlp-share-hero'},
    el('div',{},
      el('div',{class:'dlp-share-kicker'},'Share preview'),
      el('h1',{}, job?.customer || selectedJob.customer || 'DryLog claim'),
      el('p',{}, (job?.address || selectedJob.address || 'Address pending') + (job?.claim_no ? ' | Claim ' + job.claim_no : ''))
    ),
    el('div',{class:'dlp-share-score'}, el('strong',{}, readyPct + '%'), el('span',{}, 'send-ready'))
  ));

  const controls = el('section',{class:'dlp-share-controls'});
  const audience = dlpBuildSelect([['Adjuster / customer','Adjuster / customer'],['Customer','Customer'],['Adjuster','Adjuster'],['Internal review','Internal review']], shareSettings.audience || 'Adjuster / customer');
  const note = el('textarea',{rows:3,placeholder:'Short note for the share preview', value:shareSettings.note || dlpDefaultShareNote(job, rooms, zones, deploys)});
  const save = el('button',{type:'button',class:'dlp-build-primary'},'Save share note');
  save.addEventListener('click',()=>{
    dlpWriteShareSettings(claim_id,{audience:audience.value,note:note.value});
    tcToast('Share preview note saved', 'info');
    renderDlpSharePreview();
  });
  const copy = el('button',{type:'button',class:'dlp-build-secondary'},'Copy demo link');
  copy.addEventListener('click', async ()=>{
    const url = window.location.origin + window.location.pathname + '?job=' + encodeURIComponent(claim_id) + '&view=share-preview';
    try { await navigator.clipboard.writeText(url); tcToast('Demo link copied', 'info'); }
    catch(e){ prompt('Copy demo link', url); }
  });
  const download = el('button',{type:'button',class:'dlp-build-secondary'},'Download share JSON');
  download.addEventListener('click',()=>_dlpCadDownloadJson('drylog-share-preview.json', sharePayload));
  controls.append(
    el('div',{class:'dlp-share-control-main'}, el('label',{},'Audience', audience), note),
    el('div',{class:'dlp-share-control-actions'}, save, copy, download)
  );
  screen.appendChild(controls);

  screen.appendChild(el('section',{class:'dlp-share-stats'},
    dlpShareStat('Rooms', String(rooms.length), `${zones.length} chamber${zones.length===1?'':'s'}`),
    dlpShareStat('Photos', String(imagePhotos.length), 'documented'),
    dlpShareStat('Readings', String(moisture.length + atmos.length + dehu.length), dryPoints + '/' + latestMoisture.length + ' dry points'),
    dlpShareStat('Equipment', String(deploys.length), 'active'),
    dlpShareStat('Measured', cadRows.length ? _dlpCadRound(cadTotals.floor_sf,1) + ' sf' : 'Pending', cadRows.length ? 'floor area' : 'CAD needed')
  ));

  const body = el('section',{class:'dlp-share-body'});
  const publicSummary = el('div',{class:'dlp-share-card wide'});
  publicSummary.appendChild(dlpProgressPanelHead('Status update', shareSettings.audience || 'Adjuster / customer'));
  dlpShareSummaryLines({job, rooms, zones, openZones, deploys, workItems, imagePhotos, moisture, atmos, latestMoisture, dryPoints, cadRows, cadTotals, note: note.value}).forEach(line => publicSummary.appendChild(el('p',{},line)));
  body.appendChild(publicSummary);

  const readiness = el('div',{class:'dlp-share-card'});
  readiness.appendChild(dlpProgressPanelHead('Send checklist', checks.filter(c=>!c.done).length ? checks.filter(c=>!c.done).length + ' items light' : 'Looks complete'));
  checks.forEach(c => readiness.appendChild(dlpReportCheck(c.done, c.label, c.meta)));
  body.appendChild(readiness);

  const timeline = el('div',{class:'dlp-share-card'});
  timeline.appendChild(dlpProgressPanelHead('Recent activity', visits.length ? visits.length + ' visit records' : 'No visits yet'));
  const activity = dlpShareActivity(visits, imagePhotos, workItems, moisture, atmos).slice(0, 7);
  if (!activity.length) timeline.appendChild(el('div',{class:'dlp-command-empty'},'No activity has been captured yet.'));
  activity.forEach(item => timeline.appendChild(el('div',{class:'dlp-share-activity'}, el('strong',{},item.title), el('span',{},item.meta))));
  body.appendChild(timeline);

  const gallery = el('div',{class:'dlp-share-card wide'});
  gallery.appendChild(dlpProgressPanelHead('Photo preview', imagePhotos.length ? imagePhotos.length + ' available' : 'No photos yet'));
  if (imagePhotos.length) {
    gallery.appendChild(el('div',{class:'dlp-share-gallery'}, ...imagePhotos.slice(0, 6).map(p => el('figure',{},
      el('img',{src:p.file_url ? ('/' + String(p.file_url).replace(/^\/+/, '')) : 'mock-photo.svg', alt:p.caption || 'Job photo'}),
      el('figcaption',{}, p.caption || p.original_name || 'Job photo')
    ))));
  } else {
    gallery.appendChild(el('div',{class:'dlp-command-empty'},'Add arrival, source, equipment, and room photos from Buildout or Photos.'));
  }
  body.appendChild(gallery);

  screen.appendChild(body);
}

function dlpShareStat(label, value, meta){
  return el('div',{class:'dlp-share-stat'}, el('span',{},label), el('strong',{},value), el('em',{},meta));
}

function dlpDefaultShareNote(job, rooms, zones, deploys){
  return `Drying documentation is in progress for ${job?.customer || selectedJob.customer || 'this claim'}. Current affected areas include ${rooms.length || 'pending'} room${rooms.length===1?'':'s'} across ${zones.length || 'pending'} drying chamber${zones.length===1?'':'s'}, with ${deploys.length} active equipment deployment${deploys.length===1?'':'s'}.`;
}

function dlpShareSummaryLines(ctx){
  const note = (ctx.note || '').trim();
  return [
    note || dlpDefaultShareNote(ctx.job, ctx.rooms, ctx.zones, ctx.deploys),
    `${ctx.imagePhotos.length} photo${ctx.imagePhotos.length===1?'':'s'} and ${ctx.workItems.length} work log entr${ctx.workItems.length===1?'y':'ies'} are currently included in the file.`,
    `${ctx.moisture.length} moisture reading${ctx.moisture.length===1?'':'s'} and ${ctx.atmos.length} chamber atmosphere reading${ctx.atmos.length===1?'':'s'} have been captured. ${ctx.latestMoisture.length ? ctx.dryPoints + ' of ' + ctx.latestMoisture.length + ' current point' + (ctx.latestMoisture.length===1?' is':'s are') + ' at or below goal.' : 'Moisture point trends are pending.'}`,
    ctx.cadRows.length ? `Sketch measurements currently show ${_dlpCadRound(ctx.cadTotals.floor_sf,1)} floor sf and ${_dlpCadRound(ctx.cadTotals.wall_sf,1)} wall sf documented.` : 'Sketch measurements are not attached yet.'
  ];
}

function dlpShareActivity(visits, photos, workItems, moisture, atmos){
  const rows = [];
  visits.forEach(v => rows.push({title:'Visit created', meta:v.visit_date || v.created_at || ''}));
  photos.forEach(p => rows.push({title:'Photo added', meta:[p.caption || p.original_name || 'Job photo', p.uploaded_at].filter(Boolean).join(' | ')}));
  workItems.forEach(w => rows.push({title:'Work logged', meta:[w.label || w.notes || 'Work item', w.created_at].filter(Boolean).join(' | ')}));
  moisture.forEach(m => rows.push({title:'Moisture reading', meta:[m.moisture_value != null ? m.moisture_value + ' ' + (m.moisture_unit || '%MC') : null, m.reading_at].filter(Boolean).join(' | ')}));
  atmos.forEach(a => rows.push({title:'Atmosphere reading', meta:[a.temp_f != null ? a.temp_f + 'F / ' + a.rh_pct + '% RH' : null, a.reading_at].filter(Boolean).join(' | ')}));
  return rows.sort((a,b)=>String(b.meta || '').localeCompare(String(a.meta || '')));
}

function dlpReadShareSettings(claimId){
  try { return JSON.parse(localStorage.getItem('drylog_share_preview_' + claimId) || '{}'); }
  catch(e) { return {}; }
}

function dlpWriteShareSettings(claimId, patch){
  const next = Object.assign({}, dlpReadShareSettings(claimId), patch || {});
  localStorage.setItem('drylog_share_preview_' + claimId, JSON.stringify(next));
  return next;
}


async function renderDlpDailyVisitWizard(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/daily-visit', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Daily Visit');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  const loading = el('div',{class:'dlp-empty'},'Planning today’s walk…');
  screen.appendChild(loading);
  root.appendChild(screen);

  // Pull state needed to build the plan
  let zones=[], deploys=[], todayOutdoorRefs=[];
  try {
    const today = new Date().toISOString().slice(0,10);
    const [z, d, ref] = await Promise.all([
      apiGet(`/drying-zones?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/equipment-deploys?job_id=${claim_id}&active=1`).catch(()=>[]),
      apiGet(`/readings/reference?claim_id=${claim_id}`).catch(()=>[]),
    ]);
    zones = (Array.isArray(z)?z:[]).filter(zz => !zz.is_closed);
    deploys = Array.isArray(d)?d:[];
    todayOutdoorRefs = (Array.isArray(ref)?ref:[]).filter(r =>
      r.reading_type === 'outdoor' && String(r.reading_at).startsWith(today));
  } catch(e){}

  // Build step plan
  const steps = [];
  if (todayOutdoorRefs.length === 0) {
    steps.push({type:'outdoor_ref', label:'Outdoor baseline reading'});
  }
  for (const z of zones) {
    steps.push({type:'chamber_atm', label:`${z.name} — atmosphere`, zone_id:z.id, zone_name:z.name});
    // Moisture per point — one screen per chamber listing all its points
    steps.push({type:'chamber_moisture', label:`${z.name} — moisture readings`, zone_id:z.id, zone_name:z.name});
    // Dehu performance per deployed dehu in this chamber
    const chamberDehus = deploys.filter(d => parseInt(d.drying_zone_id||0,10) === parseInt(z.id,10)
      && /dehu/i.test(String(d.type||'')));
    for (const d of chamberDehus) {
      steps.push({type:'dehu', label:`${z.name} — dehu performance`, zone_id:z.id, zone_name:z.name, deploy:d});
    }
  }
  steps.push({type:'photos', label:'Photos for this visit'});
  steps.push({type:'done', label:'Done'});

  __dlpWizState = { steps, idx: 0, claim_id };
  loading.remove();
  await _dlpWizRenderStep();
}


async function _dlpWizRenderStep(){
  const st = __dlpWizState;
  if (!st) { renderDrylogPro(); return; }
  clear();
  root.appendChild(buildTopbar('← Exit Wizard', () => { __dlpWizState = null; renderDrylogPro(); }, {showClockLink:true}));

  const step = st.steps[st.idx];
  const total = st.steps.length;
  const screen = el('div',{class:'screen'});

  const pct = Math.round(((st.idx) / Math.max(1, total - 1)) * 100);
  screen.appendChild(_dlpWizHeader(st, step, total, pct));
  const content = el('section', { class:'dlp-visit-content' });
  screen.appendChild(content);

  root.appendChild(screen);

  if (step.type === 'outdoor_ref') {
    _dlpWizRenderOutdoor(content);
  } else if (step.type === 'chamber_atm') {
    _dlpWizRenderChamberAtm(content, step);
  } else if (step.type === 'chamber_moisture') {
    await _dlpWizRenderChamberMoisture(content, step);
  } else if (step.type === 'dehu') {
    _dlpWizRenderDehu(content, step);
  } else if (step.type === 'photos') {
    await _dlpWizRenderPhotos(content);
  } else if (step.type === 'done') {
    await _dlpWizRenderDone(content);
  }
}


function _dlpWizHeader(st, step, total, pct) {
  const wrap = el('section', { class:'dlp-visit-head' },
    el('div', { class:'dlp-visit-kicker' }, `Step ${Math.min(st.idx+1, total)} of ${total}`),
    el('div', { class:'dlp-visit-title' }, step.label),
    el('div', { class:'dlp-visit-sub' }, _dlpWizStepHelp(step)),
    el('div', { class:'dlp-visit-progress' }, el('i', { style:`width:${pct}%;` }))
  );
  const rail = el('div', { class:'dlp-visit-rail' });
  st.steps.forEach((s, i) => {
    const btn = el('button', {
      type:'button',
      class:'dlp-visit-step ' + (i < st.idx ? 'done' : i === st.idx ? 'active' : 'todo')
    },
      el('span', {}, String(i + 1)),
      el('strong', {}, _dlpWizStepShort(s))
    );
    btn.addEventListener('click', () => {
      if (!__dlpWizState || i > __dlpWizState.idx) return;
      __dlpWizState.idx = i;
      _dlpWizRenderStep();
    });
    rail.appendChild(btn);
  });
  wrap.appendChild(rail);
  return wrap;
}


function _dlpWizStepShort(step) {
  if (!step) return 'Step';
  if (step.type === 'outdoor_ref') return 'Outdoor';
  if (step.type === 'chamber_atm') return 'Atmosphere';
  if (step.type === 'chamber_moisture') return 'Moisture';
  if (step.type === 'dehu') return 'Dehu';
  if (step.type === 'photos') return 'Photos';
  if (step.type === 'done') return 'Review';
  return step.label || 'Step';
}


function _dlpWizStepHelp(step) {
  if (!step) return '';
  if (step.type === 'outdoor_ref') return 'Capture the outdoor baseline before comparing chamber drying conditions.';
  if (step.type === 'chamber_atm') return 'Log chamber air conditions so grain depression and dew point checks have context.';
  if (step.type === 'chamber_moisture') return 'Capture repeatable meter readings at the same points every visit.';
  if (step.type === 'dehu') return 'Compare intake and exhaust to show whether equipment is removing moisture.';
  if (step.type === 'photos') return 'Add progress photos, equipment placement, anomalies, and source-area documentation.';
  if (step.type === 'done') return 'Review today before leaving the job.';
  return '';
}


function _dlpWizFooter(canSkip, onSkip){
  const f = el('div',{style:'display:flex;gap:8px;margin-top:18px;'});
  const back = el('button',{style:'flex:0 0 80px;padding:11px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-weight:600;color:#475569;'},'← Back');
  back.addEventListener('click', () => {
    if (__dlpWizState && __dlpWizState.idx > 0) { __dlpWizState.idx--; _dlpWizRenderStep(); }
    else renderDrylogPro();
  });
  f.appendChild(back);
  if (canSkip) {
    const skip = el('button',{style:'flex:0 0 80px;padding:11px;background:transparent;border:1px solid transparent;color:#64748b;font-size:13px;font-weight:600;'},'Skip →');
    skip.addEventListener('click', onSkip || (() => { __dlpWizState.idx++; _dlpWizRenderStep(); }));
    f.appendChild(skip);
  }
  return f;
}


function _dlpWizAdvance(){
  if (!__dlpWizState) return;
  __dlpWizState.idx++;
  _dlpWizRenderStep();
}


// Outdoor reference step — inline form, save advances
function _dlpWizRenderOutdoor(screen){
  screen.appendChild(el('div',{style:'font-size:13px;color:#475569;margin-bottom:14px;line-height:1.5;'},
    "Capture today's outdoor temp + RH. Used as the baseline for chamber comparisons."));

  const grid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;'});
  const tInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Temp °F',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:18px;text-align:center;'});
  const rInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'RH %',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:18px;text-align:center;'});
  grid.appendChild(tInp); grid.appendChild(rInp);
  screen.appendChild(grid);

  const psyOut = el('div',{style:'padding:10px;background:#f8fafc;border-radius:8px;text-align:center;font-size:12px;color:#475569;margin-bottom:14px;min-height:18px;'},'');
  function refreshPsy(){
    const t = parseFloat(tInp.value), r = parseFloat(rInp.value);
    const p = _dlpPsychroClient(t, r);
    psyOut.textContent = p.gpp != null ? `GPP ${p.gpp.toFixed(1)} · dew point ${p.dew_point_f.toFixed(1)}°F` : '';
  }
  tInp.addEventListener('input', refreshPsy); rInp.addEventListener('input', refreshPsy);
  screen.appendChild(psyOut);

  const save = el('button',{style:'width:100%;padding:14px;background:#16a34a;color:#fff;border-radius:10px;font-size:15px;font-weight:700;'},'Save & Next →');
  save.addEventListener('click', async () => {
    const temp_f = parseFloat(tInp.value), rh_pct = parseFloat(rInp.value);
    if (isNaN(temp_f) || isNaN(rh_pct)) { alert('Temp and RH are required.'); return; }
    save.disabled = true; save.textContent = 'Saving…';
    try {
      const reading_at = new Date().toISOString().slice(0,19).replace('T',' ');
      const res = await apiPostOrQueue('/readings/reference', {
        claim_id: __dlpWizState.claim_id, reading_type:'outdoor',
        reading_at, temp_f, rh_pct,
      }, 'Outdoor reference — '+(__dlpWizState.claim_id||'claim'));
      if (res?.__queued) tcToast('📤 Offline — outdoor reading queued', 'info');
    } catch(e) { alert('Save failed: '+(e.message||e)); save.disabled = false; save.textContent='Save & Next →'; return; }
    _dlpWizAdvance();
  });
  screen.appendChild(save);
  screen.appendChild(_dlpWizFooter(true));
  setTimeout(() => tInp.focus(), 50);
}


// Chamber atmosphere step
function _dlpWizRenderChamberAtm(screen, step){
  screen.appendChild(el('div',{style:'font-size:13px;color:#475569;margin-bottom:14px;line-height:1.5;'},
    'Capture air temp + RH inside this chamber. Used for grain-depression checks against dehu performance.'));

  const grid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;'});
  const tInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Temp °F',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:18px;text-align:center;'});
  const rInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'RH %',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:18px;text-align:center;'});
  grid.appendChild(tInp); grid.appendChild(rInp);
  screen.appendChild(grid);

  const psyOut = el('div',{style:'padding:10px;background:#f8fafc;border-radius:8px;text-align:center;font-size:12px;color:#475569;margin-bottom:14px;min-height:18px;'},'');
  function refreshPsy(){
    const t = parseFloat(tInp.value), r = parseFloat(rInp.value);
    const p = _dlpPsychroClient(t, r);
    psyOut.textContent = p.gpp != null ? `GPP ${p.gpp.toFixed(1)} · dew point ${p.dew_point_f.toFixed(1)}°F` : '';
  }
  tInp.addEventListener('input', refreshPsy); rInp.addEventListener('input', refreshPsy);
  screen.appendChild(psyOut);

  const save = el('button',{style:'width:100%;padding:14px;background:#16a34a;color:#fff;border-radius:10px;font-size:15px;font-weight:700;'},'Save & Next →');
  save.addEventListener('click', async () => {
    const temp_f = parseFloat(tInp.value), rh_pct = parseFloat(rInp.value);
    if (isNaN(temp_f) || isNaN(rh_pct)) { alert('Temp and RH are required.'); return; }
    save.disabled = true; save.textContent = 'Saving…';
    try {
      const visit_id = await _dlpEnsureVisit(__dlpWizState.claim_id);
      const reading_at = new Date().toISOString().slice(0,19).replace('T',' ');
      const res = await apiPostOrQueue('/readings/zone-atmosphere', {
        drying_zone_id: step.zone_id, visit_id, reading_at, temp_f, rh_pct,
      }, 'Chamber atmosphere — zone '+step.zone_id);
      if (res?.__queued) tcToast('📤 Offline — atmosphere queued', 'info');
    } catch(e) { alert('Save failed: '+(e.message||e)); save.disabled = false; save.textContent='Save & Next →'; return; }
    _dlpWizAdvance();
  });
  screen.appendChild(save);
  screen.appendChild(_dlpWizFooter(true));
  setTimeout(() => tInp.focus(), 50);
}


// Chamber moisture step — lists all reading points in the chamber; tech taps
// "+" on each to enter the value inline. "Done" advances when all captured
// (or "Skip remaining" if they don't want to log all today).
async function _dlpWizRenderChamberMoisture(screen, step){
  screen.appendChild(el('div',{style:'font-size:13px;color:#475569;margin-bottom:14px;line-height:1.5;'},
    "Capture today's moisture at each reading point in this chamber. Tap a point to enter a value."));

  const loading = el('div',{class:'dlp-empty'},'Loading points…');
  screen.appendChild(loading);

  // Get all reading points in this chamber's surfaces
  const surfaces = await apiGet(`/claim-surfaces?drying_zone_id=${step.zone_id}`).catch(()=>[]);
  const surfArr = Array.isArray(surfaces)?surfaces:[];
  const pointsBySurface = {};
  for (const s of surfArr) {
    const pts = await apiGet(`/reading-points?claim_surface_id=${s.id}`).catch(()=>[]);
    pointsBySurface[s.id] = Array.isArray(pts) ? pts : [];
  }
  // Today's existing moisture readings (to mark "already done" with ✓)
  const today = new Date().toISOString().slice(0,10);
  const allMois = await apiGet(`/readings/moisture?drying_zone_id=${step.zone_id}`).catch(()=>[]);
  const capturedToday = new Set();
  for (const m of (Array.isArray(allMois)?allMois:[])) {
    if (String(m.reading_at).startsWith(today)) capturedToday.add(parseInt(m.reading_point_id,10));
  }
  loading.remove();

  if (surfArr.length === 0) {
    screen.appendChild(el('div',{class:'dlp-empty'},'No surfaces defined in this chamber yet. Skip to continue.'));
    screen.appendChild(_dlpWizFooter(true));
    return;
  }

  // Render surfaces + their points
  for (const s of surfArr) {
    const card = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;margin-bottom:8px;'});
    card.appendChild(el('div',{style:'font-weight:700;font-size:13px;color:#0f172a;margin-bottom:6px;'},
      (s.surface_label || s.surface_type) + (s.dry_goal != null ? ` · goal ${s.dry_goal} ${s.dry_goal_unit||'%MC'}` : '')));
    const pts = pointsBySurface[s.id] || [];
    if (pts.length === 0) {
      card.appendChild(el('div',{style:'font-size:12px;color:#94a3b8;font-style:italic;'},'No reading points on this surface yet.'));
    } else {
      for (const p of pts) {
        const captured = capturedToday.has(p.id);
        const row = el('div',{style:'display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #f1f5f9;'});
        row.appendChild(el('div',{style:`font-size:14px;font-weight:600;color:${captured?'#15803d':'#0f172a'};flex:1;`},
          (captured?'✓ ':'') + (p.point_label || ('P'+p.id))));
        const cap = el('button',{style:`padding:6px 12px;background:${captured?'#dcfce7':'#3b82f6'};color:${captured?'#166534':'#fff'};border-radius:6px;font-size:12px;font-weight:700;`}, captured?'Re-capture':'+ Capture');
        cap.addEventListener('click', () => renderDlpMoistureCapture(p.id, {
          surface_id: s.id, point_label: p.point_label,
          dry_goal: s.dry_goal, dry_goal_unit: s.dry_goal_unit,
        }));
        row.appendChild(cap);
        card.appendChild(row);
      }
    }
    screen.appendChild(card);
  }

  // "Next chamber" button — advances even if not every point was captured
  const next = el('button',{style:'width:100%;padding:14px;background:#3b82f6;color:#fff;border-radius:10px;font-size:15px;font-weight:700;margin-top:8px;'},'Next →');
  next.addEventListener('click', () => _dlpWizAdvance());
  screen.appendChild(next);
  screen.appendChild(_dlpWizFooter(true));
}


// Dehu performance step
function _dlpWizRenderDehu(screen, step){
  screen.appendChild(el('div',{style:'font-size:13px;color:#475569;margin-bottom:14px;line-height:1.5;'},
    `Capture intake + exhaust on this dehu: ${[step.deploy.type, step.deploy.make, step.deploy.model].filter(Boolean).join(' ')}`));

  screen.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;'},'Intake (room side)'));
  const intakeGrid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;'});
  const inT = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Intake °F',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:17px;text-align:center;'});
  const inR = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Intake RH %',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:17px;text-align:center;'});
  intakeGrid.appendChild(inT); intakeGrid.appendChild(inR);
  screen.appendChild(intakeGrid);

  screen.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;'},'Exhaust (dry side)'));
  const exhGrid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;'});
  const exT = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Exhaust °F',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:17px;text-align:center;'});
  const exR = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Exhaust RH %',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:17px;text-align:center;'});
  exhGrid.appendChild(exT); exhGrid.appendChild(exR);
  screen.appendChild(exhGrid);

  const gdCard = el('div',{style:'padding:12px;background:#f8fafc;border-radius:8px;text-align:center;margin-bottom:14px;'});
  const gdVal = el('div',{style:'font-size:24px;font-weight:800;color:#0f172a;'}, '— gpp');
  gdCard.appendChild(gdVal);
  gdCard.appendChild(el('div',{style:'font-size:11px;color:#64748b;margin-top:3px;'}, 'Grain depression — healthy 20–40'));
  screen.appendChild(gdCard);

  function refreshGd(){
    const iG = _dlpPsychroClient(parseFloat(inT.value), parseFloat(inR.value)).gpp;
    const eG = _dlpPsychroClient(parseFloat(exT.value), parseFloat(exR.value)).gpp;
    if (iG != null && eG != null) {
      const gd = iG - eG;
      gdVal.textContent = gd.toFixed(1) + ' gpp';
      gdVal.style.color = gd >= 20 && gd <= 40 ? '#15803d' : (gd >= 10 ? '#a16207' : '#b91c1c');
    } else { gdVal.textContent = '— gpp'; gdVal.style.color = '#0f172a'; }
  }
  for (const i of [inT,inR,exT,exR]) i.addEventListener('input', refreshGd);

  const save = el('button',{style:'width:100%;padding:14px;background:#7c3aed;color:#fff;border-radius:10px;font-size:15px;font-weight:700;'},'Save & Next →');
  save.addEventListener('click', async () => {
    const itf = parseFloat(inT.value), irh = parseFloat(inR.value);
    const etf = parseFloat(exT.value), erh = parseFloat(exR.value);
    if ([itf,irh,etf,erh].some(isNaN)) { alert('All four values required.'); return; }
    save.disabled = true; save.textContent = 'Saving…';
    try {
      const visit_id = await _dlpEnsureVisit(__dlpWizState.claim_id);
      const reading_at = new Date().toISOString().slice(0,19).replace('T',' ');
      await apiPost('/readings/dehu', {
        drying_zone_id: step.zone_id, equipment_deploy_id: step.deploy.id, visit_id, reading_at,
        intake_temp_f:itf, intake_rh_pct:irh, exhaust_temp_f:etf, exhaust_rh_pct:erh,
      });
    } catch(e) { alert('Save failed: '+(e.message||e)); save.disabled = false; save.textContent='Save & Next →'; return; }
    _dlpWizAdvance();
  });
  screen.appendChild(save);
  screen.appendChild(_dlpWizFooter(true));
  setTimeout(() => inT.focus(), 50);
}


// Photo dump step — multi-upload tied to the current visit. Tech shoots a
// chamber walk-around (or general progress photos) and they attach to the
// visit row via entity_attachments(entity_type='visit'). Optional; Skip
// advances without uploading anything.
async function _dlpWizRenderPhotos(screen){
  const claim_id = __dlpWizState.claim_id;
  let visit_id;
  try { visit_id = await _dlpEnsureVisit(claim_id); } catch(e){}
  if (!visit_id) {
    screen.appendChild(el('div',{class:'dlp-empty'},'No active visit yet — capture a reading first to start one.'));
    screen.appendChild(_dlpWizFooter(true));
    return;
  }
  screen.appendChild(el('div',{style:'font-size:13px;color:#475569;margin-bottom:14px;line-height:1.5;'},
    "Optional — snap photos for this visit (chamber walk-around, anomalies, equipment placement, customer signage). They attach to the visit and show up in the office app + carrier report."));

  // Render the photo grid inline (shared component used elsewhere too)
  const wrap = el('div',{});
  await _dlpRenderPhotoGrid(wrap, 'visit', visit_id);
  screen.appendChild(wrap);

  const next = el('button',{style:'width:100%;padding:14px;background:#16a34a;color:#fff;border-radius:10px;font-size:15px;font-weight:700;margin-top:14px;'},'Next →');
  next.addEventListener('click', () => _dlpWizAdvance());
  screen.appendChild(next);
  screen.appendChild(_dlpWizFooter(true));
}


// Reusable photo grid: shows existing attachments for (entity_type, entity_id)
// + a tappable "+ Add photo" tile that triggers a hidden file input. After
// upload, the grid re-renders. Captions optional.
async function _dlpRenderPhotoGrid(container, entity_type, entity_id, opts){
  opts = opts || {};
  container.innerHTML = '';
  const grid = el('div',{style:'display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;'});
  container.appendChild(grid);

  // Photos to show: a caller may pass a pre-fetched list (opts.photos) — the
  // claim-level Photos screen fetches once and slices per room bucket —
  // otherwise fetch this entity's attachments (the default per-visit behavior
  // used by the daily-visit wizard).
  let photos;
  if (Array.isArray(opts.photos)) {
    photos = opts.photos;
  } else {
    let existing = [];
    try { existing = await apiGet(`/entity-attachments?entity_type=${entity_type}&entity_id=${entity_id}`); }
    catch(e){}
    photos = (Array.isArray(existing)?existing:[])
      .filter(a => /^image\//.test(String(a.mime_type||'')) || /\.(jpe?g|png|gif|webp|heic)$/i.test(String(a.original_name||'')));
  }

  for (const p of photos) {
    const tappable = !!opts.onPhotoTap;
    const tile = el(tappable ? 'button' : 'div',{style:'position:relative;aspect-ratio:1/1;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;padding:0;cursor:'+(tappable?'pointer':'default')+';'});
    tile.appendChild(el('img',{src:'/' + p.file_url, style:'width:100%;height:100%;object-fit:cover;display:block;'}));
    if (p.caption) {
      tile.appendChild(el('div',{style:'position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;padding:3px 5px;line-height:1.2;'}, p.caption));
    }
    if (tappable) tile.addEventListener('click', () => opts.onPhotoTap(p));
    grid.appendChild(tile);
  }

  // Add-photo tile. Uploads attach to the upload target (defaults to this
  // entity; the Photos screen always uploads to today's visit) and carry the
  // bucket's claim_room_id when provided.
  const uploadType = opts.uploadEntityType || entity_type;
  const uploadId   = opts.uploadEntityId   || entity_id;

  // Offline-pending uploads for this entity/bucket — show a dimmed "⏳ Offline"
  // tile so the tech sees the photo is saved and will sync, not lost.
  try {
    const pend = tcQueueRead().filter(it => it.kind === 'entity_photo_upload'
      && it.entity_type === uploadType && String(it.entity_id) === String(uploadId)
      && (opts.claimRoomId == null || String(it.claim_room_id) === String(opts.claimRoomId)));
    for (const it of pend) {
      const ptile = el('div',{style:'position:relative;aspect-ratio:1/1;border-radius:8px;overflow:hidden;border:1px solid #fcd34d;background:#fffbeb;'});
      const pimg = el('img',{style:'width:100%;height:100%;object-fit:cover;display:block;opacity:0.65;'});
      tcPhotoSrc(it.photo_id).then(src => { if (src) pimg.src = src; });
      ptile.appendChild(pimg);
      ptile.appendChild(el('div',{style:'position:absolute;left:0;right:0;bottom:0;background:rgba(180,83,9,0.85);color:#fff;font-size:9px;padding:3px 5px;'}, '⏳ Offline'));
      grid.appendChild(ptile);
    }
  } catch(e){}

  const addTile = el('button',{style:'aspect-ratio:1/1;border:2px dashed #3b82f6;background:#eff6ff;border-radius:8px;color:#1d4ed8;font-size:11px;font-weight:700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;'},
    el('div',{style:'font-size:24px;'},'📷'),
    el('div',{}, photos.length===0 ? 'Add photo' : '+ Add')
  );
  // Two inputs: camera (capture=environment opens the camera directly) and
  // library (no capture → photo library / file picker, multi-select). Tapping
  // the add tile lets the tech choose between them.
  const camInput = el('input',{type:'file',accept:'image/*',capture:'environment',style:'display:none;'});
  const libInput = el('input',{type:'file',accept:'image/*',multiple:'true',style:'display:none;'});

  async function uploadFiles(files){
    if (!files || files.length === 0) return;
    addTile.disabled = true;
    let i = 0;
    for (const f of files) {
      i++;
      addTile.lastChild.textContent = `${i} / ${files.length}…`;
      let compressed = null;
      try {
        // Compress before upload — iPad-camera-roll JPEGs come in at 3-5 MB;
        // tcCompressFile returns ~300-500 KB. 10x faster upload on LTE,
        // 10x less server storage, visually identical on the carrier PDF.
        compressed = await tcCompressFile(f);
        const fd = new FormData();
        fd.append('file', compressed);
        fd.append('entity_type', uploadType);
        fd.append('entity_id', String(uploadId));
        if (opts.caption) fd.append('caption', opts.caption);
        if (opts.claimRoomId != null) fd.append('claim_room_id', String(opts.claimRoomId));
        const resp = await fetch(API + '/entity-attachments', {
          method:'POST',
          headers: token ? {'Authorization':'Bearer '+token} : {},
          body: fd,
        });
        // Use the app's tolerant reader (handles non-JSON / PHP error pages)
        // so a server hiccup surfaces a real "HTTP 500: …" message instead of
        // an opaque "string did not match the expected pattern" parse throw.
        const j = await _tcApiRead(resp);
        if (!resp.ok || j.success === false) throw new Error(j.error || ('HTTP ' + resp.status));
        // Call optional onUpload callback with the new attachment row
        if (opts.onUpload) opts.onUpload(j.data || j);
      } catch (e) {
        if (tcIsNetworkError(e)) {
          // Offline — stash the photo in IndexedDB + queue a deferred upload so
          // it isn't lost (mirrors Construction Daily's basement-proof capture).
          try {
            const dataUrl = await tcFileToDataUrl(compressed || f);
            const pid = tcPhotoNewId();
            await tcPhotoPut(pid, dataUrl);
            tcQueueAdd({kind:'entity_photo_upload', label:'Photo (offline)',
              entity_type:uploadType, entity_id:uploadId, photo_id:pid,
              caption:opts.caption||null,
              claim_room_id:(opts.claimRoomId!=null?opts.claimRoomId:null)});
            tcToast('📤 Saved offline — uploads when back online','info');
          } catch(err){ alert('Could not save photo offline: '+(err.message||err)); }
        } else {
          alert('Upload failed (' + (f.name||'photo') + '): ' + (e.message||e));
        }
      }
    }
    addTile.disabled = false;
    // After the batch: let the caller refresh the whole screen (so counts +
    // buckets stay consistent); otherwise re-render just this grid — the
    // original per-visit behavior, keeping the daily-visit wizard unchanged.
    if (opts.onChanged) { opts.onChanged(); }
    else { await _dlpRenderPhotoGrid(container, entity_type, entity_id, opts); }
  }

  // Capture the files, reset value (so re-picking the same file re-fires
  // change), then upload.
  camInput.addEventListener('change', () => { const fs = Array.from(camInput.files || []); camInput.value = ''; uploadFiles(fs); });
  libInput.addEventListener('change', () => { const fs = Array.from(libInput.files || []); libInput.value = ''; uploadFiles(fs); });
  addTile.addEventListener('click', () => _dlpPhotoSourceSheet(camInput, libInput));
  grid.appendChild(addTile);
  grid.appendChild(camInput);
  grid.appendChild(libInput);
}


// ─── DryLog PRO — Photos screen (room-bucketed) ──────────────────────────────
// Always-available photo capture. On a fresh job (0 chambers/rooms) the tech
// sees only the "Exterior / Arrival" bucket and can snap source-of-loss photos
// with zero setup; once rooms exist, each gets its own bucket and photos can be
// Moved between buckets. Every photo attaches to today's visit (so it appears
// in the office gallery) and carries a claim_room_id tag = the bucket.
async function renderDlpPhotos(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/photos', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Photos');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);
  screen.appendChild(el('div',{class:'dlp-section-h'},'Photos'));

  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  // Rooms + every visit photo for the claim, in parallel.
  let rooms = [], allPhotos = [];
  try {
    const [rm, ph] = await Promise.all([
      apiGet(`/claim-rooms?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/entity-attachments?entity_type=visit&claim_id=${claim_id}`).catch(()=>[]),
    ]);
    rooms = Array.isArray(rm) ? rm : [];
    allPhotos = (Array.isArray(ph)?ph:[])
      .filter(a => /^image\//.test(String(a.mime_type||'')) || /\.(jpe?g|png|gif|webp|heic)$/i.test(String(a.original_name||'')));
  } catch(e){}
  loading.remove();

  // Ensure today's visit up front so every bucket's add tile uploads to it.
  let visit_id = null;
  try { visit_id = await _dlpEnsureVisit(claim_id); } catch(e){}
  if (!visit_id) {
    screen.appendChild(el('div',{class:'dlp-empty',style:'color:#991b1b;background:#fee2e2;border-color:#fecaca;'},
      'Could not start today’s visit — check your connection and try again.'));
    return;
  }

  // Bucket list: Exterior / Arrival first (claim_room_id null OR pointing at a
  // now-deleted room → self-healing), then one per active room in order.
  const activeRoomIds = new Set(rooms.map(r => parseInt(r.id,10)));
  const inExterior = p => {
    const rid = p.claim_room_id != null ? parseInt(p.claim_room_id,10) : null;
    return rid == null || !activeRoomIds.has(rid);
  };
  const buckets = [{
    id: null, name: 'Exterior / Arrival',
    photos: allPhotos.filter(inExterior),
    hint: 'Snap source-of-loss & arrival photos here — move them into rooms after you build out chambers.'
  }];
  for (const r of rooms) {
    buckets.push({
      id: parseInt(r.id,10),
      name: r.name || ('Room ' + r.id),
      photos: allPhotos.filter(p => parseInt(p.claim_room_id,10) === parseInt(r.id,10)),
    });
  }

  function openPhotoActions(p){ _dlpPhotoActionSheet(p, buckets, renderDlpPhotos); }

  const sourcePhotos = allPhotos.filter(p => inExterior(p) || /source|arrival|exterior|access/i.test(String(p.caption || p.original_name || '')));
  const equipmentPhotos = allPhotos.filter(p => /equipment|dehu|air mover|placement/i.test(String(p.caption || p.original_name || '')));
  const roomFiled = allPhotos.filter(p => p.claim_room_id != null).length;
  screen.appendChild(el('section',{class:'dlp-photo-hero'},
    el('div',{},
      el('div',{class:'dlp-photo-kicker'},'Photo documentation'),
      el('div',{class:'dlp-photo-title'}, allPhotos.length + ' job photos'),
      el('div',{class:'dlp-photo-sub'},'Capture arrival, source, chamber progress, equipment placement, and final condition photos in report-ready buckets.')
    ),
    el('button',{type:'button',class:'dlp-photo-primary'},'Add Photos')
  ));
  screen.querySelector('.dlp-photo-primary').addEventListener('click', () => {
    const firstAdd = screen.querySelector('button[style*="Add photo"], button[style*="+ Add"]');
    if (firstAdd) firstAdd.click();
  });
  screen.appendChild(el('section',{class:'dlp-photo-readiness'},
    dlpPhotoCheck(sourcePhotos.length > 0, 'Arrival / source', sourcePhotos.length ? sourcePhotos.length + ' captured' : 'missing'),
    dlpPhotoCheck(roomFiled > 0, 'Filed to rooms', roomFiled ? roomFiled + ' filed' : 'bucket later'),
    dlpPhotoCheck(equipmentPhotos.length > 0, 'Equipment placement', equipmentPhotos.length ? equipmentPhotos.length + ' captured' : 'recommended'),
    dlpPhotoCheck(allPhotos.length >= 6, 'Report volume', allPhotos.length >= 6 ? 'healthy' : 'add progress photos')
  ));

  for (const b of buckets) {
    screen.appendChild(el('div',{class:'dlp-section-h'}, b.name + (b.photos.length ? ' · ' + b.photos.length : '')));
    if (b.photos.length === 0 && b.hint) {
      screen.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;margin:-2px 0 8px;line-height:1.4;'}, b.hint));
    }
    const wrap = el('div',{style:'margin-bottom:6px;'});
    screen.appendChild(wrap);
    _dlpRenderPhotoGrid(wrap, 'visit', visit_id, {
      photos: b.photos,
      uploadEntityType: 'visit',
      uploadEntityId: visit_id,
      claimRoomId: b.id,
      onPhotoTap: openPhotoActions,
      onChanged: renderDlpPhotos,
    });
  }
}


// Bottom action sheet for a tapped photo: preview + Move to… (another bucket)
// + Delete. Matches the iOS-style sheet techs already know from other apps.
function dlpPhotoCheck(done, label, meta) {
  return el('div',{class:'dlp-photo-check ' + (done ? 'done' : 'todo')},
    el('span',{}, done ? '✓' : '!'),
    el('strong',{}, label),
    el('em',{}, meta)
  );
}


function _dlpPhotoActionSheet(p, buckets, onChanged){
  const overlay = el('div',{style:'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:6000;display:flex;flex-direction:column;justify-content:flex-end;'});
  function close(){ overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const sheet = el('div',{style:'background:#f8fafc;border-radius:16px 16px 0 0;padding:10px 10px calc(10px + env(safe-area-inset-bottom));max-height:88vh;overflow:auto;'});

  // Preview
  const preview = el('div',{style:'background:#fff;border-radius:12px;overflow:hidden;margin-bottom:10px;'});
  preview.appendChild(el('img',{src:'/' + p.file_url, style:'width:100%;max-height:40vh;object-fit:contain;display:block;background:#0f172a;'}));
  const metaBits = [p.room_name ? ('📁 ' + p.room_name) : null, p.caption].filter(Boolean);
  if (metaBits.length) preview.appendChild(el('div',{style:'padding:8px 12px;font-size:12px;color:#475569;'}, metaBits.join(' · ')));
  sheet.appendChild(preview);

  // Move to… (every bucket except the one it's already in)
  const curRid = p.claim_room_id != null ? parseInt(p.claim_room_id,10) : null;
  sheet.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:6px 12px 4px;'},'Move to'));
  const list = el('div',{style:'background:#fff;border-radius:12px;overflow:hidden;margin-bottom:10px;'});
  for (const b of buckets) {
    if (b.id === curRid) continue;
    const row = el('button',{style:'width:100%;text-align:left;padding:14px 16px;font-size:15px;color:#0f172a;background:#fff;border:none;border-bottom:1px solid #f1f5f9;cursor:pointer;'}, b.name);
    row.addEventListener('click', async () => {
      row.disabled = true; row.textContent = 'Moving…';
      try { await apiPut('/entity-attachments/' + p.id, {claim_room_id: b.id}); close(); onChanged(); }
      catch(e){ alert('Move failed: ' + (e.message||e)); row.disabled = false; row.textContent = b.name; }
    });
    list.appendChild(row);
  }
  if (list.children.length === 0) {
    list.appendChild(el('div',{style:'padding:14px 16px;font-size:13px;color:#94a3b8;'},'No other buckets yet — build out rooms to file photos.'));
  }
  sheet.appendChild(list);

  // Delete
  const delBtn = el('button',{style:'width:100%;padding:14px;background:#fff;color:#dc2626;border:none;border-radius:12px;font-size:15px;font-weight:700;margin-bottom:8px;cursor:pointer;'},'Delete photo');
  delBtn.addEventListener('click', async () => {
    if (!confirm('Delete this photo? This cannot be undone.')) return;
    delBtn.disabled = true; delBtn.textContent = 'Deleting…';
    try { await apiDelete('/entity-attachments/' + p.id); close(); onChanged(); }
    catch(e){ alert('Delete failed: ' + (e.message||e)); delBtn.disabled = false; delBtn.textContent = 'Delete photo'; }
  });
  sheet.appendChild(delBtn);

  // Cancel
  const cancel = el('button',{style:'width:100%;padding:14px;background:#334155;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;'},'Cancel');
  cancel.addEventListener('click', close);
  sheet.appendChild(cancel);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}


// Small bottom sheet: choose the photo source. "Take Photo" opens the device
// camera directly; "Choose from Library" opens the photo roll / file picker
// (multi-select). Triggers the matching hidden <input> passed in.
function _dlpPhotoSourceSheet(camInput, libInput){
  const overlay = el('div',{style:'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:6000;display:flex;flex-direction:column;justify-content:flex-end;'});
  function close(){ overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const sheet = el('div',{style:'padding:10px 10px calc(10px + env(safe-area-inset-bottom));'});
  const card = el('div',{style:'background:#fff;border-radius:12px;overflow:hidden;margin-bottom:8px;'});
  const cam = el('button',{style:'width:100%;text-align:left;padding:16px;font-size:16px;color:#0f172a;background:#fff;border:none;border-bottom:1px solid #f1f5f9;cursor:pointer;'},'📷  Take Photo');
  const lib = el('button',{style:'width:100%;text-align:left;padding:16px;font-size:16px;color:#0f172a;background:#fff;border:none;cursor:pointer;'},'🖼  Choose from Library');
  cam.addEventListener('click', () => { close(); camInput.click(); });
  lib.addEventListener('click', () => { close(); libInput.click(); });
  card.appendChild(cam); card.appendChild(lib);
  sheet.appendChild(card);

  const cancel = el('button',{style:'width:100%;padding:14px;background:#334155;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;'},'Cancel');
  cancel.addEventListener('click', close);
  sheet.appendChild(cancel);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}


function _dlpFmtDate(d){
  if (!d) return '';
  const s = String(d).slice(0,10);
  const dt = new Date(s + 'T12:00:00');
  if (isNaN(dt)) return s;
  return dt.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'});
}


// Suggested quantity from the room's dimensions for a demo category.
function _dlpSuggestQty(categoryKey, room){
  const L = parseFloat(room?.length_ft||0), W = parseFloat(room?.width_ft||0), H = parseFloat(room?.height_ft||0);
  if (!L || !W) return null;
  const floor = L*W, perim = 2*(L+W), walls = H ? perim*H : null;
  switch (categoryKey) {
    case 'drywall_ceiling':
    case 'ceiling_tile':  return Math.round(floor);
    case 'drywall_wall':
    case 'insulation':    return walls ? Math.round(walls) : null;
    case 'carpet_pad':
    case 'hardwood':
    case 'tile':
    case 'subfloor':      return Math.round(floor);
    case 'baseboard':
    case 'trim':          return Math.round(perim);
    default:              return null;
  }
}


// Dashboard → list of rooms, each summarizing what's been logged.
async function renderDlpWorkLog(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/work-log', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Work Log');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);
  screen.appendChild(el('div',{class:'dlp-section-h'},'Work Log — by room'));

  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  let rooms = [], items = [];
  try {
    const [rm, wl] = await Promise.all([
      apiGet(`/claim-rooms?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/room-work-items?claim_id=${claim_id}`).catch(()=>[]),
    ]);
    rooms = Array.isArray(rm) ? rm : [];
    items = Array.isArray(wl) ? wl : [];
  } catch(e){}
  loading.remove();

  const byRoom = {};
  for (const it of items) { (byRoom[it.claim_room_id] = byRoom[it.claim_room_id] || []).push(it); }

  if (rooms.length === 0) {
    screen.appendChild(el('div',{class:'dlp-empty'}, 'No rooms yet. Add the rooms you worked in to start logging demo, consumables, and notes.'));
  }

  for (const r of rooms) {
    const its  = byRoom[r.id] || [];
    const demo = its.filter(x => x.item_type === 'demo').length;
    const cons = its.filter(x => x.item_type === 'consumable').length;
    const note = its.some(x => x.item_type === 'note');
    const bits = [];
    if (demo) bits.push(demo + ' demo');
    if (cons) bits.push(cons + ' consumable' + (cons===1?'':'s'));
    if (note) bits.push('note');
    const card = el('button',{style:'width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:8px;cursor:pointer;'});
    const col = el('div',{style:'flex:1;min-width:0;'});
    col.appendChild(el('div',{style:'font-size:14px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'}, r.name || ('Room '+r.id)));
    col.appendChild(el('div',{style:'font-size:11px;color:#64748b;margin-top:2px;'}, bits.length ? bits.join(' · ') : 'Nothing logged yet'));
    card.appendChild(col);
    card.appendChild(el('span',{style:'font-size:14px;color:#94a3b8;'},'›'));
    card.addEventListener('click', () => renderDlpRoomWorkLog(r));
    screen.appendChild(card);
  }

  const addBtn = el('button',{style:'width:100%;padding:12px;background:#eff6ff;border:2px dashed #3b82f6;color:#1d4ed8;border-radius:10px;font-size:14px;font-weight:700;margin-top:6px;cursor:pointer;'}, '➕ Add Room');
  addBtn.addEventListener('click', () => _dlpAddRoomSheet(claim_id, () => renderDlpWorkLog()));
  screen.appendChild(addBtn);
}


// Per-room screen: Demo / Removed · Consumables · Notes (this visit + history).
async function renderDlpRoomWorkLog(room){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/work-log/room', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Work Log');
  root.appendChild(buildTopbar('← Work Log', renderDlpWorkLog, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);
  screen.appendChild(el('div',{class:'dlp-hero-banner',style:'background:linear-gradient(135deg,#1e293b,#334155);'},
    el('div',{class:'icon'},'🧰'),
    el('div',{class:'text'},
      el('div',{class:'title'}, room.name || ('Room '+room.id)),
      el('div',{class:'sub'}, 'What got done in this room')
    )
  ));

  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  let items = [], visit_id = null;
  try { items = await apiGet(`/room-work-items?claim_id=${claim_id}&claim_room_id=${room.id}`); } catch(e){}
  if (!Array.isArray(items)) items = [];
  try { visit_id = await _dlpEnsureVisit(claim_id); } catch(e){}
  loading.remove();

  const today  = new Date().toISOString().slice(0,10);
  const reload = () => renderDlpRoomWorkLog(room);

  _dlpWorkSection(screen, 'Demo / Removed', items.filter(x=>x.item_type==='demo'), today, '+ Add demo',
    () => _dlpWorkItemSheet('demo', DLP_DEMO_CATALOG, room, visit_id, reload), reload);

  _dlpWorkSection(screen, 'Consumables used', items.filter(x=>x.item_type==='consumable'), today, '+ Add consumable',
    () => _dlpWorkItemSheet('consumable', DLP_CONSUMABLE_CATALOG, room, visit_id, reload), reload);

  // Notes — one per visit. Edit today's; show earlier ones read-only.
  screen.appendChild(el('div',{class:'dlp-section-h'},'Notes'));
  const notes = items.filter(x => x.item_type === 'note');
  const todayNote = notes.find(n => (n.visit_date||'').slice(0,10) === today) || notes.find(n => !n.visit_date);
  const ta = el('textarea',{rows:3,placeholder:'What did you do in this room today?',style:'width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;resize:vertical;'});
  if (todayNote) ta.value = todayNote.notes || '';
  screen.appendChild(ta);
  const saveNote = el('button',{style:'margin-top:6px;padding:10px 14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;'}, todayNote ? 'Update note' : 'Save note');
  saveNote.addEventListener('click', async () => {
    const txt = (ta.value||'').trim();
    saveNote.disabled = true; saveNote.textContent = 'Saving…';
    try {
      if (todayNote) {
        if (txt) await apiPut('/room-work-items/' + todayNote.id, {notes: txt});
        else     await apiDelete('/room-work-items/' + todayNote.id);
      } else if (txt) {
        await apiPost('/room-work-items', {claim_room_id: room.id, visit_id, item_type:'note', notes: txt});
      }
      reload();
    } catch(e){ alert('Save failed: ' + (e.message||e)); saveNote.disabled = false; saveNote.textContent = 'Save note'; }
  });
  screen.appendChild(saveNote);

  const priorNotes = notes.filter(n => n !== todayNote && (n.notes||'').trim());
  if (priorNotes.length) {
    screen.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;margin:12px 0 4px;text-transform:uppercase;letter-spacing:0.04em;'},'Earlier notes'));
    for (const n of priorNotes) {
      const box = el('div',{style:'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-bottom:6px;'});
      box.appendChild(el('div',{style:'font-size:10px;color:#94a3b8;margin-bottom:2px;'}, _dlpFmtDate(n.visit_date)));
      box.appendChild(el('div',{style:'font-size:13px;color:#334155;white-space:pre-wrap;'}, n.notes));
      screen.appendChild(box);
    }
  }
}


// A demo/consumables section: items grouped by visit date + an add button.
function _dlpWorkSection(screen, title, items, today, addLabel, onAdd, reload){
  screen.appendChild(el('div',{class:'dlp-section-h'}, title));
  if (items.length === 0) {
    screen.appendChild(el('div',{style:'font-size:12px;color:#94a3b8;font-style:italic;margin-bottom:6px;'}, 'Nothing logged yet.'));
  } else {
    const byDate = {};
    for (const it of items) { const d = (it.visit_date||'').slice(0,10) || 'undated'; (byDate[d] = byDate[d] || []).push(it); }
    for (const d of Object.keys(byDate).sort().reverse()) {
      const dlabel = d === today ? 'Today' : (d === 'undated' ? '—' : _dlpFmtDate(d));
      screen.appendChild(el('div',{style:'font-size:10px;color:#94a3b8;margin:4px 0 3px;'}, dlabel));
      for (const it of byDate[d]) {
        const row = el('div',{style:'display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:9px 11px;margin-bottom:5px;'});
        const txt = el('div',{style:'flex:1;min-width:0;'});
        txt.appendChild(el('div',{style:'font-size:13px;font-weight:600;color:#0f172a;'}, it.label || it.category || 'Item'));
        const qn = (it.qty != null ? (Number(it.qty) % 1 === 0 ? String(Number(it.qty)) : Number(it.qty).toFixed(2)) : '') + (it.unit ? ' ' + it.unit : '');
        const sub = [qn.trim(), it.notes].filter(Boolean).join(' · ');
        if (sub) txt.appendChild(el('div',{style:'font-size:11px;color:#64748b;margin-top:1px;'}, sub));
        row.appendChild(txt);
        const del = el('button',{style:'flex-shrink:0;width:30px;height:30px;border:none;background:#fef2f2;color:#dc2626;border-radius:6px;font-size:14px;cursor:pointer;'},'✕');
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Remove this item?')) return;
          try { await apiDelete('/room-work-items/' + it.id); reload(); }
          catch(err){ alert('Delete failed: ' + (err.message||err)); }
        });
        row.appendChild(del);
        screen.appendChild(row);
      }
    }
  }
  const add = el('button',{style:'width:100%;padding:10px;background:#eff6ff;border:1.5px dashed #3b82f6;color:#1d4ed8;border-radius:8px;font-size:13px;font-weight:700;margin-bottom:10px;cursor:pointer;'}, addLabel);
  add.addEventListener('click', onAdd);
  screen.appendChild(add);
}


// Bottom sheet: pick a catalog item → qty + unit (+ note) → save.
function _dlpWorkItemSheet(item_type, catalog, room, visit_id, onSaved){
  const overlay = el('div',{style:'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:6000;display:flex;flex-direction:column;justify-content:flex-end;'});
  function close(){ overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const sheet = el('div',{style:'background:#f8fafc;border-radius:16px 16px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));max-height:88vh;overflow:auto;'});
  sheet.appendChild(el('div',{style:'font-size:15px;font-weight:800;color:#0f172a;margin-bottom:10px;'}, item_type === 'demo' ? 'Add demo / removed' : 'Add consumable'));

  let picked = null;
  const chips = el('div',{style:'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;'});
  const form  = el('div',{style:'display:none;'});

  const labelInp = el('input',{type:'text',placeholder:'Item',style:'width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;margin-bottom:8px;'});
  const suggestHint = el('div',{style:'font-size:11px;color:#94a3b8;margin:-4px 0 8px;'});
  const qtyRow = el('div',{style:'display:flex;gap:8px;margin-bottom:8px;'});
  const qtyInp = el('input',{type:'number',inputmode:'decimal',placeholder:'Qty',style:'flex:1;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;'});
  const unitSel = el('select',{style:'width:90px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;background:#fff;'});
  for (const u of DLP_WORK_UNITS) unitSel.appendChild(el('option',{value:u}, u));
  qtyRow.appendChild(qtyInp); qtyRow.appendChild(unitSel);
  const noteInp = el('input',{type:'text',placeholder:'Note (optional)',style:'width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;margin-bottom:10px;'});
  form.appendChild(labelInp); form.appendChild(suggestHint); form.appendChild(qtyRow); form.appendChild(noteInp);

  const saveBtn = el('button',{style:'width:100%;padding:13px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;'},'Save');
  saveBtn.addEventListener('click', async () => {
    const label = (labelInp.value||'').trim();
    if (!label) { alert('Pick or name an item'); return; }
    const qtyRaw = (qtyInp.value||'').trim();
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      await apiPost('/room-work-items', {
        claim_room_id: room.id, visit_id, item_type,
        category: picked ? picked.key : null,
        label, unit: unitSel.value,
        qty: qtyRaw === '' ? null : qtyRaw,
        notes: (noteInp.value||'').trim() || null,
      });
      close(); onSaved();
    } catch(e){ alert('Save failed: ' + (e.message||e)); saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  });
  form.appendChild(saveBtn);

  for (const c of catalog) {
    const chip = el('button',{style:'padding:9px 12px;background:#fff;border:1px solid #cbd5e1;border-radius:999px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;'}, c.label);
    chip.addEventListener('click', () => {
      picked = c;
      labelInp.value = c.label === 'Other (type it)' ? '' : c.label;
      unitSel.value = c.unit;
      const sug = item_type === 'demo' ? _dlpSuggestQty(c.key, room) : null;
      if (sug != null) { qtyInp.value = sug; suggestHint.textContent = '≈ from room size — adjust to actual'; }
      else { qtyInp.value = ''; suggestHint.textContent = ''; }
      for (const ch of chips.children) { ch.style.background = '#fff'; ch.style.borderColor = '#cbd5e1'; ch.style.color = '#334155'; }
      chip.style.background = '#1d4ed8'; chip.style.borderColor = '#1d4ed8'; chip.style.color = '#fff';
      form.style.display = 'block';
      if (c.label === 'Other (type it)') labelInp.focus();
    });
    chips.appendChild(chip);
  }
  sheet.appendChild(chips);
  sheet.appendChild(form);

  const cancel = el('button',{style:'width:100%;padding:13px;background:#334155;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px;'},'Cancel');
  cancel.addEventListener('click', close);
  sheet.appendChild(cancel);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}


// Bottom sheet: add a room from presets or free text. Creates a claim_room.
function _dlpAddRoomSheet(claim_id, onSaved){
  const overlay = el('div',{style:'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:6000;display:flex;flex-direction:column;justify-content:flex-end;'});
  function close(){ overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const sheet = el('div',{style:'background:#f8fafc;border-radius:16px 16px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));max-height:88vh;overflow:auto;'});
  sheet.appendChild(el('div',{style:'font-size:15px;font-weight:800;color:#0f172a;margin-bottom:10px;'},'Add a room'));

  async function create(name){
    const nm = (name||'').trim();
    if (!nm) return;
    try { await apiPost('/claim-rooms', {claim_id, name: nm}); close(); onSaved(); }
    catch(e){ alert('Add failed: ' + (e.message||e)); }
  }

  const chips = el('div',{style:'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;'});
  for (const name of DLP_ROOM_PRESETS) {
    const chip = el('button',{style:'padding:9px 12px;background:#fff;border:1px solid #cbd5e1;border-radius:999px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;'}, name);
    chip.addEventListener('click', () => create(name));
    chips.appendChild(chip);
  }
  sheet.appendChild(chips);

  const row = el('div',{style:'display:flex;gap:6px;margin-bottom:8px;'});
  const inp = el('input',{type:'text',placeholder:'Or type a room name…',style:'flex:1;padding:11px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;'});
  const add = el('button',{style:'padding:11px 16px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;'},'Add');
  add.addEventListener('click', () => create(inp.value));
  row.appendChild(inp); row.appendChild(add);
  sheet.appendChild(row);

  const cancel = el('button',{style:'width:100%;padding:13px;background:#334155;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;'},'Cancel');
  cancel.addEventListener('click', close);
  sheet.appendChild(cancel);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}


// Done step — marks daily_visit_complete + returns to dashboard
async function _dlpWizRenderDone(screen){
  screen.appendChild(el('div',{style:'background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;padding:24px;border-radius:14px;text-align:center;margin-bottom:18px;'},
    el('div',{style:'font-size:48px;margin-bottom:6px;'},'✓'),
    el('div',{style:'font-size:18px;font-weight:800;'}, 'Daily Visit Complete'),
    el('div',{style:'font-size:13px;opacity:0.92;margin-top:6px;'}, 'Nice work. Readings captured + alerts evaluated.')
  ));

  // Try to mark the daily_visit_complete task
  const claim_id = __dlpWizState.claim_id;
  let taskMarked = false;
  try {
    await apiPost('/claim-tasks/complete', {claim_id, code: 'daily_visit_complete'});
    taskMarked = true;
  } catch(e) { /* probably already complete or prereqs not met — non-fatal */ }
  if (taskMarked) {
    screen.appendChild(el('div',{style:'padding:10px 14px;background:#dcfce7;color:#166534;border-radius:8px;margin-bottom:12px;font-size:12px;'},'✓ Marked "Daily Visit Complete" task'));
  }

  // ── Summary checklist of what was actually captured today ────────────────
  // Pulled from the API rather than the wizard's internal step state so it
  // accurately reflects what's on the server — skipped steps don't count,
  // and if the tech captured the same reading twice (e.g. retry after a
  // network blip) we still report the count correctly.
  const summaryBox = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px;'});
  summaryBox.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;'},'Captured today'));
  const list = el('div',{style:'display:flex;flex-direction:column;gap:5px;'});
  summaryBox.appendChild(list);
  const loadingLine = el('div',{style:'font-size:12px;color:#94a3b8;font-style:italic;'},'Counting…');
  list.appendChild(loadingLine);
  screen.appendChild(summaryBox);

  const back = el('button',{style:'width:100%;padding:14px;background:#3b82f6;color:#fff;border-radius:10px;font-size:15px;font-weight:700;'},'Back to Dashboard');
  back.addEventListener('click', () => { __dlpWizState = null; renderDrylogPro(); });
  screen.appendChild(back);

  // Pull today's captures async (don't block the Done screen render)
  const today = new Date().toISOString().slice(0,10);
  const isToday = ts => typeof ts === 'string' && ts.startsWith(today);
  let outdoor=[], atm=[], moi=[], dehu=[], visitPhotos=0;
  try {
    const [r, a, m, d] = await Promise.all([
      apiGet(`/readings/reference?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/zone-atmosphere?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/moisture?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/dehu?claim_id=${claim_id}`).catch(()=>[]),
    ]);
    outdoor = (Array.isArray(r)?r:[]).filter(x => x.reading_type === 'outdoor' && isToday(x.reading_at));
    atm     = (Array.isArray(a)?a:[]).filter(x => isToday(x.reading_at));
    moi     = (Array.isArray(m)?m:[]).filter(x => isToday(x.reading_at));
    dehu    = (Array.isArray(d)?d:[]).filter(x => isToday(x.reading_at));
    if (__dlpVisitId) {
      try {
        const ph = await apiGet(`/entity-attachments?entity_type=visit&entity_id=${__dlpVisitId}`);
        visitPhotos = Array.isArray(ph) ? ph.length : 0;
      } catch(e){}
    }
  } catch(e){}

  list.innerHTML = '';
  function addLine(captured, label){
    const line = el('div',{style:'display:flex;align-items:center;gap:8px;font-size:13px;'});
    line.appendChild(el('span',{style:`color:${captured?'#16a34a':'#cbd5e1'};font-weight:800;width:18px;text-align:center;`}, captured?'✅':'○'));
    line.appendChild(el('span',{style:`color:${captured?'#0f172a':'#94a3b8'};`}, label));
    list.appendChild(line);
  }
  addLine(outdoor.length > 0,        outdoor.length > 0 ? 'Outdoor baseline captured' : 'Outdoor baseline (skipped)');
  // Distinct zones touched today
  const atmZones  = new Set(atm.map(x => x.drying_zone_id));
  const moiZones  = new Set(moi.map(x => x.drying_zone_id));
  const dehuCount = dehu.length;
  addLine(atmZones.size > 0,  atmZones.size + ' chamber' + (atmZones.size===1?'':'s') + ' atmosphere updated');
  addLine(moi.length > 0,     moi.length    + ' moisture reading'   + (moi.length===1?'':'s')   + ' across ' + moiZones.size + ' chamber' + (moiZones.size===1?'':'s'));
  addLine(dehuCount > 0,      dehuCount     + ' dehu performance reading' + (dehuCount===1?'':'s'));
  addLine(visitPhotos > 0,    visitPhotos   + ' photo' + (visitPhotos===1?'':'s') + ' attached to this visit');
}


// Returns the visit_id to attach captures to. Uses today's existing visit
// for this claim if any, else POSTs a new visit with auto day_index.
async function _dlpEnsureVisit(claim_id){
  if (__dlpVisitId) return __dlpVisitId;
  const today = new Date().toISOString().slice(0,10);
  let visits = [];
  try { visits = await apiGet(`/visits?job_id=${claim_id}&start=${today}&end=${today}`); } catch(e){}
  if (Array.isArray(visits) && visits.length > 0) {
    __dlpVisitId = visits[0].id;
    return __dlpVisitId;
  }
  // Determine next day_index from existing visits
  let allVisits = [];
  try { allVisits = await apiGet(`/visits?job_id=${claim_id}`); } catch(e){}
  const maxDay = (Array.isArray(allVisits) && allVisits.length > 0)
    ? Math.max(...allVisits.map(v => parseInt(v.day_index||0,10)||0))
    : -1;
  const next = maxDay < 0 ? 0 : maxDay + 1;
  const created = await apiPost('/visits', {
    job_id: claim_id, visit_date: today, day_index: next, visit_type: 'followup'
  });
  __dlpVisitId = created?.data?.id || created?.id;
  return __dlpVisitId;
}


// Client-side psychro for live preview as the tech types. Matches the
// server-side Magnus-Tetens formula in api/lib/psychro.php closely enough
// that the displayed numbers match the persisted ones to ±0.1.
function _dlpPsychroClient(tF, rhPct){
  if (tF == null || rhPct == null || isNaN(tF) || isNaN(rhPct)) {
    return {gpp:null, dew_point_f:null, vapor_pressure_kpa:null};
  }
  const tC = (tF - 32) * 5/9;
  const sat_mb = 6.112 * Math.exp((17.67*tC)/(tC+243.5));
  const e_mb = sat_mb * (rhPct/100);
  const Patm_mb = 1013.25;
  const w = 0.622 * (e_mb / (Patm_mb - e_mb));
  const gpp = w * 7000;
  const a = 17.625, b = 243.04;
  const alpha = Math.log(Math.max(rhPct,0.0001)/100) + (a*tC)/(b+tC);
  const dpC = (b*alpha)/(a-alpha);
  return {
    gpp,
    dew_point_f: dpC*9/5+32,
    vapor_pressure_kpa: e_mb / 10,   // mb → kPa
  };
}


async function renderDlpAtmosphereList(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/atmosphere', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Atmosphere');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);

  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  let zones=[], zoneAtm=[], hvac=[], reference=[];
  try {
    const [z, za, hv, ref] = await Promise.all([
      apiGet(`/drying-zones?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/zone-atmosphere?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/hvac?claim_id=${claim_id}`).catch(()=>[]),
      apiGet(`/readings/reference?claim_id=${claim_id}`).catch(()=>[]),
    ]);
    zones = Array.isArray(z)?z:[];
    zoneAtm = Array.isArray(za)?za:[];
    hvac = Array.isArray(hv)?hv:[];
    reference = Array.isArray(ref)?ref:[];
  } catch(e){}
  loading.remove();

  // ── Chamber Atmosphere ──────────────────────────────────────────────────
  screen.appendChild(el('div',{class:'dlp-section-h'},'Chamber Atmosphere'));
  if (zones.length === 0) {
    screen.appendChild(el('div',{class:'dlp-empty'},'Define a drying chamber first (Setup tab) before capturing chamber atmosphere.'));
  } else {
    for (const zone of zones) {
      const card = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;'});
      const top = el('div',{style:'display:flex;align-items:center;gap:10px;margin-bottom:6px;'});
      top.appendChild(el('div',{style:'flex:1;font-weight:700;font-size:14px;color:#0f172a;'}, zone.name));
      const captureBtn = el('button',{style:'padding:7px 12px;background:#3b82f6;color:#fff;border-radius:6px;font-size:12px;font-weight:700;'}, '+ Capture');
      captureBtn.addEventListener('click', () => renderDlpAtmosphereCapture('zone', {drying_zone_id: zone.id, zone_name: zone.name}));
      top.appendChild(captureBtn);
      card.appendChild(top);

      const latest = zoneAtm.find(r => parseInt(r.drying_zone_id,10) === parseInt(zone.id,10));
      if (latest) {
        const ts = new Date(latest.reading_at.replace(' ','T')+'Z').toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        card.appendChild(el('div',{style:'font-size:12px;color:#475569;line-height:1.5;'},
          `Latest · ${Number(latest.temp_f).toFixed(1)}°F · ${Number(latest.rh_pct).toFixed(1)}% RH · ${latest.gpp?Number(latest.gpp).toFixed(1)+' gpp':'—'} · ${latest.dew_point_f?Number(latest.dew_point_f).toFixed(1)+'°F dew':'—'}`));
        card.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;margin-top:2px;'}, ts));
      } else {
        card.appendChild(el('div',{style:'font-size:12px;color:#94a3b8;font-style:italic;'}, 'No reading yet'));
      }
      screen.appendChild(card);
    }
  }

  // ── HVAC ────────────────────────────────────────────────────────────────
  screen.appendChild(el('div',{class:'dlp-section-h'},'HVAC Atmosphere'));
  const hvacCard = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;'});
  const hvacTop = el('div',{style:'display:flex;align-items:center;gap:10px;margin-bottom:6px;'});
  hvacTop.appendChild(el('div',{style:'flex:1;font-size:12px;color:#475569;'}, hvac.length === 0 ? 'No HVAC readings yet' : `${hvac.length} reading${hvac.length===1?'':'s'} on file`));
  if (zones.length > 0) {
    const b = el('button',{style:'padding:7px 12px;background:#3b82f6;color:#fff;border-radius:6px;font-size:12px;font-weight:700;'}, '+ Capture');
    b.addEventListener('click', () => renderDlpAtmosphereCapture('hvac', {}));
    hvacTop.appendChild(b);
  }
  hvacCard.appendChild(hvacTop);
  for (const r of hvac.slice(0,3)) {
    const ts = new Date(r.reading_at.replace(' ','T')+'Z').toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const label = (r.hvac_label ? r.hvac_label : r.measurement_point);
    hvacCard.appendChild(el('div',{style:'font-size:12px;color:#475569;border-top:1px solid #f1f5f9;padding-top:6px;margin-top:6px;'},
      `${label} · ${Number(r.temp_f).toFixed(1)}°F · ${Number(r.rh_pct).toFixed(1)}% · ${r.gpp?Number(r.gpp).toFixed(1)+' gpp':'—'} · ${ts}`));
  }
  screen.appendChild(hvacCard);

  // ── Baseline / Reference ────────────────────────────────────────────────
  screen.appendChild(el('div',{class:'dlp-section-h'},'Baseline Atmosphere (outdoor + unaffected)'));
  const refCard = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;'});
  const refTop = el('div',{style:'display:flex;align-items:center;gap:10px;margin-bottom:6px;'});
  refTop.appendChild(el('div',{style:'flex:1;font-size:12px;color:#475569;'}, reference.length === 0 ? 'No baseline readings yet' : `${reference.length} reading${reference.length===1?'':'s'} on file`));
  const refBtn = el('button',{style:'padding:7px 12px;background:#3b82f6;color:#fff;border-radius:6px;font-size:12px;font-weight:700;'}, '+ Capture');
  refBtn.addEventListener('click', () => renderDlpAtmosphereCapture('reference', {}));
  refTop.appendChild(refBtn);
  refCard.appendChild(refTop);
  for (const r of reference.slice(0,3)) {
    const ts = new Date(r.reading_at.replace(' ','T')+'Z').toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const typeLabel = r.reading_type === 'outdoor' ? 'Outdoor' : 'Unaffected';
    refCard.appendChild(el('div',{style:'font-size:12px;color:#475569;border-top:1px solid #f1f5f9;padding-top:6px;margin-top:6px;'},
      `${typeLabel}${r.source_label?(' ('+r.source_label+')'):''} · ${Number(r.temp_f).toFixed(1)}°F · ${Number(r.rh_pct).toFixed(1)}% · ${r.gpp?Number(r.gpp).toFixed(1)+' gpp':'—'} · ${ts}`));
  }
  screen.appendChild(refCard);
}


// Capture form for zone / hvac / reference atmosphere readings.
//   type: 'zone' | 'hvac' | 'reference'
//   prefill: { drying_zone_id?, zone_name?, ... }
async function renderDlpAtmosphereCapture(type, prefill){
  prefill = prefill || {};
  clear(); enableInactivity();
  tcLiveSet({current_screen:`drylog-pro/atmosphere/${type}`, current_job_id:selectedJob?.job_id||null}, 'Capturing atmosphere');
  root.appendChild(buildTopbar('← Atmosphere', renderDlpAtmosphereList, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);

  const titleByType = {zone:'Chamber Atmosphere', hvac:'HVAC Atmosphere', reference:'Baseline Reading'};
  screen.appendChild(el('div',{class:'h1'}, titleByType[type] || 'Capture'));
  if (type === 'zone' && prefill.zone_name) {
    screen.appendChild(el('div',{class:'sub'}, prefill.zone_name));
  }

  // ── Zone picker (zone + hvac only) ──────────────────────────────────────
  let zoneSelect = null;
  if (type === 'zone' || type === 'hvac') {
    let zones = [];
    try { zones = await apiGet(`/drying-zones?claim_id=${claim_id}`); } catch(e){}
    if (!Array.isArray(zones) || zones.length === 0) {
      screen.appendChild(el('div',{class:'dlp-empty'},'No drying chambers yet. Define one in the Setup tab first.'));
      root.appendChild(screen); return;
    }
    if (type === 'zone' && prefill.drying_zone_id) {
      // Pre-locked chamber — no picker needed, just stash the id
      zoneSelect = {value: String(prefill.drying_zone_id)};
    } else {
      const pickerWrap = _dlpFieldWrap(type === 'zone' ? 'Drying Chamber' : 'Nearest chamber (for HVAC)');
      zoneSelect = el('select',{style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;background:#fff;'});
      for (const z of zones) {
        const opt = el('option',{value:String(z.id)}, z.name);
        zoneSelect.appendChild(opt);
      }
      if (prefill.drying_zone_id) zoneSelect.value = String(prefill.drying_zone_id);
      pickerWrap.appendChild(zoneSelect);
      screen.appendChild(pickerWrap);
    }
  }

  // ── Type-specific extras ────────────────────────────────────────────────
  let measSelect = null, hvacLabelInp = null, refTypeSelect = null, sourceLabelInp = null;
  if (type === 'hvac') {
    const w = _dlpFieldWrap('Measurement point');
    measSelect = el('select',{style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;background:#fff;'});
    for (const v of ['supply','return','plenum']) measSelect.appendChild(el('option',{value:v}, v.charAt(0).toUpperCase()+v.slice(1)));
    w.appendChild(measSelect);
    screen.appendChild(w);

    const w2 = _dlpFieldWrap('Label (optional)','e.g. "Supply — basement"');
    hvacLabelInp = el('input',{type:'text',placeholder:'e.g. Supply — basement',style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;'});
    w2.appendChild(hvacLabelInp);
    screen.appendChild(w2);
  }
  if (type === 'reference') {
    const w = _dlpFieldWrap('Reading type');
    refTypeSelect = el('select',{style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;background:#fff;'});
    refTypeSelect.appendChild(el('option',{value:'outdoor'}, 'Outdoor'));
    refTypeSelect.appendChild(el('option',{value:'unaffected_indoor'}, 'Unaffected indoor'));
    w.appendChild(refTypeSelect);
    screen.appendChild(w);

    const w2 = _dlpFieldWrap('Source (optional)','e.g. "Front yard", "Guest BR"');
    sourceLabelInp = el('input',{type:'text',placeholder:'e.g. Front yard',style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;'});
    w2.appendChild(sourceLabelInp);
    screen.appendChild(w2);
  }

  // ── Temp + RH inputs (all types) ────────────────────────────────────────
  const tempRhGrid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;'});
  const tempInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Temp °F',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:18px;text-align:center;'});
  const rhInp   = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'RH %',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:18px;text-align:center;'});
  tempRhGrid.appendChild(tempInp); tempRhGrid.appendChild(rhInp);
  screen.appendChild(tempRhGrid);

  // Live psychro readout
  const psyGrid = el('div',{style:'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:14px;'});
  function psyCell(label){
    const c = el('div',{style:'padding:10px 6px;background:#f8fafc;border-radius:8px;text-align:center;'});
    const v = el('div',{style:'font-size:18px;font-weight:700;color:#0f172a;'},'—');
    c.appendChild(v);
    c.appendChild(el('div',{style:'font-size:10px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;'},label));
    return {wrap:c, v};
  }
  const gppCell = psyCell('GPP');
  const dpCell = psyCell('Dew Pt °F');
  const vpCell = psyCell('Vapor kPa');
  psyGrid.appendChild(gppCell.wrap); psyGrid.appendChild(dpCell.wrap); psyGrid.appendChild(vpCell.wrap);
  screen.appendChild(psyGrid);

  function refreshPsy(){
    const t = parseFloat(tempInp.value), r = parseFloat(rhInp.value);
    const p = _dlpPsychroClient(t, r);
    gppCell.v.textContent = p.gpp != null ? p.gpp.toFixed(1) : '—';
    dpCell.v.textContent  = p.dew_point_f != null ? p.dew_point_f.toFixed(1) : '—';
    vpCell.v.textContent  = p.vapor_pressure_kpa != null ? p.vapor_pressure_kpa.toFixed(2) : '—';
  }
  tempInp.addEventListener('input', refreshPsy);
  rhInp.addEventListener('input', refreshPsy);

  // Notes
  const notesWrap = _dlpFieldWrap('Notes (optional)');
  const notesInp = el('textarea',{rows:2,placeholder:'',style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;resize:vertical;'});
  notesWrap.appendChild(notesInp);
  screen.appendChild(notesWrap);

  // Submit
  const submitBtn = el('button',{class:'wiz-btn-next',style:'width:100%;padding:14px;background:#16a34a;color:#fff;border-radius:10px;font-size:15px;font-weight:700;margin-top:14px;'}, 'Save Reading');
  submitBtn.addEventListener('click', async () => {
    const temp_f = parseFloat(tempInp.value);
    const rh_pct = parseFloat(rhInp.value);
    if (isNaN(temp_f) || isNaN(rh_pct)) { alert('Temp and RH are required.'); return; }
    submitBtn.disabled = true; submitBtn.textContent = 'Saving…';
    try {
      const reading_at = new Date().toISOString().slice(0,19).replace('T',' ');
      const notes = (notesInp.value || '').trim() || undefined;
      let endpoint, payload;
      if (type === 'zone') {
        const visit_id = await _dlpEnsureVisit(claim_id);
        endpoint = '/readings/zone-atmosphere';
        payload = {drying_zone_id: parseInt(zoneSelect.value,10), visit_id, reading_at, temp_f, rh_pct, notes};
      } else if (type === 'hvac') {
        const visit_id = await _dlpEnsureVisit(claim_id);
        endpoint = '/readings/hvac';
        payload = {drying_zone_id: parseInt(zoneSelect.value,10), visit_id, measurement_point: measSelect.value, hvac_label: (hvacLabelInp.value||'').trim() || undefined, reading_at, temp_f, rh_pct, notes};
      } else {
        endpoint = '/readings/reference';
        payload = {claim_id, reading_type: refTypeSelect.value, source_label: (sourceLabelInp.value||'').trim() || undefined, reading_at, temp_f, rh_pct, notes};
      }
      const res = await apiPost(endpoint, payload);
      // Show derived values + any alerts in a brief confirmation
      const data = res?.data || res;
      const fired = (data?.alerts?.alerts_fired || []);
      let msg = 'Saved.';
      if (data?.derived && data.derived.gpp != null) {
        msg += ` GPP ${Number(data.derived.gpp).toFixed(1)}, dew point ${Number(data.derived.dew_point_f).toFixed(1)}°F.`;
      }
      if (fired.length > 0) {
        msg += `\n\n⚠ ${fired.length} alert${fired.length===1?'':'s'} fired:\n` + fired.map(a => '· '+a.title).join('\n');
      }
      alert(msg);
    } catch(e) {
      alert('Save failed: ' + (e.message || e));
      submitBtn.disabled = false; submitBtn.textContent = 'Save Reading';
      return;
    }
    renderDlpAtmosphereList();
  });
  screen.appendChild(submitBtn);

  root.appendChild(screen);
  setTimeout(() => tempInp.focus(), 50);
}


// Small helper: labeled field wrapper used by the capture forms.
function _dlpFieldWrap(label, helper){
  const w = el('div',{style:'margin-bottom:10px;'});
  w.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:5px;'}, label));
  if (helper) w.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;margin-bottom:5px;'}, helper));
  return w;
}


async function renderDlpSurfacesList(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/surfaces', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Surfaces');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);

  screen.appendChild(el('div',{class:'dlp-section-h'},'Drying Chambers'));
  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  let zones = [];
  try { zones = await apiGet(`/drying-zones?claim_id=${claim_id}&include_closed=1`); } catch(e){}
  loading.remove();

  if (!Array.isArray(zones) || zones.length === 0) {
    screen.appendChild(el('div',{class:'dlp-empty'},'No drying chambers yet — start by defining one for the affected area.'));
  } else {
    for (const z of zones) {
      const card = el('button',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;text-align:left;width:100%;display:flex;align-items:center;gap:10px;'});
      const main = el('div',{style:'flex:1;min-width:0;'});
      const titleRow = el('div',{style:'display:flex;align-items:center;gap:8px;margin-bottom:4px;'});
      titleRow.appendChild(el('div',{style:'font-weight:700;font-size:14px;color:#0f172a;'}, z.name));
      if (z.is_closed) titleRow.appendChild(el('span',{style:'font-size:9px;padding:2px 6px;background:#dcfce7;color:#166534;border-radius:4px;font-weight:700;letter-spacing:0.04em;'},'CLOSED'));
      else if (z.category_of_water) titleRow.appendChild(el('span',{style:'font-size:9px;padding:2px 6px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-weight:700;'},'CAT '+z.category_of_water));
      main.appendChild(titleRow);
      const ridCount = Array.isArray(z.claim_room_ids) ? z.claim_room_ids.length : 0;
      main.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;'},
        ridCount === 0 ? 'No rooms attached' : ridCount + ' room' + (ridCount===1?'':'s')));
      card.appendChild(main);
      card.appendChild(el('div',{style:'font-size:18px;color:#cbd5e1;'},'›'));
      card.addEventListener('click', () => renderDlpZoneDetail(z.id));
      screen.appendChild(card);
    }
  }

  const addBtn = el('button',{style:'width:100%;padding:12px;border:1px dashed #3b82f6;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:14px;font-weight:700;margin-top:6px;'},'+ Add Drying Chamber');
  addBtn.addEventListener('click', () => renderDlpZoneCreate());
  screen.appendChild(addBtn);
}


// Create a new drying chamber with inline room creation.
async function renderDlpZoneCreate(){
  clear(); enableInactivity();
  root.appendChild(buildTopbar('← Setup', renderDlpSurfacesList, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.appendChild(el('div',{class:'h1'},'New Drying Chamber'));

  // Load existing rooms for this claim
  let rooms = [];
  try { rooms = await apiGet(`/claim-rooms?claim_id=${claim_id}`); } catch(e){}
  if (!Array.isArray(rooms)) rooms = [];

  // Name
  const nameW = _dlpFieldWrap('Chamber name','e.g. "Chamber A — Basement bath" or just "Master Bath"');
  const nameInp = el('input',{type:'text',placeholder:'Chamber name',style:'padding:10px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:15px;width:100%;'});
  nameW.appendChild(nameInp);
  screen.appendChild(nameW);

  // Cat / Class
  const catW = _dlpFieldWrap('Category & Class of water');
  const catGrid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:8px;'});
  const catSelect = el('select',{style:'padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;background:#fff;'});
  catSelect.appendChild(el('option',{value:''},'Category…'));
  for (const c of [1,2,3]) catSelect.appendChild(el('option',{value:String(c)},'Cat '+c));
  const classSelect = el('select',{style:'padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;background:#fff;'});
  classSelect.appendChild(el('option',{value:''},'Class…'));
  for (const c of [1,2,3,4]) classSelect.appendChild(el('option',{value:String(c)},'Class '+c));
  catGrid.appendChild(catSelect); catGrid.appendChild(classSelect);
  catW.appendChild(catGrid);
  screen.appendChild(catW);

  // Rooms: multi-select + inline add
  const roomsW = _dlpFieldWrap('Rooms in this chamber','One chamber can span multiple rooms (open floorplan, contiguous wet area).');
  const selected = new Set();
  const roomList = el('div',{style:'display:flex;flex-direction:column;gap:6px;margin-bottom:8px;'});
  function refreshRoomList(){
    roomList.innerHTML = '';
    for (const r of rooms) {
      const row = el('button',{style:'display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid '+(selected.has(r.id)?'#3b82f6':'#cbd5e1')+';border-radius:8px;background:'+(selected.has(r.id)?'#dbeafe':'#fff')+';width:100%;text-align:left;'});
      row.appendChild(el('div',{style:'flex:1;font-size:14px;font-weight:600;color:'+(selected.has(r.id)?'#1d4ed8':'#0f172a')+';'}, r.name));
      row.appendChild(el('div',{style:'font-size:18px;color:'+(selected.has(r.id)?'#1d4ed8':'#cbd5e1')+';'}, selected.has(r.id)?'✓':'+'));
      row.addEventListener('click', () => {
        if (selected.has(r.id)) selected.delete(r.id); else selected.add(r.id);
        refreshRoomList();
      });
      roomList.appendChild(row);
    }
    if (rooms.length === 0) {
      roomList.appendChild(el('div',{style:'font-size:12px;color:#94a3b8;font-style:italic;padding:6px 0;'},'No rooms defined yet — add one below.'));
    }
  }
  refreshRoomList();
  roomsW.appendChild(roomList);

  // Inline new-room form
  const newRoomBox = el('div',{style:'display:flex;gap:6px;align-items:center;margin-top:6px;'});
  const newRoomInp = el('input',{type:'text',placeholder:'+ Add new room…',style:'flex:1;padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;'});
  const newRoomBtn = el('button',{style:'padding:9px 14px;background:#16a34a;color:#fff;border-radius:6px;font-size:13px;font-weight:700;'},'Add');
  newRoomBtn.addEventListener('click', async () => {
    const nm = (newRoomInp.value||'').trim();
    if (!nm) return;
    newRoomBtn.disabled = true; newRoomBtn.textContent = '…';
    try {
      const res = await apiPost('/claim-rooms', {claim_id, name: nm});
      const created = res?.data || res;
      if (created && created.id) {
        rooms.push(created);
        selected.add(created.id);
        newRoomInp.value = '';
      }
    } catch(e) { alert('Add failed: ' + (e.message||e)); }
    newRoomBtn.disabled = false; newRoomBtn.textContent = 'Add';
    refreshRoomList();
  });
  newRoomBox.appendChild(newRoomInp); newRoomBox.appendChild(newRoomBtn);
  roomsW.appendChild(newRoomBox);

  // Quick-add presets — tap to fill the name, tweak (e.g. "Bedroom 2"), then Add.
  const presetRow = el('div',{style:'display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;'});
  for (const pn of DLP_ROOM_PRESETS) {
    const c = el('button',{style:'padding:5px 9px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;font-size:11px;color:#475569;cursor:pointer;'}, pn);
    c.addEventListener('click', () => { newRoomInp.value = pn; newRoomInp.focus(); });
    presetRow.appendChild(c);
  }
  roomsW.appendChild(presetRow);

  screen.appendChild(roomsW);

  // Notes
  const notesW = _dlpFieldWrap('Containment notes (optional)');
  const notesInp = el('textarea',{rows:2,placeholder:'',style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;resize:vertical;'});
  notesW.appendChild(notesInp);
  screen.appendChild(notesW);

  // Save
  const saveBtn = el('button',{style:'width:100%;padding:14px;background:#16a34a;color:#fff;border-radius:10px;font-size:15px;font-weight:700;margin-top:14px;'},'Create Chamber');
  saveBtn.addEventListener('click', async () => {
    const name = (nameInp.value||'').trim();
    if (!name) { alert('Chamber name is required.'); return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const payload = {
        claim_id, name,
        claim_room_ids: Array.from(selected),
        category_of_water: catSelect.value ? parseInt(catSelect.value,10) : undefined,
        class_of_water:    classSelect.value ? parseInt(classSelect.value,10) : undefined,
        containment_notes: (notesInp.value||'').trim() || undefined,
      };
      const res = await apiPost('/drying-zones', payload);
      const z = res?.data || res;
      if (z && z.id) { renderDlpZoneDetail(z.id); return; }
    } catch(e) {
      alert('Create failed: ' + (e.message||e));
      saveBtn.disabled = false; saveBtn.textContent = 'Create Chamber';
      return;
    }
    renderDlpSurfacesList();
  });
  screen.appendChild(saveBtn);

  root.appendChild(screen);
  setTimeout(() => nameInp.focus(), 50);
}


// Zone detail: shows the zone hero, sizing recommender (when rooms + class
// are set), and the surfaces list. Surfaces are listed with their latest dry
// state and a tap drills into the surface detail for reading-point management.
async function renderDlpZoneDetail(zone_id){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/zone/'+zone_id, current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Chamber');
  root.appendChild(buildTopbar('← Setup', renderDlpSurfacesList, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);

  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  let zone=null, surfaces=[], rooms=[], atmos=null;
  try {
    const [z, s, r, atmList] = await Promise.all([
      apiGet(`/drying-zones/${zone_id}`),
      apiGet(`/claim-surfaces?drying_zone_id=${zone_id}`),
      apiGet(`/claim-rooms?claim_id=${claim_id}`),
      apiGet(`/readings/zone-atmosphere?drying_zone_id=${zone_id}`),
    ]);
    zone = z?.data || z;
    surfaces = Array.isArray(s) ? s : [];
    rooms = Array.isArray(r) ? r : [];
    if (Array.isArray(atmList) && atmList.length > 0) atmos = atmList[0];
  } catch(e){}
  loading.remove();

  if (!zone) { screen.appendChild(el('div',{class:'dlp-empty'},'Chamber not found.')); return; }

  // Hero
  const hero = el('div',{style:'background:linear-gradient(135deg,#0c4a6e,#0369a1);color:#fff;padding:14px 18px;border-radius:12px;margin-bottom:14px;'});
  hero.appendChild(el('div',{style:'font-size:18px;font-weight:800;'}, zone.name));
  const heroMeta = [];
  if (zone.category_of_water) heroMeta.push('Cat '+zone.category_of_water);
  if (zone.class_of_water) heroMeta.push('Class '+zone.class_of_water);
  if (Array.isArray(zone.claim_room_ids)) {
    const names = zone.claim_room_ids.map(id => (rooms.find(r => r.id == id)||{}).name).filter(Boolean);
    if (names.length) heroMeta.push(names.join(' + '));
  }
  if (zone.is_closed) heroMeta.push('CLOSED');
  if (heroMeta.length) hero.appendChild(el('div',{style:'font-size:12px;color:rgba(255,255,255,0.78);margin-top:3px;'}, heroMeta.join(' · ')));
  screen.appendChild(hero);

  // Sizing card (when class is set + at least one room with dims)
  if (zone.class_of_water && Array.isArray(zone.claim_room_ids) && zone.claim_room_ids.length > 0) {
    const zoneRooms = rooms.filter(r => zone.claim_room_ids.includes(r.id) || zone.claim_room_ids.includes(String(r.id)));
    const sized = zoneRooms.filter(r => r.length_ft && r.width_ft && r.height_ft);
    if (sized.length > 0) {
      const sizingCard = el('div',{style:'background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px 14px;margin-bottom:14px;'});
      sizingCard.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;'},'Sizing recommendation'));
      const sizingLoad = el('div',{style:'font-size:12px;color:#475569;'}, 'Computing…');
      sizingCard.appendChild(sizingLoad);
      screen.appendChild(sizingCard);
      // Compute per-room asynchronously
      (async () => {
        sizingLoad.remove();
        let totalAm = 0, totalPpd = 0;
        const lines = [];
        for (const r of sized) {
          try {
            const res = await apiPost('/sizing/recommend', {
              length_ft: r.length_ft, width_ft: r.width_ft, height_ft: r.height_ft,
              class_of_water: zone.class_of_water,
              current_gpp: atmos && atmos.gpp ? parseFloat(atmos.gpp) : undefined,
            });
            const d = res?.data || res;
            totalAm += d.air_movers_recommended;
            totalPpd += d.dehu_pints_per_day_recommended;
            lines.push(`${r.name}: ${d.air_movers_recommended} AM · ${d.dehu_pints_per_day_recommended} ppd`);
          } catch(e){}
        }
        sizingCard.appendChild(el('div',{style:'font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;'},
          `${totalAm} air mover${totalAm===1?'':'s'} · ${totalPpd} pints/day dehu`));
        for (const line of lines) {
          sizingCard.appendChild(el('div',{style:'font-size:11px;color:#475569;'}, line));
        }
        sizingCard.appendChild(el('div',{style:'font-size:10px;color:#94a3b8;margin-top:6px;font-style:italic;'},
          'IICRC S500-derived starting point' + (atmos && atmos.gpp ? ` (current GPP ${Number(atmos.gpp).toFixed(0)} factored in)` : '')));
      })();
    }
  }

  // Surfaces list
  screen.appendChild(el('div',{class:'dlp-section-h'},'Surfaces'));
  if (surfaces.length === 0) {
    screen.appendChild(el('div',{class:'dlp-empty'},'No surfaces tracked yet for this zone.'));
  } else {
    for (const s of surfaces) {
      const card = el('button',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:11px 14px;margin-bottom:8px;text-align:left;width:100%;display:flex;align-items:center;gap:10px;'});
      const main = el('div',{style:'flex:1;min-width:0;'});
      const t = el('div',{style:'display:flex;align-items:center;gap:6px;'});
      t.appendChild(el('div',{style:'font-weight:600;font-size:14px;color:#0f172a;'}, s.surface_label || s.surface_type));
      if (s.is_dry) t.appendChild(el('span',{style:'font-size:9px;padding:2px 6px;background:#dcfce7;color:#166534;border-radius:4px;font-weight:700;letter-spacing:0.04em;'},'DRY'));
      main.appendChild(t);
      const meta = [s.surface_type, s.material, s.dry_goal != null ? ('goal '+s.dry_goal+' '+(s.dry_goal_unit||'%MC')) : null].filter(Boolean).join(' · ');
      if (meta) main.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;margin-top:2px;'}, meta));
      card.appendChild(main);
      card.appendChild(el('div',{style:'font-size:18px;color:#cbd5e1;'},'›'));
      card.addEventListener('click', () => renderDlpSurfaceDetail(s.id));
      screen.appendChild(card);
    }
  }
  const addSurfBtn = el('button',{style:'width:100%;padding:11px;border:1px dashed #3b82f6;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:14px;font-weight:700;margin-top:6px;'},'+ Add Surface');
  addSurfBtn.addEventListener('click', () => renderDlpSurfaceCreate(zone_id));
  screen.appendChild(addSurfBtn);

  // F18.14: floor-plan CAD editor (replaced F18.12c upload-photo flow)
  const sketchBtn = el('button',{style:'width:100%;padding:11px;background:#dbeafe;border:1px solid #3b82f6;border-radius:10px;color:#1d4ed8;font-size:13px;font-weight:700;margin-top:8px;'},'📐 Floor Plan');
  sketchBtn.addEventListener('click', () => renderDlpCadSketch(zone_id));
  screen.appendChild(sketchBtn);

  // Close zone / delete actions
  if (!zone.is_closed) {
    const closeBtn = el('button',{style:'width:100%;padding:11px;background:#fff;border:1px solid #cbd5e1;border-radius:10px;color:#475569;font-size:13px;font-weight:700;margin-top:14px;'},'Close Chamber');
    closeBtn.addEventListener('click', async () => {
      if (!confirm('Close this chamber? Use this when the chamber has hit dry goal and equipment is pulled.')) return;
      try { await apiPost(`/drying-zones/${zone_id}/close`, {}); } catch(e) { alert('Close failed: ' + (e.message||e)); return; }
      renderDlpSurfacesList();
    });
    screen.appendChild(closeBtn);
  }
  const delBtn = el('button',{style:'width:100%;padding:9px;background:#fff;border:1px solid #fecaca;border-radius:10px;color:#dc2626;font-size:12px;font-weight:600;margin-top:8px;'}, '🗑 Delete Chamber');
  delBtn.addEventListener('click', async () => {
    if (!confirm('Delete this chamber? Its surfaces + reading points are NOT deleted, but the chamber disappears from this claim.')) return;
    try { await apiDelete(`/drying-zones/${zone_id}`); } catch(e) { alert('Delete failed: ' + (e.message||e)); return; }
    renderDlpSurfacesList();
  });
  screen.appendChild(delBtn);
}


// Convert pixels (world units) → human "12'-6\"" string. Rounds to nearest inch.
function _dlpCadPxToFtIn(px){
  const totalIn = Math.round((px / DLP_CAD_PX_PER_FT) * 12);
  if (totalIn === 0) return '0';
  const ft = Math.floor(Math.abs(totalIn) / 12);
  const inches = Math.abs(totalIn) % 12;
  const sign = totalIn < 0 ? '-' : '';
  if (inches === 0) return `${sign}${ft}'`;
  if (ft === 0) return `${sign}${inches}"`;
  return `${sign}${ft}'-${inches}"`;
}


// Constrain a target point to be on a horizontal or vertical line from origin.
// Picks whichever axis the target is "more along" so the result is the
// closest of {horizontal-from-origin, vertical-from-origin}.
function _dlpCadConstrainOrtho(x1, y1, x2, y2){
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  if (dx >= dy) return { x: x2, y: y1 };
  return { x: x1, y: y2 };
}


function _dlpCadInitState(){
  return {
    version: DLP_CAD_VERSION,
    walls: [], doors: [], windows: [], openings: [], texts: [],
    equipment: [], points: [], annotations: [],
    rooms: [], water: [],
  };
}


async function renderDlpCadSketch(zone_id){
  return _renderDlpCadEditor({
    kind: 'zone',
    id: zone_id,
    sketchPath: `/drying-zones/${zone_id}/sketch-cad`,
    autoRoomPath: `/drying-zones/${zone_id}/auto-room`,
    backLabel: '← Chamber',
    onBack: () => renderDlpZoneDetail(zone_id),
    liveScreen: 'drylog-pro/cad/' + zone_id,
    liveTitle: 'DryLog PRO — Floor Plan',
    tools: DLP_CAD_TOOLS,
    keepAwake: false,
  });
}


async function _renderDlpCadEditor(ctx){
  clear();
  if (ctx.keepAwake) disableInactivity(); else enableInactivity();
  tcLiveSet({current_screen: ctx.liveScreen, current_job_id:selectedJob?.job_id||null}, ctx.liveTitle);
  root.appendChild(buildTopbar(ctx.backLabel, () => { _dlpCadFlushSave(); ctx.onBack(); }, {showClockLink:true}));

  const screen = el('div',{class:'screen',style:'padding:0;'});
  const loading = el('div',{class:'dlp-empty',style:'margin:16px;'},'Loading floor plan…');
  screen.appendChild(loading);
  root.appendChild(screen);

  // Load state + (zone mode) chamber reading points
  let data;
  try { data = await apiGet(ctx.sketchPath); data = data?.data || data; }
  catch(e){ loading.textContent = 'Load failed: ' + (e.message||e); return; }
  loading.remove();

  __dlpCad = {
    ctx,
    state: (data && data.state_json) ? Object.assign(_dlpCadInitState(), data.state_json) : _dlpCadInitState(),
    points_meta: Array.isArray(data?.points) ? data.points : [],
    tool: 'select',
    selected: null,
    inProgress: null,
    pan: {x: 200, y: 200},
    zoom: 1,
    pointers: new Map(),
    undoStack: [],
    redoStack: [],
    dirty: false,
    saveTimer: null,
    saveStatus: 'saved',
    svgRoot: null, contentG: null, statusEl: null, inspectorEl: null,
    snapToGrid: true,
    ortho: true,
    showDims: true,
    lastSavedAt: data?.updated_at || null,
    lastSavedBy: data?.updated_by_name || null,
  };

  // ── Toolbar (top horizontal, scrollable on narrow screens) ───────────────
  const cadHead = el('section',{class:'dlp-cad-head'},
    el('div',{},
      el('div',{class:'dlp-cad-kicker'},'CAD floor plan'),
      el('div',{class:'dlp-cad-title'},'Chamber sketch'),
      el('div',{class:'dlp-cad-sub'},'Draw rooms, connect openings, place doors/windows, mark wet areas, and drop equipment or reading points.')
    ),
    el('div',{class:'dlp-cad-head-actions'},
      (() => { const b=el('button',{type:'button'},'Import Scan'); b.addEventListener('click',()=>_dlpCadOpenScanImport()); return b; })(),
      (() => { const b=el('button',{type:'button'},'Scan Demo'); b.addEventListener('click',()=>_dlpCadImportScanData(_dlpCadDemoScanPayload(), {replace:true, confirm:false})); return b; })(),
      (() => { const b=el('button',{type:'button'},'Export Package'); b.addEventListener('click',()=>_dlpCadOpenExportPackage()); return b; })(),
      (() => { const b=el('button',{type:'button'},'Room 12x10'); b.addEventListener('click',()=>_dlpCadAddRoomTemplate()); return b; })(),
      (() => { const b=el('button',{type:'button'},'Fit'); b.addEventListener('click',_dlpCadFitView); return b; })(),
      (() => { const b=el('button',{type:'button'},'Save'); b.addEventListener('click',_dlpCadFlushSave); return b; })()
    )
  );
  screen.appendChild(cadHead);

  const toolbar = el('div',{class:'dlp-cad-toolbar',style:'display:flex;align-items:center;gap:4px;padding:8px 10px;background:#0f172a;color:#fff;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;border-bottom:1px solid #1e293b;'});
  for (const t of (ctx.tools || DLP_CAD_TOOLS)){
    const b = el('button',{style:'flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:54px;padding:6px 8px;background:transparent;border:1px solid #334155;border-radius:8px;color:#cbd5e1;font-size:10px;font-weight:600;cursor:pointer;line-height:1.1;'},
      el('div',{style:'font-size:18px;line-height:1;'}, t.icon),
      el('div',{style:'margin-top:3px;font-size:9px;'}, t.label)
    );
    b.addEventListener('click', (e) => { e.preventDefault(); _dlpCadSetTool(t.id); _dlpCadRenderToolbarState(); });
    b.dataset.tool = t.id;
    toolbar.appendChild(b);
  }
  // separator + action buttons
  toolbar.appendChild(el('div',{style:'flex:0 0 auto;width:1px;height:36px;background:#334155;margin:0 4px;'}));
  function actBtn(icon, label, onClick, stateKey){
    const b = el('button',{style:'flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:54px;padding:6px 8px;background:transparent;border:1px solid #334155;border-radius:8px;color:#cbd5e1;font-size:10px;font-weight:600;cursor:pointer;line-height:1.1;'},
      el('div',{style:'font-size:18px;line-height:1;'}, icon),
      el('div',{style:'margin-top:3px;font-size:9px;'}, label)
    );
    b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
    if (stateKey) b.dataset.stateKey = stateKey;
    return b;
  }
  toolbar.appendChild(actBtn('↶','Undo', _dlpCadUndo));
  toolbar.appendChild(actBtn('↷','Redo', _dlpCadRedo));
  toolbar.appendChild(actBtn('🗑️','Delete', _dlpCadDeleteSelected));
  toolbar.appendChild(actBtn('🔍+','Zoom+', () => _dlpCadZoom(1.25)));
  toolbar.appendChild(actBtn('🔍−','Zoom−', () => _dlpCadZoom(0.8)));
  toolbar.appendChild(actBtn('🎯','Fit', _dlpCadFitView));
  toolbar.appendChild(actBtn('⊞','Snap', () => { __dlpCad.snapToGrid = !__dlpCad.snapToGrid; _dlpCadRenderToolbarState(); }, 'snapToGrid'));
  toolbar.appendChild(actBtn('⊥','Ortho', () => { __dlpCad.ortho = !__dlpCad.ortho; _dlpCadRenderToolbarState(); }, 'ortho'));
  toolbar.appendChild(actBtn('📏','Dims', () => { __dlpCad.showDims = !__dlpCad.showDims; _dlpCadRender(); _dlpCadRenderToolbarState(); }, 'showDims'));
  screen.appendChild(toolbar);

  // ── Status bar ───────────────────────────────────────────────────────────
  const status = el('div',{style:'display:flex;align-items:center;gap:10px;padding:6px 12px;background:#1e293b;color:#94a3b8;font-size:11px;'});
  const statusLeft = el('div',{style:'flex:1;'}, '');
  const statusRight = el('div',{style:'flex:0 0 auto;text-align:right;color:#16a34a;font-weight:600;'}, '✓ Saved');
  status.appendChild(statusLeft); status.appendChild(statusRight);
  __dlpCad.statusEl = statusRight;
  __dlpCad.statusLeft = statusLeft;
  screen.appendChild(status);

  // ── SVG canvas ───────────────────────────────────────────────────────────
  const workbench = el('div',{class:'dlp-cad-workbench'});
  const canvasWrap = el('div',{class:'dlp-cad-canvas-wrap',style:'position:relative;flex:1;background:#fafafa;touch-action:none;overflow:hidden;height:calc(100vh - 230px);min-height:400px;'});
  const svg = sv('svg', {
    xmlns:'http://www.w3.org/2000/svg',
    width:'100%', height:'100%',
    style:'display:block;touch-action:none;-webkit-user-select:none;user-select:none;',
  });
  __dlpCad.svgRoot = svg;
  // Grid pattern
  const defs = sv('defs');
  const pattern = sv('pattern',{id:'dlpcad-grid', width: DLP_CAD_PX_PER_FT * DLP_CAD_GRID_FT, height: DLP_CAD_PX_PER_FT * DLP_CAD_GRID_FT, patternUnits:'userSpaceOnUse'},
    sv('path',{d:`M ${DLP_CAD_PX_PER_FT*DLP_CAD_GRID_FT} 0 L 0 0 0 ${DLP_CAD_PX_PER_FT*DLP_CAD_GRID_FT}`, fill:'none', stroke:'#e2e8f0', 'stroke-width':1})
  );
  const patternMajor = sv('pattern',{id:'dlpcad-grid-major', width: DLP_CAD_PX_PER_FT*5, height: DLP_CAD_PX_PER_FT*5, patternUnits:'userSpaceOnUse'},
    sv('rect',{width:DLP_CAD_PX_PER_FT*5, height:DLP_CAD_PX_PER_FT*5, fill:'url(#dlpcad-grid)'}),
    sv('path',{d:`M ${DLP_CAD_PX_PER_FT*5} 0 L 0 0 0 ${DLP_CAD_PX_PER_FT*5}`, fill:'none', stroke:'#cbd5e1', 'stroke-width':1})
  );
  defs.appendChild(pattern); defs.appendChild(patternMajor);
  svg.appendChild(defs);

  // Background grid rect (very large so panning doesn't reveal an edge)
  const gridRect = sv('rect',{x:-5000,y:-5000,width:10000,height:10000,fill:'url(#dlpcad-grid-major)'});
  svg.appendChild(gridRect);

  // The pannable / zoomable content group
  const contentG = sv('g',{id:'dlpcad-content'});
  __dlpCad.contentG = contentG;
  svg.appendChild(contentG);

  canvasWrap.appendChild(svg);
  workbench.appendChild(canvasWrap);
  const inspector = el('aside',{class:'dlp-cad-inspector'});
  __dlpCad.inspectorEl = inspector;
  workbench.appendChild(inspector);
  screen.appendChild(workbench);

  // Wire pointer events on the SVG for tool actions + pan/zoom
  svg.addEventListener('pointerdown', _dlpCadOnPointerDown);
  svg.addEventListener('pointermove', _dlpCadOnPointerMove);
  svg.addEventListener('pointerup', _dlpCadOnPointerUp);
  svg.addEventListener('pointercancel', _dlpCadOnPointerUp);
  // Mouse wheel zoom (desktop convenience)
  svg.addEventListener('wheel', (e) => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    _dlpCadZoom(e.deltaY < 0 ? 1.1 : 0.9, _dlpCadScreenToWorld(e.clientX, e.clientY));
  }, {passive:false});

  // Keyboard shortcuts (desktop)
  document.addEventListener('keydown', _dlpCadOnKeyDown);

  _dlpCadRenderToolbarState();
  _dlpCadRender();
}


// Update toolbar button styles based on current tool / state
function _dlpCadRenderToolbarState(){
  if (!__dlpCad || !__dlpCad.svgRoot) return;
  const tb = __dlpCad.svgRoot.parentElement.parentElement.querySelector('div');  // toolbar is first child of screen
  if (!tb) return;
  // Walk siblings — match by data-tool
  for (const btn of tb.querySelectorAll('button[data-tool]')){
    const sel = btn.dataset.tool === __dlpCad.tool;
    btn.style.background = sel ? '#3b82f6' : 'transparent';
    btn.style.color = sel ? '#fff' : '#cbd5e1';
    btn.style.borderColor = sel ? '#3b82f6' : '#334155';
  }
  // Toggle-state buttons (Snap / Ortho / Dims) — green when on
  for (const btn of tb.querySelectorAll('button[data-state-key]')){
    const on = !!__dlpCad[btn.dataset.stateKey];
    btn.style.background = on ? '#16a34a' : 'transparent';
    btn.style.color = on ? '#fff' : '#cbd5e1';
    btn.style.borderColor = on ? '#16a34a' : '#334155';
  }
  if (__dlpCad.statusLeft){
    const t = DLP_CAD_TOOLS.find(t=>t.id===__dlpCad.tool);
    const help = {
      select: 'Tap to select · drag to move',
      wall: 'Tap to set start · tap again for end · chains until you switch tools',
      room: 'Tap two opposite corners to draw a room (4 walls)',
      door: 'Tap on a wall to place a door',
      opening: 'Tap on a wall to cut a 3\' archway (no door)',
      connector: 'Tap on a shared wall to cut a wide room connector',
      window: 'Tap on a wall to place a window',
      water: 'Drag to circle wet area — or tap inside a room to flood-fill it',
      text: 'Tap on canvas to add a label',
      dehu: 'Tap to drop a dehu marker',
      mover: 'Tap to drop an air-mover marker',
      scrubber: 'Tap to drop an air-scrubber marker',
      point: 'Tap to drop a reading point',
    };
    const flags = [];
    if (__dlpCad.snapToGrid) flags.push('snap 6"');
    if (__dlpCad.ortho) flags.push('ortho');
    if (__dlpCad.showDims) flags.push('dims');
    __dlpCad.statusLeft.textContent = `${t.icon} ${t.label} — ${help[__dlpCad.tool] || ''}` + (flags.length ? ' · ' + flags.join(', ') : '');
  }
}


function _dlpCadSetTool(toolId){
  if (!__dlpCad) return;
  __dlpCad.tool = toolId;
  __dlpCad.inProgress = null;
  __dlpCad.selected = null;
  _dlpCadRender();
}


// ── Coordinate conversion ────────────────────────────────────────────────────
function _dlpCadAddRoomTemplate(){
  if (!__dlpCad) return;
  const label = prompt('Room label:', 'Room');
  if (label === null) return;
  const dimStr = prompt('Exact size in feet - width x length:', '12 x 10');
  if (dimStr === null) return;
  const parts = String(dimStr).toLowerCase().split(/[x×,]/).map(s => parseFloat(s.trim()));
  const widthFt = (parts[0] > 0 && parts[0] < 500) ? parts[0] : 12;
  const lengthFt = (parts[1] > 0 && parts[1] < 500) ? parts[1] : 10;
  const ch = parseFloat(prompt('Ceiling height in ft:', '8') || '8');
  const heightFt = ch > 0 ? ch : 8;
  const w = widthFt * DLP_CAD_PX_PER_FT;
  const h = lengthFt * DLP_CAD_PX_PER_FT;
  const x = -w / 2;
  const y = -h / 2;
  _dlpCadPushUndo();
  if (!Array.isArray(__dlpCad.state.rooms)) __dlpCad.state.rooms = [];
  __dlpCad.state.rooms.push({
    x, y, w, h,
    label: String(label || '').trim() || 'Room',
    ceiling_height_ft: heightFt,
    surface_ids: null,
    area_sf: Math.round(widthFt * lengthFt * 100) / 100,
    linear_ft: Math.round((2 * (widthFt + lengthFt)) * 100) / 100,
    wall_sf: Math.round((2 * (widthFt + lengthFt) * heightFt) * 100) / 100,
  });
  __dlpCad.state.walls.push({x1:x,y1:y,x2:x+w,y2:y});
  __dlpCad.state.walls.push({x1:x+w,y1:y,x2:x+w,y2:y+h});
  __dlpCad.state.walls.push({x1:x+w,y1:y+h,x2:x,y2:y+h});
  __dlpCad.state.walls.push({x1:x,y1:y+h,x2:x,y2:y});
  __dlpCad.selected = {kind:'room', idx:__dlpCad.state.rooms.length-1};
  _dlpCadMarkDirty();
  _dlpCadFitView();
  _dlpCadRender();
}


function _dlpCadDemoScanPayload(){
  return {
    source: 'DryLog scan demo',
    scanned_at: new Date().toISOString(),
    rooms: [
      {label:'Kitchen', width_ft:12, length_ft:10, ceiling_height_ft:8, x_ft:0, y_ft:0, wet:true},
      {label:'Hallway', width_ft:6, length_ft:5, ceiling_height_ft:8, x_ft:12, y_ft:2.5},
      {label:'Laundry', width_ft:7, length_ft:8, ceiling_height_ft:8, x_ft:3, y_ft:10},
    ],
    openings: [
      {from_room:'Kitchen', to_room:'Hallway', wall:'right', position:.5, width_ft:4, type:'connector'},
      {from_room:'Kitchen', to_room:'Laundry', wall:'bottom', position:.42, width_ft:3, type:'door'},
    ],
    windows: [
      {room:'Kitchen', wall:'top', position:.55, width_ft:4},
    ],
    equipment: [
      {room:'Kitchen', type:'dehu', label:'DH-1', x_ft:8.2, y_ft:6.4},
      {room:'Kitchen', type:'mover', label:'AM-1', x_ft:3.2, y_ft:7.2},
      {room:'Laundry', type:'mover', label:'AM-2', x_ft:5.8, y_ft:14.5},
    ],
    points: [
      {room:'Kitchen', point_label:'P1 sink wall', x_ft:10.5, y_ft:2.1},
      {room:'Laundry', point_label:'P2 baseboard', x_ft:4.8, y_ft:12.6},
    ],
    notes: ['RoomPlan-style import preview', 'Verify dimensions before report export'],
  };
}


function _dlpCadScanSchemaTemplate(){
  return {
    description: 'DryLog room scan import contract. Units are feet. Coordinates are plan-space feet from the upper-left scan origin.',
    source: 'RoomPlan / LiDAR companion',
    scanned_at: 'ISO-8601 timestamp',
    rooms: [
      {
        label: 'Kitchen',
        width_ft: 12,
        length_ft: 10,
        ceiling_height_ft: 8,
        x_ft: 0,
        y_ft: 0,
        wet: true
      }
    ],
    openings: [
      {
        from_room: 'Kitchen',
        to_room: 'Hallway',
        wall: 'right',
        position: 0.5,
        width_ft: 4,
        type: 'connector'
      }
    ],
    doors: [
      {
        room: 'Kitchen',
        wall: 'bottom',
        position: 0.35,
        width_ft: 3,
        swing: 'right'
      }
    ],
    windows: [
      {
        room: 'Kitchen',
        wall: 'top',
        position: 0.55,
        width_ft: 4
      }
    ],
    equipment: [
      {
        room: 'Kitchen',
        type: 'dehu',
        label: 'DH-1',
        x_ft: 8.2,
        y_ft: 6.4
      }
    ],
    points: [
      {
        room: 'Kitchen',
        point_label: 'P1 sink wall',
        x_ft: 10.5,
        y_ft: 2.1
      }
    ],
    notes: [
      'Verify dimensions before report export.'
    ]
  };
}


function _dlpCadImportScanFile(){
  if (!__dlpCad) return;
  const input = el('input',{type:'file',accept:'.json,application/json',style:'display:none;'});
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const scan = JSON.parse(String(reader.result || '{}'));
        _dlpCadImportScanData(scan, {replace:true});
      } catch(e) {
        alert('Scan import failed: the file is not valid JSON.');
      }
    };
    reader.onerror = () => alert('Scan import failed: could not read the file.');
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 1000);
}


function _dlpCadScanSummary(scan){
  const normalized = _dlpCadNormalizeScan(scan);
  const area = normalized.rooms.reduce((sum, r) => sum + (r.width_ft * r.length_ft), 0);
  const wallSf = normalized.rooms.reduce((sum, r) => sum + (2 * (r.width_ft + r.length_ft) * (r.ceiling_height_ft || 8)), 0);
  const warnings = _dlpCadValidateScan(scan, normalized);
  return {
    normalized,
    roomCount: normalized.rooms.length,
    openingCount: normalized.openings.length + normalized.doors.length + normalized.windows.length,
    equipmentCount: normalized.equipment.length,
    pointCount: normalized.points.length,
    totalArea: _dlpCadRound(area, 1),
    wallSf: _dlpCadRound(wallSf, 1),
    warnings,
  };
}


function _dlpCadValidateScan(rawScan, normalized){
  const warnings = [];
  const rawRooms = Array.isArray(rawScan?.rooms) ? rawScan.rooms : [];
  const names = new Map();
  normalized.rooms.forEach((room, idx) => {
    const key = String(room.label || '').trim().toLowerCase();
    if (names.has(key)) warnings.push(`Duplicate room name: ${room.label}`);
    names.set(key, idx);
    const raw = rawRooms[idx] || {};
    if (raw.width_ft == null && raw.widthFt == null && raw.width == null && !raw.dimensions?.width) warnings.push(`${room.label}: width was missing, defaulted to ${room.width_ft} ft`);
    if (raw.length_ft == null && raw.lengthFt == null && raw.depth_ft == null && raw.depthFt == null && raw.length == null && raw.depth == null && !raw.dimensions?.length && !raw.dimensions?.depth) warnings.push(`${room.label}: length was missing, defaulted to ${room.length_ft} ft`);
    if (room.width_ft <= 1 || room.length_ft <= 1) warnings.push(`${room.label}: room dimensions look too small`);
  });
  const hasRoom = (label) => {
    if (!label) return true;
    return names.has(String(label).trim().toLowerCase());
  };
  for (const item of [...(normalized.openings||[]), ...(normalized.doors||[]), ...(normalized.windows||[])]){
    const label = item.room || item.from_room || item.fromRoom;
    if (!hasRoom(label)) warnings.push(`Opening references unknown room: ${label}`);
    const width = Number(item.width_ft ?? item.widthFt) || 0;
    if (width && (width < 1.5 || width > 12)) warnings.push(`Opening width looks unusual: ${width} ft`);
  }
  for (const item of [...(normalized.equipment||[]), ...(normalized.points||[])]){
    if (!hasRoom(item.room)) warnings.push(`Marker references unknown room: ${item.room}`);
  }
  return warnings;
}


function _dlpCadDownloadJson(filename, payload){
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = el('a',{href:url,download:filename,style:'display:none;'});
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}


function _dlpCadOpenScanImport(seedScan){
  if (!__dlpCad) return;
  const overlay = el('div',{class:'dlp-scan-modal'});
  const sampleText = JSON.stringify(seedScan || _dlpCadDemoScanPayload(), null, 2);
  const textarea = el('textarea',{class:'dlp-scan-textarea',spellcheck:'false'});
  textarea.value = sampleText;
  const fileInput = el('input',{type:'file',accept:'.json,application/json',class:'dlp-scan-file'});
  const replaceBox = el('input',{type:'checkbox',checked:true});
  const status = el('div',{class:'dlp-scan-status'});
  const preview = el('div',{class:'dlp-scan-preview'});
  let parsed = null;

  const close = () => overlay.remove();
  const renderPreview = () => {
    preview.innerHTML = '';
    status.textContent = '';
    parsed = null;
    let scan;
    try {
      scan = JSON.parse(textarea.value || '{}');
    } catch(e) {
      status.textContent = 'JSON needs a quick fix before it can be imported.';
      status.className = 'dlp-scan-status error';
      preview.appendChild(el('div',{class:'dlp-scan-empty'},'Paste scan JSON or load the demo scan to preview the plan.'));
      return;
    }
    const summary = _dlpCadScanSummary(scan);
    parsed = scan;
    if (!summary.roomCount){
      status.textContent = 'No rooms found. Add a rooms array with labels and dimensions.';
      status.className = 'dlp-scan-status error';
      preview.appendChild(el('div',{class:'dlp-scan-empty'},'Expected rooms like: Kitchen, width_ft, length_ft, ceiling_height_ft.'));
      return;
    }
    status.textContent = `${summary.roomCount} rooms ready / ${summary.totalArea} sf floor / ${summary.wallSf} sf walls`;
    status.className = 'dlp-scan-status ok';
    const metrics = el('div',{class:'dlp-scan-metrics'},
      _dlpScanMetric('Rooms', summary.roomCount),
      _dlpScanMetric('Openings', summary.openingCount),
      _dlpScanMetric('Equipment', summary.equipmentCount),
      _dlpScanMetric('Points', summary.pointCount)
    );
    preview.appendChild(metrics);
    if (summary.warnings.length){
      const warningBox = el('div',{class:'dlp-scan-warnings'},
        el('strong',{},`${summary.warnings.length} review item${summary.warnings.length === 1 ? '' : 's'}`)
      );
      for (const msg of summary.warnings.slice(0, 6)) warningBox.appendChild(el('span',{}, msg));
      if (summary.warnings.length > 6) warningBox.appendChild(el('span',{}, `+ ${summary.warnings.length - 6} more`));
      preview.appendChild(warningBox);
    }
    const list = el('div',{class:'dlp-scan-room-list'});
    for (const room of summary.normalized.rooms){
      const area = _dlpCadRound(room.width_ft * room.length_ft, 1);
      list.appendChild(el('div',{class:'dlp-scan-room'},
        el('strong',{}, room.label),
        el('span',{}, `${room.width_ft}' x ${room.length_ft}' / ${area} sf / ${room.ceiling_height_ft}' ceiling`),
        room.wet ? el('em',{},'wet') : el('em',{class:'muted'},'dry')
      ));
    }
    preview.appendChild(list);
  };

  const loadFile = () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { textarea.value = String(reader.result || ''); renderPreview(); };
    reader.onerror = () => {
      status.textContent = 'Could not read that scan file.';
      status.className = 'dlp-scan-status error';
    };
    reader.readAsText(file);
  };

  fileInput.addEventListener('change', loadFile);
  textarea.addEventListener('input', renderPreview);

  const panel = el('div',{class:'dlp-scan-panel'},
    el('div',{class:'dlp-scan-head'},
      el('div',{},
        el('div',{class:'dlp-scan-kicker'},'LiDAR / RoomPlan bridge'),
        el('div',{class:'dlp-scan-title'},'Import Room Scan'),
        el('div',{class:'dlp-scan-sub'},'Review dimensions before they become rooms, walls, connectors, equipment pins, and reading points.')
      ),
      (() => { const b=el('button',{type:'button',class:'dlp-scan-close'},'Close'); b.addEventListener('click', close); return b; })()
    ),
    el('div',{class:'dlp-scan-body'},
      el('div',{class:'dlp-scan-source'},
        el('div',{class:'dlp-scan-tools'},
          (() => { const b=el('button',{type:'button'},'Load JSON'); b.addEventListener('click',()=>fileInput.click()); return b; })(),
          (() => { const b=el('button',{type:'button'},'Use Demo Scan'); b.addEventListener('click',()=>{ textarea.value = JSON.stringify(_dlpCadDemoScanPayload(), null, 2); renderPreview(); }); return b; })(),
          (() => { const b=el('button',{type:'button'},'Download Demo'); b.addEventListener('click',()=>_dlpCadDownloadJson('drylog-room-scan-demo.json', _dlpCadDemoScanPayload())); return b; })(),
          (() => { const b=el('button',{type:'button'},'Download Schema'); b.addEventListener('click',()=>_dlpCadDownloadJson('drylog-room-scan-schema.json', _dlpCadScanSchemaTemplate())); return b; })()
        ),
        fileInput,
        textarea
      ),
      el('div',{class:'dlp-scan-review'}, status, preview)
    ),
    el('div',{class:'dlp-scan-footer'},
      el('label',{class:'dlp-scan-toggle'}, replaceBox, el('span',{},'Replace current sketch')),
      (() => {
        const b=el('button',{type:'button',class:'dlp-scan-apply'},'Apply to CAD');
        b.addEventListener('click', () => {
          renderPreview();
          if (!parsed) return;
          _dlpCadImportScanData(parsed, {replace: !!replaceBox.checked, confirm: !!replaceBox.checked});
          close();
        });
        return b;
      })()
    )
  );
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  renderPreview();
  setTimeout(() => textarea.focus(), 50);
}


function _dlpScanMetric(label, value){
  return el('div',{class:'dlp-scan-metric'},
    el('span',{}, label),
    el('strong',{}, String(value))
  );
}


function _dlpCadFtToPx(v){
  return (Number(v) || 0) * DLP_CAD_PX_PER_FT;
}


function _dlpCadNormalizeScan(scan){
  const rawRooms = Array.isArray(scan?.rooms) ? scan.rooms
    : Array.isArray(scan?.capturedRoom?.rooms) ? scan.capturedRoom.rooms
      : Array.isArray(scan?.floors) ? scan.floors
        : [];
  const rooms = rawRooms.map((r, i) => {
    const dims = r.dimensions || r.size || {};
    const width = r.width_ft ?? r.widthFt ?? dims.width_ft ?? dims.width ?? r.width;
    const length = r.length_ft ?? r.lengthFt ?? r.depth_ft ?? r.depthFt ?? dims.length_ft ?? dims.length ?? dims.depth ?? r.length ?? r.depth;
    const height = r.ceiling_height_ft ?? r.ceilingHeightFt ?? r.height_ft ?? dims.ceiling_height_ft ?? dims.height ?? r.height;
    const origin = r.origin || r.position || {};
    return {
      label: r.label || r.name || `Scanned Room ${i + 1}`,
      width_ft: Math.max(.5, Number(width) || 10),
      length_ft: Math.max(.5, Number(length) || 10),
      ceiling_height_ft: Math.max(1, Number(height) || 8),
      x_ft: Number(r.x_ft ?? r.xFt ?? origin.x_ft ?? origin.x ?? (i % 2) * 12) || 0,
      y_ft: Number(r.y_ft ?? r.yFt ?? origin.y_ft ?? origin.y ?? Math.floor(i / 2) * 11) || 0,
      wet: !!r.wet,
    };
  });
  return {
    source: scan?.source || scan?.provider || 'Room scan',
    scanned_at: scan?.scanned_at || scan?.scannedAt || null,
    rooms,
    openings: Array.isArray(scan?.openings) ? scan.openings : [],
    doors: Array.isArray(scan?.doors) ? scan.doors : [],
    windows: Array.isArray(scan?.windows) ? scan.windows : [],
    equipment: Array.isArray(scan?.equipment) ? scan.equipment : [],
    points: Array.isArray(scan?.points) ? scan.points : Array.isArray(scan?.reading_points) ? scan.reading_points : [],
    notes: Array.isArray(scan?.notes) ? scan.notes : [],
  };
}


function _dlpCadFindRoomByLabel(rooms, label){
  const target = String(label || '').trim().toLowerCase();
  return rooms.findIndex(r => String(r.label || '').trim().toLowerCase() === target);
}


function _dlpCadPointInRoom(room, xFt, yFt){
  const x = _dlpCadFtToPx(room.x_ft + (Number(xFt) || room.width_ft / 2));
  const y = _dlpCadFtToPx(room.y_ft + (Number(yFt) || room.length_ft / 2));
  return {x, y};
}


function _dlpCadRoomFeatureWall(roomEntry, wallName){
  const side = String(wallName || '').toLowerCase();
  if (side === 'top' || side === 'north') return roomEntry.walls.top;
  if (side === 'right' || side === 'east') return roomEntry.walls.right;
  if (side === 'bottom' || side === 'south') return roomEntry.walls.bottom;
  if (side === 'left' || side === 'west') return roomEntry.walls.left;
  return roomEntry.walls.right;
}


function _dlpCadBuildStateFromScan(scan){
  const normalized = _dlpCadNormalizeScan(scan);
  const state = _dlpCadInitState();
  const roomEntries = [];
  normalized.rooms.forEach((room, idx) => {
    const x = _dlpCadFtToPx(room.x_ft);
    const y = _dlpCadFtToPx(room.y_ft);
    const w = _dlpCadFtToPx(room.width_ft);
    const h = _dlpCadFtToPx(room.length_ft);
    const ceiling = room.ceiling_height_ft || 8;
    const roomIdx = state.rooms.length;
    state.rooms.push({
      x, y, w, h,
      label: room.label || `Room ${idx + 1}`,
      ceiling_height_ft: ceiling,
      surface_ids: null,
      area_sf: _dlpCadRound(room.width_ft * room.length_ft, 1),
      linear_ft: _dlpCadRound(2 * (room.width_ft + room.length_ft), 1),
      wall_sf: _dlpCadRound(2 * (room.width_ft + room.length_ft) * ceiling, 1),
      scan_source: normalized.source,
    });
    const top = state.walls.push({x1:x,y1:y,x2:x+w,y2:y}) - 1;
    const right = state.walls.push({x1:x+w,y1:y,x2:x+w,y2:y+h}) - 1;
    const bottom = state.walls.push({x1:x+w,y1:y+h,x2:x,y2:y+h}) - 1;
    const left = state.walls.push({x1:x,y1:y+h,x2:x,y2:y}) - 1;
    roomEntries.push({room, roomIdx, walls:{top,right,bottom,left}});
    if (room.wet) state.water.push({roomIdx});
  });

  const featureRoom = (item) => {
    const idx = _dlpCadFindRoomByLabel(normalized.rooms, item.room || item.from_room || item.fromRoom);
    return roomEntries[idx >= 0 ? idx : 0];
  };
  const featurePosition = (item) => Math.max(.08, Math.min(.92, Number(item.position ?? item.t ?? .5) || .5));
  const featureWidth = (item, fallbackFt) => _dlpCadFtToPx(Number(item.width_ft ?? item.widthFt) || fallbackFt);

  for (const item of normalized.openings){
    const entry = featureRoom(item);
    if (!entry) continue;
    const kind = item.type === 'door' ? 'door' : item.type === 'archway' ? 'opening' : (item.kind || 'connector');
    const wallIdx = _dlpCadRoomFeatureWall(entry, item.wall);
    if (kind === 'door') state.doors.push({wallIdx, position: featurePosition(item), width: featureWidth(item, 3), swing:'right'});
    else state.openings.push({wallIdx, position: featurePosition(item), width: featureWidth(item, kind === 'connector' ? 4 : 3), kind});
  }
  for (const item of normalized.doors){
    const entry = featureRoom(item);
    if (!entry) continue;
    state.doors.push({wallIdx:_dlpCadRoomFeatureWall(entry, item.wall), position: featurePosition(item), width: featureWidth(item, 3), swing:item.swing || 'right'});
  }
  for (const item of normalized.windows){
    const entry = featureRoom(item);
    if (!entry) continue;
    state.windows.push({wallIdx:_dlpCadRoomFeatureWall(entry, item.wall), position: featurePosition(item), width: featureWidth(item, 3)});
  }
  for (const item of normalized.equipment){
    const idx = _dlpCadFindRoomByLabel(normalized.rooms, item.room);
    const room = normalized.rooms[idx >= 0 ? idx : 0];
    if (!room) continue;
    const p = _dlpCadPointInRoom(room, item.x_ft, item.y_ft);
    state.equipment.push({x:p.x, y:p.y, type:item.type || 'mover', label:item.label || '', rotation: Number(item.rotation) || 0});
  }
  for (const item of normalized.points){
    const idx = _dlpCadFindRoomByLabel(normalized.rooms, item.room);
    const room = normalized.rooms[idx >= 0 ? idx : 0];
    if (!room) continue;
    const p = _dlpCadPointInRoom(room, item.x_ft, item.y_ft);
    state.points.push({x:p.x, y:p.y, point_id:item.point_id || null, point_label:item.point_label || item.label || `Scan P${state.points.length + 1}`});
  }
  state.scan_meta = {
    source: normalized.source,
    scanned_at: normalized.scanned_at,
    imported_at: new Date().toISOString(),
    room_count: state.rooms.length,
    opening_count: state.openings.length + state.doors.length + state.windows.length,
    notes: normalized.notes,
  };
  return state;
}


function _dlpCadImportScanData(scan, opts){
  if (!__dlpCad) return;
  const nextState = _dlpCadBuildStateFromScan(scan);
  if (!nextState.rooms.length){
    alert('No rooms found in that scan. Import expects JSON with a rooms array.');
    return;
  }
  const replace = opts?.replace !== false;
  if (replace && opts?.confirm !== false && (__dlpCad.state.rooms.length || __dlpCad.state.walls.length)){
    if (!confirm('Replace the current sketch with this scan import?')) return;
  }
  _dlpCadPushUndo();
  if (replace) {
    __dlpCad.state = nextState;
  } else {
    const offset = __dlpCad.state.rooms.length ? 40 : 0;
    const wallOffset = __dlpCad.state.walls.length;
    const roomOffset = __dlpCad.state.rooms.length;
    for (const w of nextState.walls) __dlpCad.state.walls.push({x1:w.x1+offset,y1:w.y1+offset,x2:w.x2+offset,y2:w.y2+offset});
    for (const r of nextState.rooms) __dlpCad.state.rooms.push({...r,x:r.x+offset,y:r.y+offset});
    for (const d of nextState.doors) __dlpCad.state.doors.push({...d, wallIdx:d.wallIdx + wallOffset});
    for (const w of nextState.windows) __dlpCad.state.windows.push({...w, wallIdx:w.wallIdx + wallOffset});
    for (const o of nextState.openings) __dlpCad.state.openings.push({...o, wallIdx:o.wallIdx + wallOffset});
    for (const e of nextState.equipment) __dlpCad.state.equipment.push({...e, x:e.x+offset, y:e.y+offset});
    for (const p of nextState.points) __dlpCad.state.points.push({...p, x:p.x+offset, y:p.y+offset});
    for (const w of nextState.water) __dlpCad.state.water.push(w.roomIdx != null ? {...w, roomIdx:w.roomIdx + roomOffset} : w);
    __dlpCad.state.scan_meta = nextState.scan_meta;
  }
  __dlpCad.selected = {kind:'room', idx:0};
  __dlpCad.tool = 'select';
  _dlpCadMarkDirty();
  _dlpCadFitView();
  _dlpCadRenderToolbarState();
  _dlpCadRender();
}


function _dlpCadScreenToWorld(clientX, clientY){
  const rect = __dlpCad.svgRoot.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return {
    x: (sx - __dlpCad.pan.x) / __dlpCad.zoom,
    y: (sy - __dlpCad.pan.y) / __dlpCad.zoom,
  };
}


function _dlpCadSnap(pt){
  if (!__dlpCad.snapToGrid) return pt;
  // Snap at 6" precision — the visual grid stays at 1ft, but you can place
  // half-foot increments (a door centered halfway along a 7ft wall, etc.)
  const g = DLP_CAD_PX_PER_FT * DLP_CAD_SUBGRID_FT;
  return { x: Math.round(pt.x / g) * g, y: Math.round(pt.y / g) * g };
}


function _dlpCadSnapEndpoint(pt){
  // If close to an existing wall endpoint, snap there
  const st = __dlpCad.state;
  let best = null, bestD = DLP_CAD_ENDPT_SNAP_PX / __dlpCad.zoom;
  for (const w of st.walls){
    for (const [x,y] of [[w.x1,w.y1],[w.x2,w.y2]]){
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d < bestD){ bestD = d; best = {x,y}; }
    }
  }
  return best || _dlpCadSnap(pt);
}


// ── Pointer event flow ───────────────────────────────────────────────────────
function _dlpCadOnPointerDown(e){
  if (!__dlpCad) return;
  e.preventDefault();
  __dlpCad.svgRoot.setPointerCapture(e.pointerId);
  __dlpCad.pointers.set(e.pointerId, {
    startX: e.clientX, startY: e.clientY,
    curX: e.clientX, curY: e.clientY,
    moved: false, pointerType: e.pointerType,
  });
  // If 2 pointers down, cancel any in-progress drawing and switch to pinch mode
  if (__dlpCad.pointers.size === 2){
    __dlpCad.inProgress = null;
    __dlpCad.pinchStart = _dlpCadPinchMetrics();
    __dlpCad.pinchStartZoom = __dlpCad.zoom;
    __dlpCad.pinchStartPan = {...__dlpCad.pan};
    return;
  }
  // Water tool: drag-to-draw freestyle. Seed the path on first touch so the
  // move handler has something to append to. A pure tap (no movement) is
  // resolved into a room-fill in the up handler.
  if (__dlpCad.tool === 'water'){
    const wpt = _dlpCadScreenToWorld(e.clientX, e.clientY);
    __dlpCad.inProgress = {kind:'water', points: [{x: wpt.x, y: wpt.y}]};
  }
}


function _dlpCadOnPointerMove(e){
  if (!__dlpCad) return;
  const p = __dlpCad.pointers.get(e.pointerId);
  if (!p) return;
  p.curX = e.clientX; p.curY = e.clientY;
  const dx = e.clientX - p.startX, dy = e.clientY - p.startY;
  if (Math.hypot(dx, dy) > DLP_CAD_TAP_THRESHOLD) p.moved = true;

  if (__dlpCad.pointers.size === 2){
    // Pinch / pan
    const m = _dlpCadPinchMetrics();
    if (__dlpCad.pinchStart){
      const scale = m.dist / __dlpCad.pinchStart.dist;
      const newZoom = Math.max(0.2, Math.min(8, __dlpCad.pinchStartZoom * scale));
      const focus = __dlpCad.pinchStart.mid;
      // Adjust pan so the focus point stays put under the pinch
      const sx = focus.x - __dlpCad.pinchStartPan.x;
      const sy = focus.y - __dlpCad.pinchStartPan.y;
      __dlpCad.zoom = newZoom;
      __dlpCad.pan.x = m.mid.x - (sx / __dlpCad.pinchStart.zoom) * newZoom;
      __dlpCad.pan.y = m.mid.y - (sy / __dlpCad.pinchStart.zoom) * newZoom;
      _dlpCadApplyTransform();
    }
    return;
  }

  // Single pointer
  if (__dlpCad.tool === 'select' && __dlpCad.selected && p.moved){
    // Move selected element by delta in world coords
    const wDelta = { dx: dx / __dlpCad.zoom, dy: dy / __dlpCad.zoom };
    _dlpCadMoveSelectedDelta(wDelta);
    // Reset start so we compute incremental deltas
    p.startX = e.clientX; p.startY = e.clientY;
  } else if (!__dlpCad.selected && p.moved && (__dlpCad.tool === 'select' || __dlpCad.tool === 'pan')){
    // Pan with single finger when nothing's selected and tool is select
    __dlpCad.pan.x += (e.clientX - (p.lastX || p.startX));
    __dlpCad.pan.y += (e.clientY - (p.lastY || p.startY));
    _dlpCadApplyTransform();
    p.lastX = e.clientX; p.lastY = e.clientY;
  } else if (__dlpCad.tool === 'wall' && __dlpCad.inProgress && __dlpCad.inProgress.kind === 'wall'){
    // Live preview of wall being drawn
    let w = _dlpCadSnapEndpoint(_dlpCadScreenToWorld(e.clientX, e.clientY));
    if (__dlpCad.ortho) w = _dlpCadConstrainOrtho(__dlpCad.inProgress.x1, __dlpCad.inProgress.y1, w.x, w.y);
    __dlpCad.inProgress.x2 = w.x; __dlpCad.inProgress.y2 = w.y;
    _dlpCadRender();
  } else if (__dlpCad.tool === 'room' && __dlpCad.inProgress && __dlpCad.inProgress.kind === 'room'){
    const w = _dlpCadSnap(_dlpCadScreenToWorld(e.clientX, e.clientY));
    __dlpCad.inProgress.x2 = w.x; __dlpCad.inProgress.y2 = w.y;
    _dlpCadRender();
  } else if (__dlpCad.tool === 'water' && __dlpCad.inProgress && __dlpCad.inProgress.kind === 'water'){
    // Append a point if we've moved far enough since the last one. Keeps the
    // path from blowing up to thousands of points on a slow drag.
    const wpt = _dlpCadScreenToWorld(e.clientX, e.clientY);
    const pts = __dlpCad.inProgress.points;
    const last = pts[pts.length - 1];
    const minDist = 4 / __dlpCad.zoom;
    if (Math.hypot(wpt.x - last.x, wpt.y - last.y) >= minDist){
      pts.push({x: wpt.x, y: wpt.y});
      _dlpCadRender();
    }
  }
}


function _dlpCadOnPointerUp(e){
  if (!__dlpCad) return;
  const p = __dlpCad.pointers.get(e.pointerId);
  __dlpCad.pointers.delete(e.pointerId);
  try { __dlpCad.svgRoot.releasePointerCapture(e.pointerId); } catch(err){}
  if (!p) return;
  if (__dlpCad.pointers.size === 0) __dlpCad.pinchStart = null;

  // Water tool finalize — needs to handle BOTH a drag-end (commit polygon)
  // AND a clean tap (room flood-fill), so it runs before the tap-return below.
  if (__dlpCad.tool === 'water' && __dlpCad.inProgress && __dlpCad.inProgress.kind === 'water'){
    const pts = __dlpCad.inProgress.points;
    __dlpCad.inProgress = null;
    if (!Array.isArray(__dlpCad.state.water)) __dlpCad.state.water = [];
    if (p.moved && pts.length >= 3){
      _dlpCadPushUndo();
      __dlpCad.state.water.push({points: pts});
      _dlpCadMarkDirty();
      _dlpCadRender();
    } else if (!p.moved){
      // Tap — flood-fill the room under the tap (if any & not already filled)
      const wpt = _dlpCadScreenToWorld(e.clientX, e.clientY);
      const rooms = __dlpCad.state.rooms || [];
      let roomIdx = -1;
      for (let i = rooms.length - 1; i >= 0; i--){
        const r = rooms[i];
        if (wpt.x >= r.x && wpt.x <= r.x + r.w && wpt.y >= r.y && wpt.y <= r.y + r.h){
          roomIdx = i; break;
        }
      }
      if (roomIdx >= 0){
        const dupe = __dlpCad.state.water.some(w => w.roomIdx === roomIdx);
        if (!dupe){
          _dlpCadPushUndo();
          __dlpCad.state.water.push({roomIdx});
          _dlpCadMarkDirty();
          _dlpCadRender();
        }
      }
    }
    return;
  }

  if (p.moved) return;   // wasn't a tap

  // Tap action — depends on current tool
  const wpt = _dlpCadScreenToWorld(e.clientX, e.clientY);
  const tool = __dlpCad.tool;
  if (tool === 'select'){
    const hit = _dlpCadHitTest(wpt);
    __dlpCad.selected = hit;
    _dlpCadRender();
    return;
  }
  if (tool === 'wall'){
    let snap = _dlpCadSnapEndpoint(wpt);
    if (!__dlpCad.inProgress){
      __dlpCad.inProgress = {kind:'wall', x1: snap.x, y1: snap.y, x2: snap.x, y2: snap.y};
      _dlpCadRender();
    } else {
      const ip = __dlpCad.inProgress;
      if (__dlpCad.ortho) snap = _dlpCadConstrainOrtho(ip.x1, ip.y1, snap.x, snap.y);
      const w = {x1: ip.x1, y1: ip.y1, x2: snap.x, y2: snap.y};
      if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) >= 4){
        _dlpCadPushUndo();
        __dlpCad.state.walls.push(w);
        _dlpCadMarkDirty();
      }
      // Chain to next wall — start point is the just-finished endpoint
      __dlpCad.inProgress = {kind:'wall', x1: snap.x, y1: snap.y, x2: snap.x, y2: snap.y};
      _dlpCadRender();
    }
    return;
  }
  if (tool === 'room'){
    const snap = _dlpCadSnap(wpt);
    if (!__dlpCad.inProgress || __dlpCad.inProgress.kind !== 'room'){
      __dlpCad.inProgress = {kind:'room', x1: snap.x, y1: snap.y, x2: snap.x, y2: snap.y};
      _dlpCadRender();
    } else {
      const ip = __dlpCad.inProgress;
      const minX = Math.min(ip.x1, snap.x), maxX = Math.max(ip.x1, snap.x);
      const minY = Math.min(ip.y1, snap.y), maxY = Math.max(ip.y1, snap.y);
      if (maxX - minX < DLP_CAD_PX_PER_FT || maxY - minY < DLP_CAD_PX_PER_FT){
        __dlpCad.inProgress = null;
        _dlpCadRender();
        return;
      }
      const label = prompt(__dlpCad.ctx.autoRoomPath
        ? 'Room name (e.g., Kitchen) — leave blank to skip auto-surfaces:'
        : 'Room name (e.g., Kitchen):', '') || '';
      let ceilingHeight = 8;
      if (label){
        const ch = prompt(`Ceiling height in ft for "${label}":`, '8');
        const n = parseFloat(ch);
        if (n > 0 && n < 50) ceilingHeight = n;
      }
      // Exact tape measurements. The drawn box snaps to 6", so it's only a rough
      // shape — let the tech key the REAL size (width × length, in feet). The box
      // keeps its top-left corner and resizes to match. Blank/OK keeps the drawn
      // size. This is what's stored AND what syncs to the room card, so the
      // sketch and the named room finally agree.
      let fw = maxX - minX, fh = maxY - minY;
      const drawnW = Math.round(fw / DLP_CAD_PX_PER_FT * 100) / 100;
      const drawnL = Math.round(fh / DLP_CAD_PX_PER_FT * 100) / 100;
      const dimStr = prompt(`Exact size in feet — width x length (e.g. 12.5 x 10). Blank = drawn ${drawnW} x ${drawnL}:`, `${drawnW} x ${drawnL}`);
      if (dimStr != null && String(dimStr).trim()){
        const parts = String(dimStr).toLowerCase().split(/[x×,]/).map(s => parseFloat(s.trim()));
        if (parts.length === 2 && parts[0] > 0 && parts[1] > 0 && parts[0] < 500 && parts[1] < 500){
          fw = parts[0] * DLP_CAD_PX_PER_FT;
          fh = parts[1] * DLP_CAD_PX_PER_FT;
        }
      }
      const rMaxX = minX + fw, rMaxY = minY + fh;
      _dlpCadPushUndo();
      if (!Array.isArray(__dlpCad.state.rooms)) __dlpCad.state.rooms = [];
      const room = {
        x: minX, y: minY, w: fw, h: fh, label,
        ceiling_height_ft: ceilingHeight,
        surface_ids: null, area_sf: null, linear_ft: null, wall_sf: null,
      };
      __dlpCad.state.rooms.push(room);
      const roomIdx = __dlpCad.state.rooms.length - 1;
      __dlpCad.state.walls.push({x1: minX, y1: minY, x2: rMaxX, y2: minY});  // top
      __dlpCad.state.walls.push({x1: rMaxX, y1: minY, x2: rMaxX, y2: rMaxY});  // right
      __dlpCad.state.walls.push({x1: rMaxX, y1: rMaxY, x2: minX, y2: rMaxY});  // bottom
      __dlpCad.state.walls.push({x1: minX, y1: rMaxY, x2: minX, y2: minY});  // left
      __dlpCad.inProgress = null;
      _dlpCadMarkDirty();
      _dlpCadRender();

      // Fire-and-forget: create 3 claim_surfaces with auto-computed measurements
      if (label && __dlpCad.ctx.autoRoomPath){
        const width_ft = Math.round(fw / DLP_CAD_PX_PER_FT * 100) / 100;
        const depth_ft = Math.round(fh / DLP_CAD_PX_PER_FT * 100) / 100;
        apiPost(__dlpCad.ctx.autoRoomPath, {
          label, width_ft, depth_ft, ceiling_height_ft: ceilingHeight
        }).then(res => {
          const d = res?.data || res;
          const r = __dlpCad.state.rooms[roomIdx];
          if (r && d){
            r.surface_ids = {floor: d.floor_id, ceiling: d.ceiling_id, wall: d.wall_id};
            r.area_sf  = d.floor_sf;
            r.linear_ft = d.linear_ft;
            r.wall_sf   = d.wall_sf;
            _dlpCadMarkDirty();
            _dlpCadRender();
          }
        }).catch(e => {
          console.warn('auto-room failed:', e);
          if (__dlpCad.statusEl){
            __dlpCad.statusEl.textContent = '⚠ Surfaces failed';
            __dlpCad.statusEl.style.color = '#dc2626';
          }
        });
      }
    }
    return;
  }
  if (tool === 'door' || tool === 'window' || tool === 'opening' || tool === 'connector'){
    const wHit = _dlpCadHitNearestWall(wpt, 25 / __dlpCad.zoom);
    if (wHit){
      _dlpCadPushUndo();
      if (tool === 'door'){
        __dlpCad.state.doors.push({wallIdx: wHit.wallIdx, position: wHit.t, width: 30, swing: 'right'});
      } else if (tool === 'window'){
        __dlpCad.state.windows.push({wallIdx: wHit.wallIdx, position: wHit.t, width: 30});
      } else {
        // opening — default 3 ft (60 px) wide archway, no swing arc
        if (!Array.isArray(__dlpCad.state.openings)) __dlpCad.state.openings = [];
        __dlpCad.state.openings.push({wallIdx: wHit.wallIdx, position: wHit.t, width: tool === 'connector' ? 96 : 60, kind: tool === 'connector' ? 'connector' : 'opening'});
      }
      _dlpCadMarkDirty();
      _dlpCadRender();
    }
    return;
  }
  if (tool === 'text'){
    const text = prompt('Label text:', '');
    if (text){
      _dlpCadPushUndo();
      __dlpCad.state.texts.push({x: wpt.x, y: wpt.y, text, size: 14, color: '#0f172a'});
      _dlpCadMarkDirty();
      _dlpCadRender();
    }
    return;
  }
  if (tool === 'dehu' || tool === 'mover' || tool === 'scrubber'){
    _dlpCadPushUndo();
    __dlpCad.state.equipment.push({x: wpt.x, y: wpt.y, type: tool, label: '', rotation: 0});
    _dlpCadMarkDirty();
    _dlpCadRender();
    return;
  }
  if (tool === 'point'){
    // Pick an unplaced reading point or any reading point
    const placedIds = new Set(__dlpCad.state.points.map(p => p.point_id));
    const candidates = __dlpCad.points_meta.filter(p => !placedIds.has(p.id));
    let pick = null;
    if (candidates.length === 0){
      if (__dlpCad.points_meta.length === 0){
        alert('No reading points in this chamber yet. Add some via Setup → Chamber → Surface → Reading Point.');
        return;
      }
      pick = __dlpCad.points_meta[__dlpCad.state.points.length % __dlpCad.points_meta.length];
    } else if (candidates.length === 1){
      pick = candidates[0];
    } else {
      // Quick numeric picker
      const opts = candidates.map((p,i) => `${i+1}. ${p.point_label||('P'+p.id)} (${p.surface_label||p.surface_type||''})`).join('\n');
      const ans = prompt(`Pick a reading point:\n${opts}`, '1');
      const n = parseInt(ans, 10);
      if (!n || n < 1 || n > candidates.length) return;
      pick = candidates[n-1];
    }
    _dlpCadPushUndo();
    __dlpCad.state.points.push({x: wpt.x, y: wpt.y, point_id: pick.id, point_label: pick.point_label || ('P'+pick.id)});
    _dlpCadMarkDirty();
    _dlpCadRender();
    return;
  }
}


function _dlpCadPinchMetrics(){
  const arr = Array.from(__dlpCad.pointers.values());
  if (arr.length < 2) return null;
  const a = arr[0], b = arr[1];
  return {
    dist: Math.hypot(b.curX - a.curX, b.curY - a.curY) || 1,
    mid: { x: (a.curX + b.curX) / 2, y: (a.curY + b.curY) / 2 },
    zoom: __dlpCad.zoom,
  };
}


function _dlpCadApplyTransform(){
  if (!__dlpCad.contentG) return;
  __dlpCad.contentG.setAttribute('transform', `translate(${__dlpCad.pan.x},${__dlpCad.pan.y}) scale(${__dlpCad.zoom})`);
}


function _dlpCadZoom(factor, focusWorld){
  if (!__dlpCad) return;
  const oldZoom = __dlpCad.zoom;
  const newZoom = Math.max(0.2, Math.min(8, oldZoom * factor));
  if (focusWorld){
    // Adjust pan so focusWorld stays under the same screen point
    __dlpCad.pan.x = __dlpCad.pan.x + focusWorld.x * (oldZoom - newZoom);
    __dlpCad.pan.y = __dlpCad.pan.y + focusWorld.y * (oldZoom - newZoom);
  }
  __dlpCad.zoom = newZoom;
  _dlpCadApplyTransform();
}


function _dlpCadFitView(){
  if (!__dlpCad) return;
  const st = __dlpCad.state;
  const allX = [], allY = [];
  for (const w of st.walls){ allX.push(w.x1,w.x2); allY.push(w.y1,w.y2); }
  for (const o of [...st.texts, ...st.equipment, ...st.points]){ allX.push(o.x); allY.push(o.y); }
  for (const r of (st.rooms||[])){ allX.push(r.x, r.x + r.w); allY.push(r.y, r.y + r.h); }
  if (allX.length === 0){ __dlpCad.zoom = 1; __dlpCad.pan = {x: 200, y: 200}; _dlpCadApplyTransform(); return; }
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const minY = Math.min(...allY), maxY = Math.max(...allY);
  const w = maxX - minX + 100, h = maxY - minY + 100;
  const rect = __dlpCad.svgRoot.getBoundingClientRect();
  const zoom = Math.min(rect.width / w, rect.height / h, 4);
  __dlpCad.zoom = zoom;
  __dlpCad.pan.x = rect.width/2 - (minX + maxX)/2 * zoom;
  __dlpCad.pan.y = rect.height/2 - (minY + maxY)/2 * zoom;
  _dlpCadApplyTransform();
}


// ── Hit testing ─────────────────────────────────────────────────────────────
function _dlpCadHitTest(wpt){
  const st = __dlpCad.state;
  const tol = 10 / __dlpCad.zoom;
  // Reading points first (top of z-order)
  for (let i = st.points.length-1; i >= 0; i--){
    const p = st.points[i];
    if (Math.hypot(p.x - wpt.x, p.y - wpt.y) < 18) return {kind:'point', idx:i};
  }
  for (let i = st.equipment.length-1; i >= 0; i--){
    const eq = st.equipment[i];
    if (Math.hypot(eq.x - wpt.x, eq.y - wpt.y) < 22) return {kind:'equipment', idx:i};
  }
  for (let i = st.texts.length-1; i >= 0; i--){
    const t = st.texts[i];
    if (Math.abs(t.x - wpt.x) < 40 && Math.abs(t.y - wpt.y) < 16) return {kind:'text', idx:i};
  }
  // Water (highest priority among "fills" — sits on top of rooms but under walls).
  // Room-fill water: hit if tap is inside the room rect. Path water: ray-cast.
  for (let i = (st.water||[]).length - 1; i >= 0; i--){
    const wEntry = st.water[i];
    if (wEntry.roomIdx != null){
      const r = (st.rooms||[])[wEntry.roomIdx];
      if (r && wpt.x >= r.x && wpt.x <= r.x + r.w && wpt.y >= r.y && wpt.y <= r.y + r.h){
        return {kind:'water', idx: i};
      }
    } else if (Array.isArray(wEntry.points) && wEntry.points.length >= 3){
      // Point-in-polygon via ray casting
      const pts = wEntry.points;
      let inside = false;
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++){
        const xa = pts[a].x, ya = pts[a].y, xb = pts[b].x, yb = pts[b].y;
        const crosses = ((ya > wpt.y) !== (yb > wpt.y)) &&
                        (wpt.x < (xb - xa) * (wpt.y - ya) / ((yb - ya) || 1e-9) + xa);
        if (crosses) inside = !inside;
      }
      if (inside) return {kind:'water', idx: i};
    }
  }

  // Doors / windows / openings — hit at their centerpoint on the wall
  const hitOnWall = (arr, kind) => {
    for (let i = arr.length-1; i >= 0; i--){
      const item = arr[i];
      const w = st.walls[item.wallIdx];
      if (!w) continue;
      const wx = w.x1 + (w.x2-w.x1) * item.position;
      const wy = w.y1 + (w.y2-w.y1) * item.position;
      if (Math.hypot(wpt.x - wx, wpt.y - wy) < (item.width/2 + 6)) return {kind, idx: i};
    }
    return null;
  };
  let h;
  if ((h = hitOnWall(st.doors||[], 'door'))) return h;
  if ((h = hitOnWall(st.openings||[], 'opening'))) return h;
  if ((h = hitOnWall(st.windows||[], 'window'))) return h;

  for (let i = st.walls.length-1; i >= 0; i--){
    const w = st.walls[i];
    const d = _dlpCadPointLineDistance(wpt.x, wpt.y, w.x1, w.y1, w.x2, w.y2);
    if (d < tol) return {kind:'wall', idx:i};
  }
  // Rooms last (lowest z) — hit if tap is inside the rectangle
  for (let i = (st.rooms||[]).length-1; i >= 0; i--){
    const r = st.rooms[i];
    if (wpt.x >= r.x && wpt.x <= r.x + r.w && wpt.y >= r.y && wpt.y <= r.y + r.h) return {kind:'room', idx:i};
  }
  return null;
}


function _dlpCadHitNearestWall(wpt, maxDist){
  const st = __dlpCad.state;
  let best = null, bestD = maxDist;
  for (let i = 0; i < st.walls.length; i++){
    const w = st.walls[i];
    const t = _dlpCadProjectOnLine(wpt.x, wpt.y, w.x1, w.y1, w.x2, w.y2);
    const clampedT = Math.max(0, Math.min(1, t));
    const px = w.x1 + (w.x2-w.x1) * clampedT, py = w.y1 + (w.y2-w.y1) * clampedT;
    const d = Math.hypot(wpt.x - px, wpt.y - py);
    if (d < bestD){ bestD = d; best = {wallIdx:i, t: clampedT, px, py}; }
  }
  return best;
}


function _dlpCadPointLineDistance(px, py, x1, y1, x2, y2){
  const dx = x2-x1, dy = y2-y1;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return Math.hypot(px-x1, py-y1);
  const t = Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / len2));
  return Math.hypot(px - (x1 + dx*t), py - (y1 + dy*t));
}


function _dlpCadProjectOnLine(px, py, x1, y1, x2, y2){
  const dx = x2-x1, dy = y2-y1;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return 0;
  return ((px-x1)*dx + (py-y1)*dy) / len2;
}


// ── Move + delete ───────────────────────────────────────────────────────────
function _dlpCadMoveSelectedDelta(d){
  const s = __dlpCad.selected;
  if (!s) return;
  const st = __dlpCad.state;
  if (s.kind === 'wall'){
    const w = st.walls[s.idx];
    w.x1 += d.dx; w.y1 += d.dy; w.x2 += d.dx; w.y2 += d.dy;
  } else if (s.kind === 'point' || s.kind === 'equipment' || s.kind === 'text'){
    const o = st[s.kind === 'point' ? 'points' : s.kind === 'equipment' ? 'equipment' : 'texts'][s.idx];
    o.x += d.dx; o.y += d.dy;
  } else if (s.kind === 'room'){
    const r = st.rooms[s.idx];
    r.x += d.dx; r.y += d.dy;
  }
  _dlpCadMarkDirty();
  _dlpCadRender();
}


function _dlpCadDeleteSelected(){
  if (!__dlpCad || !__dlpCad.selected) return;
  const s = __dlpCad.selected;
  const st = __dlpCad.state;
  _dlpCadPushUndo();
  if (s.kind === 'wall'){
    st.walls.splice(s.idx, 1);
    // Also drop any doors/windows/openings on this wall, and reindex
    st.doors = st.doors.filter(d => d.wallIdx !== s.idx).map(d => ({...d, wallIdx: d.wallIdx > s.idx ? d.wallIdx-1 : d.wallIdx}));
    st.windows = st.windows.filter(w => w.wallIdx !== s.idx).map(w => ({...w, wallIdx: w.wallIdx > s.idx ? w.wallIdx-1 : w.wallIdx}));
    st.openings = (st.openings||[]).filter(o => o.wallIdx !== s.idx).map(o => ({...o, wallIdx: o.wallIdx > s.idx ? o.wallIdx-1 : o.wallIdx}));
  } else if (s.kind === 'door') st.doors.splice(s.idx, 1);
  else if (s.kind === 'opening') (st.openings||[]).splice(s.idx, 1);
  else if (s.kind === 'window') st.windows.splice(s.idx, 1);
  else if (s.kind === 'text') st.texts.splice(s.idx, 1);
  else if (s.kind === 'equipment') st.equipment.splice(s.idx, 1);
  else if (s.kind === 'point') st.points.splice(s.idx, 1);
  else if (s.kind === 'water') (st.water||[]).splice(s.idx, 1);
  else if (s.kind === 'room') {
    // Cascade-delete any water flood-fill tied to this room, then reindex others
    st.water = (st.water||[]).filter(w => w.roomIdx !== s.idx)
                              .map(w => w.roomIdx != null && w.roomIdx > s.idx
                                   ? {...w, roomIdx: w.roomIdx - 1} : w);
    (st.rooms||[]).splice(s.idx, 1);
  }
  __dlpCad.selected = null;
  _dlpCadMarkDirty();
  _dlpCadRender();
}


// ── Undo / redo / save ──────────────────────────────────────────────────────
function _dlpCadPushUndo(){
  if (!__dlpCad) return;
  __dlpCad.undoStack.push(JSON.stringify(__dlpCad.state));
  if (__dlpCad.undoStack.length > 50) __dlpCad.undoStack.shift();
  __dlpCad.redoStack = [];
}


function _dlpCadUndo(){
  if (!__dlpCad || __dlpCad.undoStack.length === 0) return;
  __dlpCad.redoStack.push(JSON.stringify(__dlpCad.state));
  __dlpCad.state = JSON.parse(__dlpCad.undoStack.pop());
  __dlpCad.selected = null;
  _dlpCadMarkDirty();
  _dlpCadRender();
}


function _dlpCadRedo(){
  if (!__dlpCad || __dlpCad.redoStack.length === 0) return;
  __dlpCad.undoStack.push(JSON.stringify(__dlpCad.state));
  __dlpCad.state = JSON.parse(__dlpCad.redoStack.pop());
  __dlpCad.selected = null;
  _dlpCadMarkDirty();
  _dlpCadRender();
}


function _dlpCadMarkDirty(){
  __dlpCad.dirty = true;
  _dlpCadUpdateStatus('unsaved');
  if (__dlpCad.saveTimer) clearTimeout(__dlpCad.saveTimer);
  __dlpCad.saveTimer = setTimeout(_dlpCadFlushSave, 1000);
}


async function _dlpCadFlushSave(){
  if (!__dlpCad || !__dlpCad.dirty) return;
  const ctx = __dlpCad.ctx;
  const snapshot = JSON.parse(JSON.stringify(__dlpCad.state));
  _dlpCadUpdateStatus('saving');
  try {
    await apiPut(ctx.sketchPath, {state_json: snapshot});
    if (__dlpCad && __dlpCad.ctx === ctx){
      // Only mark clean if no further edits while save was in-flight
      if (JSON.stringify(__dlpCad.state) === JSON.stringify(snapshot)){
        __dlpCad.dirty = false;
        _dlpCadUpdateStatus('saved');
      } else {
        // edits during save — schedule another flush
        _dlpCadMarkDirty();
      }
    }
  } catch(e){
    _dlpCadUpdateStatus('error');
  }
}


function _dlpCadUpdateStatus(s){
  if (!__dlpCad || !__dlpCad.statusEl) return;
  __dlpCad.saveStatus = s;
  const map = {
    saved:    {text:'✓ Saved', color:'#16a34a'},
    saving:   {text:'⌛ Saving…', color:'#f59e0b'},
    unsaved:  {text:'• Unsaved', color:'#94a3b8'},
    error:    {text:'⚠ Save failed — retrying', color:'#dc2626'},
  };
  const m = map[s] || map.saved;
  __dlpCad.statusEl.textContent = m.text;
  __dlpCad.statusEl.style.color = m.color;
}


function _dlpCadOnKeyDown(e){
  if (!__dlpCad) return;
  // Only handle if we're actively in the CAD editor
  if (!document.body.contains(__dlpCad.svgRoot)) {
    document.removeEventListener('keydown', _dlpCadOnKeyDown);
    return;
  }
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z'){
    e.preventDefault();
    if (e.shiftKey) _dlpCadRedo(); else _dlpCadUndo();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y'){
    e.preventDefault(); _dlpCadRedo();
  } else if (e.key === 'Delete' || e.key === 'Backspace'){
    if (__dlpCad.selected){ e.preventDefault(); _dlpCadDeleteSelected(); }
  } else if (e.key === 'Escape'){
    __dlpCad.inProgress = null; __dlpCad.selected = null; _dlpCadRender();
  }
}


// ── Rendering ───────────────────────────────────────────────────────────────
function _dlpCadExportRows(){
  const st = __dlpCad?.state || _dlpCadInitState();
  return (st.rooms||[]).map((room, idx) => {
    const widthFt = room.w / DLP_CAD_PX_PER_FT;
    const lengthFt = room.h / DLP_CAD_PX_PER_FT;
    const ceiling = Number(room.ceiling_height_ft) || 8;
    const area = room.area_sf != null ? Number(room.area_sf) : widthFt * lengthFt;
    const perimeter = room.linear_ft != null ? Number(room.linear_ft) : 2 * (widthFt + lengthFt);
    const wallSf = room.wall_sf != null ? Number(room.wall_sf) : perimeter * ceiling;
    const wet = (st.water||[]).some(w => w.roomIdx === idx);
    return {
      room: room.label || `Room ${idx + 1}`,
      width_ft: _dlpCadRound(widthFt, 2),
      length_ft: _dlpCadRound(lengthFt, 2),
      ceiling_ft: _dlpCadRound(ceiling, 2),
      floor_sf: _dlpCadRound(area, 1),
      perimeter_lf: _dlpCadRound(perimeter, 1),
      wall_sf: _dlpCadRound(wallSf, 1),
      wet_area: wet ? 'Yes' : 'No',
      source: room.scan_source || st.scan_meta?.source || 'Manual sketch',
    };
  });
}


function _dlpCadExportSummary(){
  const st = __dlpCad?.state || _dlpCadInitState();
  const rows = _dlpCadExportRows();
  const totals = rows.reduce((acc, row) => {
    acc.floor_sf += Number(row.floor_sf) || 0;
    acc.wall_sf += Number(row.wall_sf) || 0;
    acc.perimeter_lf += Number(row.perimeter_lf) || 0;
    if (row.wet_area === 'Yes') acc.wet_rooms += 1;
    return acc;
  }, {floor_sf:0, wall_sf:0, perimeter_lf:0, wet_rooms:0});
  return {
    claim: selectedJob?.name || selectedJob?.job_name || 'DryLog job',
    generated_at: new Date().toISOString(),
    scan_meta: st.scan_meta || null,
    totals: {
      rooms: rows.length,
      floor_sf: _dlpCadRound(totals.floor_sf, 1),
      wall_sf: _dlpCadRound(totals.wall_sf, 1),
      perimeter_lf: _dlpCadRound(totals.perimeter_lf, 1),
      wet_rooms: totals.wet_rooms,
      doors: (st.doors||[]).length,
      windows: (st.windows||[]).length,
      connectors: (st.openings||[]).filter(o => o.kind === 'connector').length,
      equipment: (st.equipment||[]).length,
      reading_points: (st.points||[]).length,
    },
    rooms: rows,
  };
}


function _dlpCadCsvEscape(value){
  const s = String(value == null ? '' : value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}


function _dlpCadDownloadText(filename, text, type){
  const blob = new Blob([text], {type: type || 'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = el('a',{href:url,download:filename,style:'display:none;'});
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}


function _dlpCadDownloadCsv(){
  const rows = _dlpCadExportRows();
  const cols = ['room','width_ft','length_ft','ceiling_ft','floor_sf','perimeter_lf','wall_sf','wet_area','source'];
  const csv = [cols.join(',')].concat(rows.map(row => cols.map(c => _dlpCadCsvEscape(row[c])).join(','))).join('\n');
  _dlpCadDownloadText('drylog-room-measurements.csv', csv, 'text/csv');
}


function _dlpCadDownloadExportJson(){
  _dlpCadDownloadJson('drylog-cad-export-package.json', _dlpCadExportSummary());
}


function _dlpCadDrawingBounds(pad){
  const st = __dlpCad?.state || _dlpCadInitState();
  const xs = [], ys = [];
  for (const w of st.walls||[]){ xs.push(w.x1,w.x2); ys.push(w.y1,w.y2); }
  for (const r of st.rooms||[]){ xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); }
  for (const o of [...(st.texts||[]), ...(st.equipment||[]), ...(st.points||[])]){ xs.push(o.x); ys.push(o.y); }
  const p = pad == null ? 50 : pad;
  if (!xs.length) return {minX:-p,minY:-p,width:p*2,height:p*2};
  const minX = Math.min(...xs) - p, maxX = Math.max(...xs) + p;
  const minY = Math.min(...ys) - p, maxY = Math.max(...ys) + p;
  return {minX, minY, width:Math.max(1, maxX - minX), height:Math.max(1, maxY - minY)};
}


function _dlpCadExportSvgMarkup(){
  if (!__dlpCad || !__dlpCad.contentG) return '';
  const bounds = _dlpCadDrawingBounds(60);
  const clone = __dlpCad.contentG.cloneNode(true);
  clone.removeAttribute('transform');
  const exportSvg = sv('svg',{
    xmlns:'http://www.w3.org/2000/svg',
    width:Math.ceil(bounds.width),
    height:Math.ceil(bounds.height),
    viewBox:`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`,
  });
  exportSvg.appendChild(sv('rect',{x:bounds.minX,y:bounds.minY,width:bounds.width,height:bounds.height,fill:'#ffffff'}));
  exportSvg.appendChild(clone);
  return new XMLSerializer().serializeToString(exportSvg);
}


function _dlpCadDownloadSvg(){
  const markup = _dlpCadExportSvgMarkup();
  if (!markup){ alert('Nothing to export yet.'); return; }
  _dlpCadDownloadText('drylog-cad-sketch.svg', markup, 'image/svg+xml');
}


function _dlpCadOpenExportPackage(){
  if (!__dlpCad) return;
  const summary = _dlpCadExportSummary();
  const overlay = el('div',{class:'dlp-scan-modal'});
  const close = () => overlay.remove();
  const metrics = el('div',{class:'dlp-export-metrics'},
    _dlpScanMetric('Rooms', summary.totals.rooms),
    _dlpScanMetric('Floor SF', summary.totals.floor_sf),
    _dlpScanMetric('Wall SF', summary.totals.wall_sf),
    _dlpScanMetric('Wet Rooms', summary.totals.wet_rooms)
  );
  const table = el('div',{class:'dlp-export-table'},
    el('div',{class:'dlp-export-row head'},
      el('span',{},'Room'), el('span',{},'Size'), el('span',{},'Floor'), el('span',{},'Walls'), el('span',{},'Wet')
    )
  );
  for (const row of summary.rooms){
    table.appendChild(el('div',{class:'dlp-export-row'},
      el('strong',{}, row.room),
      el('span',{}, `${row.width_ft}' x ${row.length_ft}'`),
      el('span',{}, `${row.floor_sf} sf`),
      el('span',{}, `${row.wall_sf} sf`),
      el('span',{}, row.wet_area)
    ));
  }
  const empty = !summary.rooms.length ? el('div',{class:'dlp-scan-empty'},'No rooms in this sketch yet. Add a room or import a scan first.') : null;
  const panel = el('div',{class:'dlp-export-panel'},
    el('div',{class:'dlp-scan-head'},
      el('div',{},
        el('div',{class:'dlp-scan-kicker'},'Report package'),
        el('div',{class:'dlp-scan-title'},'CAD Export'),
        el('div',{class:'dlp-scan-sub'},'Download a clean sketch plus room measurements for the mitigation report.')
      ),
      (() => { const b=el('button',{type:'button',class:'dlp-scan-close'},'Close'); b.addEventListener('click', close); return b; })()
    ),
    el('div',{class:'dlp-export-body'},
      metrics,
      summary.scan_meta ? el('div',{class:'dlp-cad-scan-card'}, el('span',{},'Scan source'), el('strong',{},summary.scan_meta.source || 'Room scan'), el('em',{},`${summary.scan_meta.room_count || 0} rooms imported`)) : null,
      empty,
      summary.rooms.length ? table : null
    ),
    el('div',{class:'dlp-scan-footer'},
      el('div',{class:'dlp-export-note'}, `${summary.totals.doors} doors / ${summary.totals.windows} windows / ${summary.totals.connectors} connectors / ${summary.totals.equipment} equipment`),
      el('div',{class:'dlp-export-actions'},
        (() => { const b=el('button',{type:'button'},'Download SVG'); b.addEventListener('click',_dlpCadDownloadSvg); return b; })(),
        (() => { const b=el('button',{type:'button'},'Download CSV'); b.addEventListener('click',_dlpCadDownloadCsv); return b; })(),
        (() => { const b=el('button',{type:'button',class:'primary'},'Download JSON'); b.addEventListener('click',_dlpCadDownloadExportJson); return b; })()
      )
    )
  );
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
}


function _dlpCadRound(n, places){
  const p = Math.pow(10, places || 0);
  return Math.round((Number(n) || 0) * p) / p;
}


function _dlpCadObjectLabel(kind){
  const labels = {
    room: 'Room',
    wall: 'Wall',
    opening: 'Connector / opening',
    door: 'Door',
    window: 'Window',
    equipment: 'Equipment',
    point: 'Reading point',
    text: 'Label',
    water: 'Wet area',
  };
  return labels[kind] || 'Selection';
}


function _dlpCadInspectorButton(label, onClick, intent){
  const b = el('button',{type:'button',class:'dlp-cad-inspector-btn' + (intent ? ' ' + intent : '')}, label);
  b.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
  return b;
}


function _dlpCadInspectorRow(label, value){
  return el('div',{class:'dlp-cad-inspector-row'},
    el('span',{}, label),
    el('strong',{}, value == null || value === '' ? '-' : String(value))
  );
}


function _dlpCadWallLength(wallIdx){
  const w = __dlpCad?.state?.walls?.[wallIdx];
  if (!w) return 0;
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}


function _dlpCadAddWallFeature(kind){
  if (!__dlpCad || !__dlpCad.selected || __dlpCad.selected.kind !== 'wall') return;
  const wallIdx = __dlpCad.selected.idx;
  const st = __dlpCad.state;
  if (!st.walls[wallIdx]) return;
  _dlpCadPushUndo();
  if (kind === 'door'){
    st.doors.push({wallIdx, position: 0.5, width: DLP_CAD_PX_PER_FT * 3, swing: 'right'});
  } else if (kind === 'window'){
    st.windows.push({wallIdx, position: 0.5, width: DLP_CAD_PX_PER_FT * 3});
  } else {
    if (!Array.isArray(st.openings)) st.openings = [];
    st.openings.push({wallIdx, position: 0.5, width: DLP_CAD_PX_PER_FT * (kind === 'connector' ? 4 : 3), kind});
  }
  __dlpCad.selected = kind === 'door'
    ? {kind:'door', idx:st.doors.length - 1}
    : kind === 'window'
      ? {kind:'window', idx:st.windows.length - 1}
      : {kind:'opening', idx:st.openings.length - 1};
  _dlpCadMarkDirty();
  _dlpCadRender();
}


function _dlpCadRenameSelected(){
  if (!__dlpCad || !__dlpCad.selected) return;
  const s = __dlpCad.selected;
  const st = __dlpCad.state;
  let obj = null;
  let key = 'label';
  if (s.kind === 'room') obj = st.rooms?.[s.idx];
  else if (s.kind === 'equipment') obj = st.equipment?.[s.idx];
  else if (s.kind === 'point') { obj = st.points?.[s.idx]; key = 'point_label'; }
  else if (s.kind === 'text') { obj = st.texts?.[s.idx]; key = 'text'; }
  if (!obj) return;
  const next = prompt('Name:', obj[key] || '');
  if (next === null) return;
  _dlpCadPushUndo();
  obj[key] = String(next || '').trim();
  _dlpCadMarkDirty();
  _dlpCadRender();
}


function _dlpCadSetOpeningWidth(idx, feet){
  if (!__dlpCad || !__dlpCad.state.openings?.[idx]) return;
  _dlpCadPushUndo();
  const o = __dlpCad.state.openings[idx];
  o.width = feet * DLP_CAD_PX_PER_FT;
  if (feet >= 4) o.kind = 'connector';
  _dlpCadMarkDirty();
  _dlpCadRender();
}


function _dlpCadSetDoorWindowWidth(kind, idx, feet){
  if (!__dlpCad) return;
  const list = kind === 'door' ? __dlpCad.state.doors : __dlpCad.state.windows;
  if (!list?.[idx]) return;
  _dlpCadPushUndo();
  list[idx].width = feet * DLP_CAD_PX_PER_FT;
  _dlpCadMarkDirty();
  _dlpCadRender();
}


function _dlpCadSetRoomWet(idx, wet){
  if (!__dlpCad || !__dlpCad.state.rooms?.[idx]) return;
  const water = Array.isArray(__dlpCad.state.water) ? __dlpCad.state.water : [];
  const has = water.some(w => w.roomIdx === idx);
  if ((wet && has) || (!wet && !has)) return;
  _dlpCadPushUndo();
  __dlpCad.state.water = wet ? [...water, {roomIdx: idx}] : water.filter(w => w.roomIdx !== idx);
  _dlpCadMarkDirty();
  _dlpCadRender();
}


function _dlpCadRenderInspector(){
  if (!__dlpCad || !__dlpCad.inspectorEl) return;
  const panel = __dlpCad.inspectorEl;
  panel.innerHTML = '';
  const st = __dlpCad.state;
  const sel = __dlpCad.selected;
  const counts = [
    `${(st.rooms||[]).length} rooms`,
    `${(st.walls||[]).length} walls`,
    `${(st.openings||[]).filter(o => o.kind === 'connector').length} connectors`,
  ].join(' / ');
  panel.appendChild(el('div',{class:'dlp-cad-inspector-kicker'},'Plan inspector'));
  panel.appendChild(el('div',{class:'dlp-cad-inspector-title'}, sel ? _dlpCadObjectLabel(sel.kind) : 'Nothing selected'));
  panel.appendChild(el('div',{class:'dlp-cad-inspector-meta'}, counts));
  if (st.scan_meta){
    panel.appendChild(el('div',{class:'dlp-cad-scan-card'},
      el('span',{}, 'Scan import'),
      el('strong',{}, st.scan_meta.source || 'Room scan'),
      el('em',{}, `${st.scan_meta.room_count || 0} rooms / ${st.scan_meta.opening_count || 0} openings`)
    ));
  }

  if (!sel){
    panel.appendChild(el('div',{class:'dlp-cad-inspector-empty'},
      'Select a room, wall, connector, marker, or reading point to edit it here.'
    ));
    panel.appendChild(el('div',{class:'dlp-cad-inspector-actions'},
      _dlpCadInspectorButton('Add 12 x 10 room', _dlpCadAddRoomTemplate, 'primary'),
      _dlpCadInspectorButton('Fit plan', _dlpCadFitView)
    ));
    return;
  }

  if (sel.kind === 'room'){
    const r = st.rooms?.[sel.idx];
    if (!r) return;
    const widthFt = r.w / DLP_CAD_PX_PER_FT;
    const lengthFt = r.h / DLP_CAD_PX_PER_FT;
    const wet = (st.water||[]).some(w => w.roomIdx === sel.idx);
    panel.appendChild(_dlpCadInspectorRow('Name', r.label || `Room ${sel.idx + 1}`));
    panel.appendChild(_dlpCadInspectorRow('Size', `${_dlpCadPxToFtIn(r.w)} x ${_dlpCadPxToFtIn(r.h)}`));
    panel.appendChild(_dlpCadInspectorRow('Area', `${_dlpCadRound(r.area_sf || (widthFt * lengthFt), 1)} sf`));
    panel.appendChild(_dlpCadInspectorRow('Perimeter', `${_dlpCadRound(r.linear_ft || (2 * (widthFt + lengthFt)), 1)} lf`));
    panel.appendChild(_dlpCadInspectorRow('Wall area', `${_dlpCadRound(r.wall_sf || (2 * (widthFt + lengthFt) * (r.ceiling_height_ft || 8)), 1)} sf`));
    panel.appendChild(el('div',{class:'dlp-cad-inspector-actions'},
      _dlpCadInspectorButton('Rename', _dlpCadRenameSelected),
      _dlpCadInspectorButton(wet ? 'Clear wet fill' : 'Mark room wet', () => _dlpCadSetRoomWet(sel.idx, !wet), wet ? '' : 'primary')
    ));
  } else if (sel.kind === 'wall'){
    const w = st.walls?.[sel.idx];
    if (!w) return;
    panel.appendChild(_dlpCadInspectorRow('Length', _dlpCadPxToFtIn(_dlpCadWallLength(sel.idx))));
    panel.appendChild(_dlpCadInspectorRow('Features', `${(st.doors||[]).filter(d => d.wallIdx === sel.idx).length} doors / ${(st.windows||[]).filter(x => x.wallIdx === sel.idx).length} windows / ${(st.openings||[]).filter(o => o.wallIdx === sel.idx).length} openings`));
    panel.appendChild(el('div',{class:'dlp-cad-inspector-actions'},
      _dlpCadInspectorButton('Add connector', () => _dlpCadAddWallFeature('connector'), 'primary'),
      _dlpCadInspectorButton('Add door', () => _dlpCadAddWallFeature('door')),
      _dlpCadInspectorButton('Add window', () => _dlpCadAddWallFeature('window')),
      _dlpCadInspectorButton('Add archway', () => _dlpCadAddWallFeature('opening'))
    ));
  } else if (sel.kind === 'opening'){
    const o = st.openings?.[sel.idx];
    if (!o) return;
    panel.appendChild(_dlpCadInspectorRow('Type', o.kind === 'connector' ? 'Room connector' : 'Archway'));
    panel.appendChild(_dlpCadInspectorRow('Width', _dlpCadPxToFtIn(o.width || 0)));
    panel.appendChild(_dlpCadInspectorRow('Wall', `Wall ${Number(o.wallIdx) + 1}`));
    panel.appendChild(el('div',{class:'dlp-cad-inspector-actions'},
      _dlpCadInspectorButton('3 ft', () => _dlpCadSetOpeningWidth(sel.idx, 3)),
      _dlpCadInspectorButton('4 ft', () => _dlpCadSetOpeningWidth(sel.idx, 4), 'primary'),
      _dlpCadInspectorButton('6 ft', () => _dlpCadSetOpeningWidth(sel.idx, 6)),
      _dlpCadInspectorButton('8 ft', () => _dlpCadSetOpeningWidth(sel.idx, 8)),
      _dlpCadInspectorButton('Delete', _dlpCadDeleteSelected, 'danger')
    ));
  } else if (sel.kind === 'door' || sel.kind === 'window'){
    const list = sel.kind === 'door' ? st.doors : st.windows;
    const obj = list?.[sel.idx];
    if (!obj) return;
    panel.appendChild(_dlpCadInspectorRow('Width', _dlpCadPxToFtIn(obj.width || 0)));
    panel.appendChild(_dlpCadInspectorRow('Wall', `Wall ${Number(obj.wallIdx) + 1}`));
    panel.appendChild(el('div',{class:'dlp-cad-inspector-actions'},
      _dlpCadInspectorButton('2 ft 6 in', () => _dlpCadSetDoorWindowWidth(sel.kind, sel.idx, 2.5)),
      _dlpCadInspectorButton('3 ft', () => _dlpCadSetDoorWindowWidth(sel.kind, sel.idx, 3), 'primary'),
      _dlpCadInspectorButton('4 ft', () => _dlpCadSetDoorWindowWidth(sel.kind, sel.idx, 4)),
      _dlpCadInspectorButton('Delete', _dlpCadDeleteSelected, 'danger')
    ));
  } else if (sel.kind === 'equipment'){
    const eq = st.equipment?.[sel.idx];
    if (!eq) return;
    panel.appendChild(_dlpCadInspectorRow('Type', eq.type || 'equipment'));
    panel.appendChild(_dlpCadInspectorRow('Label', eq.label || '-'));
    panel.appendChild(el('div',{class:'dlp-cad-inspector-actions'},
      _dlpCadInspectorButton('Rename', _dlpCadRenameSelected, 'primary'),
      _dlpCadInspectorButton('Delete', _dlpCadDeleteSelected, 'danger')
    ));
  } else if (sel.kind === 'point'){
    const p = st.points?.[sel.idx];
    if (!p) return;
    panel.appendChild(_dlpCadInspectorRow('Point', p.point_label || `Point ${sel.idx + 1}`));
    panel.appendChild(_dlpCadInspectorRow('Linked ID', p.point_id || '-'));
    panel.appendChild(el('div',{class:'dlp-cad-inspector-actions'},
      _dlpCadInspectorButton('Rename', _dlpCadRenameSelected, 'primary'),
      _dlpCadInspectorButton('Delete', _dlpCadDeleteSelected, 'danger')
    ));
  } else if (sel.kind === 'text'){
    const t = st.texts?.[sel.idx];
    if (!t) return;
    panel.appendChild(_dlpCadInspectorRow('Text', t.text || '-'));
    panel.appendChild(el('div',{class:'dlp-cad-inspector-actions'},
      _dlpCadInspectorButton('Edit text', _dlpCadRenameSelected, 'primary'),
      _dlpCadInspectorButton('Delete', _dlpCadDeleteSelected, 'danger')
    ));
  } else if (sel.kind === 'water'){
    panel.appendChild(_dlpCadInspectorRow('Type', 'Wet area'));
    panel.appendChild(el('div',{class:'dlp-cad-inspector-actions'},
      _dlpCadInspectorButton('Delete wet area', _dlpCadDeleteSelected, 'danger')
    ));
  }
}


function _dlpCadRender(){
  if (!__dlpCad || !__dlpCad.contentG) return;
  _dlpCadApplyTransform();
  const g = __dlpCad.contentG;
  // Clear
  while (g.firstChild) g.removeChild(g.firstChild);

  const st = __dlpCad.state;
  const sel = __dlpCad.selected;
  const selKind = sel?.kind, selIdx = sel?.idx;

  // Rooms — lowest z-order, behind walls
  for (let i = 0; i < (st.rooms||[]).length; i++){
    const r = st.rooms[i];
    const isSel = selKind === 'room' && selIdx === i;
    g.appendChild(sv('rect',{
      x: r.x, y: r.y, width: r.w, height: r.h,
      fill: isSel ? '#dbeafe' : '#f1f5f9',
      stroke: isSel ? '#dc2626' : 'none',
      'stroke-width': isSel ? 2 : 0,
      'stroke-dasharray': isSel ? '6 4' : null,
    }));
    if (r.label){
      const cx = r.x + r.w/2, cy = r.y + r.h/2;
      g.appendChild(sv('text',{
        x: cx, y: cy - 10,
        'text-anchor':'middle', 'font-size': 14, fill:'#475569', 'font-weight':'700',
      }, r.label));
      g.appendChild(sv('text',{
        x: cx, y: cy + 4,
        'text-anchor':'middle', 'font-size': 9, fill:'#64748b',
      }, `${_dlpCadPxToFtIn(r.w)} × ${_dlpCadPxToFtIn(r.h)}`));
      if (r.area_sf){
        g.appendChild(sv('text',{
          x: cx, y: cy + 16,
          'text-anchor':'middle', 'font-size': 9, fill:'#16a34a', 'font-weight':'600',
        }, `${r.area_sf} sf · ${r.linear_ft||'?'} lf · ${r.ceiling_height_ft||8}' h`));
        g.appendChild(sv('text',{
          x: cx, y: cy + 27,
          'text-anchor':'middle', 'font-size': 8, fill:'#16a34a',
        }, `walls ${r.wall_sf||'?'} sf`));
      }
    }
  }

  // Water — light blue fills marking wet areas. Rendered AFTER rooms (so they
  // tint the room fill) but BEFORE walls (so wall lines stay crisp on top).
  for (let i = 0; i < (st.water||[]).length; i++){
    const w = st.water[i];
    const isSel = selKind === 'water' && selIdx === i;
    const stroke = isSel ? '#dc2626' : '#0284c7';
    if (w.roomIdx != null){
      const r = (st.rooms||[])[w.roomIdx];
      if (!r) continue;
      g.appendChild(sv('rect',{
        x: r.x, y: r.y, width: r.w, height: r.h,
        fill: '#7dd3fc', 'fill-opacity': 0.40,
        stroke, 'stroke-width': isSel ? 2 : 1, 'stroke-dasharray': '5 3',
      }));
    } else if (Array.isArray(w.points) && w.points.length >= 2){
      const d = w.points.map((p,j) => (j===0?'M':'L') + ' ' + p.x + ' ' + p.y).join(' ') + ' Z';
      g.appendChild(sv('path',{
        d, fill: '#7dd3fc', 'fill-opacity': 0.40,
        stroke, 'stroke-width': isSel ? 2 : 1.5, 'stroke-dasharray': '5 3',
        'stroke-linejoin': 'round',
      }));
    }
  }
  // In-progress water path preview while dragging
  if (__dlpCad.inProgress && __dlpCad.inProgress.kind === 'water'){
    const pts = __dlpCad.inProgress.points;
    if (pts && pts.length >= 2){
      const d = pts.map((p,j) => (j===0?'M':'L') + ' ' + p.x + ' ' + p.y).join(' ');
      g.appendChild(sv('path',{
        d, fill: 'none', stroke: '#0284c7', 'stroke-width': 2,
        'stroke-dasharray': '4 2', 'stroke-linejoin': 'round',
      }));
    }
  }

  // Walls
  for (let i = 0; i < st.walls.length; i++){
    const w = st.walls[i];
    const isSel = selKind === 'wall' && selIdx === i;
    g.appendChild(sv('line',{
      x1:w.x1, y1:w.y1, x2:w.x2, y2:w.y2,
      stroke: isSel ? '#dc2626' : '#0f172a',
      'stroke-width': isSel ? 6 : 5,
      'stroke-linecap':'round',
    }));
    // Length label centered on the wall, rotated to its angle
    if (__dlpCad.showDims){
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (len >= 30){
        const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
        let angle = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI;
        if (angle > 90 || angle < -90) angle += 180;
        // Offset label slightly off the wall line (perpendicular)
        const wlen = len || 1;
        const nx = -(w.y2 - w.y1) / wlen, ny = (w.x2 - w.x1) / wlen;
        const lx = mx + nx * 9, ly = my + ny * 9;
        g.appendChild(sv('text',{
          x: lx, y: ly,
          transform: `rotate(${angle.toFixed(1)} ${lx} ${ly})`,
          'text-anchor':'middle', 'dominant-baseline':'middle',
          'font-size': 10, 'font-weight':'700', fill:'#2563eb',
          'paint-order':'stroke', stroke:'#fafafa', 'stroke-width':3,
        }, _dlpCadPxToFtIn(len)));
      }
    }
  }

  // Doors (render on top of their wall)
  for (let i = 0; i < st.doors.length; i++){
    const d = st.doors[i];
    const w = st.walls[d.wallIdx];
    if (!w) continue;
    const isSel = selKind === 'door' && selIdx === i;
    const wx = w.x1 + (w.x2-w.x1) * d.position;
    const wy = w.y1 + (w.y2-w.y1) * d.position;
    const wallLen = Math.hypot(w.x2-w.x1, w.y2-w.y1) || 1;
    const ux = (w.x2-w.x1) / wallLen, uy = (w.y2-w.y1) / wallLen;
    const halfWidth = d.width / 2;
    const dx1 = wx - ux*halfWidth, dy1 = wy - uy*halfWidth;
    const dx2 = wx + ux*halfWidth, dy2 = wy + uy*halfWidth;
    // White gap to "cut" the wall
    g.appendChild(sv('line',{x1:dx1,y1:dy1,x2:dx2,y2:dy2,stroke:'#fafafa','stroke-width':7}));
    // Swing arc (perpendicular)
    const nx = -uy, ny = ux;  // perpendicular unit
    const arcEnd = { x: dx1 + nx*d.width, y: dy1 + ny*d.width };
    g.appendChild(sv('path',{
      d: `M ${dx1} ${dy1} L ${dx2} ${dy2} A ${d.width} ${d.width} 0 0 ${d.swing==='right'?1:0} ${arcEnd.x} ${arcEnd.y} Z`,
      fill:'none', stroke: isSel ? '#dc2626' : '#475569', 'stroke-width': isSel ? 2 : 1,
    }));
  }

  // Openings — wall gaps with no door swing (archways, pass-throughs)
  for (let i = 0; i < (st.openings||[]).length; i++){
    const o = st.openings[i];
    const w = st.walls[o.wallIdx];
    if (!w) continue;
    const isSel = selKind === 'opening' && selIdx === i;
    const wx = w.x1 + (w.x2-w.x1) * o.position;
    const wy = w.y1 + (w.y2-w.y1) * o.position;
    const wallLen = Math.hypot(w.x2-w.x1, w.y2-w.y1) || 1;
    const ux = (w.x2-w.x1) / wallLen, uy = (w.y2-w.y1) / wallLen;
    const halfWidth = o.width / 2;
    const dx1 = wx - ux*halfWidth, dy1 = wy - uy*halfWidth;
    const dx2 = wx + ux*halfWidth, dy2 = wy + uy*halfWidth;
    // White cut through the wall
    g.appendChild(sv('line',{x1:dx1,y1:dy1,x2:dx2,y2:dy2,stroke:'#fafafa','stroke-width':7}));
    // Thin green dashed marker so the opening is visible (vs. a deleted wall)
    const isConnector = o.kind === 'connector';
    g.appendChild(sv('line',{
      x1:dx1, y1:dy1, x2:dx2, y2:dy2,
      stroke: isSel ? '#dc2626' : (isConnector ? '#087d8a' : '#16a34a'), 'stroke-width': isConnector ? 4 : 2, 'stroke-dasharray': isConnector ? '8 4' : '4 3',
    }));
    if (isConnector) {
      g.appendChild(sv('text',{x:wx+6,y:wy-6,fill:'#087d8a','font-size':10,'font-weight':800},'CONNECT'));
    }
  }

  // Windows (render on top of wall as a thinner double line)
  for (let i = 0; i < st.windows.length; i++){
    const win = st.windows[i];
    const w = st.walls[win.wallIdx];
    if (!w) continue;
    const isSel = selKind === 'window' && selIdx === i;
    const wx = w.x1 + (w.x2-w.x1) * win.position;
    const wy = w.y1 + (w.y2-w.y1) * win.position;
    const wallLen = Math.hypot(w.x2-w.x1, w.y2-w.y1) || 1;
    const ux = (w.x2-w.x1) / wallLen, uy = (w.y2-w.y1) / wallLen;
    const halfWidth = (win.width || 30) / 2;
    const dx1 = wx - ux*halfWidth, dy1 = wy - uy*halfWidth;
    const dx2 = wx + ux*halfWidth, dy2 = wy + uy*halfWidth;
    // White cut
    g.appendChild(sv('line',{x1:dx1,y1:dy1,x2:dx2,y2:dy2,stroke:'#fafafa','stroke-width':7}));
    // Blue window bar (single thin line)
    g.appendChild(sv('line',{x1:dx1,y1:dy1,x2:dx2,y2:dy2,stroke: isSel ? '#dc2626' : '#0ea5e9','stroke-width':2}));
  }

  // Equipment markers
  const eqStyles = {
    dehu: {bg:'#2563eb', fg:'#fff', icon:'💧'},
    mover: {bg:'#0891b2', fg:'#fff', icon:'💨'},
    scrubber: {bg:'#7c3aed', fg:'#fff', icon:'🌪️'},
  };
  for (let i = 0; i < st.equipment.length; i++){
    const eq = st.equipment[i];
    const s = eqStyles[eq.type] || {bg:'#64748b', fg:'#fff', icon:'?'};
    const isSel = selKind === 'equipment' && selIdx === i;
    g.appendChild(sv('circle',{cx: eq.x, cy: eq.y, r: 18, fill: s.bg, stroke: isSel ? '#dc2626' : '#fff', 'stroke-width': isSel ? 3 : 2}));
    const txt = sv('text',{x: eq.x, y: eq.y + 6, 'text-anchor':'middle', 'font-size':18, fill: s.fg}, s.icon);
    g.appendChild(txt);
    if (eq.label){
      g.appendChild(sv('text',{x: eq.x, y: eq.y + 32, 'text-anchor':'middle', 'font-size':10, fill:'#0f172a','font-weight':'600'}, eq.label));
    }
  }

  // Reading point markers (numbered)
  for (let i = 0; i < st.points.length; i++){
    const p = st.points[i];
    const isSel = selKind === 'point' && selIdx === i;
    g.appendChild(sv('circle',{cx: p.x, cy: p.y, r: 14, fill: '#1d4ed8', stroke: isSel ? '#dc2626' : '#fff', 'stroke-width': isSel ? 3 : 2}));
    g.appendChild(sv('text',{x: p.x, y: p.y + 4, 'text-anchor':'middle', 'font-size':11, fill:'#fff','font-weight':'700'}, String(i+1)));
    if (p.point_label){
      g.appendChild(sv('text',{x: p.x, y: p.y + 26, 'text-anchor':'middle', 'font-size':9, fill:'#0f172a'}, p.point_label));
    }
  }

  // Text labels
  for (let i = 0; i < st.texts.length; i++){
    const t = st.texts[i];
    const isSel = selKind === 'text' && selIdx === i;
    g.appendChild(sv('text',{
      x: t.x, y: t.y, 'text-anchor':'middle', 'font-size': t.size || 14, fill: t.color || '#0f172a',
      'font-weight':'700', 'paint-order':'stroke', stroke: isSel ? '#dc2626' : '#fafafa', 'stroke-width': isSel ? 3 : 4,
    }, t.text));
  }

  // In-progress wall preview + live length readout
  if (__dlpCad.inProgress && __dlpCad.inProgress.kind === 'wall'){
    const ip = __dlpCad.inProgress;
    g.appendChild(sv('line',{
      x1:ip.x1, y1:ip.y1, x2:ip.x2, y2:ip.y2,
      stroke:'#3b82f6', 'stroke-width':4, 'stroke-dasharray':'4 4', opacity:0.7,
    }));
    g.appendChild(sv('circle',{cx:ip.x1, cy:ip.y1, r:6, fill:'#3b82f6'}));
    const len = Math.hypot(ip.x2 - ip.x1, ip.y2 - ip.y1);
    if (len > 10){
      const mx = (ip.x1 + ip.x2) / 2, my = (ip.y1 + ip.y2) / 2;
      let angle = Math.atan2(ip.y2 - ip.y1, ip.x2 - ip.x1) * 180 / Math.PI;
      if (angle > 90 || angle < -90) angle += 180;
      const nx = -(ip.y2 - ip.y1) / len, ny = (ip.x2 - ip.x1) / len;
      const lx = mx + nx * 14, ly = my + ny * 14;
      g.appendChild(sv('text',{
        x: lx, y: ly,
        transform: `rotate(${angle.toFixed(1)} ${lx} ${ly})`,
        'text-anchor':'middle', 'dominant-baseline':'middle',
        'font-size': 12, 'font-weight':'700', fill:'#2563eb',
        'paint-order':'stroke', stroke:'#fafafa', 'stroke-width':3,
      }, _dlpCadPxToFtIn(len)));
    }
  }

  // In-progress room preview + live dimensions
  if (__dlpCad.inProgress && __dlpCad.inProgress.kind === 'room'){
    const ip = __dlpCad.inProgress;
    const mx = Math.min(ip.x1, ip.x2), my = Math.min(ip.y1, ip.y2);
    const mw = Math.abs(ip.x2 - ip.x1), mh = Math.abs(ip.y2 - ip.y1);
    g.appendChild(sv('rect',{
      x: mx, y: my, width: mw, height: mh,
      fill: 'rgba(59, 130, 246, 0.12)',
      stroke: '#3b82f6', 'stroke-width': 2, 'stroke-dasharray': '6 4',
    }));
    g.appendChild(sv('circle',{cx: ip.x1, cy: ip.y1, r: 6, fill:'#3b82f6'}));
    if (mw > 20){
      g.appendChild(sv('text',{x: mx + mw/2, y: my - 8, 'text-anchor':'middle', 'font-size':12, 'font-weight':'700', fill:'#2563eb', 'paint-order':'stroke', stroke:'#fafafa', 'stroke-width':3}, _dlpCadPxToFtIn(mw)));
    }
    if (mh > 20){
      g.appendChild(sv('text',{x: mx + mw + 10, y: my + mh/2, 'text-anchor':'start', 'dominant-baseline':'middle', 'font-size':12, 'font-weight':'700', fill:'#2563eb', 'paint-order':'stroke', stroke:'#fafafa', 'stroke-width':3}, _dlpCadPxToFtIn(mh)));
    }
  }
  _dlpCadRenderInspector();
}


async function renderDlpSketchEditor(zone_id){
  // F18.14: legacy entry point — redirect to the new CAD editor.
  return renderDlpCadSketch(zone_id);
}


async function renderDlpSurfaceCreate(zone_id){
  clear(); enableInactivity();
  root.appendChild(buildTopbar('← Chamber', () => renderDlpZoneDetail(zone_id), {showClockLink:true}));

  const screen = el('div',{class:'screen'});
  screen.appendChild(el('div',{class:'h1'},'New Surface'));

  // Surface type
  const stW = _dlpFieldWrap('Surface type');
  const stSelect = el('select',{style:'padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;background:#fff;'});
  for (const v of ['wall','floor','ceiling','baseboard','cabinet','subfloor','insulation','other']) {
    stSelect.appendChild(el('option',{value:v}, v.charAt(0).toUpperCase()+v.slice(1)));
  }
  stW.appendChild(stSelect);
  screen.appendChild(stW);

  // Label + wall index
  const lblW = _dlpFieldWrap('Label (optional)','e.g. "North wall", "Floor under sink"');
  const lblInp = el('input',{type:'text',placeholder:'Label',style:'padding:10px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;'});
  lblW.appendChild(lblInp);
  screen.appendChild(lblW);

  // Materials — multi-select dropdown keyed by surface type. Tech can check
  // multiple ("Plaster + Drywall + Framing" on a wet wall is common). Falls
  // back to free-text for surface types without a curated list ('other').
  const matW = _dlpFieldWrap('Materials (check all wet)','Pick everything that’s wet at this surface.');
  const matChecks = el('div',{style:'display:flex;flex-wrap:wrap;gap:6px;'});
  const matCustomInp = el('input',{type:'text',placeholder:'Other / custom (optional, comma-separated)',style:'padding:8px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;width:100%;margin-top:6px;'});
  const matSelected = new Set();
  function refreshMaterials(){
    matChecks.innerHTML = '';
    const list = DLP_MATERIALS_BY_SURFACE_TYPE[stSelect.value] || [];
    if (list.length === 0) {
      matChecks.appendChild(el('div',{style:'font-size:12px;color:#94a3b8;font-style:italic;padding:6px 0;'},'No standard materials for this surface type — use the custom field below.'));
      return;
    }
    for (const m of list) {
      const isOn = matSelected.has(m);
      const chip = el('button',{style:`padding:7px 11px;border-radius:8px;font-size:12px;font-weight:600;border:1px solid ${isOn?'#3b82f6':'#cbd5e1'};background:${isOn?'#dbeafe':'#fff'};color:${isOn?'#1d4ed8':'#475569'};`},
        (isOn?'✓ ':'+ ') + m);
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        if (matSelected.has(m)) matSelected.delete(m); else matSelected.add(m);
        refreshMaterials();
      });
      matChecks.appendChild(chip);
    }
  }
  refreshMaterials();
  // Reset selection + refresh chip list when surface type changes (different list)
  stSelect.addEventListener('change', () => { matSelected.clear(); refreshMaterials(); });
  matW.appendChild(matChecks);
  matW.appendChild(matCustomInp);
  screen.appendChild(matW);

  // Dry goal — property-wide per material; not entered per surface. The goal is
  // applied automatically from the claim's Dry Goals based on the material above.
  const goalNote = el('div',{style:'background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:11px 13px;margin-top:4px;'});
  goalNote.appendChild(el('div',{style:'font-size:12px;color:#0369a1;font-weight:700;margin-bottom:3px;'},'🎯 Dry goal set by material'));
  goalNote.appendChild(el('div',{style:'font-size:12px;color:#0c4a6e;'},'Dry goals are set once per material for the whole property and applied here automatically — no need to type one. The goal shows on the surface once saved.'));
  const goalLink = el('button',{style:'margin-top:8px;padding:8px 12px;background:#0ea5e9;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;'},'Open Dry Goals');
  goalLink.addEventListener('click',(e)=>{ e.preventDefault(); renderDlpDryGoals(); });
  goalNote.appendChild(goalLink);
  screen.appendChild(goalNote);

  // Save
  const saveBtn = el('button',{style:'width:100%;padding:14px;background:#16a34a;color:#fff;border-radius:10px;font-size:15px;font-weight:700;margin-top:14px;'},'Create Surface');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const customMats = (matCustomInp.value||'').split(',').map(s=>s.trim()).filter(Boolean);
      const allMats = [...Array.from(matSelected), ...customMats];
      const payload = {
        drying_zone_id: zone_id,
        surface_type: stSelect.value,
        surface_label: (lblInp.value||'').trim() || undefined,
        material: allMats.length ? allMats.join(', ') : undefined,
        // dry_goal / unit / meter_type are derived server-side from the claim's
        // per-material standard — not sent from here.
      };
      const res = await apiPost('/claim-surfaces', payload);
      const s = res?.data || res;
      if (s && s.id) { renderDlpSurfaceDetail(s.id); return; }
    } catch(e) {
      alert('Create failed: ' + (e.message||e));
      saveBtn.disabled = false; saveBtn.textContent = 'Create Surface';
      return;
    }
    renderDlpZoneDetail(zone_id);
  });
  screen.appendChild(saveBtn);
  root.appendChild(screen);
  setTimeout(() => lblInp.focus(), 50);
}


// Surface edit: prefilled mirror of the Create form, plus the F18.14b dimension
// fields (area_sf / linear_ft / ceiling_height_ft) that the auto-room flow sets
// but Create doesn't expose. Posts a PUT to /claim-surfaces/{id} on save and
// then bounces back to the surface detail screen.
async function renderDlpSurfaceEdit(surface_id){
  clear(); enableInactivity();
  let surface = null;
  try { surface = await apiGet(`/claim-surfaces/${surface_id}`); } catch(e){}
  root.appendChild(buildTopbar('← Surface', () => renderDlpSurfaceDetail(surface_id), {showClockLink:true}));
  const screen = el('div',{class:'screen'});
  screen.appendChild(el('div',{class:'h1'},'Edit Surface'));
  if (!surface) { screen.appendChild(el('div',{class:'dlp-empty'},'Surface not found.')); root.appendChild(screen); return; }

  // Surface type
  const stW = _dlpFieldWrap('Surface type');
  const stSelect = el('select',{style:'padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;background:#fff;'});
  for (const v of ['wall','floor','ceiling','baseboard','cabinet','subfloor','insulation','other']) {
    stSelect.appendChild(el('option',{value:v}, v.charAt(0).toUpperCase()+v.slice(1)));
  }
  stSelect.value = surface.surface_type || 'wall';
  stW.appendChild(stSelect); screen.appendChild(stW);

  // Label
  const lblW = _dlpFieldWrap('Label (optional)','e.g. "North wall", "Floor under sink"');
  const lblInp = el('input',{type:'text',placeholder:'Label',style:'padding:10px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;'});
  lblInp.value = surface.surface_label || '';
  lblW.appendChild(lblInp); screen.appendChild(lblW);

  // Materials — same chip picker, pre-checked from current comma-separated value
  const matW = _dlpFieldWrap('Materials (check all wet)','Pick everything that’s wet at this surface.');
  const matChecks = el('div',{style:'display:flex;flex-wrap:wrap;gap:6px;'});
  const matCustomInp = el('input',{type:'text',placeholder:'Other / custom (optional, comma-separated)',style:'padding:8px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;width:100%;margin-top:6px;'});
  const matSelected = new Set();
  const existingMats = (surface.material || '').split(',').map(s => s.trim()).filter(Boolean);
  function refreshMaterials(){
    matChecks.innerHTML = '';
    const list = DLP_MATERIALS_BY_SURFACE_TYPE[stSelect.value] || [];
    if (list.length === 0) {
      matChecks.appendChild(el('div',{style:'font-size:12px;color:#94a3b8;font-style:italic;padding:6px 0;'},'No standard materials for this surface type — use the custom field below.'));
      return;
    }
    for (const m of list) {
      const isOn = matSelected.has(m);
      const chip = el('button',{style:`padding:7px 11px;border-radius:8px;font-size:12px;font-weight:600;border:1px solid ${isOn?'#3b82f6':'#cbd5e1'};background:${isOn?'#dbeafe':'#fff'};color:${isOn?'#1d4ed8':'#475569'};`},
        (isOn?'✓ ':'+ ') + m);
      chip.addEventListener('click', (e) => { e.preventDefault(); if (matSelected.has(m)) matSelected.delete(m); else matSelected.add(m); refreshMaterials(); });
      matChecks.appendChild(chip);
    }
  }
  // Seed: known mats become chips; unknowns become custom-field text
  const knownMats = new Set(DLP_MATERIALS_BY_SURFACE_TYPE[stSelect.value] || []);
  const customSeed = [];
  for (const m of existingMats) { if (knownMats.has(m)) matSelected.add(m); else customSeed.push(m); }
  if (customSeed.length) matCustomInp.value = customSeed.join(', ');
  refreshMaterials();
  stSelect.addEventListener('change', () => { matSelected.clear(); refreshMaterials(); });
  matW.appendChild(matChecks); matW.appendChild(matCustomInp); screen.appendChild(matW);

  // Dry goal — property-wide per material; shown read-only here (the value is
  // applied automatically from the claim's Dry Goals based on the material).
  const goalNote = el('div',{style:'background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:11px 13px;'});
  goalNote.appendChild(el('div',{style:'font-size:12px;color:#0369a1;font-weight:700;margin-bottom:3px;'},'🎯 Dry goal set by material'));
  const curGoal = (surface.dry_goal != null)
    ? (surface.dry_goal + ' ' + (surface.dry_goal_unit || '%MC') + (surface.meter_type ? ' · ' + surface.meter_type : ''))
    : 'not set yet';
  goalNote.appendChild(el('div',{style:'font-size:12px;color:#0c4a6e;'},'Current: ' + curGoal + '. Dry goals are property-wide per material — change them in Dry Goals and every matching surface updates.'));
  const goalLink = el('button',{style:'margin-top:8px;padding:8px 12px;background:#0ea5e9;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;'},'Open Dry Goals');
  goalLink.addEventListener('click',(e)=>{ e.preventDefault(); renderDlpDryGoals(); });
  goalNote.appendChild(goalLink);
  screen.appendChild(goalNote);

  // Dimensions (F18.14b) — let tech correct what auto-room computed, or fill in
  // by hand for a manually-created surface
  const dimW = _dlpFieldWrap('Dimensions (optional)','Auto-filled when the Room tool creates the surface. Edit if measurements were off.');
  const dimGrid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;'});
  const areaInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Area sf',style:'padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;'});
  const linInp  = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Linear ft',style:'padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;'});
  const chInp   = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:"Ceiling ft",style:'padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;'});
  if (surface.area_sf != null)           areaInp.value = surface.area_sf;
  if (surface.linear_ft != null)         linInp.value  = surface.linear_ft;
  if (surface.ceiling_height_ft != null) chInp.value   = surface.ceiling_height_ft;
  dimGrid.appendChild(areaInp); dimGrid.appendChild(linInp); dimGrid.appendChild(chInp);
  dimW.appendChild(dimGrid); screen.appendChild(dimW);

  // Notes
  const notesW = _dlpFieldWrap('Notes (optional)');
  const notesInp = el('textarea',{rows:2,style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;resize:vertical;'});
  notesInp.value = surface.notes || '';
  notesW.appendChild(notesInp); screen.appendChild(notesW);

  // Save
  const saveBtn = el('button',{style:'width:100%;padding:14px;background:#16a34a;color:#fff;border-radius:10px;font-size:15px;font-weight:700;margin-top:14px;'},'Save Changes');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const customMats = (matCustomInp.value||'').split(',').map(s=>s.trim()).filter(Boolean);
      const allMats = [...Array.from(matSelected), ...customMats];
      const payload = {
        surface_type:      stSelect.value,
        surface_label:     (lblInp.value||'').trim() || null,
        material:          allMats.length ? allMats.join(', ') : null,
        // dry_goal / unit / meter_type are derived server-side from the claim's
        // per-material standard when the material changes — not sent from here.
        area_sf:           areaInp.value !== '' ? parseFloat(areaInp.value) : null,
        linear_ft:         linInp.value  !== '' ? parseFloat(linInp.value)  : null,
        ceiling_height_ft: chInp.value   !== '' ? parseFloat(chInp.value)   : null,
        notes:             (notesInp.value||'').trim() || null,
      };
      await apiPut(`/claim-surfaces/${surface_id}`, payload);
      renderDlpSurfaceDetail(surface_id);
    } catch(e) {
      alert('Save failed: ' + (e.message||e));
      saveBtn.disabled = false; saveBtn.textContent = 'Save Changes';
    }
  });
  screen.appendChild(saveBtn);
  root.appendChild(screen);
}


// Surface detail: shows the surface hero + reading points + "+Add point"
async function renderDlpSurfaceDetail(surface_id){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/surface/'+surface_id, current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Surface');

  // Fetch first so the back button can route to the right zone
  let surface=null, points=[];
  try {
    const [s, p] = await Promise.all([
      apiGet(`/claim-surfaces/${surface_id}`),
      apiGet(`/reading-points?claim_surface_id=${surface_id}`),
    ]);
    surface = s?.data || s;
    points = Array.isArray(p) ? p : [];
  } catch(e){}

  const zoneId = surface ? surface.drying_zone_id : null;
  root.appendChild(buildTopbar('← Chamber', () => zoneId ? renderDlpZoneDetail(zoneId) : renderDlpSurfacesList(), {showClockLink:true}));

  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);
  root.appendChild(screen);

  if (!surface) { screen.appendChild(el('div',{class:'dlp-empty'},'Surface not found.')); return; }

  // Hero
  const hero = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:14px;'});
  const heroTop = el('div',{style:'display:flex;align-items:center;gap:8px;'});
  heroTop.appendChild(el('div',{style:'flex:1;font-size:18px;font-weight:800;color:#0f172a;'}, surface.surface_label || surface.surface_type));
  if (surface.is_dry) heroTop.appendChild(el('span',{style:'font-size:10px;padding:3px 8px;background:#dcfce7;color:#166534;border-radius:5px;font-weight:700;letter-spacing:0.04em;'},'DRY'));
  const editBtn = el('button',{style:'padding:6px 9px;background:#fff;border:1px solid #cbd5e1;color:#475569;border-radius:6px;font-size:12px;font-weight:600;','aria-label':'Edit surface'},'✏️ Edit');
  editBtn.addEventListener('click', () => renderDlpSurfaceEdit(surface_id));
  heroTop.appendChild(editBtn);
  hero.appendChild(heroTop);
  const metaBits = [surface.surface_type, surface.material, surface.dry_goal != null ? ('goal '+surface.dry_goal+' '+(surface.dry_goal_unit||'%MC')) : null, surface.meter_type].filter(Boolean);
  if (metaBits.length) hero.appendChild(el('div',{style:'font-size:12px;color:#64748b;margin-top:5px;'}, metaBits.join(' · ')));
  // F18.14b dimensions — only show the line if the auto-room or a manual edit set them
  const dimBits = [];
  if (surface.area_sf)            dimBits.push(surface.area_sf + ' sf');
  if (surface.linear_ft)          dimBits.push(surface.linear_ft + ' lf');
  if (surface.ceiling_height_ft)  dimBits.push(surface.ceiling_height_ft + "' h");
  if (dimBits.length) hero.appendChild(el('div',{style:'font-size:11px;color:#16a34a;margin-top:3px;font-weight:600;'}, dimBits.join(' · ')));
  screen.appendChild(hero);

  // Reading points
  screen.appendChild(el('div',{class:'dlp-section-h'},'Reading Points'));
  if (points.length === 0) {
    screen.appendChild(el('div',{class:'dlp-empty'},'No reading points yet on this surface.'));
  } else {
    // Load latest moisture per point so the row can show it
    let latestByPoint = {};
    try {
      const moi = await apiGet(`/readings/moisture?claim_surface_id=${surface_id}`);
      if (Array.isArray(moi)) {
        for (const r of moi) {
          const pid = parseInt(r.reading_point_id, 10);
          if (!latestByPoint[pid]) latestByPoint[pid] = r;
        }
      }
    } catch(e){}

    for (const p of points) {
      const row = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 13px;margin-bottom:6px;display:flex;align-items:center;gap:10px;'});
      const main = el('div',{style:'flex:1;min-width:0;'});
      main.appendChild(el('div',{style:'font-weight:600;font-size:13px;color:#0f172a;'}, p.point_label || ('P'+p.id)));
      const latest = latestByPoint[p.id];
      if (latest) {
        const ts = new Date(latest.reading_at.replace(' ','T')+'Z').toLocaleDateString([], {month:'short',day:'numeric'});
        const dry = latest.is_dry_at_time ? ' ✓' : '';
        main.appendChild(el('div',{style:'font-size:11px;color:'+(latest.is_dry_at_time?'#16a34a':'#475569')+';margin-top:2px;'},
          `${Number(latest.moisture_value).toFixed(1)} ${latest.moisture_unit||'%MC'}${dry} · ${ts}`));
      } else if (p.location_notes) {
        main.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;'}, p.location_notes));
      } else {
        main.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;font-style:italic;'}, 'No reading yet'));
      }
      row.appendChild(main);

      const capBtn = el('button',{style:'padding:6px 10px;background:#3b82f6;color:#fff;border-radius:6px;font-size:12px;font-weight:700;'},'+');
      capBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        renderDlpMoistureCapture(p.id, {surface_id, point_label: p.point_label, dry_goal: surface.dry_goal, dry_goal_unit: surface.dry_goal_unit});
      });
      row.appendChild(capBtn);

      const delPt = el('button',{style:'padding:6px 8px;background:#fff;border:1px solid #fecaca;color:#dc2626;border-radius:6px;font-size:11px;font-weight:700;'},'🗑');
      delPt.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (!confirm('Delete reading point "'+(p.point_label||p.id)+'"? Past moisture readings stay archived.')) return;
        try { await apiDelete(`/reading-points/${p.id}`); } catch(e) { alert('Delete failed: ' + (e.message||e)); return; }
        renderDlpSurfaceDetail(surface_id);
      });
      row.appendChild(delPt);
      screen.appendChild(row);
    }
  }

  const addPtBtn = el('button',{style:'width:100%;padding:11px;border:1px dashed #3b82f6;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:14px;font-weight:700;margin-top:6px;'},'+ Add Reading Point');
  addPtBtn.addEventListener('click', () => renderDlpPointCreate(surface_id));
  screen.appendChild(addPtBtn);

  // Delete surface
  const delBtn = el('button',{style:'width:100%;padding:9px;background:#fff;border:1px solid #fecaca;border-radius:10px;color:#dc2626;font-size:12px;font-weight:600;margin-top:14px;'},'🗑 Delete Surface');
  delBtn.addEventListener('click', async () => {
    if (!confirm('Delete this surface? Past moisture readings on its points stay archived.')) return;
    try { await apiDelete(`/claim-surfaces/${surface_id}`); } catch(e) { alert('Delete failed: ' + (e.message||e)); return; }
    if (zoneId) renderDlpZoneDetail(zoneId); else renderDlpSurfacesList();
  });
  screen.appendChild(delBtn);
}


// Moisture capture form (entered from a reading point row in surface detail).
// prefill: { surface_id, point_label, dry_goal, dry_goal_unit }
async function renderDlpMoistureCapture(point_id, prefill){
  prefill = prefill || {};
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/moisture-capture', current_job_id:selectedJob?.job_id||null}, 'Capturing moisture');
  root.appendChild(buildTopbar('← Surface', () => prefill.surface_id ? renderDlpSurfaceDetail(prefill.surface_id) : renderDlpSurfacesList(), {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);
  screen.appendChild(el('div',{class:'h1'},'Moisture Reading'));
  if (prefill.point_label) {
    let sub = 'Point: ' + prefill.point_label;
    if (prefill.dry_goal != null) sub += ' · Goal: ' + prefill.dry_goal + ' ' + (prefill.dry_goal_unit||'%MC');
    screen.appendChild(el('div',{class:'sub'}, sub));
  }

  // Moisture value
  const valW = _dlpFieldWrap('Moisture reading');
  const valGrid = el('div',{style:'display:grid;grid-template-columns:2fr 1fr;gap:8px;'});
  const valInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'e.g. 18.5',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:18px;text-align:center;'});
  const unitSelect = el('select',{style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;background:#fff;'});
  for (const u of ['%MC','%WME','reference_scale']) unitSelect.appendChild(el('option',{value:u}, u));
  if (prefill.dry_goal_unit) unitSelect.value = prefill.dry_goal_unit;
  valGrid.appendChild(valInp); valGrid.appendChild(unitSelect);
  valW.appendChild(valGrid);
  screen.appendChild(valW);

  // Live "would be dry" hint
  const dryHint = el('div',{style:'font-size:11px;color:#94a3b8;margin-top:-4px;margin-bottom:10px;min-height:14px;'});
  screen.appendChild(dryHint);
  function refreshDryHint(){
    const v = parseFloat(valInp.value);
    if (isNaN(v) || prefill.dry_goal == null) { dryHint.textContent = ''; return; }
    if (v <= prefill.dry_goal) {
      dryHint.innerHTML = '<span style="color:#16a34a;font-weight:700;">✓ At or below dry goal ('+prefill.dry_goal+')</span>';
    } else {
      dryHint.innerHTML = '<span style="color:#92400e;">'+(v - prefill.dry_goal).toFixed(1)+' above dry goal — still wet</span>';
    }
  }
  valInp.addEventListener('input', refreshDryHint);

  // Surface temp (optional but recommended for condensation_risk alert)
  const stW = _dlpFieldWrap('Surface temp °F (optional)','Required for the condensation-risk alert.');
  const stInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'°F',style:'padding:10px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;'});
  stW.appendChild(stInp);
  screen.appendChild(stW);

  // Meter make/model
  const mtrW = _dlpFieldWrap('Meter (optional)','e.g. Protimeter MMS3');
  const mtrInp = el('input',{type:'text',placeholder:'',style:'padding:10px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;'});
  mtrW.appendChild(mtrInp);
  screen.appendChild(mtrW);

  // Optional photo (F18.7h) — stores resulting URL in moisture_readings.photo_url
  // when the save POSTs. Uploads attach to the visit so they also show in the
  // visit's photo dump.
  const photoW = _dlpFieldWrap('Photo (optional)','Snap a photo of the meter / wet area. Helpful for anomalies.');
  let pendingPhotoUrl = null;
  const photoBtnRow = el('div',{style:'display:flex;align-items:center;gap:10px;'});
  const photoStatus = el('div',{style:'font-size:12px;color:#94a3b8;flex:1;'},'No photo attached');
  const photoBtn = el('button',{style:'padding:9px 14px;background:#dbeafe;color:#1d4ed8;border-radius:6px;font-size:12px;font-weight:700;'},'📷 Add');
  const photoInput = el('input',{type:'file',accept:'image/*',capture:'environment',style:'display:none;'});
  photoBtn.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const f = (photoInput.files || [])[0];
    if (!f) return;
    photoBtn.disabled = true; photoBtn.textContent = 'Uploading…';
    try {
      const visit_id = await _dlpEnsureVisit(claim_id);
      const up = await tcCompressFile(f);  // shrink before send — avoids HTTP 413 on full-size photos
      const fd = new FormData();
      fd.append('file', up);
      fd.append('entity_type', 'visit');
      fd.append('entity_id', String(visit_id));
      fd.append('caption', 'Moisture reading' + (prefill.point_label ? ' — ' + prefill.point_label : ''));
      const resp = await fetch(API + '/entity-attachments', {
        method:'POST',
        headers: token ? {'Authorization':'Bearer '+token} : {},
        body: fd,
      });
      const j = await resp.json();
      if (!resp.ok || j.success === false) throw new Error(j.error || 'Upload failed');
      pendingPhotoUrl = '/' + (j.data || j).file_url;
      photoStatus.textContent = '✓ Photo attached';
      photoStatus.style.color = '#16a34a';
      photoBtn.textContent = '📷 Replace';
    } catch(e) {
      alert('Photo upload failed: ' + (e.message||e));
      photoBtn.textContent = '📷 Add';
    }
    photoBtn.disabled = false;
  });
  photoBtnRow.appendChild(photoStatus);
  photoBtnRow.appendChild(photoBtn);
  photoBtnRow.appendChild(photoInput);
  photoW.appendChild(photoBtnRow);
  screen.appendChild(photoW);

  // Notes
  const notesW = _dlpFieldWrap('Notes (optional)');
  const notesInp = el('textarea',{rows:2,placeholder:'',style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;resize:vertical;'});
  notesW.appendChild(notesInp);
  screen.appendChild(notesW);

  // Save
  const saveBtn = el('button',{style:'width:100%;padding:14px;background:#16a34a;color:#fff;border-radius:10px;font-size:15px;font-weight:700;margin-top:14px;'},'Save Reading');
  saveBtn.addEventListener('click', async () => {
    const v = parseFloat(valInp.value);
    if (isNaN(v)) { alert('Moisture reading is required.'); return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const visit_id = await _dlpEnsureVisit(claim_id);
      const reading_at = new Date().toISOString().slice(0,19).replace('T',' ');
      const payload = {
        reading_point_id: point_id, visit_id, reading_at,
        moisture_value: v, moisture_unit: unitSelect.value,
        surface_temp_f: stInp.value ? parseFloat(stInp.value) : undefined,
        meter_make_model: (mtrInp.value||'').trim() || undefined,
        photo_url: pendingPhotoUrl || undefined,
        notes: (notesInp.value||'').trim() || undefined,
      };
      const res = await apiPostOrQueue('/readings/moisture', payload,
        'Moisture @ '+(prefill.point_label||'point '+point_id));
      if (res?.__queued) {
        tcToast('📤 Offline — reading queued, will sync', 'info');
      } else {
        const data = res?.data || res;
        const fired = (data?.alerts?.alerts_fired || []);
        let msg = 'Reading saved.';
        if (data?.derived?.is_dry_at_time) msg += ' ✓ At dry goal.';
        if (fired.length > 0) msg += '\n\n⚠ ' + fired.length + ' alert(s):\n' + fired.map(a => '· '+a.title).join('\n');
        // Only block with an alert if there's something noteworthy beyond plain success
        if (data?.derived?.is_dry_at_time || fired.length > 0) alert(msg);
        else tcToast('✓ Reading saved');
      }
    } catch(e) {
      alert('Save failed: ' + (e.message||e));
      saveBtn.disabled = false; saveBtn.textContent = 'Save Reading';
      return;
    }
    if (prefill.surface_id) renderDlpSurfaceDetail(prefill.surface_id);
    else renderDlpSurfacesList();
  });
  screen.appendChild(saveBtn);

  root.appendChild(screen);
  setTimeout(() => valInp.focus(), 50);
}


async function renderDlpEquipmentList(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/equipment', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Equipment');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);

  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  let deploys=[], zones=[];
  try {
    const [d, z] = await Promise.all([
      apiGet(`/equipment-deploys?job_id=${claim_id}&active=1`),
      apiGet(`/drying-zones?claim_id=${claim_id}`),
    ]);
    deploys = Array.isArray(d) ? d : [];
    zones = Array.isArray(z) ? z : [];
  } catch(e){}
  loading.remove();

  screen.appendChild(el('div',{class:'dlp-section-h'},'On Site Equipment · ' + deploys.length));

  if (deploys.length === 0) {
    screen.appendChild(el('div',{class:'dlp-empty'},'No equipment on site yet. Tap “Deploy equipment” below to pull a unit from inventory (or scan its asset tag).'));
  }

  for (const d of deploys) {
    const card = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;'});
    const top = el('div',{style:'display:flex;align-items:center;gap:10px;margin-bottom:6px;'});
    const labelParts = [d.type, d.make, d.model].filter(Boolean);
    const label = labelParts.length ? labelParts.join(' ') : ('Equipment #'+d.id);
    top.appendChild(el('div',{style:'flex:1;font-size:14px;font-weight:700;color:#0f172a;'}, label));
    const isDehu = ((d.type||'')+'').toLowerCase().includes('dehu') || ((d.type||'')+'').toLowerCase().includes('dehumidifier');
    if (isDehu) top.appendChild(el('span',{style:'font-size:9px;padding:2px 6px;background:#ede9fe;color:#7c3aed;border-radius:4px;font-weight:700;letter-spacing:0.04em;'},'DEHU'));
    card.appendChild(top);

    // Sub-line: serial, hours, when deployed
    const subBits = [];
    if (d.serial_no || d.asset_tag) subBits.push((d.serial_no || d.asset_tag));
    if (d.hours_deployed != null) subBits.push(d.hours_deployed + 'h on rent');
    if (subBits.length) card.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;margin-bottom:6px;'}, subBits.join(' · ')));

    // Zone assignment
    const zoneRow = el('div',{style:'display:flex;align-items:center;gap:8px;margin-top:6px;'});
    zoneRow.appendChild(el('div',{style:'font-size:11px;color:#475569;font-weight:600;'},'Zone:'));
    const zoneSel = el('select',{style:'flex:1;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;background:#fff;'});
    zoneSel.appendChild(el('option',{value:''},'(Not assigned)'));
    for (const z of zones) zoneSel.appendChild(el('option',{value:String(z.id)}, z.name));
    if (d.drying_zone_id) zoneSel.value = String(d.drying_zone_id);
    zoneSel.addEventListener('change', async () => {
      try {
        await apiPut(`/equipment-deploys/${d.id}`, {drying_zone_id: zoneSel.value ? parseInt(zoneSel.value,10) : null});
      } catch(e) { alert('Assign failed: ' + (e.message||e)); }
    });
    zoneRow.appendChild(zoneSel);
    card.appendChild(zoneRow);

    // Dehu performance CTA
    if (isDehu) {
      const dehuBtn = el('button',{style:'width:100%;margin-top:10px;padding:9px;background:#7c3aed;color:#fff;border-radius:8px;font-size:13px;font-weight:700;'},'+ Capture Dehu Performance');
      dehuBtn.addEventListener('click', () => {
        const zid = d.drying_zone_id ? parseInt(d.drying_zone_id,10) : (zoneSel.value ? parseInt(zoneSel.value,10) : null);
        renderDlpDehuCapture({equipment_deploy_id: d.id, drying_zone_id: zid, label});
      });
      card.appendChild(dehuBtn);
    }

    screen.appendChild(card);
  }

  // Deploy flow — pull a unit from inventory or scan its asset tag.
  const deployBtn = el('button',{style:'width:100%;padding:12px;background:#eff6ff;border:2px dashed #3b82f6;color:#1d4ed8;border-radius:10px;font-size:14px;font-weight:700;margin-top:6px;cursor:pointer;'}, '➕ Deploy equipment');
  deployBtn.addEventListener('click', () => _dlpDeployEquipmentSheet(claim_id, () => renderDlpEquipmentList()));
  screen.appendChild(deployBtn);
}


// Bottom sheet: deploy a unit to THIS job. Lists available inventory
// (GET /equipment) and supports scanning an asset tag / QR. Deploying POSTs
// /equipment-deploys {equipment_id, job_id}; units already out elsewhere are
// shown read-only (return them first). Refreshes the Equipment list on success.
async function _dlpDeployEquipmentSheet(claim_id, onDone){
  const overlay = el('div',{style:'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:6000;display:flex;flex-direction:column;justify-content:flex-end;'});
  function close(){ overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const sheet = el('div',{style:'background:#f8fafc;border-radius:16px 16px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));max-height:88vh;overflow:auto;'});
  sheet.appendChild(el('div',{style:'font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px;'},'Deploy equipment'));
  sheet.appendChild(el('div',{style:'font-size:12px;color:#64748b;margin-bottom:12px;'},'Pick an available unit, or scan its asset tag.'));

  let inventory = [];
  async function deploy(eq){
    try { await apiPost('/equipment-deploys', {equipment_id: eq.id, job_id: claim_id}); close(); onDone(); }
    catch(e){ alert('Deploy failed: ' + (e.message||e)); }
  }

  const scanBtn = el('button',{style:'width:100%;padding:12px;background:#0f172a;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:12px;'},'📷 Scan asset tag / QR');
  scanBtn.addEventListener('click', () => {
    tcScanBarcode((code) => {
      const v = (code||'').trim().toLowerCase();
      if (!v) return;
      const hit = inventory.find(e => (e.asset_tag||'').toLowerCase() === v || (e.serial_no||'').toLowerCase() === v);
      if (!hit) { alert('No inventory match for “' + code + '”.'); return; }
      if (hit.deployed_job_id && parseInt(hit.deployed_job_id,10) !== parseInt(claim_id,10)) {
        alert('That unit is already deployed elsewhere — return it first.'); return;
      }
      deploy(hit);
    });
  });
  sheet.appendChild(scanBtn);

  const listWrap = el('div',{});
  const loading = el('div',{class:'dlp-empty'},'Loading inventory…');
  listWrap.appendChild(loading);
  sheet.appendChild(listWrap);

  const cancel = el('button',{style:'width:100%;padding:13px;background:#334155;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px;'},'Cancel');
  cancel.addEventListener('click', close);
  sheet.appendChild(cancel);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  try { inventory = await apiGet('/equipment'); if (!Array.isArray(inventory)) inventory = []; }
  catch(e){ inventory = []; }
  loading.remove();

  const lbl = (e) => [e.type, e.make, e.model].filter(Boolean).join(' ') || ('Equipment #'+e.id);
  const sub = (e) => [e.asset_tag || e.serial_no].filter(Boolean).join(' · ');
  const free = inventory.filter(e => !e.deployed_job_id);
  const busy = inventory.filter(e => e.deployed_job_id && parseInt(e.deployed_job_id,10) !== parseInt(claim_id,10));

  if (inventory.length === 0) {
    listWrap.appendChild(el('div',{class:'dlp-empty'},'No equipment in inventory. Add units in the office (TotalOps → Equipment).'));
    return;
  }
  if (free.length === 0) {
    listWrap.appendChild(el('div',{style:'font-size:12px;color:#64748b;font-style:italic;margin-bottom:8px;'},'No available units — everything is deployed.'));
  }
  for (const e of free) {
    const row = el('button',{style:'width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:11px 13px;margin-bottom:6px;display:flex;align-items:center;gap:8px;cursor:pointer;'});
    const col = el('div',{style:'flex:1;min-width:0;'});
    col.appendChild(el('div',{style:'font-size:14px;font-weight:700;color:#0f172a;'}, lbl(e)));
    if (sub(e)) col.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;margin-top:1px;'}, sub(e)));
    row.appendChild(col);
    row.appendChild(el('span',{style:'font-size:12px;font-weight:700;color:#16a34a;flex-shrink:0;'},'Deploy →'));
    row.addEventListener('click', () => deploy(e));
    listWrap.appendChild(row);
  }
  if (busy.length) {
    listWrap.appendChild(el('div',{style:'font-size:10px;color:#94a3b8;margin:10px 0 4px;text-transform:uppercase;letter-spacing:0.04em;'},'Deployed elsewhere'));
    for (const e of busy) {
      const row = el('div',{style:'background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:9px 12px;margin-bottom:5px;opacity:0.75;'});
      row.appendChild(el('div',{style:'font-size:13px;font-weight:600;color:#475569;'}, lbl(e)));
      const w = [e.deployed_customer, e.deployed_address].filter(Boolean).join(' · ');
      row.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;margin-top:1px;'}, 'On: ' + (w || ('job #'+e.deployed_job_id))));
      listWrap.appendChild(row);
    }
  }
}


// Dry Goals — property-wide dry standard per material. Set once; the server
// propagates each goal into every matching surface's dry_goal (write-through),
// so changing a goal here updates every surface of that material on the claim.
async function renderDlpDryGoals(){
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/dry-goals', current_job_id:selectedJob?.job_id||null}, 'DryLog PRO — Dry Goals');
  root.appendChild(buildTopbar('← Dashboard', renderDrylogPro, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);
  screen.appendChild(el('div',{class:'dlp-section-h'},'Dry Goals — by material'));
  screen.appendChild(el('div',{style:'font-size:12px;color:#64748b;margin-bottom:12px;'},'Set the dry standard once per material. Every surface of that material uses it automatically — change it here and all matching surfaces update.'));

  const loading = el('div',{class:'dlp-empty'},'Loading…');
  screen.appendChild(loading);
  root.appendChild(screen);

  let existing = [];
  try { existing = await apiGet('/claim-material-standards?claim_id=' + claim_id); } catch(e){}
  if (!Array.isArray(existing)) existing = [];
  loading.remove();

  const byClass = {};
  for (const r of existing) byClass[r.material] = r;

  const rows = [];
  for (const c of DLP_DRY_GOAL_CLASSES) {
    const cur = byClass[c.key] || {};
    const card = el('div',{style:'background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:11px 13px;margin-bottom:8px;'});
    card.appendChild(el('div',{style:'font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;'}, c.label));
    const grid = el('div',{style:'display:grid;grid-template-columns:1.3fr 1fr 1.3fr;gap:7px;'});
    const goal = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Goal',style:'padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;'});
    if (cur.dry_goal != null) goal.value = cur.dry_goal;
    const unit = el('select',{style:'padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;background:#fff;'});
    unit.appendChild(el('option',{value:'%MC'},'%MC'));
    unit.appendChild(el('option',{value:'%WME'},'%WME'));
    unit.value = cur.dry_goal_unit || '%MC';
    const meter = el('select',{style:'padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;background:#fff;'});
    meter.appendChild(el('option',{value:''},'meter…'));
    for (const v of ['pin','non-pin','thermohygrometer']) meter.appendChild(el('option',{value:v}, v));
    meter.value = cur.meter_type || '';
    grid.appendChild(goal); grid.appendChild(unit); grid.appendChild(meter);
    card.appendChild(grid);
    screen.appendChild(card);
    rows.push({key:c.key, goal, unit, meter});
  }

  const status = el('div',{style:'font-size:12px;color:#16a34a;font-weight:700;text-align:center;min-height:16px;margin:6px 0;'});
  screen.appendChild(status);

  const saveBtn = el('button',{style:'width:100%;padding:14px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;'},'Save dry goals');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    status.style.color = '#16a34a'; status.textContent = '';
    let propagated = 0, saved = 0;
    try {
      for (const r of rows) {
        const g = (r.goal.value||'').trim();
        if (g === '') continue;  // only save materials with a goal entered
        const res = await apiPost('/claim-material-standards', {
          claim_id, material: r.key,
          dry_goal: parseFloat(g), dry_goal_unit: r.unit.value, meter_type: r.meter.value || null,
        });
        saved++;
        if (res && res.propagated) propagated += res.propagated;
      }
      status.textContent = saved
        ? ('Saved ' + saved + ' goal' + (saved===1?'':'s') + ' · applied to ' + propagated + ' surface' + (propagated===1?'':'s'))
        : 'Enter a goal for at least one material.';
    } catch(e){
      status.style.color = '#dc2626';
      status.textContent = 'Save failed: ' + (e.message||e);
    }
    saveBtn.disabled = false; saveBtn.textContent = 'Save dry goals';
  });
  screen.appendChild(saveBtn);
}


// Dehu performance capture — intake + exhaust + grain depression
async function renderDlpDehuCapture(prefill){
  prefill = prefill || {};
  clear(); enableInactivity();
  tcLiveSet({current_screen:'drylog-pro/dehu-capture', current_job_id:selectedJob?.job_id||null}, 'Capturing dehu performance');
  root.appendChild(buildTopbar('← Equipment', renderDlpEquipmentList, {showClockLink:true}));

  const claim_id = selectedJob.job_id;
  const screen = el('div',{class:'screen'});
  screen.addEventListener('click', resetInactivity);

  screen.appendChild(el('div',{class:'h1'},'Dehu Performance'));
  if (prefill.label) screen.appendChild(el('div',{class:'sub'}, prefill.label));

  // Zone picker if not pre-filled
  let zoneSelect = null;
  if (prefill.drying_zone_id) {
    zoneSelect = {value: String(prefill.drying_zone_id)};
  } else {
    let zones = [];
    try { zones = await apiGet(`/drying-zones?claim_id=${claim_id}`); } catch(e){}
    if (!Array.isArray(zones) || zones.length === 0) {
      screen.appendChild(el('div',{class:'dlp-empty'},'No drying zones yet. Define one in the Surfaces tab first.'));
      root.appendChild(screen); return;
    }
    const zw = _dlpFieldWrap('Zone');
    zoneSelect = el('select',{style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;background:#fff;'});
    for (const z of zones) zoneSelect.appendChild(el('option',{value:String(z.id)}, z.name));
    zw.appendChild(zoneSelect);
    screen.appendChild(zw);
  }

  // Intake
  screen.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin:6px 0 6px;'}, 'Intake (room side)'));
  const intakeGrid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;'});
  const inTempInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Intake °F',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:17px;text-align:center;'});
  const inRhInp   = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Intake RH %',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:17px;text-align:center;'});
  intakeGrid.appendChild(inTempInp); intakeGrid.appendChild(inRhInp);
  screen.appendChild(intakeGrid);

  // Exhaust
  screen.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin:6px 0 6px;'}, 'Exhaust (dry side)'));
  const exhGrid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;'});
  const exTempInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Exhaust °F',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:17px;text-align:center;'});
  const exRhInp   = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Exhaust RH %',style:'padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:17px;text-align:center;'});
  exhGrid.appendChild(exTempInp); exhGrid.appendChild(exRhInp);
  screen.appendChild(exhGrid);

  // Live grain depression readout
  const gdCard = el('div',{style:'padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;margin-bottom:14px;'});
  const gdValue = el('div',{style:'font-size:28px;font-weight:800;color:#0f172a;'}, '— gpp');
  const gdLabel = el('div',{style:'font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-top:4px;'},'Grain depression (intake − exhaust)');
  const gdGuide = el('div',{style:'font-size:11px;color:#94a3b8;margin-top:6px;'},'Healthy: 20–40');
  gdCard.appendChild(gdValue); gdCard.appendChild(gdLabel); gdCard.appendChild(gdGuide);
  screen.appendChild(gdCard);

  function refreshGd(){
    const inT = parseFloat(inTempInp.value), inR = parseFloat(inRhInp.value);
    const exT = parseFloat(exTempInp.value), exR = parseFloat(exRhInp.value);
    const inG = _dlpPsychroClient(inT, inR).gpp;
    const exG = _dlpPsychroClient(exT, exR).gpp;
    if (inG != null && exG != null) {
      const gd = inG - exG;
      gdValue.textContent = gd.toFixed(1) + ' gpp';
      const color = (gd >= 20 && gd <= 40) ? '#15803d' : (gd >= 10 ? '#a16207' : '#b91c1c');
      gdValue.style.color = color;
      gdGuide.textContent = (gd >= 20 && gd <= 40) ? 'In healthy 20–40 range'
        : (gd < 10 ? 'Low — dehu likely saturated, undersized, or short-cycling'
        : (gd < 20 ? 'Slight drop — check filters / airflow'
        : 'Very high — verify probe placement (may be reading at coil)'));
    } else {
      gdValue.textContent = '— gpp';
      gdValue.style.color = '#0f172a';
      gdGuide.textContent = 'Healthy: 20–40';
    }
  }
  for (const inp of [inTempInp, inRhInp, exTempInp, exRhInp]) inp.addEventListener('input', refreshGd);

  // Hours running + water collected
  const extraGrid = el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;'});
  const hoursInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Hours (optional)',style:'padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;text-align:center;'});
  const waterInp = el('input',{type:'number',step:'0.1',inputmode:'decimal',placeholder:'Pints (optional)',style:'padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;text-align:center;'});
  extraGrid.appendChild(hoursInp); extraGrid.appendChild(waterInp);
  screen.appendChild(extraGrid);

  // Notes
  const notesW = _dlpFieldWrap('Notes (optional)');
  const notesInp = el('textarea',{rows:2,placeholder:'',style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;resize:vertical;'});
  notesW.appendChild(notesInp);
  screen.appendChild(notesW);

  // Save
  const saveBtn = el('button',{style:'width:100%;padding:14px;background:#7c3aed;color:#fff;border-radius:10px;font-size:15px;font-weight:700;margin-top:14px;'},'Save Reading');
  saveBtn.addEventListener('click', async () => {
    const inT = parseFloat(inTempInp.value), inR = parseFloat(inRhInp.value);
    const exT = parseFloat(exTempInp.value), exR = parseFloat(exRhInp.value);
    if (isNaN(inT) || isNaN(inR) || isNaN(exT) || isNaN(exR)) {
      alert('All four intake/exhaust values are required.'); return;
    }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const visit_id = await _dlpEnsureVisit(claim_id);
      const reading_at = new Date().toISOString().slice(0,19).replace('T',' ');
      const payload = {
        drying_zone_id: parseInt(zoneSelect.value, 10),
        visit_id, reading_at,
        equipment_deploy_id: prefill.equipment_deploy_id || undefined,
        intake_temp_f: inT, intake_rh_pct: inR,
        exhaust_temp_f: exT, exhaust_rh_pct: exR,
        hours_running: hoursInp.value ? parseFloat(hoursInp.value) : undefined,
        water_collected_pints: waterInp.value ? parseFloat(waterInp.value) : undefined,
        notes: (notesInp.value||'').trim() || undefined,
      };
      const res = await apiPostOrQueue('/readings/dehu', payload,
        'Dehu reading — zone '+zoneSelect.value);
      if (res?.__queued) {
        tcToast('📤 Offline — dehu reading queued', 'info');
      } else {
        const data = res?.data || res;
        const fired = (data?.alerts?.alerts_fired || []);
        const gd = data?.derived?.grain_depression;
        let msg = 'Saved.';
        if (gd != null) msg += ' Grain depression: ' + Number(gd).toFixed(1) + ' gpp.';
        if (fired.length > 0) msg += '\n\n⚠ ' + fired.length + ' alert(s):\n' + fired.map(a => '· '+a.title).join('\n');
        if (fired.length > 0) alert(msg);
        else tcToast(gd != null ? ('✓ Saved · '+Number(gd).toFixed(1)+' gpp') : '✓ Saved');
      }
    } catch(e) {
      alert('Save failed: ' + (e.message||e));
      saveBtn.disabled = false; saveBtn.textContent = 'Save Reading';
      return;
    }
    renderDlpEquipmentList();
  });
  screen.appendChild(saveBtn);

  root.appendChild(screen);
  setTimeout(() => inTempInp.focus(), 50);
}


// Reading point create form
async function renderDlpPointCreate(surface_id){
  clear(); enableInactivity();
  root.appendChild(buildTopbar('← Surface', () => renderDlpSurfaceDetail(surface_id), {showClockLink:true}));

  const screen = el('div',{class:'screen'});
  screen.appendChild(el('div',{class:'h1'},'New Reading Point'));

  const lblW = _dlpFieldWrap('Label','e.g. "P1", "Behind toilet", "12 in from corner"');
  const lblInp = el('input',{type:'text',placeholder:'Label',style:'padding:10px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:15px;width:100%;'});
  lblW.appendChild(lblInp);
  screen.appendChild(lblW);

  const notesW = _dlpFieldWrap('Location notes (optional)','For relocating the meter on future visits.');
  const notesInp = el('textarea',{rows:2,placeholder:'',style:'padding:9px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;width:100%;resize:vertical;'});
  notesW.appendChild(notesInp);
  screen.appendChild(notesW);

  const saveBtn = el('button',{style:'width:100%;padding:14px;background:#16a34a;color:#fff;border-radius:10px;font-size:15px;font-weight:700;margin-top:14px;'},'Create Point');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const payload = {
        claim_surface_id: surface_id,
        point_label: (lblInp.value||'').trim() || undefined,
        location_notes: (notesInp.value||'').trim() || undefined,
      };
      await apiPost('/reading-points', payload);
    } catch(e) {
      alert('Create failed: ' + (e.message||e));
      saveBtn.disabled = false; saveBtn.textContent = 'Create Point';
      return;
    }
    renderDlpSurfaceDetail(surface_id);
  });
  screen.appendChild(saveBtn);
  root.appendChild(screen);
  setTimeout(() => lblInp.focus(), 50);
}


// ─────────────────────────────────────────────────────────────────────────────
// Drying Timeline — chart-ish view of room-readings over time.
// For each room, for each non-reference surface: list the date and the avg of
// (m1,m2,m3) with a colored chip showing how far above goal it is.
// ─────────────────────────────────────────────────────────────────────────────
async function renderDryingTimeline(preloaded){
  clear();disableInactivity();
  tcLiveSet({current_screen:'drying-timeline',current_job_id:selectedJob?.job_id||null}, 'Reviewing drying timeline');
  root.appendChild(buildTopbar('← Back', renderActionPicker, {showClockLink:true}));

  const screen=el('div',{class:'screen'});
  screen.appendChild(el('div',{class:'h1'},'Drying Timeline'));
  screen.appendChild(el('div',{class:'sub'},(selectedJob.customer||'')+(selectedJob.address?(' · '+selectedJob.address):'')));

  let data = preloaded;
  if(!data || !Array.isArray(data.rooms)){
    const loadingEl=el('div',{class:'loading'},'Loading readings…');
    screen.appendChild(loadingEl);
    root.appendChild(screen);
    try { data = await apiGet(`/room-readings?job_id=${selectedJob.job_id}`); } catch(e){ data={rooms:[]}; }
    loadingEl.remove();
  } else {
    root.appendChild(screen);
  }

  const rooms = (data && data.rooms) ? data.rooms : [];
  if(rooms.length===0){
    screen.appendChild(el('div',{style:'padding:32px 14px;text-align:center;font-size:13px;color:#94a3b8;'},'No readings recorded yet. Once you log moisture readings on Daily Visits they show up here as a timeline.'));
    return;
  }

  function avgOf(r){ const v=[r.m1,r.m2,r.m3].filter(x=>x!=null&&x!==''); if(!v.length)return null; return v.reduce((a,b)=>a+parseFloat(b),0)/v.length; }
  function chipFor(avg, goal){
    if(avg==null) return {label:'—', bg:'#f1f5f9', fg:'#94a3b8'};
    if(goal==null) return {label:avg.toFixed(1), bg:'#dbeafe', fg:'#1d4ed8'};
    const diff = avg - parseFloat(goal);
    if(diff <= 0) return {label:avg.toFixed(1)+' ✓', bg:'#dcfce7', fg:'#15803d'};
    if(diff <= 2) return {label:avg.toFixed(1), bg:'#fef3c7', fg:'#a16207'};
    return {label:avg.toFixed(1), bg:'#fee2e2', fg:'#b91c1c'};
  }

  for(const room of rooms){
    const sec=el('div',{class:'jd-section'});
    sec.appendChild(el('div',{class:'jd-section-h'},room.room_name||'Room'));

    const surfaces = (room.surfaces||[]).filter(s=>!s.is_reference);
    if(surfaces.length===0){
      sec.appendChild(el('div',{style:'padding:8px 12px;font-size:12px;color:#94a3b8;'},'No surface readings.'));
      screen.appendChild(sec);
      continue;
    }

    for(const surf of surfaces){
      const card=el('div',{class:'jd-card',style:'padding:10px 12px;margin-bottom:8px;'});
      const head=el('div',{style:'display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px;'});
      head.appendChild(el('div',{style:'font-weight:700;font-size:13px;color:#0f172a;'},(surf.surface_type||'Surface')+(surf.wall_index!=null?(' #'+surf.wall_index):'')));
      head.appendChild(el('div',{style:'font-size:11px;color:#64748b;'},'Goal: '+(surf.drying_goal!=null?surf.drying_goal:'—')));
      card.appendChild(head);

      // Backend emits `date` (room_readings.php:124). Earlier draft of this
      // view read `reading_date` which is the DB column name but not the JSON
      // key — every pill showed `—` until this was fixed.
      const series = (surf.series||[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
      if(series.length===0){
        card.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;'},'No readings.'));
        sec.appendChild(card);
        continue;
      }

      const grid=el('div',{style:'display:flex;flex-wrap:wrap;gap:5px;'});
      for(const r of series){
        const avg=avgOf(r);
        const chip=chipFor(avg, surf.drying_goal);
        const d=String(r.date||'').slice(5); // MM-DD
        const pill=el('div',{style:`display:inline-flex;flex-direction:column;align-items:center;gap:2px;padding:5px 8px;border-radius:6px;background:${chip.bg};color:${chip.fg};font-size:11px;font-weight:600;min-width:48px;`});
        pill.appendChild(el('div',{style:'font-size:10px;font-weight:500;opacity:0.85;'},d||'—'));
        pill.appendChild(el('div',{style:'font-size:12px;font-weight:700;'},chip.label));
        grid.appendChild(pill);
      }
      card.appendChild(grid);

      // Trend hint
      if(series.length>=2){
        const first=avgOf(series[0]);
        const last=avgOf(series[series.length-1]);
        if(first!=null && last!=null){
          const diff = last-first;
          const dir = diff<0 ? '↓' : (diff>0?'↑':'→');
          const color = diff<0 ? '#15803d' : (diff>0?'#b91c1c':'#64748b');
          card.appendChild(el('div',{style:`font-size:11px;color:${color};margin-top:6px;`},
            `${dir} ${Math.abs(diff).toFixed(1)} since first reading (${series.length} readings)`));
        }
      }
      sec.appendChild(card);
    }
    screen.appendChild(sec);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Psychrometric Calculator — given temp (°F) + RH (%), compute:
//   • Dew point (°F) — Magnus formula
//   • Vapor pressure (mb) — saturation × RH
//   • GPP (grains per pound) — ASHRAE practical formula
// Used in mit to verify dehumidifier performance: GPP in vs. GPP out should
// drop by 20-40 across the unit; dew point should track room temp - 20°F or so.
// ─────────────────────────────────────────────────────────────────────────────
function renderPsychroCalc(){
  clear();enableInactivity();
  tcLiveSet({current_screen:'psychro-calc',current_job_id:selectedJob?.job_id||null}, 'Using psychrometric calculator');
  root.appendChild(buildTopbar('← Back', renderActionPicker, {showClockLink:true}));

  const screen=el('div',{class:'screen'});
  screen.appendChild(el('div',{class:'h1'},'Psychrometric'));
  screen.appendChild(el('div',{class:'sub'},'Enter temp + RH → get dew point, GPP, vapor pressure'));

  // Math helpers
  function fToC(f){ return (f-32)*5/9; }
  function cToF(c){ return c*9/5+32; }
  // Magnus formula (Tetens approximation): sat vapor pressure in mb
  function satVPmb(tF){
    const tC=fToC(tF);
    return 6.112 * Math.exp((17.67*tC)/(tC+243.5));
  }
  // Dew point in °F from temp °F + RH %
  function dewPointF(tF, rhPct){
    const tC=fToC(tF);
    const a=17.625, b=243.04;
    const alpha = Math.log(Math.max(rhPct,0.0001)/100) + (a*tC)/(b+tC);
    const dpC = (b*alpha)/(a-alpha);
    return cToF(dpC);
  }
  // Humidity ratio (lb water / lb dry air) then converted to GPP (× 7000 gr/lb)
  function gpp(tF, rhPct){
    const ePs = satVPmb(tF);            // sat vapor pressure mb
    const e = ePs * (rhPct/100);        // partial vapor pressure mb
    const Patm = 1013.25;               // mb sea level
    const w = 0.622 * (e/(Patm - e));   // humidity ratio lb/lb
    return w * 7000;                    // gr/lb dry air
  }

  function compute(){
    const t1 = parseFloat(t1Inp.value), r1 = parseFloat(r1Inp.value);
    const t2 = parseFloat(t2Inp.value), r2 = parseFloat(r2Inp.value);
    function fmt(v){ return (v==null||isNaN(v))?'—':v.toFixed(1); }
    function row(tF,rhPct){
      if(isNaN(tF)||isNaN(rhPct)) return {dp:null,vp:null,gpp:null};
      return { dp:dewPointF(tF,rhPct), vp:satVPmb(tF)*(rhPct/100), gpp:gpp(tF,rhPct) };
    }
    const a = row(t1,r1), b = row(t2,r2);
    out1Dp.textContent = fmt(a.dp);
    out1Vp.textContent = fmt(a.vp);
    out1Gpp.textContent = fmt(a.gpp);
    out2Dp.textContent = fmt(b.dp);
    out2Vp.textContent = fmt(b.vp);
    out2Gpp.textContent = fmt(b.gpp);

    if(a.gpp!=null && b.gpp!=null){
      const drop = a.gpp - b.gpp;
      const sign = drop>=0 ? 'down' : 'up';
      const color = (drop>=20 && drop<=40) ? '#15803d' : (drop>=10?'#a16207':'#b91c1c');
      const guide = (drop>=20 && drop<=40)
        ? 'In healthy range (20–40 gr/lb drop indicates dehu is moving water)'
        : (drop<10
          ? 'Low drop — dehu may be saturated, undersized, or short-cycling'
          : (drop<20
            ? 'Slight drop — check filters, air flow, or upgrade unit'
            : 'Very high drop — verify probe placement (probably reading at coil)'));
      delta.style.color = color;
      delta.innerHTML = `<div style="font-weight:700;">Δ GPP: ${drop.toFixed(1)} (${sign})</div><div style="font-size:11px;margin-top:3px;font-weight:500;opacity:0.9;">${guide}</div>`;
    } else {
      delta.style.color = '#94a3b8';
      delta.textContent = 'Fill both rows to compare';
    }
  }

  function row(title, helper){
    const wrap=el('div',{style:'margin-bottom:16px;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;'});
    wrap.appendChild(el('div',{style:'font-weight:700;font-size:13px;color:#0f172a;margin-bottom:4px;'},title));
    if(helper) wrap.appendChild(el('div',{style:'font-size:11px;color:#94a3b8;margin-bottom:8px;'},helper));
    const inputs=el('div',{style:'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;'});
    const tInp=el('input',{type:'number',step:'0.1',placeholder:'Temp °F',style:'padding:9px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;'});
    const rInp=el('input',{type:'number',step:'0.1',placeholder:'RH %',style:'padding:9px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;'});
    inputs.appendChild(tInp); inputs.appendChild(rInp);
    wrap.appendChild(inputs);

    const grid=el('div',{style:'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;'});
    function cell(label){
      const c=el('div',{style:'padding:8px 6px;background:#f8fafc;border-radius:6px;text-align:center;'});
      const v=el('div',{style:'font-size:16px;font-weight:700;color:#0f172a;'},'—');
      c.appendChild(v);
      c.appendChild(el('div',{style:'font-size:10px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;'},label));
      return {wrap:c, val:v};
    }
    const dp=cell('Dew Pt °F');
    const vp=cell('Vapor mb');
    const gpp=cell('GPP');
    grid.appendChild(dp.wrap); grid.appendChild(vp.wrap); grid.appendChild(gpp.wrap);
    wrap.appendChild(grid);

    return { wrap, tInp, rInp, dp:dp.val, vp:vp.val, gpp:gpp.val };
  }

  const r1Row = row('Reading A — typically dehu intake (room air)', 'e.g. unaffected room 72°F / 45% RH');
  const r2Row = row('Reading B — typically dehu exhaust (or after dehu)', 'e.g. dehu outlet 95°F / 18% RH');
  screen.appendChild(r1Row.wrap);
  screen.appendChild(r2Row.wrap);

  const t1Inp=r1Row.tInp, r1Inp=r1Row.rInp;
  const out1Dp=r1Row.dp, out1Vp=r1Row.vp, out1Gpp=r1Row.gpp;
  const t2Inp=r2Row.tInp, r2Inp=r2Row.rInp;
  const out2Dp=r2Row.dp, out2Vp=r2Row.vp, out2Gpp=r2Row.gpp;

  [t1Inp,r1Inp,t2Inp,r2Inp].forEach(i=>i.addEventListener('input',compute));

  const delta=el('div',{style:'padding:12px;background:#f1f5f9;border-radius:10px;font-size:13px;color:#94a3b8;text-align:center;'},'Fill both rows to compare');
  screen.appendChild(delta);

  screen.appendChild(el('div',{style:'margin-top:14px;padding:10px 12px;background:#fef3c7;border:1px dashed #fcd34d;border-radius:8px;font-size:11px;color:#92400e;line-height:1.5;'},
    'Quick reference: target GPP ≤ 55–65 gr/lb during drying. Dew point of room air should be below surface temp of wet materials — if dew point > surface temp, condensation forms and drying stops. Formulas use Magnus/ASHRAE approximations at sea level.'));

  root.appendChild(screen);
}
