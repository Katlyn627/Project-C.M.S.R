'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  try {
    const fs = require('fs');
    const defaultDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
    return path.join(defaultDir, 'cmsr.db');
  } catch {
    const os = require('os');
    return path.join(os.tmpdir(), 'cmsr.db');
  }
}

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dbPath = resolveDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    db = new Database(dbPath);
    try {
      db.pragma('journal_mode = DELETE');
    } catch (e) {
      console.warn('journal_mode warning:', e);
    }
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','coordinator','volunteer','viewer')),
      full_name TEXT NOT NULL,
      phone TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      skills TEXT,
      availability TEXT,
      background_checked INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      start_point TEXT NOT NULL,
      end_point TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER REFERENCES routes(id),
      shift_type TEXT NOT NULL CHECK(shift_type IN ('walking_bus','tutoring','mentorship')),
      scheduled_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      max_volunteers INTEGER NOT NULL DEFAULT 2,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shift_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES shifts(id),
      volunteer_id INTEGER NOT NULL REFERENCES volunteers(id),
      status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','confirmed','completed','cancelled')),
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(shift_id, volunteer_id)
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reported_by INTEGER NOT NULL REFERENCES users(id),
      incident_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
      location TEXT,
      involved_parties_enc TEXT,
      description_enc TEXT NOT NULL,
      safeguarding_referral INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','under_review','resolved','escalated')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sms_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_phone TEXT NOT NULL,
      message TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
