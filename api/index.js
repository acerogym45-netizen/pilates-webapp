const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const app = express();

// Database setup
let db;
try {
  const dbPath = path.join(__dirname, '../database.sqlite');
  db = new Database(dbPath);
} catch (error) {
  console.error('Database connection error:', error);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Utility Functions
function generateId() {
  return crypto.randomUUID();
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function parseQueryParams(req) {
  const limit = parseInt(req.query.limit || '1000');
  const sort = req.query.sort || '-created_at';
  const complex = req.query.complex;
  
  let orderBy = 'created_at DESC';
  if (sort.startsWith('-')) {
    orderBy = `${sort.slice(1)} DESC`;
  } else {
    orderBy = `${sort} ASC`;
  }
  
  return { limit, orderBy, complex };
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '12.2.6',
    timestamp: getCurrentTimestamp(),
    database: db ? 'connected' : 'disconnected'
  });
});

// Programs API
app.get('/api/programs', (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    
    const { limit, orderBy, complex } = parseQueryParams(req);
    let query = 'SELECT * FROM programs WHERE 1=1';
    const params = [];
    
    if (complex) {
      query += ' AND complex_code = ?';
      params.push(complex);
    }
    
    query += ` ORDER BY display_order ASC, ${orderBy} LIMIT ?`;
    params.push(limit);
    
    const stmt = db.prepare(query);
    const results = stmt.all(...params);
    res.json(results);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/tables/programs', (req, res) => {
  req.url = '/api/programs';
  app.handle(req, res);
});

app.post('/api/programs', (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    
    const body = req.body;
    const id = generateId();
    const now = getCurrentTimestamp();
    
    const stmt = db.prepare(`
      INSERT INTO programs (
        id, name, description, price, max_capacity, 
        display_order, is_active, is_personal_lesson, 
        available_times, complex_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id, body.name, body.description || null, body.price || 0,
      body.max_capacity || 6, body.display_order || 0,
      body.is_active !== undefined ? body.is_active : 1,
      body.is_personal_lesson || 0, body.available_times || null,
      body.complex_code || 'cheongju-sk', now, now
    );
    
    res.status(201).json({ id, success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/tables/programs', (req, res) => {
  req.url = '/api/programs';
  app.handle(req, res);
});

// Contracts API
app.get('/api/contracts', (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    
    const { limit, orderBy, complex } = parseQueryParams(req);
    let query = 'SELECT * FROM pilates_contracts WHERE 1=1';
    const params = [];
    
    if (complex) {
      query += ' AND complex_code = ?';
      params.push(complex);
    }
    
    query += ` ORDER BY ${orderBy} LIMIT ?`;
    params.push(limit);
    
    const stmt = db.prepare(query);
    const results = stmt.all(...params);
    res.json(results);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/tables/pilates_contracts', (req, res) => {
  req.url = '/api/contracts';
  app.handle(req, res);
});

app.post('/api/contracts', (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    
    const body = req.body;
    const id = generateId();
    const now = getCurrentTimestamp();
    
    const stmt = db.prepare(`
      INSERT INTO pilates_contracts (
        id, dong, ho, name, phone, lesson_type, preferred_time,
        start_date, agreement, terms_agreement, signature,
        signature_image, signature_date, status, complex_code,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id, body.dong, body.ho, body.name, body.phone,
      body.lesson_type, body.preferred_time, body.start_date || null,
      body.agreement || 0, body.terms_agreement || 0,
      body.signature || null, body.signature_image || null,
      body.signature_date || null, body.status || 'approved',
      body.complex_code || 'cheongju-sk', now, now
    );
    
    res.status(201).json({ id, success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/tables/pilates_contracts', (req, res) => {
  req.url = '/api/contracts';
  app.handle(req, res);
});

// Inquiries API
app.get('/api/inquiries', (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    
    const { limit, orderBy } = parseQueryParams(req);
    const publicOnly = req.query.public === 'true';
    
    let query = 'SELECT * FROM pilates_inquiries WHERE 1=1';
    const params = [];
    
    if (publicOnly) {
      query += ' AND is_public = 1';
    }
    
    query += ` ORDER BY ${orderBy} LIMIT ?`;
    params.push(limit);
    
    const stmt = db.prepare(query);
    const results = stmt.all(...params);
    res.json(results);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/tables/pilates_inquiries', (req, res) => {
  req.url = '/api/inquiries';
  app.handle(req, res);
});

app.post('/api/inquiries', (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    
    const body = req.body;
    const id = generateId();
    const now = getCurrentTimestamp();
    
    const stmt = db.prepare(`
      INSERT INTO pilates_inquiries (
        id, dong, ho, name, phone, title, content,
        is_public, reply, reply_date, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id, body.dong, body.ho, body.name, body.phone,
      body.title, body.content, body.is_public || 0,
      body.reply || null, body.reply_date || null,
      body.status || 'pending', now, now
    );
    
    res.status(201).json({ id, success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/tables/pilates_inquiries', (req, res) => {
  req.url = '/api/inquiries';
  app.handle(req, res);
});

// Notices API
app.get('/api/notices', (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    
    const { limit, orderBy, complex } = parseQueryParams(req);
    let query = 'SELECT * FROM notices WHERE 1=1';
    const params = [];
    
    if (complex) {
      query += ' AND complex_code = ?';
      params.push(complex);
    }
    
    query += ` ORDER BY pinned DESC, ${orderBy} LIMIT ?`;
    params.push(limit);
    
    const stmt = db.prepare(query);
    const results = stmt.all(...params);
    res.json(results);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/tables/notices', (req, res) => {
  req.url = '/api/notices';
  app.handle(req, res);
});

// Statistics API
app.get('/api/statistics/dashboard', (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    
    const complex = req.query.complex || 'cheongju-sk';
    
    const totalContracts = db.prepare('SELECT COUNT(*) as total FROM pilates_contracts WHERE complex_code = ?').get(complex);
    const approvedContracts = db.prepare('SELECT COUNT(*) as total FROM pilates_contracts WHERE complex_code = ? AND status = ?').get(complex, 'approved');
    const waitingContracts = db.prepare('SELECT COUNT(*) as total FROM pilates_contracts WHERE complex_code = ? AND status = ?').get(complex, 'waiting');
    const totalInquiries = db.prepare('SELECT COUNT(*) as total FROM pilates_inquiries').get();
    const pendingInquiries = db.prepare('SELECT COUNT(*) as total FROM pilates_inquiries WHERE status = ?').get('pending');
    const programStats = db.prepare(`
      SELECT lesson_type, COUNT(*) as count 
      FROM pilates_contracts 
      WHERE complex_code = ? AND status = ?
      GROUP BY lesson_type
      ORDER BY count DESC
    `).all(complex, 'approved');
    
    res.json({
      totalContracts: totalContracts?.total || 0,
      approvedContracts: approvedContracts?.total || 0,
      waitingContracts: waitingContracts?.total || 0,
      totalInquiries: totalInquiries?.total || 0,
      pendingInquiries: pendingInquiries?.total || 0,
      programStats: programStats || []
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel
module.exports = app;
