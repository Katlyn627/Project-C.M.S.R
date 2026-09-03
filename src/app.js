const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const volunteerRoutes = require('./routes/volunteers');
const shiftRoutes = require('./routes/shifts');
const incidentRoutes = require('./routes/incidents');
const smsRoutes = require('./routes/sms');
const demoRoutes = require('./routes/demo');

// Strict limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

function createApp() {
  const app = express();
  app.use(express.json());

  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir, { index: false }));

  app.get('/', (req, res) => {
    if (req.accepts('html')) {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    return res.json({
      name: 'Project C.M.S.R',
      description: 'Community Mentorship & Safe Route Volunteer Coordinator API',
      status: 'online',
      version: '1.0.0',
      health: '/health',
      documentation: 'https://github.com/Katlyn627/Project-C.M.S.R'
    });
  });

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'CMSR' }));

  app.use('/auth', authLimiter, authRoutes);
  app.use('/volunteers', apiLimiter, volunteerRoutes);
  app.use('/shifts', apiLimiter, shiftRoutes);
  app.use('/incidents', apiLimiter, incidentRoutes);
  app.use('/sms', apiLimiter, smsRoutes);
  app.use('/api/demo', apiLimiter, demoRoutes);

  // 404 handler for API routes
  app.use((req, res) => {
    if (req.accepts('html')) {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
