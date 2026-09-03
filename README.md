# Project C.M.S.R — Community Mentorship & Safe Route Volunteer Coordinator

A coordination platform connecting community volunteers (walking escorts, after-school tutors, mentors) with local youth centers and schools to improve safety and access to secondary education for girls.

## Features

### 1. Volunteer Dispatch & Shift Rosters
- Low-data REST API for managing weekly walking-bus routes and mentorship sessions.
- Role-based access: admins and coordinators manage rosters; volunteers view their assignments.
- Route management (start/end points, descriptions).
- Shift types: `walking_bus`, `tutoring`, `mentorship`.
- Volunteer assignment with capacity enforcement.

### 2. Safeguarding & Incident Reporting
- Any authenticated user can report incidents.
- Sensitive fields (`description`, `involved_parties`) are **AES-256-GCM encrypted** at rest.
- Only coordinators and admins can view decrypted incident details (role-based access).
- Incident statuses: `open` → `under_review` → `resolved` / `escalated`.
- Automatic SMS alert to coordinators/admins for `high` and `critical` severity incidents.

### 3. SMS/USSD Integration (Mock)
- Mock SMS service logs all notifications to the database and prints to console.
- Trigger types: `shift_reminder`, `safe_arrival`, `incident_alert`, `custom`.
- USSD callback endpoint (`POST /sms/ussd-hook`) simulates inbound USSD sessions (confirm shift, report issue, safe arrival).
- Replace the mock `sendSms` function in `src/services/sms.js` with a real gateway (e.g. Africa's Talking) for production.

## Roles

| Role         | Permissions                                              |
|--------------|----------------------------------------------------------|
| `admin`      | Full access                                              |
| `coordinator`| Manage volunteers, shifts, routes, view all incidents    |
| `volunteer`  | Report incidents, confirm shifts, trigger safe arrival   |
| `viewer`     | Read-only access to own data                             |

## Getting Started

```bash
npm install
npm start        # runs on port 3000 (set PORT env var to override)
npm test         # run all tests
```

### Environment Variables

| Variable          | Default                        | Description                                 |
|-------------------|--------------------------------|---------------------------------------------|
| `PORT`            | `3000`                         | HTTP port                                   |
| `DB_PATH`         | `data/cmsr.db`                 | SQLite database file path                   |
| `JWT_SECRET`      | *(insecure default)*           | JWT signing secret — **change in production** |
| `ENCRYPTION_KEY`  | *(derived from default string)*| 64-char hex key for AES-256-GCM — **change in production** |

## API Overview

| Method | Endpoint                         | Description                        |
|--------|----------------------------------|------------------------------------|
| POST   | `/auth/register`                 | Register a user                    |
| POST   | `/auth/login`                    | Login, returns JWT                 |
| GET    | `/volunteers`                    | List volunteers (coord+)           |
| POST   | `/volunteers`                    | Create volunteer profile           |
| POST   | `/volunteers/:id/notify-shift`   | SMS shift reminder                 |
| GET    | `/shifts`                        | List shifts                        |
| POST   | `/shifts`                        | Create shift                       |
| GET    | `/shifts/:id/roster`             | Get shift roster                   |
| POST   | `/shifts/:id/assign`             | Assign volunteer to shift          |
| GET    | `/shifts/routes/list`            | List walking routes                |
| POST   | `/shifts/routes`                 | Create route                       |
| POST   | `/incidents`                     | Report incident                    |
| GET    | `/incidents`                     | List incidents                     |
| GET    | `/incidents/:id`                 | Get incident details (decrypted for coord+) |
| PUT    | `/incidents/:id/status`          | Update incident status             |
| POST   | `/sms/safe-arrival`              | Notify parent of safe arrival      |
| POST   | `/sms/ussd-hook`                 | USSD session callback              |
| GET    | `/sms`                           | List SMS notification log          |
