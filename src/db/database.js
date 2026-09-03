'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function resolveDbFilePath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  try {
    const defaultDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
    return path.join(defaultDir, 'cmsr.json');
  } catch {
    return path.join(os.tmpdir(), 'cmsr.json');
  }
}

function splitSqlValues(str) {
  const tokens = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      current += ch;
      if (ch === quoteChar) inQuote = false;
    } else if (ch === "'" || ch === '"') {
      inQuote = true;
      quoteChar = ch;
      current += ch;
    } else if (ch === ',') {
      tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

class FastStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.tables = {
      users: [],
      volunteers: [],
      routes: [],
      shifts: [],
      shift_assignments: [],
      incidents: [],
      sms_notifications: [],
    };
    this.autoIncs = {
      users: 1,
      volunteers: 1,
      routes: 1,
      shifts: 1,
      shift_assignments: 1,
      incidents: 1,
      sms_notifications: 1,
    };
    this.load();
  }

  load() {
    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.tables) this.tables = data.tables;
        if (data.autoIncs) this.autoIncs = data.autoIncs;
      } catch (e) {
        console.warn('FastStore load warning, starting fresh:', e.message);
      }
    }
  }

  save() {
    if (this.filePath) {
      try {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify({ tables: this.tables, autoIncs: this.autoIncs }, null, 2));
      } catch (e) {
        console.warn('FastStore save warning:', e.message);
      }
    }
  }

  pragma() {}
  exec() {}
  close() { this.save(); }

  prepare(sql) {
    const trimmed = sql.trim();
    return {
      get: (...params) => this._query(trimmed, params, 'get'),
      all: (...params) => this._query(trimmed, params, 'all'),
      run: (...params) => this._execute(trimmed, params),
    };
  }

  _execute(sql, params) {
    // 1. INSERT INTO
    const insertMatch = sql.match(/INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)/is);
    if (insertMatch) {
      const tableName = insertMatch[1].toLowerCase();
      const cols = splitSqlValues(insertMatch[2]).map(c => c.trim().toLowerCase());
      const rawVals = splitSqlValues(insertMatch[3]);
      const table = this.tables[tableName] || (this.tables[tableName] = []);
      const newId = this.autoIncs[tableName]++;
      
      const record = { id: newId };
      let pIdx = 0;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const valExpr = rawVals[i] !== undefined ? rawVals[i] : '?';
        if (valExpr === '?') {
          record[col] = params[pIdx++];
        } else if (/^NULL$/i.test(valExpr)) {
          record[col] = null;
        } else if (/^datetime\(/i.test(valExpr)) {
          record[col] = new Date().toISOString();
        } else if (/^['"].*['"]$/.test(valExpr)) {
          record[col] = valExpr.slice(1, -1);
        } else if (!isNaN(Number(valExpr))) {
          record[col] = Number(valExpr);
        } else {
          record[col] = params[pIdx++];
        }
      }
      if (!record.created_at) record.created_at = new Date().toISOString();
      if (!record.updated_at) record.updated_at = new Date().toISOString();

      // Check unique constraints
      if (tableName === 'shift_assignments') {
        const dup = table.find(r => r.shift_id === Number(record.shift_id) && r.volunteer_id === Number(record.volunteer_id));
        if (dup) return { lastInsertRowid: dup.id, changes: 0 };
      }
      if (tableName === 'users') {
        const dup = table.find(u => u.username === record.username);
        if (dup) return { lastInsertRowid: dup.id, changes: 0 };
      }

      table.push(record);
      this.save();
      return { lastInsertRowid: newId, changes: 1 };
    }

    // 2. UPDATE
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
    if (updateMatch) {
      const tableName = updateMatch[1].toLowerCase();
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const table = this.tables[tableName] || [];

      let changes = 0;
      const setParts = setClause.split(',').map(s => s.trim());
      
      let pIdx = 0;
      const setters = [];
      for (const part of setParts) {
        const [col, expr] = part.split('=').map(s => s.trim());
        const colName = col.toLowerCase();
        if (expr.includes('?')) {
          const val = params[pIdx++];
          setters.push((row) => { 
            if (val !== undefined) row[colName] = val; 
          });
        } else if (expr.toLowerCase().includes("datetime('now')")) {
          setters.push((row) => { row[colName] = new Date().toISOString(); });
        } else {
          const literalVal = expr.replace(/['"]/g, '');
          setters.push((row) => { row[colName] = literalVal; });
        }
      }

      for (const row of table) {
        if (this._matchWhere(tableName, row, whereClause, params.slice(pIdx))) {
          for (const s of setters) s(row);
          changes++;
        }
      }

      this.save();
      return { changes };
    }

    return { changes: 0, lastInsertRowid: 0 };
  }

  _query(sql, params, mode) {
    const s = sql.replace(/\s+/g, ' ');

    // COUNT queries: SELECT COUNT(*) as count FROM table
    if (/SELECT COUNT\(\*\)\s+as\s+count\s+FROM\s+(\w+)/i.test(s)) {
      const m = s.match(/FROM\s+(\w+)/i);
      const tbl = m[1].toLowerCase();
      const count = (this.tables[tbl] || []).length;
      return mode === 'get' ? { count } : [{ count }];
    }

    // SELECT 1
    if (/SELECT 1/i.test(s)) {
      return mode === 'get' ? { val: 1 } : [{ val: 1 }];
    }

    // USERS: SELECT id FROM users WHERE username = ?
    if (/SELECT id FROM users WHERE username = \?/i.test(s)) {
      const res = this.tables.users.find(u => u.username === params[0]);
      const obj = res ? { id: res.id } : undefined;
      return mode === 'get' ? obj : (obj ? [obj] : []);
    }

    // USERS: SELECT id, role, full_name FROM users WHERE username = ?
    if (/SELECT id, role, full_name FROM users WHERE username = \?/i.test(s)) {
      const res = this.tables.users.find(u => u.username === params[0]);
      const obj = res ? { id: res.id, role: res.role, full_name: res.full_name } : undefined;
      return mode === 'get' ? obj : (obj ? [obj] : []);
    }

    // USERS: SELECT * FROM users WHERE username = ?
    if (/FROM users WHERE username = \?/i.test(s)) {
      const res = this.tables.users.find(u => u.username === params[0]);
      return mode === 'get' ? res : (res ? [res] : []);
    }

    // USERS: SELECT * (or id) FROM users WHERE role = ? or role = 'volunteer'
    if (/FROM users WHERE role\s*=\s*/i.test(s)) {
      const m = s.match(/FROM users WHERE role\s*=\s*['"]?(\w+)['"]?/i);
      const targetRole = m && m[1] !== '?' ? m[1] : params[0];
      const res = this.tables.users.find(u => u.role === targetRole);
      return mode === 'get' ? res : (res ? [res] : []);
    }

    // USERS: SELECT id, phone, full_name FROM users WHERE role IN ('coordinator', 'admin')
    if (/FROM users WHERE role IN/i.test(s)) {
      const list = this.tables.users
        .filter(u => u.role === 'coordinator' || u.role === 'admin')
        .map(u => ({ id: u.id, phone: u.phone, full_name: u.full_name }));
      return mode === 'get' ? list[0] : list;
    }

    // USERS by ID: SELECT id FROM users WHERE id = ?
    if (/FROM users WHERE id = \?/i.test(s)) {
      const res = this.tables.users.find(u => u.id === Number(params[0]));
      return mode === 'get' ? res : (res ? [res] : []);
    }

    // VOLUNTEERS: SELECT id FROM volunteers WHERE user_id = ?
    if (/SELECT id FROM volunteers WHERE user_id = \?/i.test(s)) {
      const res = this.tables.volunteers.find(v => v.user_id === Number(params[0]));
      const obj = res ? { id: res.id } : undefined;
      return mode === 'get' ? obj : (obj ? [obj] : []);
    }

    // VOLUNTEERS: SELECT id FROM volunteers WHERE id = ?
    if (/SELECT id FROM volunteers WHERE id = \?/i.test(s)) {
      const res = this.tables.volunteers.find(v => v.id === Number(params[0]));
      const obj = res ? { id: res.id } : undefined;
      return mode === 'get' ? obj : (obj ? [obj] : []);
    }

    // VOLUNTEERS: SELECT v.*, u.username, u.full_name, u.phone FROM volunteers v JOIN users u
    if (/FROM volunteers v JOIN users u/i.test(s)) {
      let list = this.tables.volunteers.map(v => {
        const u = this.tables.users.find(usr => usr.id === v.user_id) || {};
        return {
          ...v,
          username: u.username,
          full_name: u.full_name,
          phone: u.phone,
        };
      });
      if (/WHERE v\.id = \?/i.test(s)) {
        const item = list.find(v => v.id === Number(params[0]));
        return mode === 'get' ? item : (item ? [item] : []);
      }
      return mode === 'get' ? list[0] : list;
    }

    // ROUTES: SELECT * FROM routes WHERE active = 1 ORDER BY name
    if (/FROM routes/i.test(s)) {
      const active = this.tables.routes.filter(r => r.active === 1 || r.active === true || r.active === undefined);
      active.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return mode === 'get' ? active[0] : active;
    }

    // SHIFTS: SELECT * FROM shifts WHERE id = ?
    if (/SELECT \* FROM shifts WHERE id = \?/i.test(s)) {
      const item = this.tables.shifts.find(sh => sh.id === Number(params[0]));
      return mode === 'get' ? item : (item ? [item] : []);
    }

    // SHIFTS with joins
    if (/FROM shifts/i.test(s)) {
      let list = this.tables.shifts.map(sh => {
        const r = this.tables.routes.find(rt => rt.id === sh.route_id);
        const assigned = this.tables.shift_assignments.filter(sa => sa.shift_id === sh.id && sa.status !== 'cancelled').length;
        return {
          ...sh,
          route_name: r ? r.name : null,
          start_point: r ? r.start_point : null,
          end_point: r ? r.end_point : null,
          assigned_count: assigned,
        };
      });
      list.sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || '') || (a.start_time || '').localeCompare(b.start_time || ''));
      return mode === 'get' ? list[0] : list;
    }

    // SHIFT ASSIGNMENTS
    if (/FROM shift_assignments sa/i.test(s)) {
      const shiftId = Number(params[0]);
      const list = this.tables.shift_assignments
        .filter(sa => sa.shift_id === shiftId)
        .map(sa => {
          const v = this.tables.volunteers.find(vol => vol.id === sa.volunteer_id) || {};
          const u = this.tables.users.find(usr => usr.id === v.user_id) || {};
          return {
            ...sa,
            skills: v.skills,
            full_name: u.full_name,
            phone: u.phone,
          };
        });
      return mode === 'get' ? list[0] : list;
    }

    if (/COUNT\(\*\) as count FROM shift_assignments WHERE shift_id = \?/i.test(s)) {
      const shiftId = Number(params[0]);
      const count = this.tables.shift_assignments.filter(sa => sa.shift_id === shiftId && sa.status !== 'cancelled').length;
      return mode === 'get' ? { count } : [{ count }];
    }

    // INCIDENTS: SELECT * FROM incidents WHERE id = ?
    if (/SELECT \* FROM incidents WHERE id = \?/i.test(s)) {
      const inc = this.tables.incidents.find(i => i.id === Number(params[0]));
      return mode === 'get' ? inc : (inc ? [inc] : []);
    }

    if (/FROM incidents/i.test(s)) {
      let list = this.tables.incidents.map(inc => {
        const u = this.tables.users.find(usr => usr.id === inc.reported_by) || {};
        return {
          ...inc,
          reporter_name: u.full_name || 'Anonymous',
        };
      });
      list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return mode === 'get' ? list[0] : list;
    }

    // SMS NOTIFICATIONS: SELECT * FROM sms_notifications ORDER BY created_at DESC
    if (/FROM sms_notifications/i.test(s)) {
      const list = [...this.tables.sms_notifications];
      list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return mode === 'get' ? list[0] : list;
    }

    return mode === 'get' ? undefined : [];
  }

  _matchWhere(table, row, whereClause, whereParams) {
    if (/id = \?/i.test(whereClause)) {
      return row.id === Number(whereParams[0]);
    }
    if (/shift_id = \? AND volunteer_id = \?/i.test(whereClause)) {
      return row.shift_id === Number(whereParams[0]) && row.volunteer_id === Number(whereParams[1]);
    }
    return true;
  }
}

let storeInstance = null;

function getDb() {
  if (!storeInstance) {
    const filePath = resolveDbFilePath();
    storeInstance = new FastStore(filePath);
  }
  return storeInstance;
}

function closeDb() {
  if (storeInstance) {
    storeInstance.close();
    storeInstance = null;
  }
}

module.exports = { getDb, closeDb };
