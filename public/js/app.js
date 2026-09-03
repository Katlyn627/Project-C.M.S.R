'use strict';

/* ==========================================================================
   Project C.M.S.R — Client Application Controller
   Civic Daylight Architecture & Real-Time Dispatch Engine
   ========================================================================== */

// Application State
const state = {
  token: localStorage.getItem('cmsr_token') || null,
  user: JSON.parse(localStorage.getItem('cmsr_user') || 'null'),
  currentTab: 'dashboard',
  routes: [],
  shifts: [],
  volunteers: [],
  incidents: [],
  smsLogs: [],
  supervisorDecrypted: true,
  currentAssignShiftId: null,
  ussd: {
    phoneNumber: '+256707654321',
    sessionId: 'sess_' + Date.now(),
    text: '',
    inputBuffer: '',
    screenText: 'CON Welcome to CMSR\n1. Confirm shift\n2. Report issue\n3. Safe arrival',
    isEnded: false,
  }
};

// Waypoint Intelligence Data
const WAYPOINT_INTEL = {
  1: {
    name: 'Assembly Point (Central Transit Hub)',
    type: 'Roll-Call & Parent Drop-off Point',
    details: 'Active Escort: Amara Okafor | High-visibility vests & whistle packs issued | Roll-call ratio 1:6 compliant.',
    schedule: 'Assembly Window: 06:45 – 07:15 AM'
  },
  2: {
    name: 'Checkpoint Alpha (Market Footbridge)',
    type: 'Pedestrian Chaperone Station',
    details: 'Narrow footbridge choke point. Volunteer monitors pedestrian flow and guides students across steps safely.',
    schedule: 'Stationed: 07:15 – 07:40 AM'
  },
  3: {
    name: 'Safe Haven Refuge (Market Pharmacy)',
    type: 'Designated Community Emergency Refuge',
    details: 'First-aid certified staff on premise. Official safe haven business equipped with emergency telephone and water.',
    schedule: 'Continuous On-Call Refuge'
  },
  4: {
    name: 'Hazard Watchpoint (Railway Crossing Gate)',
    type: 'Train Crossing & Heavy Traffic Corridor',
    details: 'Active crossing guard advisory. Volunteers ensure cohort halts 5 meters before tracks when signals flash.',
    schedule: 'Stationed: 07:45 – 08:10 AM'
  },
  5: {
    name: 'School Terminal (St. Mary Girls High School)',
    type: 'Final Destination & Parent Broadcast Hub',
    details: 'Gatekeeper verification sign-in. Triggers automated Parent Safe Arrival SMS broadcast to guardian mobile phones.',
    schedule: 'Arrival Window: 08:10 – 08:25 AM'
  }
};

// API Helper
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers['Authorization'] = 'Bearer ' + state.token;
  }
  const res = await fetch(endpoint, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Request failed with status ' + res.status);
  }
  return data;
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// Theme Switcher (Daylight Civic vs Night Operations)
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('cmsr_theme', next);
  showToast(`Switched to ${next === 'dark' ? 'Operations Night' : 'Civic Daylight'} theme`, 'info');
}

// Health Check Ping
async function checkHealth() {
  const healthEl = document.getElementById('healthStatus');
  if (!healthEl) return;
  const start = Date.now();
  try {
    const res = await fetch('/health');
    const data = await res.json();
    const lat = Date.now() - start;
    if (data.status === 'ok') {
      healthEl.innerHTML = `<span class="pulse-dot"></span> Online (${lat}ms)`;
    }
  } catch {
    healthEl.innerHTML = `<span class="pulse-dot" style="background:var(--rose-500)"></span> Offline`;
  }
}

// Interactive Waypoint Selector
function selectWaypoint(idx) {
  document.querySelectorAll('.waypoint-step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === idx);
  });
  const data = WAYPOINT_INTEL[idx] || WAYPOINT_INTEL[1];
  const intelEl = document.getElementById('waypointIntel');
  if (intelEl) {
    intelEl.innerHTML = `
      <div>
        <strong>Selected Station: ${data.name}</strong> — ${data.type}.
        <div style="color:var(--text-secondary); margin-top:2px;">
          ${data.details} &bull; <em>${data.schedule}</em>
        </div>
      </div>
      <button class="btn btn-sm btn-primary" onclick="switchTab('shifts')">
        Manage Dispatch
      </button>
    `;
  }
}

