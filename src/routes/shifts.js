'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /shifts - list shifts (with optional filters)
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { date, type, route_id } = req.query;
  let query = `
    SELECT s.id, s.route_id, r.name AS route_name, s.shift_type, s.scheduled_date,
           s.start_time, s.end_time, s.max_volunteers, s.notes, s.created_at,
           COUNT(sa.id) AS assigned_count
    FROM shifts s
    LEFT JOIN routes r ON r.id = s.route_id
    LEFT JOIN shift_assignments sa ON sa.shift_id = s.id AND sa.status != 'cancelled'
    WHERE 1=1
  `;
  const params = [];
  if (date) { query += ' AND s.scheduled_date = ?'; params.push(date); }
  if (type) { query += ' AND s.shift_type = ?'; params.push(type); }
  if (route_id) { query += ' AND s.route_id = ?'; params.push(route_id); }
  query += ' GROUP BY s.id ORDER BY s.scheduled_date, s.start_time';
  res.json(db.prepare(query).all(...params));
});

// GET /shifts/:id/roster - get volunteer roster for a shift
router.get('/:id/roster', authenticate, (req, res) => {
  const db = getDb();
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  const assignments = db.prepare(`
    SELECT sa.id, sa.status, sa.assigned_at, v.id AS volunteer_id, u.full_name, u.phone
    FROM shift_assignments sa
    JOIN volunteers v ON v.id = sa.volunteer_id
    JOIN users u ON u.id = v.user_id
    WHERE sa.shift_id = ?
    ORDER BY u.full_name
  `).all(req.params.id);
  res.json({ shift, assignments });
});

// POST /shifts - create shift (coordinator+)
router.post('/', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const { route_id, shift_type, scheduled_date, start_time, end_time, max_volunteers, notes } = req.body;
  if (!shift_type || !scheduled_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'shift_type, scheduled_date, start_time, end_time are required' });
  }
  const allowedTypes = ['walking_bus', 'tutoring', 'mentorship'];
  if (!allowedTypes.includes(shift_type)) {
    return res.status(400).json({ error: `shift_type must be one of: ${allowedTypes.join(', ')}` });
  }
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO shifts (route_id, shift_type, scheduled_date, start_time, end_time, max_volunteers, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(route_id || null, shift_type, scheduled_date, start_time, end_time, max_volunteers || 2, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// POST /shifts/:id/assign - assign volunteer to shift
router.post('/:id/assign', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const { volunteer_id } = req.body;
  if (!volunteer_id) return res.status(400).json({ error: 'volunteer_id is required' });
  const db = getDb();
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  const vol = db.prepare('SELECT id FROM volunteers WHERE id = ? AND active = 1').get(volunteer_id);
  if (!vol) return res.status(404).json({ error: 'Active volunteer not found' });
  // Check capacity
  const count = db.prepare(
    "SELECT COUNT(*) as cnt FROM shift_assignments WHERE shift_id = ? AND status != 'cancelled'"
  ).get(req.params.id);
  if (count.cnt >= shift.max_volunteers) {
    return res.status(400).json({ error: 'Shift is at full capacity' });
  }
  try {
    const result = db.prepare(
      'INSERT INTO shift_assignments (shift_id, volunteer_id) VALUES (?, ?)'
    ).run(req.params.id, volunteer_id);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Volunteer already assigned to this shift' });
    }
    throw e;
  }
});

// PUT /shifts/:id/assignments/:aid - update assignment status
router.put('/:id/assignments/:aid', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const { status } = req.body;
  const allowed = ['assigned', 'confirmed', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const db = getDb();
  const result = db.prepare(
    'UPDATE shift_assignments SET status = ? WHERE id = ? AND shift_id = ?'
  ).run(status, req.params.aid, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Assignment not found' });
  res.json({ success: true });
});

// GET /shifts/routes - list walking routes
router.get('/routes/list', authenticate, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM routes WHERE active = 1 ORDER BY name').all());
});

// POST /shifts/routes - create route (coordinator+)
router.post('/routes', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const { name, description, start_point, end_point } = req.body;
  if (!name || !start_point || !end_point) {
    return res.status(400).json({ error: 'name, start_point, end_point are required' });
  }
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO routes (name, description, start_point, end_point) VALUES (?, ?, ?, ?)'
  ).run(name, description || null, start_point, end_point);
  res.status(201).json({ id: result.lastInsertRowid });
});

module.exports = router;
