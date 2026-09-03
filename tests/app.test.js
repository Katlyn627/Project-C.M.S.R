'use strict';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join('/tmp', 'cmsr-test-' + Date.now() + '.db');
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'test-secret';

const { createApp } = require('../src/app');
const { closeDb } = require('../src/db/database');

const app = createApp();

afterAll(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

function bearer(token) {
  return 'Bearer ' + token;
}

describe('Health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth', () => {
  it('registers a new user', async () => {
    const res = await request(app).post('/auth/register').send({
      username: 'coord1', password: 'pass123', role: 'coordinator', full_name: 'Coord One', phone: '+1111111111'
    });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('coordinator');
  });

  it('rejects duplicate username', async () => {
    await request(app).post('/auth/register').send({
      username: 'dup', password: 'pass', role: 'volunteer', full_name: 'Dup User'
    });
    const res = await request(app).post('/auth/register').send({
      username: 'dup', password: 'pass', role: 'volunteer', full_name: 'Dup User'
    });
    expect(res.status).toBe(409);
  });

  it('logs in and returns a token', async () => {
    await request(app).post('/auth/register').send({
      username: 'voluser', password: 'secret', role: 'volunteer', full_name: 'Vol User'
    });
    const res = await request(app).post('/auth/login').send({ username: 'voluser', password: 'secret' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects bad credentials', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'noone', password: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('Volunteers', () => {
  let coordToken, volToken, volUserId;

  beforeAll(async () => {
    await request(app).post('/auth/register').send({
      username: 'coord2', password: 'pass', role: 'coordinator', full_name: 'Coord Two', phone: '+2222222222'
    });
    const lc = await request(app).post('/auth/login').send({ username: 'coord2', password: 'pass' });
    coordToken = lc.body.token;

    const rv = await request(app).post('/auth/register').send({
      username: 'vol2', password: 'pass', role: 'volunteer', full_name: 'Vol Two', phone: '+3333333333'
    });
    volUserId = rv.body.id;
    const lv = await request(app).post('/auth/login').send({ username: 'vol2', password: 'pass' });
    volToken = lv.body.token;
  });

  it('coordinator can create volunteer profile', async () => {
    const res = await request(app)
      .post('/volunteers')
      .set('Authorization', bearer(coordToken))
      .send({ user_id: volUserId, skills: 'tutoring', background_checked: true });
    expect(res.status).toBe(201);
  });

  it('coordinator can list volunteers', async () => {
    const res = await request(app)
      .get('/volunteers')
      .set('Authorization', bearer(coordToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('volunteer cannot list all volunteers', async () => {
    const res = await request(app)
      .get('/volunteers')
      .set('Authorization', bearer(volToken));
    expect(res.status).toBe(403);
  });
});

describe('Shifts & Routes', () => {
  let coordToken;

  beforeAll(async () => {
    await request(app).post('/auth/register').send({
      username: 'coord3', password: 'pass', role: 'coordinator', full_name: 'Coord Three'
    });
    const lc = await request(app).post('/auth/login').send({ username: 'coord3', password: 'pass' });
    coordToken = lc.body.token;
  });

  it('creates a route', async () => {
    const res = await request(app)
      .post('/shifts/routes')
      .set('Authorization', bearer(coordToken))
      .send({ name: 'Route A', start_point: 'Market St', end_point: 'School Rd' });
    expect(res.status).toBe(201);
  });

  it('lists routes', async () => {
    const res = await request(app)
      .get('/shifts/routes/list')
      .set('Authorization', bearer(coordToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('creates a shift', async () => {
    const res = await request(app)
      .post('/shifts')
      .set('Authorization', bearer(coordToken))
      .send({
        shift_type: 'walking_bus',
        scheduled_date: '2025-01-15',
        start_time: '07:00',
        end_time: '08:00',
        max_volunteers: 3,
      });
    expect(res.status).toBe(201);
  });

  it('lists shifts', async () => {
    const res = await request(app)
      .get('/shifts')
      .set('Authorization', bearer(coordToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('Incidents', () => {
  let coordToken, volToken, incidentId;

  beforeAll(async () => {
    await request(app).post('/auth/register').send({
      username: 'coord4', password: 'pass', role: 'coordinator', full_name: 'Coord Four', phone: '+4444444444'
    });
    const lc = await request(app).post('/auth/login').send({ username: 'coord4', password: 'pass' });
    coordToken = lc.body.token;

    await request(app).post('/auth/register').send({
      username: 'vol4', password: 'pass', role: 'volunteer', full_name: 'Vol Four'
    });
    const lv = await request(app).post('/auth/login').send({ username: 'vol4', password: 'pass' });
    volToken = lv.body.token;
  });

  it('volunteer can report an incident', async () => {
    const res = await request(app)
      .post('/incidents')
      .set('Authorization', bearer(volToken))
      .send({
        incident_type: 'harassment',
        severity: 'medium',
        location: 'Route A, near market',
        description: 'Witness reported verbal harassment near the bus stop.',
        involved_parties: 'Unknown adult male',
      });
    expect(res.status).toBe(201);
    incidentId = res.body.id;
  });

  it('coordinator can view all incidents', async () => {
    const res = await request(app)
      .get('/incidents')
      .set('Authorization', bearer(coordToken));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('coordinator can view decrypted incident details', async () => {
    const res = await request(app)
      .get('/incidents/' + incidentId)
      .set('Authorization', bearer(coordToken));
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Witness reported verbal harassment near the bus stop.');
    expect(res.body.involved_parties).toBe('Unknown adult male');
  });

  it('volunteer cannot see decrypted details of own incident', async () => {
    const res = await request(app)
      .get('/incidents/' + incidentId)
      .set('Authorization', bearer(volToken));
    expect(res.status).toBe(200);
    expect(res.body.description).toBeUndefined();
  });

  it('coordinator can update incident status', async () => {
    const res = await request(app)
      .put('/incidents/' + incidentId + '/status')
      .set('Authorization', bearer(coordToken))
      .send({ status: 'under_review' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('SMS / USSD', () => {
  let coordToken;

  beforeAll(async () => {
    await request(app).post('/auth/register').send({
      username: 'coord5', password: 'pass', role: 'coordinator', full_name: 'Coord Five', phone: '+5555555555'
    });
    const lc = await request(app).post('/auth/login').send({ username: 'coord5', password: 'pass' });
    coordToken = lc.body.token;
  });

  it('sends safe arrival notification', async () => {
    const res = await request(app)
      .post('/sms/safe-arrival')
      .set('Authorization', bearer(coordToken))
      .send({ parent_phone: '+9990000001', child_name: 'Amara', location: 'School' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
  });

  it('USSD hook returns main menu', async () => {
    const res = await request(app)
      .post('/sms/ussd-hook')
      .send({ sessionId: 'sess1', phoneNumber: '+9990000002', text: '' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('CON Welcome to CMSR');
  });

  it('USSD hook handles shift confirm', async () => {
    const res = await request(app)
      .post('/sms/ussd-hook')
      .send({ sessionId: 'sess2', phoneNumber: '+9990000003', text: '1' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('END');
    expect(res.text).toContain('confirmed');
  });

  it('coordinator can list SMS log', async () => {
    const res = await request(app)
      .get('/sms')
      .set('Authorization', bearer(coordToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
