'use strict';

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
  ussd: {
    phoneNumber: '+256701234567',
    sessionId: 'sess_' + Date.now(),
    text: '',
    screenText: 'CON Welcome to CMSR Volunteer Dispatch\n1. Confirm Shift Assignment\n2. Report Safe Route Arrival\n3. Report Urgent Issue\n4. Contact Coordinator',
    isEnded: false,
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

// Health Check Ping
async function checkHealth() {
  const healthEl = document.getElementById('healthStatus');
  const start = Date.now();
  try {
    const res = await fetch('/health');
    const data = await res.json();
    const lat = Date.now() - start;
    if (data.status === 'ok') {
      healthEl.innerHTML = `<span class="pulse-dot"></span> Online (${lat}ms)`;
    }
  } catch {
    healthEl.innerHTML = `<span class="pulse-dot" style="background:var(--badge-rose)"></span> Offline`;
  }
}

// Auth & Quick Demo Switcher
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
    showToast(`Switched role to ${res.user.role.toUpperCase()} (${res.user.full_name})`, 'success');
    refreshActiveTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('cmsr_token');
  localStorage.removeItem('cmsr_user');
  quickLogin('coordinator'); // default back to coordinator for portfolio demo
}

function updateUserBar() {
  const user = state.user;
  const userBar = document.getElementById('currentUserDisplay');
  if (!userBar) return;
  if (user) {
    userBar.innerHTML = `
      <span>👤 <strong>${user.full_name}</strong></span>
      <span class="role-badge role-${user.role}">${user.role}</span>
    `;
  } else {
    userBar.innerHTML = `<span>Not authenticated</span>`;
  }
}

