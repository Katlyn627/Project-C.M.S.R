'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { sendSms, notifyParentSafeArrival } = require('../services/sms');

const router = express.Router();

// GET /sms - list notification history (admin/coordinator)
router.get('/', authenticate, authorize('admin', 'coordinator'), (req, res) => {
  const db = getDb();
  const { type, status } = req.query;
  let query = 'SELECT * FROM sms_notifications WHERE 1=1';
  const params = [];
  if (type) { query += ' AND notification_type = ?'; params.push(type); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC LIMIT 100';
  res.json(db.prepare(query).all(...params));
});

// POST /sms/safe-arrival - trigger safe arrival notification to parent
router.post('/safe-arrival', authenticate, authorize('admin', 'coordinator', 'volunteer'), (req, res) => {
  const { parent_phone, child_name, location } = req.body;
  if (!parent_phone || !child_name || !location) {
    return res.status(400).json({ error: 'parent_phone, child_name, and location are required' });
  }
  const result = notifyParentSafeArrival(parent_phone, child_name, location);
  res.json(result);
});

// POST /sms/custom - send custom SMS (admin only)
router.post('/custom', authenticate, authorize('admin'), (req, res) => {
  const { phone, message, notification_type } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }
  const result = sendSms(phone, message, notification_type || 'custom');
  res.json(result);
});

// POST /sms/ussd-hook - USSD callback hook (simulates inbound USSD session)
router.post('/ussd-hook', (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  if (!sessionId || !phoneNumber) {
    return res.status(400).json({ error: 'sessionId and phoneNumber are required' });
  }

  // Simple USSD menu simulation
  const level = text ? text.split('*').length : 0;
  let response = '';

  if (!text || text === '') {
    response = 'CON Welcome to CMSR\n1. Confirm shift\n2. Report issue\n3. Safe arrival';
  } else if (text === '1') {
    response = 'END Your shift has been confirmed. Thank you!';
  } else if (text === '2') {
    response = 'END Your report has been received. A coordinator will contact you.';
  } else if (text === '3') {
    response = 'END Safe arrival logged. Parents/guardians have been notified.';
  } else {
    response = 'END Invalid option. Please try again.';
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

module.exports = router;
