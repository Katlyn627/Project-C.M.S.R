# Project C.M.S.R. — Community-Monitored Safe Routes & Safeguarding Platform

[![Render Deploy](https://img.shields.io/badge/Render-Live%20Deployment-00b894?logo=render&logoColor=white)](https://project-cmsr.onrender.com)
[![Data Security](https://img.shields.io/badge/Security-AES--256--GCM%20Encrypted-0984e3)](https://project-cmsr.onrender.com)
[![Architecture](https://img.shields.io/badge/Engine-Zero--Dependency%20Pure%20JS-6c5ce7)](#architecture)
[![Telecom](https://img.shields.io/badge/Telecom-USSD%20%26%20SMS%20Gateway-e17055)](#last-mile-telecom)
[![License: ISC](https://img.shields.io/badge/License-ISC-2d3436.svg)](LICENSE)

> **Live Production Application**: **[https://project-cmsr.onrender.com](https://project-cmsr.onrender.com)**  
> *A civic safeguarding and field dispatch platform coordinating community walking buses, chaperone rosters, hardware-grade encrypted incident triage, and last-mile telecom notifications for vulnerable students traveling to secondary school.*

---

## 📖 Mission & Problem Statement

In underserved settlements and peri-urban corridors across developing regions, long pedestrian commutes to school expose adolescent girls to street harassment, hazardous transit crossings, and elevated drop-out risks. 

**Project C.M.S.R. (Community-Monitored Safe Routes)** mobilizes vetted local volunteers into structured **"Walking Buses"**—supervised pedestrian convoys that shepherd cohorts along mapped, verified safe corridors with designated commercial refuge points ("Safe Havens"). 

Crucially, because last-mile communities often lack reliable internet or smartphones, CMSR bridges the digital divide through **dual-interface architecture**:
1. **Civic Web Dispatch Console**: Real-time dispatch boards, chaperone rosters, and cryptographic safeguarding incident desk for program supervisors.
2. **Feature-Phone Telecom Fallback**: USSD menu (`*384*100#`) and automated SMS broadcasts allowing chaperones to confirm shifts on basic handsets and notifying guardians the exact minute their child reaches school gates.

---

## 🏛️ System Architecture

```
                                +-------------------------------------------+
                                |        Field Volunteers & Guardians       |
                                |     (Basic Handsets / No Internet)        |
                                +---------------------+---------------------+
                                                      |
                                          USSD / SMS Telecom Hook
                                         (*384*100# / SMS Gateway)
                                                      |
+------------------------------------+                v
|    Civic Dispatch Web Console      |    +---------------------------+
| (Desktop / Tablet / Mobile Browser)|<-->|  Express 5 API Gateway    |
+-----------------+------------------+    +-------------+-------------+
                  |                                     |
       JWT Role-Based Auth                              |
    (Coordinator, Volunteer, Admin)                     |
                  |                                     |
                  v                                     v
   +------------------------------+     +-------------------------------+
   | AES-256-GCM Encryption       |     |  Pure-JS Persistent Store     |
   | (Hardware Cipher, IV, Tag)   |     |  (Zero-Dependency Data Engine)|
   +--------------+---------------+     +---------------+---------------+
                  |                                     |
                  +------------------+------------------+
                                     |
                        +------------v------------+
                        |  Auditable JSON Ledger  |
                        |  (Users, Shifts, Routes,|
                        |   Incidents, SMS Logs)  |
                        +-------------------------+
```

---

## ✨ Core Features & Technical Highlights

### 1. 🚶‍♀️ Walking-Bus Dispatch & Corridor Management
- **Designated Safe Passage Corridors**: Map vetted routes with start assembly hubs, waypoint checkpoints, physical hazards (railway crossings, unlit footbridges), and verified emergency refuge businesses.
- **Volunteer Capacity & Ratio Enforcement**: Roster chaperones to shifts with real-time capacity meters, ensuring a strict **1:6 chaperone-to-child ratio** compliant with international child protection standards.
- **Roster Reminders via SMS**: 1-click dispatch alerts sent directly to chaperones' mobile phones 24 hours prior to scheduled departure.

### 2. 🛡️ Cryptographic Child Safeguarding Incident Desk
- **AES-256-GCM Encryption at Rest**: Minor names, witness testimonies, involved vehicle identifiers, and narrative descriptions are encrypted at rest using hardware-accelerated AES-256-GCM with distinct initialization vectors (`IV`) and cryptographic authentication tags (`Tag`).
- **Role-Based Redaction & Supervisor Audit**: Unauthorized users and volunteers see a redacted privacy view (`🔒 [ENCRYPTED AT REST]`), while verified Coordinators and System Directors can toggle the decrypted audit view.
- **Social Services Escalation**: Includes a high-priority flag to trigger direct social services and emergency welfare referrals for severe safeguarding breaches.

### 3. 📱 Last-Mile Telecom Fallback (USSD & SMS)
- **Interactive Nokia Feature Phone Simulator**: Test field interactions directly inside the web console with an interactive keypad dialer:
  - `Option 1: Confirm Shift Assignment` (Updates roster attendance)
  - `Option 2: Report Urgent Field Issue` (Routes to safeguarding desk)
  - `Option 3: Safe Arrival Confirmation` (Triggers guardian broadcast)
- **Guardian Arrival Broadcasts**: Dispatches automated SMS messages to parents when walking cohorts reach destination gates (*"SAFE ARRIVAL: Your student Amara arrived safely at St. Mary Girls High School at 08:15"*).
- **Auditable Outbox Ledger**: Full inspection table tracking SMS message content, phone numbers, delivery status, and timestamps.

### 4. ⚡ Zero-Dependency Pure JavaScript Data Engine
- **No Native C++ Compilation**: Built with `FastStore`, an in-memory data store with persistent JSON storage that implements the synchronous `prepare().get()`, `.all()`, `.run()`, and `.exec()` API.
- **Eliminates Segmentation Faults**: Completely bypasses `node-gyp` and Python build requirements, eliminating platform-specific `status 139 (SIGSEGV)` crashes on memory-constrained 512MB cloud instances.
- **Blazing Fast Instantiation**: Boots the entire Express server and loads all relational tables in under **50ms**.

---

## 👥 Evaluator Persona & Role Clearance

Use the **Demo Role Switcher** at the top of the application to evaluate different authorization levels:

| Role Persona | Target User Profile | Access Clearance |
| :--- | :--- | :--- |
| **Sarah Kintu** (`coordinator`) | Lead Community Coordinator | Full access: Corridor planning, shift rostering, chaperone assignments, and **decrypted supervisor safeguarding audit**. |
| **Amara Okafor** (`volunteer`) | Field Walking-Bus Escort | Field view: Check assigned walking-bus shifts, submit encrypted incident reports, trigger arrival broadcasts. |
| **Elena Rostova** (`admin`) | District System Director | Full administrative clearance: System configuration, volunteer credential audits, and SMS ledger inspection. |
| **Community Observer** (`viewer`) | Community Member / Guardian | Read-only access: View public safe corridor schedules and safety guidelines with minor data redacted. |

> **Quick Evaluation**: Click the green **"🌱 Seed Demo Data"** button in the header bar to immediately populate realistic walking corridors, scheduled shifts, volunteer profiles, and encrypted incident reports.

---

## 🔌 API Reference Overview

### Authentication & Demo
- `POST /auth/register`: Register new volunteer account with bcrypt password hashing.
- `POST /auth/login`: Authenticate and obtain JWT bearer token.
- `GET /api/demo/status`: Health and entity counts across all system modules.
- `POST /api/demo/quick-login`: 1-click persona token generation for evaluators.
- `POST /api/demo/seed`: Seed production-ready corridor and incident fixtures.

### Corridors & Shifts
- `GET /shifts/routes/list`: List all active safe walking corridors.
- `POST /shifts/routes`: Register a new corridor with assembly points and hazard notes.
- `GET /shifts`: Retrieve scheduled escort shifts (filterable by date, type, route).
- `POST /shifts`: Schedule a new walking-bus or after-school shift.
- `POST /shifts/:id/assign`: Assign a vetted volunteer to a shift convoy.

### Field Safeguarding & Incidents
- `GET /incidents`: Retrieve safeguarding stream (auto-decrypted for Coordinators/Admins; redacted for field roles).
- `POST /incidents`: Submit field report (payload encrypted at rest with AES-256-GCM).
- `PUT /incidents/:id/status`: Transition incident status (`open` → `under_review` → `resolved` / `escalated`).

### Telecom & Notifications
- `POST /sms/ussd-hook`: Inbound USSD session handler for telecom carriers.
- `POST /sms/safe-arrival`: Broadcast safe school arrival notification to parent phone.
- `POST /sms/send`: Direct transactional SMS alert to volunteer or supervisor.
- `GET /sms`: Inspect live SMS outbox transmission ledger.

---

## 🚀 Local Development Quickstart

### Prerequisites
- Node.js `>= 20.0.0` (Recommended: Node 22 LTS or Node 24)
- Git

### Installation & Run
```bash
# 1. Clone the repository
git clone https://github.com/Katlyn627/Project-C.M.S.R.git
cd Project-C.M.S.R

# 2. Install dependencies (pure JavaScript, installs in seconds)
npm install

# 3. Start local development server
npm start
```

The application will be live at `http://localhost:3000`.

### Environment Variables (Optional)
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for Express web and API server |
| `DB_PATH` | `data/cmsr.json` | File path for persistent JSON database store |
| `JWT_SECRET` | *(Auto-generated)* | 256-bit secret for signing user tokens |
| `ENCRYPTION_KEY` | *(Auto-generated)* | 32-byte key for AES-256-GCM safeguarding payloads |

---

## 🧪 Automated Testing

```bash
# Run unit and integration tests
npm test
```

---

## 🌐 Deploy to Render

This repository includes a [`render.yaml`](render.yaml) blueprint configured for instant one-click deployment:

1. Fork or push to GitHub.
2. In Render, select **New** → **Blueprint** and connect your repository.
3. Render automatically provisions the web service, configures environment variables, and launches the application.

---

## 📄 License & Attribution
Distributed under the **ISC License**. Developed as an open-source humanitarian civic project to advance safeguarding and equitable access to education for vulnerable youth.