// Demo Data Seeder
async function seedDemoData() {
  try {
    await api('/api/demo/seed', { method: 'POST' });
    showToast('Demo data seeded successfully with realistic routes, shifts & incidents!', 'success');
    await loadAllData();
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
  if (state.currentTab === 'shifts') loadShiftsView();
  if (state.currentTab === 'incidents') loadIncidentsView();
  if (state.currentTab === 'ussd') loadUssdView();
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

// 1. Dashboard View
async function loadDashboard() {
  try {
    const status = await api('/api/demo/status');
    document.getElementById('metricVolunteers').innerText = status.counts.volunteers;
    document.getElementById('metricShifts').innerText = status.counts.shifts;
    document.getElementById('metricIncidents').innerText = status.counts.incidents;
    document.getElementById('metricSms').innerText = status.counts.sms;
  } catch {
    document.getElementById('metricVolunteers').innerText = state.volunteers.length;
    document.getElementById('metricShifts').innerText = state.shifts.length;
    document.getElementById('metricIncidents').innerText = state.incidents.length;
    document.getElementById('metricSms').innerText = state.smsLogs.length;
  }

  // Render recent shifts summary table
  const recentShiftsTbody = document.getElementById('recentShiftsTbody');
  if (recentShiftsTbody) {
    if (!state.shifts.length) {
      recentShiftsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No shifts scheduled. Click "Seed Demo Data" above.</td></tr>`;
    } else {
      recentShiftsTbody.innerHTML = state.shifts.slice(0, 5).map(s => `
        <tr>
          <td><strong>${s.route_name || 'Designated Route'}</strong></td>
          <td><span class="badge ${s.shift_type === 'walking_bus' ? 'badge-under_review' : 'badge-open'}">${s.shift_type.replace('_', ' ').toUpperCase()}</span></td>
          <td>${s.scheduled_date} &bull; ${s.start_time} - ${s.end_time}</td>
          <td>${s.assigned_count || 0} / ${s.max_volunteers}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="switchTab('shifts')">View Roster</button>
          </td>
        </tr>
      `).join('');
    }
  }

  // Render recent incidents table
  const recentIncidentsTbody = document.getElementById('recentIncidentsTbody');
  if (recentIncidentsTbody) {
    if (!state.incidents.length) {
      recentIncidentsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No incidents logged. System safe.</td></tr>`;
    } else {
      recentIncidentsTbody.innerHTML = state.incidents.slice(0, 5).map(inc => `
        <tr>
          <td><span class="badge badge-${inc.severity}">${inc.severity.toUpperCase()}</span></td>
          <td>${inc.incident_type}</td>
          <td>${inc.location || 'Not specified'}</td>
          <td><span class="badge badge-${inc.status}">${inc.status.replace('_', ' ')}</span></td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="switchTab('incidents')">Details</button>
          </td>
        </tr>
      `).join('');
    }
  }
}

// 2. Shifts & Routes View
async function loadShiftsView() {
  await Promise.all([loadRoutes(), loadShifts(), loadVolunteers()]);
  
  // Populate routes dropdown in shift form
  const routeSelect = document.getElementById('shiftRouteSelect');
  if (routeSelect) {
    routeSelect.innerHTML = '<option value="">-- Select Walking Route (Optional) --</option>' + 
      state.routes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  }

  // Render Routes List
  const routesList = document.getElementById('routesContainer');
  if (routesList) {
    if (!state.routes.length) {
      routesList.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">No walking routes defined. Use the form below or Seed Demo Data.</p>`;
    } else {
      routesList.innerHTML = state.routes.map(r => `
        <div class="card" style="background:var(--bg-input);margin-bottom:0.75rem;padding:1rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
            <h4 style="color:var(--brand-cyan);font-size:0.95rem">${r.name}</h4>
            <span class="badge badge-resolved">ACTIVE CORRIDOR</span>
          </div>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.4rem">${r.description || ''}</p>
          <div style="font-size:0.78rem;color:var(--text-muted)">
            <span>📍 Start: <strong>${r.start_point}</strong></span> &bull; <span>🏁 End: <strong>${r.end_point}</strong></span>
          </div>
        </div>
      `).join('');
    }
  }

  // Render Shifts Table
  const shiftsTbody = document.getElementById('shiftsFullTbody');
  if (shiftsTbody) {
    if (!state.shifts.length) {
      shiftsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No active shifts.</td></tr>`;
    } else {
      shiftsTbody.innerHTML = state.shifts.map(s => {
        const isFull = (s.assigned_count || 0) >= s.max_volunteers;
        return `
          <tr>
            <td><strong>${s.route_name || 'Designated Route'}</strong></td>
            <td><span class="badge ${s.shift_type === 'walking_bus' ? 'badge-under_review' : 'badge-open'}">${s.shift_type.replace('_', ' ').toUpperCase()}</span></td>
            <td>${s.scheduled_date}<br><small style="color:var(--text-muted)">${s.start_time} - ${s.end_time}</small></td>
            <td>
              <span class="badge ${isFull ? 'badge-medium' : 'badge-low'}">${s.assigned_count || 0} / ${s.max_volunteers} volunteers</span>
            </td>
            <td>${s.notes || '&mdash;'}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="openAssignModal(${s.id}, '${s.shift_type}')" ${isFull ? 'disabled' : ''}>
                ${isFull ? 'Full' : '+ Assign'}
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Render Volunteers Roster table
  const volunteersTbody = document.getElementById('volunteersTbody');
  if (volunteersTbody) {
    if (!state.volunteers.length) {
      volunteersTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No volunteer profiles found (requires Coordinator or Admin role).</td></tr>`;
    } else {
      volunteersTbody.innerHTML = state.volunteers.map(v => `
        <tr>
          <td><strong>${v.full_name}</strong><br><small style="color:var(--text-muted)">@${v.username}</small></td>
          <td>${v.phone || '&mdash;'}</td>
          <td>${v.skills || 'Walking escort'}</td>
          <td>${v.availability || 'Flexible'}</td>
          <td>
            <span class="badge ${v.background_checked ? 'badge-resolved' : 'badge-medium'}">
              ${v.background_checked ? '✅ Verified' : '⏳ Pending'}
            </span>
          </td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="sendVolunteerShiftReminder(${v.id}, '${v.phone}')">
              📲 SMS Reminder
            </button>
          </td>
        </tr>
      `).join('');
    }
  }
}

// Create Route
async function handleCreateRoute(e) {
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
    showToast('Safe walking route added!', 'success');
    document.getElementById('createRouteForm').reset();
    loadShiftsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Create Shift
async function handleCreateShift(e) {
  e.preventDefault();
  const route_id = document.getElementById('shiftRouteSelect').value || null;
  const shift_type = document.getElementById('shiftType').value;
  const scheduled_date = document.getElementById('shiftDate').value;
  const start_time = document.getElementById('shiftStart').value;
  const end_time = document.getElementById('shiftEnd').value;
  const max_volunteers = parseInt(document.getElementById('shiftMaxVolunteers').value, 10) || 2;
  const notes = document.getElementById('shiftNotes').value.trim();

  try {
    await api('/shifts', {
      method: 'POST',
      body: JSON.stringify({ route_id, shift_type, scheduled_date, start_time, end_time, max_volunteers, notes }),
    });
    showToast('Shift scheduled successfully!', 'success');
    document.getElementById('createShiftForm').reset();
    loadShiftsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Volunteer Assignment
let currentAssignShiftId = null;
function openAssignModal(shiftId, shiftType) {
  currentAssignShiftId = shiftId;
  const select = document.getElementById('assignVolunteerSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Choose Verified Volunteer --</option>' +
      state.volunteers.map(v => `<option value="${v.id}">${v.full_name} (${v.skills || 'Escort'})</option>`).join('');
  }
  document.getElementById('assignModal').classList.add('active');
}

function closeAssignModal() {
  document.getElementById('assignModal').classList.remove('active');
  currentAssignShiftId = null;
}

async function handleAssignVolunteer(e) {
  e.preventDefault();
  const volunteer_id = document.getElementById('assignVolunteerSelect').value;
  if (!volunteer_id || !currentAssignShiftId) {
    showToast('Please select a volunteer.', 'error');
    return;
  }
  try {
    await api(`/shifts/${currentAssignShiftId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ volunteer_id }),
    });
    showToast('Volunteer successfully assigned to shift roster!', 'success');
    closeAssignModal();
    loadShiftsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function sendVolunteerShiftReminder(volunteerId, phone) {
  try {
    await api(`/volunteers/${volunteerId}/notify-shift`, { method: 'POST' });
    showToast(`Shift reminder SMS sent to ${phone || 'volunteer'}!`, 'success');
    loadSmsLogs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 3. Safeguarding & Incident Desk View
async function loadIncidentsView() {
  await loadIncidents();
  const tbody = document.getElementById('incidentsFullTbody');
  if (!tbody) return;

  const isCoordOrAdmin = state.user && (state.user.role === 'coordinator' || state.user.role === 'admin');

  if (!state.incidents.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No safeguarding incidents reported. Safe routes operating normally.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.incidents.map(inc => {
    // If coordinator/admin, show details or fetch detail
    const detailsHtml = isCoordOrAdmin && inc.description
      ? `<div style="font-size:0.85rem">${inc.description}</div>${inc.involved_parties ? `<small style="color:var(--text-muted)">Parties: ${inc.involved_parties}</small>` : ''}`
      : `<span style="font-size:0.78rem;color:var(--text-muted)">🔒 AES-256-GCM Encrypted at rest (Coordinator+ clearance)</span>`;

    return `
      <tr>
        <td><strong>#${inc.id}</strong></td>
        <td><span class="badge badge-${inc.severity}">${inc.severity.toUpperCase()}</span></td>
        <td>${inc.incident_type}</td>
        <td>${inc.location || 'Route corridor'}</td>
        <td style="max-width:300px">${detailsHtml}</td>
        <td>
          <select class="form-control" style="padding:0.2rem 0.4rem;font-size:0.75rem;width:auto" onchange="updateIncidentStatus(${inc.id}, this.value)" ${isCoordOrAdmin ? '' : 'disabled'}>
            <option value="open" ${inc.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="under_review" ${inc.status === 'under_review' ? 'selected' : ''}>Under Review</option>
            <option value="resolved" ${inc.status === 'resolved' ? 'selected' : ''}>Resolved</option>
            <option value="escalated" ${inc.status === 'escalated' ? 'selected' : ''}>Escalated</option>
          </select>
        </td>
        <td style="font-size:0.75rem;color:var(--text-muted)">${new Date(inc.created_at).toLocaleDateString()}</td>
      </tr>
    `;
  }).join('');
}

async function handleReportIncident(e) {
  e.preventDefault();
  const incident_type = document.getElementById('incType').value;
  const severity = document.getElementById('incSeverity').value;
  const location = document.getElementById('incLocation').value.trim();
  const description = document.getElementById('incDesc').value.trim();
  const involved_parties = document.getElementById('incParties').value.trim();
  const safeguarding_referral = document.getElementById('incReferral').checked;

  try {
    await api('/incidents', {
      method: 'POST',
      body: JSON.stringify({
        incident_type,
        severity,
        location,
        description,
        involved_parties,
        safeguarding_referral,
      }),
    });
    showToast('Incident safely encrypted with AES-256-GCM and submitted!', 'success');
    document.getElementById('reportIncidentForm').reset();
    loadIncidentsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateIncidentStatus(incidentId, status) {
  try {
    await api(`/incidents/${incidentId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    showToast(`Incident #${incidentId} status updated to ${status.replace('_', ' ')}`, 'success');
    loadIncidentsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 4. USSD & SMS Simulator View
async function loadUssdView() {
  await loadSmsLogs();
  renderSmsOutbox();
}

function renderSmsOutbox() {
  const tbody = document.getElementById('smsOutboxTbody');
  if (!tbody) return;
  if (!state.smsLogs.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">SMS Outbox empty. Trigger safe arrival or shift reminders above.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.smsLogs.map(sms => `
    <tr>
      <td><code>${sms.recipient_phone}</code></td>
      <td style="font-size:0.82rem">${sms.message}</td>
      <td><span class="badge badge-under_review">${sms.notification_type}</span></td>
      <td><span class="badge badge-resolved">DELIVERED</span></td>
      <td style="font-size:0.75rem;color:var(--text-muted)">${new Date(sms.created_at).toLocaleTimeString()}</td>
    </tr>
  `).join('');
}

// Parent Safe Arrival SMS Trigger
async function handleSafeArrivalSMS(e) {
  e.preventDefault();
  const parent_phone = document.getElementById('arrivalPhone').value.trim();
  const child_name = document.getElementById('arrivalChildName').value.trim();
  const location = document.getElementById('arrivalLocation').value.trim();

  try {
    const res = await api('/sms/safe-arrival', {
      method: 'POST',
      body: JSON.stringify({ parent_phone, child_name, location }),
    });
    showToast(`Safe arrival SMS sent to parent (${parent_phone})!`, 'success');
    document.getElementById('safeArrivalForm').reset();
    await loadSmsLogs();
    renderSmsOutbox();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// USSD Keypad & Simulator Machine
async function submitUssdInput() {
  const inputEl = document.getElementById('ussdInput');
  const entered = inputEl.value.trim();
  inputEl.value = '';

  let newText = state.ussd.text ? `${state.ussd.text}*${entered}` : entered;
  state.ussd.text = newText;

  const screenEl = document.getElementById('ussdScreenContent');
  screenEl.innerText = 'Connecting to CMSR Gateway...\n';

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
    screenEl.innerText = textOutput;
    if (textOutput.startsWith('END')) {
      state.ussd.isEnded = true;
      document.getElementById('ussdInputRow').style.display = 'none';
      showToast('USSD session completed', 'info');
      await loadSmsLogs();
      renderSmsOutbox();
    }
  } catch {
    screenEl.innerText = 'Network timeout. Dial again.\n';
  }
}

function ussdKeypadPress(val) {
  const inputEl = document.getElementById('ussdInput');
  if (inputEl) inputEl.value += val;
}

function resetUssdSession() {
  state.ussd.sessionId = 'sess_' + Date.now();
  state.ussd.text = '';
  state.ussd.isEnded = false;
  state.ussd.screenText = 'CON Welcome to CMSR Volunteer Dispatch\n1. Confirm Shift Assignment\n2. Report Safe Route Arrival\n3. Report Urgent Issue\n4. Contact Coordinator';
  document.getElementById('ussdScreenContent').innerText = state.ussd.screenText;
  document.getElementById('ussdInputRow').style.display = 'flex';
  document.getElementById('ussdInput').value = '';
}

// Initialization on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  // Set default date in shift creation
  const shiftDateInput = document.getElementById('shiftDate');
  if (shiftDateInput) {
    shiftDateInput.value = new Date().toISOString().slice(0, 10);
  }

  // If no user, quick login as coordinator so portfolio demo is immediately interactive
  if (!state.user || !state.token) {
    await quickLogin('coordinator');
  } else {
    updateUserBar();
  }

  // Periodic health check
  checkHealth();
  setInterval(checkHealth, 30000);

  // Load initial data
  await loadAllData();
});

