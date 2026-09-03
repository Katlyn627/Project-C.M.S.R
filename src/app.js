'use strict';

const express = require('express');
const authRoutes = require('./routes/auth');
const volunteerRoutes = require('./routes/volunteers');
const shiftRoutes = require('./routes/shifts');
const incidentRoutes = require('./routes/incidents');
const smsRoutes = require('./routes/sms');

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'CMSR' }));

  app.use('/auth', authRoutes);
  app.use('/volunteers', volunteerRoutes);
  app.use('/shifts', shiftRoutes);
  app.use('/incidents', incidentRoutes);
  app.use('/sms', smsRoutes);

  // 404 handler
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
