'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const volunteerRoutes = require('./routes/volunteers');
const shiftRoutes = require('./routes/shifts');
const incidentRoutes = require('./routes/incidents');
const smsRoutes = require('./routes/sms');

// Strict limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'CMSR' }));

  app.use('/auth', authLimiter, authRoutes);
  app.use('/volunteers', apiLimiter, volunteerRoutes);
  app.use('/shifts', apiLimiter, shiftRoutes);
  app.use('/incidents', apiLimiter, incidentRoutes);
  app.use('/sms', apiLimiter, smsRoutes);

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
