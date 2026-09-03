'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/encryption');
const { notifyCoordinatorIncident } = require('../services/sms');

const router = express.Router();

// POST /incidents - report incident (any authenticated user)
router.post('/', authenticate, (req, res) => {
  const { incident_type, severity, location, involved_parties, description, safeguarding_referral } = req.body;
  if (!incident_type || !severity || !description) {
    return res.status(400).json({ error: 'incident_type, severity, and description are required' });
  }
  const allowedSeverity = ['low', 'medium', 'high', 'critical'];
  if (!allowedSeverity.includes(severity)) {
    return res.status(400).json({ error: `severity must be one of: ${allowedSeverity.join(', ')}` });
  }

  // Encrypt sensitive fields per child protection standards
  const descEnc = encrypt(description);
  const partiesEnc = involved_parties ? encrypt(involved_parties) : null;

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO incidents (reported_by, incident_type, severity, location, involved_parties_enc,
                           description_enc, safeguarding_referral)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, incident_type, severity, location || null, partiesEnc, descEnc,
    safeguarding_referral ? 1 : 0
  );

  const incidentId = result.lastInsertRowid;

  // Notify coordinators/admins via SMS if high/critical
  if (severity === 'high' || severity === 'critical') {
    const coordinators = db.prepare(
      "SELECT phone FROM users WHERE role IN ('admin','coordinator') AND phone IS NOT NULL"
    ).all();
    coordinators.forEach(c => notifyCoordinatorIncident(c.phone, incidentId, severity));
  }

  res.status(201).json({ id: incidentId, status: 'open' });
});

// GET /incidents - list incidents (admin/coordinator see all; volunteer/viewer see own)
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  let rows;
  if (['admin', 'coordinator'].includes(req.user.role)) {
    rows = db.prepare(`
      SELECT i.id, i.reported_by, u.full_name AS reporter_name, i.incident_type, i.severity,
             i.location, i.safeguarding_referral, i.status, i.created_at, i.updated_at
      FROM incidents i JOIN users u ON u.id = i.reported_by
      ORDER BY i.created_at DESC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT id, incident_type, severity, location, safeguarding_referral, status, created_at, updated_at
      FROM incidents WHERE reported_by = ?
      ORDER BY created_at DESC
    `).all(req.user.id);
  }
  res.json(rows);
});

// GET /incidents/:id - get full incident details (admin/coordinator only get decrypted)
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  // Volunteers can only view their own incidents
  if (!['admin', 'coordinator'].includes(req.user.role) && incident.reported_by !== req.user.id) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  // Decrypt sensitive fields only for admin/coordinator
  const result = {
    id: incident.id,
    reported_by: incident.reported_by,
    incident_type: incident.incident_type,
    severity: incident.severity,
    location: incident.location,
    safeguarding_referral: incident.safeguarding_referral,
    status: incident.status,
    created_at: incident.created_at,
    updated_at: incident.updated_at,
  };

  if (['admin', 'coordinator'].includes(req.user.role)) {
    result.description = decrypt(incident.description_enc);
    result.involved_parties = incident.involved_parties_enc ? decrypt(incident.involved_parties_enc) : null;
  }

  res.json(result);
});

// PUT /incidents/:id/status - update incident status (coordinator+)
router.put('/:id/status', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const { status } = req.body;
  const allowed = ['open', 'under_review', 'resolved', 'escalated'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const db = getDb();
  const result = db.prepare(
    "UPDATE incidents SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Incident not found' });
  res.json({ success: true });
});

module.exports = router;
