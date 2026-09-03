'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { notifyVolunteerShiftReminder } = require('../services/sms');

const router = express.Router();

// GET /volunteers - list all volunteers (coordinator+)
router.get('/', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT v.id, v.user_id, u.full_name, u.phone, v.skills, v.availability,
           v.background_checked, v.active, v.created_at
    FROM volunteers v
    JOIN users u ON u.id = v.user_id
    ORDER BY u.full_name
  `).all();
  res.json(rows);
});

// GET /volunteers/:id
router.get('/:id', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT v.id, v.user_id, u.full_name, u.phone, v.skills, v.availability,
           v.background_checked, v.active, v.created_at
    FROM volunteers v
    JOIN users u ON u.id = v.user_id
    WHERE v.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Volunteer not found' });
  res.json(row);
});

// POST /volunteers - register volunteer profile (admin/coordinator)
router.post('/', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const { user_id, skills, availability, background_checked } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const existing = db.prepare('SELECT id FROM volunteers WHERE user_id = ?').get(user_id);
  if (existing) return res.status(409).json({ error: 'Volunteer profile already exists for this user' });
  const result = db.prepare(
    'INSERT INTO volunteers (user_id, skills, availability, background_checked) VALUES (?, ?, ?, ?)'
  ).run(user_id, skills || null, availability || null, background_checked ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /volunteers/:id - update volunteer
router.put('/:id', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const { skills, availability, background_checked, active } = req.body;
  const db = getDb();
  const vol = db.prepare('SELECT id FROM volunteers WHERE id = ?').get(req.params.id);
  if (!vol) return res.status(404).json({ error: 'Volunteer not found' });
  db.prepare(`
    UPDATE volunteers SET skills = ?, availability = ?, background_checked = ?, active = ?
    WHERE id = ?
  `).run(
    skills !== undefined ? skills : null,
    availability !== undefined ? availability : null,
    background_checked !== undefined ? (background_checked ? 1 : 0) : 0,
    active !== undefined ? (active ? 1 : 0) : 1,
    req.params.id
  );
  res.json({ success: true });
});

// POST /volunteers/:id/notify-shift - send SMS reminder for a shift
router.post('/:id/notify-shift', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const { shift_id } = req.body;
  if (!shift_id) return res.status(400).json({ error: 'shift_id is required' });
  const db = getDb();
  const vol = db.prepare(`
    SELECT v.id, u.phone FROM volunteers v JOIN users u ON u.id = v.user_id WHERE v.id = ?
  `).get(req.params.id);
  if (!vol) return res.status(404).json({ error: 'Volunteer not found' });
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift_id);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (!vol.phone) return res.status(400).json({ error: 'Volunteer has no phone number' });
  const result = notifyVolunteerShiftReminder(vol, shift);
  res.json(result);
});

module.exports = router;