// Persona & Demo Role Switcher
async function quickLogin(role) {
  try {
    const res = await api('/api/demo/quick-login', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('cmsr_token', res.token);
    localStorage.setItem('cmsr_user', JSON.stringify(res.user));
    updateUserBar();
    showToast(`Assumed role: ${res.user.role.toUpperCase()} (${res.user.full_name})`, 'success');
    refreshActiveTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateUserBar() {
  const user = state.user;
  const avatarEl = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userName');
  const badgeEl = document.getElementById('userBadge');
  const permEl = document.getElementById('userPermissions');

  if (!user) return;

  const initials = user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'U';
  if (avatarEl) {
    avatarEl.innerText = initials;
    avatarEl.className = `identity-avatar ${user.role}`;
  }
  if (nameEl) nameEl.innerText = user.full_name;
  if (badgeEl) {
    badgeEl.innerText = user.role.toUpperCase();
    badgeEl.className = `identity-badge ${user.role}`;
  }

  const roleDescriptions = {
    coordinator: 'Full Clearance: Walking-Bus Dispatch, Route Management, Decrypted Safeguarding Desk',
    volunteer: 'Field Clearance: Chaperone Roster, Walking-Bus Shifts, Field Incident Reporting',
    admin: 'System Director Clearance: Administrative Oversight, Incident Auditing, Telecom Logs',
    viewer: 'Community Observer: Read-Only Overview & Public Route Information',
  };

  if (permEl) {
    permEl.innerText = roleDescriptions[user.role] || 'Standard Access';
  }

  // Update button active state
  ['Coord', 'Vol', 'Admin', 'Viewer'].forEach(k => {
    const btn = document.getElementById(`btnRole${k}`);
    if (btn) btn.classList.remove('active');
  });
  if (user.role === 'coordinator' && document.getElementById('btnRoleCoord')) document.getElementById('btnRoleCoord').classList.add('active');
  if (user.role === 'volunteer' && document.getElementById('btnRoleVol')) document.getElementById('btnRoleVol').classList.add('active');
  if (user.role === 'admin' && document.getElementById('btnRoleAdmin')) document.getElementById('btnRoleAdmin').classList.add('active');
  if (user.role === 'viewer' && document.getElementById('btnRoleViewer')) document.getElementById('btnRoleViewer').classList.add('active');
}

// Seed Demo Data
async function seedDemoData() {
  try {
    await api('/api/demo/seed', { method: 'POST' });
    showToast('Demo data seeded with verified corridors, chaperones, shifts & incidents!', 'success');
    await loadAllData();
    refreshActiveTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Tab Switching
function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });
  refreshActiveTab();
}

function refreshActiveTab() {
  if (state.currentTab === 'dashboard') loadDashboard();
  if (state.currentTab === 'shifts') loadShiftsTab();
  if (state.currentTab === 'incidents') loadIncidentsTab();
  if (state.currentTab === 'ussd') loadUssdTab();
}

// Data Loaders
async function loadAllData() {
  await Promise.allSettled([
    loadRoutes(),
    loadShifts(),
    loadVolunteers(),
    loadIncidents(),
    loadSmsLogs(),
  ]);
  loadDashboard();
}

async function loadRoutes() {
  try {
    state.routes = await api('/shifts/routes/list');
  } catch {
    state.routes = [];
  }
}

async function loadShifts() {
  try {
    state.shifts = await api('/shifts');
  } catch {
    state.shifts = [];
  }
}

async function loadVolunteers() {
  try {
    state.volunteers = await api('/volunteers');
  } catch {
    state.volunteers = [];
  }
}

async function loadIncidents() {
  try {
    state.incidents = await api('/incidents');
  } catch {
    state.incidents = [];
  }
}

async function loadSmsLogs() {
  try {
    state.smsLogs = await api('/sms');
  } catch {
    state.smsLogs = [];
  }
}

// 1. Dashboard Overview Tab
async function loadDashboard() {
  try {
    const status = await api('/api/demo/status');
    if (document.getElementById('metricVolunteers')) document.getElementById('metricVolunteers').innerText = status.counts.volunteers;
    if (document.getElementById('metricShifts')) document.getElementById('metricShifts').innerText = status.counts.shifts;
    if (document.getElementById('metricRoutes')) document.getElementById('metricRoutes').innerText = status.counts.routes;
    if (document.getElementById('metricIncidents')) document.getElementById('metricIncidents').innerText = status.counts.incidents;
  } catch {
    if (document.getElementById('metricVolunteers')) document.getElementById('metricVolunteers').innerText = state.volunteers.length;
    if (document.getElementById('metricShifts')) document.getElementById('metricShifts').innerText = state.shifts.length;
    if (document.getElementById('metricRoutes')) document.getElementById('metricRoutes').innerText = state.routes.length;
    if (document.getElementById('metricIncidents')) document.getElementById('metricIncidents').innerText = state.incidents.length;
  }
}

// 2. Safe Routes & Shifts Tab
async function loadShiftsTab() {
  await Promise.all([loadRoutes(), loadShifts(), loadVolunteers()]);
  renderRoutesGrid();
  renderShiftsGrid();
  renderVolunteersTable();
}

function renderRoutesGrid() {
  const container = document.getElementById('routesGrid');
  if (!container) return;

  if (!state.routes.length) {
    container.innerHTML = `
      <div style="grid-column:1/-1; padding:2rem; text-align:center; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); color:var(--text-muted);">
        No corridors mapped yet. Click "Register Safe Corridor" above or "Seed Demo Data".
      </div>
    `;
    return;
  }

  container.innerHTML = state.routes.map(r => `
    <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:1.25rem; box-shadow:var(--shadow-card);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <h4 style="font-size:0.95rem; font-weight:700; color:var(--teal-700);">${r.name}</h4>
        <span class="identity-badge coordinator">ACTIVE CORRIDOR</span>
      </div>
      <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:0.75rem; line-height:1.4;">
        ${r.description || 'Verified walking corridor with assigned chaperones and refuge stations.'}
      </p>
      <div style="font-size:0.76rem; color:var(--text-muted); display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
        <span>🚏 Start: <strong>${r.start_point}</strong></span> &bull; 
        <span>🏫 End: <strong>${r.end_point}</strong></span>
      </div>
    </div>
  `).join('');

  // Populate shift modal select
  const select = document.getElementById('shiftRouteSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Choose Corridor --</option>' + 
      state.routes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  }
}

function renderShiftsGrid() {
  const container = document.getElementById('shiftsGrid');
  if (!container) return;

  if (!state.shifts.length) {
    container.innerHTML = `
      <div style="grid-column:1/-1; padding:2rem; text-align:center; color:var(--text-muted);">
        No scheduled shifts. Click "Schedule New Shift" or "Seed Demo Data".
      </div>
    `;
    return;
  }

  container.innerHTML = state.shifts.map(s => {
    const assigned = s.assigned_count || 0;
    const max = s.max_volunteers || 2;
    const percent = Math.min(100, Math.round((assigned / max) * 100));
    const isFull = assigned >= max;

    return `
      <div class="shift-card">
        <div class="shift-card-header">
          <span class="shift-type-pill ${s.shift_type}">${s.shift_type.replace('_', ' ')}</span>
          <span class="shift-date-badge">📅 ${s.scheduled_date}</span>
        </div>

        <h4 class="shift-route-title">${s.route_name || 'Designated Safe Corridor'}</h4>
        
        <div class="shift-time-range">
          <span>⏰ ${s.start_time} – ${s.end_time}</span>
          <span>&bull;</span>
          <span>${s.notes || 'Routine escorted transit'}</span>
        </div>

        <div class="capacity-gauge">
          <div class="capacity-meta">
            <span>Escort Allocation</span>
            <span>${assigned} / ${max} Chaperones</span>
          </div>
          <div class="capacity-bar">
            <div class="capacity-fill ${assigned === 0 ? 'empty' : ''}" style="width: ${percent}%;"></div>
          </div>
        </div>

        <div class="shift-actions">
          <button class="btn btn-sm btn-primary" onclick="openAssignModal(${s.id})" ${isFull ? 'disabled style="opacity:0.6"' : ''}>
            ${isFull ? '✓ Full' : '➕ Assign Chaperone'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderVolunteersTable() {
  const tbody = document.querySelector('#volunteersTable tbody');
  if (!tbody) return;

  if (!state.volunteers.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">
          No volunteer profiles loaded. (Requires Coordinator or Admin session).
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.volunteers.map(v => `
    <tr>
      <td><strong>${v.full_name}</strong></td>
      <td><span class="identity-badge volunteer">@${v.username}</span></td>
      <td><code>${v.phone || '&mdash;'}</code></td>
      <td>${v.skills || 'Walking Bus Escort'}</td>
      <td>${v.availability || 'Weekdays 06:30-08:30'}</td>
      <td>
        <span class="identity-badge coordinator">
          ${v.background_checked ? '✅ Vetted' : '⏳ Pending'}
        </span>
      </td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="sendReminderSms('${v.phone}', 'Route 1')">
          📲 Shift SMS
        </button>
      </td>
    </tr>
  `).join('');
}

// 3. Safeguarding Incident Desk Tab
async function loadIncidentsTab() {
  await loadIncidents();
  renderIncidentsList();
}

function toggleDecryptionMode() {
  state.supervisorDecrypted = !state.supervisorDecrypted;
  const btn = document.getElementById('decryptToggleBtn');
  if (btn) {
    btn.innerHTML = state.supervisorDecrypted 
      ? '🔒 Show Encrypted Ciphertext' 
      : '🔓 Decrypt Supervisor View';
  }
  renderIncidentsList();
}

function renderIncidentsList() {
  const container = document.getElementById('incidentsList');
  const countBadge = document.getElementById('incidentCountBadge');
  if (!container) return;

  if (countBadge) countBadge.innerText = `${state.incidents.length} INCIDENTS`;

  const isSupervisor = state.user && (state.user.role === 'coordinator' || state.user.role === 'admin');

  if (!state.incidents.length) {
    container.innerHTML = `
      <div style="padding:2rem; text-align:center; color:var(--text-muted);">
        No safeguarding incidents logged. Corridors safe and normal.
      </div>
    `;
    return;
  }

  container.innerHTML = state.incidents.map(inc => {
    const isDecrypted = isSupervisor && state.supervisorDecrypted && inc.description;
    const descDisplay = isDecrypted 
      ? inc.description 
      : '🔒 [ENCRYPTED AT REST] Ciphertext payload protected with AES-256-GCM hardware key. Coordinator/Admin clearance required to audit.';
    const partiesDisplay = isDecrypted && inc.involved_parties
      ? `<div style="font-size:0.78rem; color:var(--teal-700); margin-top:0.35rem;"><strong>Involved:</strong> ${inc.involved_parties}</div>`
      : '';

    return `
      <div class="incident-card">
        <div class="incident-card-top">
          <div class="incident-badges">
            <span class="badge-severity ${inc.severity}">${inc.severity}</span>
            <span class="identity-badge coordinator">${inc.incident_type.replace('_', ' ')}</span>
            ${inc.safeguarding_referral ? '<span class="badge-referral">⚠️ Child Protection Referral</span>' : ''}
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">
            Logged: ${new Date(inc.created_at).toLocaleString()}
          </div>
        </div>

        <div class="incident-location">
          <span>📍</span>
          <span>${inc.location || 'Corridor Checkpoint'}</span>
        </div>

        <div class="incident-encrypted-box ${isDecrypted ? 'decrypted' : ''}">
          <div>${descDisplay}</div>
          ${partiesDisplay}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
          <div style="font-size:0.78rem; color:var(--text-secondary);">
            Reported by: <strong>${inc.reporter_name || 'Anonymous Staff'}</strong>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="font-size:0.75rem; font-weight:600; color:var(--text-secondary);">Status:</span>
            <select class="form-control" style="padding:0.25rem 0.5rem; font-size:0.75rem; width:auto;" onchange="updateIncidentStatus(${inc.id}, this.value)" ${isSupervisor ? '' : 'disabled'}>
              <option value="open" ${inc.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="under_review" ${inc.status === 'under_review' ? 'selected' : ''}>Under Review</option>
              <option value="resolved" ${inc.status === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="escalated" ${inc.status === 'escalated' ? 'selected' : ''}>Escalated</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function submitIncident(e) {
  e.preventDefault();
  const incident_type = document.getElementById('incType').value;
  const severity = document.getElementById('incSeverity').value;
  const location = document.getElementById('incLocation').value.trim();
  const involved_parties = document.getElementById('incParties').value.trim();
  const description = document.getElementById('incDescription').value.trim();
  const safeguarding_referral = document.getElementById('incSafeguarding').checked;

  try {
    await api('/incidents', {
      method: 'POST',
      body: JSON.stringify({
        incident_type,
        severity,
        location,
        involved_parties,
        description,
        safeguarding_referral,
      }),
    });
    showToast('Field incident encrypted with AES-256-GCM and submitted!', 'success');
    document.getElementById('incidentForm').reset();
    await loadIncidents();
    renderIncidentsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateIncidentStatus(id, status) {
  try {
    await api(`/incidents/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    showToast(`Incident #${id} status updated to ${status.replace('_', ' ').toUpperCase()}`, 'success');
    await loadIncidents();
    renderIncidentsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 4. USSD & Last-Mile SMS Studio Tab
async function loadUssdTab() {
  await loadSmsLogs();
  renderSmsOutbox();
}

function renderSmsOutbox() {
  const tbody = document.querySelector('#smsTable tbody');
  if (!tbody) return;

  if (!state.smsLogs.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">
          No notifications recorded in outbox. Trigger safe arrival or reminders above.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.smsLogs.map(sms => `
    <tr>
      <td style="font-size:0.78rem; color:var(--text-secondary);">${new Date(sms.created_at).toLocaleTimeString()}</td>
      <td><span class="identity-badge coordinator">${sms.notification_type}</span></td>
      <td><code>${sms.recipient_phone}</code></td>
      <td><span class="identity-badge volunteer">SENT</span></td>
      <td style="font-size:0.8rem; max-width:380px;">${sms.message}</td>
    </tr>
  `).join('');
}

// USSD Keypad State & Dialing
function ussdPress(key) {
  state.ussd.inputBuffer += key;
  const screenEl = document.getElementById('ussdScreen');
  if (screenEl) {
    screenEl.innerText = state.ussd.screenText + '\n\n> ' + state.ussd.inputBuffer;
  }
}

async function ussdSend() {
  const entered = state.ussd.inputBuffer.trim();
  state.ussd.inputBuffer = '';

  let newText = state.ussd.text ? `${state.ussd.text}*${entered}` : entered;
  state.ussd.text = newText;

  const screenEl = document.getElementById('ussdScreen');
  if (screenEl) screenEl.innerText = 'Connecting to CMSR Gateway...\n';

  try {
    const res = await fetch('/sms/ussd-hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.ussd.sessionId,
        phoneNumber: state.ussd.phoneNumber,
        text: state.ussd.text,
      }),
    });
    const textOutput = await res.text();
    state.ussd.screenText = textOutput;
    if (screenEl) screenEl.innerText = textOutput;
    if (textOutput.startsWith('END')) {
      state.ussd.isEnded = true;
      showToast('USSD session completed', 'info');
      await loadSmsLogs();
      renderSmsOutbox();
    }
  } catch {
    if (screenEl) screenEl.innerText = 'Network timeout. Dial again.\n';
  }
}

function ussdReset() {
  state.ussd.sessionId = 'sess_' + Date.now();
  state.ussd.text = '';
  state.ussd.inputBuffer = '';
  state.ussd.isEnded = false;
  state.ussd.screenText = 'CON Welcome to CMSR\n1. Confirm shift\n2. Report issue\n3. Safe arrival';
  const screenEl = document.getElementById('ussdScreen');
  if (screenEl) screenEl.innerText = state.ussd.screenText;
}

// Parent Safe Arrival SMS Trigger
async function sendSafeArrivalSms() {
  const child_name = document.getElementById('smsStudentName').value.trim();
  const parent_phone = document.getElementById('smsParentPhone').value.trim();
  if (!child_name || !parent_phone) {
    showToast('Please enter both student name and phone number', 'error');
    return;
  }

  try {
    await api('/sms/safe-arrival', {
      method: 'POST',
      body: JSON.stringify({
        child_name,
        parent_phone,
        location: 'St. Mary Girls High School',
      }),
    });
    showToast(`Arrival SMS dispatched to guardian (${parent_phone})!`, 'success');
    await loadSmsLogs();
    renderSmsOutbox();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function sendReminderSms(phone, routeName) {
  try {
    await api('/sms/send', {
      method: 'POST',
      body: JSON.stringify({
        recipient_phone: phone || '+256707654321',
        message: `CMSR Shift Reminder: You are rostered for ${routeName} Walking-Bus tomorrow at 07:00 AM. Reply 1 to confirm.`,
        notification_type: 'shift_reminder',
      }),
    });
    showToast(`Shift reminder dispatched to ${phone}!`, 'success');
    await loadSmsLogs();
    renderSmsOutbox();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Modals Management
function openAssignModal(shiftId) {
  state.currentAssignShiftId = shiftId;
  const select = document.getElementById('assignVolunteerSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Choose Vetted Volunteer --</option>' +
      state.volunteers.map(v => `<option value="${v.id}">${v.full_name} (${v.skills || 'Escort'})</option>`).join('');
  }
  document.getElementById('assignShiftId').value = shiftId;
  document.getElementById('assignModal').classList.add('active');
}

function closeAssignModal() {
  document.getElementById('assignModal').classList.remove('active');
  state.currentAssignShiftId = null;
}

async function assignVolunteer(e) {
  e.preventDefault();
  const shiftId = state.currentAssignShiftId;
  const volunteer_id = document.getElementById('assignVolunteerSelect').value;
  if (!shiftId || !volunteer_id) {
    showToast('Please choose a volunteer', 'error');
    return;
  }
  try {
    await api(`/shifts/${shiftId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ volunteer_id }),
    });
    showToast('Volunteer successfully assigned to walking bus!', 'success');
    closeAssignModal();
    await loadShifts();
    renderShiftsGrid();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openNewShiftModal() {
  const shiftDate = document.getElementById('shiftDate');
  if (shiftDate) shiftDate.value = new Date().toISOString().slice(0, 10);
  document.getElementById('newShiftModal').classList.add('active');
}

function closeNewShiftModal() {
  document.getElementById('newShiftModal').classList.remove('active');
}

async function submitShift(e) {
  e.preventDefault();
  const route_id = document.getElementById('shiftRouteSelect').value || null;
  const shift_type = document.getElementById('shiftType').value;
  const scheduled_date = document.getElementById('shiftDate').value;
  const start_time = document.getElementById('shiftStartTime').value;
  const end_time = document.getElementById('shiftEndTime').value;
  const max_volunteers = parseInt(document.getElementById('shiftCapacity').value, 10) || 2;
  const notes = document.getElementById('shiftNotes').value.trim();

  try {
    await api('/shifts', {
      method: 'POST',
      body: JSON.stringify({
        route_id,
        shift_type,
        scheduled_date,
        start_time,
        end_time,
        max_volunteers,
        notes,
      }),
    });
    showToast('New walking bus shift scheduled!', 'success');
    closeNewShiftModal();
    document.getElementById('newShiftForm').reset();
    await loadShifts();
    renderShiftsGrid();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openNewRouteModal() {
  document.getElementById('newRouteModal').classList.add('active');
}

function closeNewRouteModal() {
  document.getElementById('newRouteModal').classList.remove('active');
}

async function submitRoute(e) {
  e.preventDefault();
  const name = document.getElementById('routeName').value.trim();
  const start_point = document.getElementById('routeStart').value.trim();
  const end_point = document.getElementById('routeEnd').value.trim();
  const description = document.getElementById('routeDesc').value.trim();

  try {
    await api('/shifts/routes', {
      method: 'POST',
      body: JSON.stringify({ name, start_point, end_point, description }),
    });
    showToast('New safe route corridor registered!', 'success');
    closeNewRouteModal();
    document.getElementById('newRouteForm').reset();
    await loadRoutes();
    renderRoutesGrid();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Initialization on DOM Load
document.addEventListener('DOMContentLoaded', async () => {
  // Apply stored theme if any
  const savedTheme = localStorage.getItem('cmsr_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Authenticate as coordinator by default for immediate evaluation
  if (!state.user || !state.token) {
    await quickLogin('coordinator');
  } else {
    updateUserBar();
  }

  // Periodic health check
  checkHealth();
  setInterval(checkHealth, 30000);

  // Load all data
  await loadAllData();
});
