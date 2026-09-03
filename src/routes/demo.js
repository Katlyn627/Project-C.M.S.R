'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { encrypt } = require('../services/encryption');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const DEMO_USERS = [
  { username: 'coord_sarah', password: 'password123', role: 'coordinator', full_name: 'Sarah Kintu (Lead Coordinator)', phone: '+256701234567' },
  { username: 'vol_amara', password: 'password123', role: 'volunteer', full_name: 'Amara Okafor (Escort Volunteer)', phone: '+256707654321' },
  { username: 'admin_elena', password: 'password123', role: 'admin', full_name: 'Elena Rostova (System Director)', phone: '+155510001' },
  { username: 'viewer_guest', password: 'password123', role: 'viewer', full_name: 'Community Observer (Viewer)', phone: '+256700000000' },
];

function seedDatabase(db) {
  // 1. Seed users
  const userIds = {};
  for (const u of DEMO_USERS) {
    let existing = db.prepare('SELECT id, role, full_name FROM users WHERE username = ?').get(u.username);
    if (!existing) {
      const hash = bcrypt.hashSync(u.password, 10);
      const res = db.prepare(
        'INSERT INTO users (username, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)'
      ).run(u.username, hash, u.role, u.full_name, u.phone);
      userIds[u.role] = res.lastInsertRowid;
    } else {
      userIds[u.role] = existing.id;
    }
  }

  // 2. Seed Volunteers
  const volUser = db.prepare("SELECT id FROM users WHERE role = 'volunteer' LIMIT 1").get();
  if (volUser) {
    const existingVol = db.prepare('SELECT id FROM volunteers WHERE user_id = ?').get(volUser.id);
    if (!existingVol) {
      db.prepare(`
        INSERT INTO volunteers (user_id, skills, availability, background_checked, active)
        VALUES (?, 'Walking Bus Escort, First Aid certified', 'Mon-Fri 06:30-08:30, 15:30-17:30', 1, 1)
      `).run(volUser.id);
    }
  }

  // 3. Seed Routes
  const existingRoute = db.prepare('SELECT id FROM routes LIMIT 1').get();
  let route1Id = 1;
  let route2Id = 2;
  if (!existingRoute) {
    const r1 = db.prepare(`
      INSERT INTO routes (name, description, start_point, end_point, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(
      'Route 1: Central Transit Hub → St. Mary Girls High School',
      'Monitored 2.4km pedestrian corridor with 3 designated safe-crossing checkpoints and volunteer chaperone stations.',
      'Central Transit Hub (Gate 2)',
      'St. Mary Girls High School'
    );
    route1Id = r1.lastInsertRowid;

    const r2 = db.prepare(`
      INSERT INTO routes (name, description, start_point, end_point, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(
      'Route 2: East River Settlement → Community Youth Center',
      'Community walking-bus path avoiding highway bypass; includes lighting checkpoints and peer mentor check-in.',
      'East River Settlement Park',
      'Hope Community Youth Center'
    );
    route2Id = r2.lastInsertRowid;
  }

  // 4. Seed Shifts
  const existingShift = db.prepare('SELECT id FROM shifts LIMIT 1').get();
  if (!existingShift) {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const s1 = db.prepare(`
      INSERT INTO shifts (route_id, shift_type, scheduled_date, start_time, end_time, max_volunteers, notes)
      VALUES (?, 'walking_bus', ?, '07:00', '08:30', 3, 'Morning walking bus escort for primary and secondary students.')
    `).run(route1Id, today);

    db.prepare(`
      INSERT INTO shifts (route_id, shift_type, scheduled_date, start_time, end_time, max_volunteers, notes)
      VALUES (?, 'tutoring', ?, '15:30', '17:30', 2, 'After-school STEM mentorship and homework assistance.')
    `).run(route2Id, today);

    db.prepare(`
      INSERT INTO shifts (route_id, shift_type, scheduled_date, start_time, end_time, max_volunteers, notes)
      VALUES (?, 'walking_bus', ?, '07:00', '08:30', 2, 'Scheduled morning safe route coverage.')
    `).run(route2Id, tomorrow);

    // Assign volunteer to shift 1
    const vol = db.prepare('SELECT id FROM volunteers LIMIT 1').get();
    if (vol) {
      db.prepare(`
        INSERT OR IGNORE INTO shift_assignments (shift_id, volunteer_id, status)
        VALUES (?, ?, 'confirmed')
      `).run(s1.lastInsertRowid, vol.id);
    }
  }

  // 5. Seed Incidents with AES-256-GCM encryption
  const existingIncident = db.prepare('SELECT id FROM incidents LIMIT 1').get();
  if (!existingIncident) {
    const reporter = db.prepare("SELECT id FROM users WHERE role = 'volunteer' LIMIT 1").get() || { id: 1 };
    
    const inc1Desc = encrypt('Suspicious silver sedan idling near the footbridge assembly point during morning walking bus. Chaperones redirected students via Market Road safely.');
    const inc1Parties = encrypt('Silver sedan, unknown male driver');
    db.prepare(`
      INSERT INTO incidents (reported_by, incident_type, severity, location, involved_parties_enc, description_enc, safeguarding_referral, status)
      VALUES (?, 'suspicious_activity', 'medium', 'Market Footbridge, Checkpoint B', ?, ?, 0, 'under_review')
    `).run(reporter.id, inc1Parties, inc1Desc);

    const inc2Desc = encrypt('Broken streetlight and uneven pavement near railway crossing reported by student group. Coordinator notified local municipal ward.');
    db.prepare(`
      INSERT INTO incidents (reported_by, incident_type, severity, location, involved_parties_enc, description_enc, safeguarding_referral, status)
      VALUES (?, 'route_hazard', 'low', 'Railway Crossing, North Gate', NULL, ?, 0, 'resolved')
    `).run(reporter.id, inc2Desc);
  }

  // 6. Seed SMS notifications
  const existingSms = db.prepare('SELECT id FROM sms_notifications LIMIT 1').get();
  if (!existingSms) {
    db.prepare(`
      INSERT INTO sms_notifications (recipient_phone, message, notification_type, status, sent_at)
      VALUES (?, ?, 'safe_arrival', 'sent', datetime('now', '-30 minutes'))
    `).run(
      '+256712345678',
      'SAFE ARRIVAL: Your student Amara arrived safely at St. Mary Girls High School at 08:15. Supervised by CMSR Walking-Bus Escort Team.'
    );

    db.prepare(`
      INSERT INTO sms_notifications (recipient_phone, message, notification_type, status, sent_at)
      VALUES (?, ?, 'shift_reminder', 'sent', datetime('now', '-2 hours'))
    `).run(
      '+256707654321',
      'CMSR Shift Reminder: You are rostered for Route 1 Walking-Bus tomorrow at 07:00 AM. Reply 1 to confirm.'
    );
  }
}

// GET /api/demo/status
router.get('/status', (req, res) => {
  try {
    const db = getDb();
    const counts = {
      users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      volunteers: db.prepare('SELECT COUNT(*) as count FROM volunteers').get().count,
      routes: db.prepare('SELECT COUNT(*) as count FROM routes').get().count,
      shifts: db.prepare('SELECT COUNT(*) as count FROM shifts').get().count,
      incidents: db.prepare('SELECT COUNT(*) as count FROM incidents').get().count,
      sms: db.prepare('SELECT COUNT(*) as count FROM sms_notifications').get().count,
    };
    res.json({
      status: 'ok',
      seeded: counts.routes > 0,
      counts,
      demoAccounts: DEMO_USERS.map(u => ({ username: u.username, role: u.role, full_name: u.full_name })),
    });
  } catch (err) {
    console.error('DEMO STATUS ERROR:', err);
    res.status(500).json({ error: err.message, status: 'error' });
  }
});

// POST /api/demo/seed
router.post('/seed', (req, res) => {
  try {
    const db = getDb();
    seedDatabase(db);
    res.json({ success: true, message: 'Demo data seeded successfully' });
  } catch (err) {
    console.error('DEMO SEED ERROR:', err);
    res.status(500).json({ error: err.message, success: false });
  }
});

// POST /api/demo/quick-login - Instant 1-click token for portfolio demo
router.post('/quick-login', (req, res) => {
  try {
    const { role } = req.body;
    const db = getDb();
    seedDatabase(db); // ensure accounts exist

    const targetRole = role || 'coordinator';
    const user = db.prepare('SELECT * FROM users WHERE role = ? ORDER BY id ASC LIMIT 1').get(targetRole);

    if (!user) {
      return res.status(404).json({ error: `No demo user found with role ${targetRole}` });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error('QUICK LOGIN ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

