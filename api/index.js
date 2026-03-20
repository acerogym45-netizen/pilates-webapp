const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Utility Functions
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
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      version: '12.2.6',
      timestamp: getCurrentTimestamp(),
      database: 'connected',
      storage: 'postgresql'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============= PROGRAMS API =============

app.get('/api/programs', async (req, res) => {
  try {
    const { limit, complex } = parseQueryParams(req);
    let query = 'SELECT * FROM programs WHERE 1=1';
    const params = [];
    
    if (complex) {
      query += ' AND complex_code = $1';
      params.push(complex);
    }
    
    query += ` ORDER BY display_order ASC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/tables/programs', (req, res) => {
  req.url = '/api/programs';
  app.handle(req, res);
});

app.post('/api/programs', async (req, res) => {
  try {
    const body = req.body;
    
    const query = `
      INSERT INTO programs (
        name, description, price, max_capacity, 
        display_order, is_active, is_personal_lesson, 
        available_times, complex_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const values = [
      body.name,
      body.description || '',
      body.price || 0,
      body.max_capacity || 1,
      body.display_order || 0,
      body.is_active !== undefined ? body.is_active : true,
      body.is_personal_lesson || false,
      body.available_times || '',
      body.complex_code || null
    ];
    
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/programs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    
    const query = `
      UPDATE programs 
      SET name = $1, description = $2, price = $3, max_capacity = $4,
          display_order = $5, is_active = $6, is_personal_lesson = $7,
          available_times = $8, complex_code = $9, updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *
    `;
    
    const values = [
      body.name,
      body.description,
      body.price,
      body.max_capacity,
      body.display_order,
      body.is_active,
      body.is_personal_lesson,
      body.available_times,
      body.complex_code,
      id
    ];
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/programs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM programs WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }
    
    res.json({ message: 'Program deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= CONTRACTS API =============

app.get('/api/contracts', async (req, res) => {
  try {
    const { limit, orderBy, complex } = parseQueryParams(req);
    const status = req.query.status;
    
    let query = 'SELECT * FROM pilates_contracts WHERE 1=1';
    const params = [];
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    if (complex) {
      query += ` AND complex_code = $${params.length + 1}`;
      params.push(complex);
    }
    
    query += ` ORDER BY ${orderBy} LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/tables/pilates_contracts', (req, res) => {
  req.url = '/api/contracts';
  app.handle(req, res);
});

app.post('/api/contracts', async (req, res) => {
  try {
    const body = req.body;
    
    const query = `
      INSERT INTO pilates_contracts (
        dong, ho, name, phone, lesson_type, preferred_time,
        agreement, terms_agreement, signature, signature_image,
        signature_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    
    const values = [
      body.dong || '',
      body.ho || '',
      body.name,
      body.phone,
      body.lesson_type || '',
      body.preferred_time || '',
      body.agreement || false,
      body.terms_agreement || false,
      body.signature || '',
      body.signature_image || '',
      body.signature_date || '',
      body.status || 'waiting'
    ];
    
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    Object.keys(body).forEach(key => {
      if (key !== 'id' && key !== 'created_at') {
        updates.push(`${key} = $${paramCount}`);
        values.push(body[key]);
        paramCount++;
      }
    });
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const query = `
      UPDATE pilates_contracts 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM pilates_contracts WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    res.json({ message: 'Contract deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= INQUIRIES API =============

app.get('/api/inquiries', async (req, res) => {
  try {
    const { limit, orderBy } = parseQueryParams(req);
    const is_public = req.query.is_public;
    
    let query = 'SELECT * FROM pilates_inquiries WHERE 1=1';
    const params = [];
    
    if (is_public !== undefined) {
      query += ` AND is_public = $${params.length + 1}`;
      params.push(is_public === 'true');
    }
    
    query += ` ORDER BY ${orderBy} LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/tables/pilates_inquiries', (req, res) => {
  req.url = '/api/inquiries';
  app.handle(req, res);
});

app.post('/api/inquiries', async (req, res) => {
  try {
    const body = req.body;
    
    const query = `
      INSERT INTO pilates_inquiries (
        dong, ho, name, phone, title, content, is_public, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const values = [
      body.dong || '',
      body.ho || '',
      body.name,
      body.phone,
      body.title,
      body.content,
      body.is_public !== undefined ? body.is_public : true,
      body.status || 'pending'
    ];
    
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/inquiries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    
    const query = `
      UPDATE pilates_inquiries 
      SET reply = $1, reply_date = CURRENT_TIMESTAMP, status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const values = [
      body.reply,
      'answered',
      id
    ];
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inquiries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM pilates_inquiries WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    
    res.json({ message: 'Inquiry deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= NOTICES API =============

app.get('/api/notices', async (req, res) => {
  try {
    const { limit, orderBy, complex } = parseQueryParams(req);
    
    let query = 'SELECT * FROM notices WHERE 1=1';
    const params = [];
    
    if (complex) {
      query += ` AND complex_code = $${params.length + 1}`;
      params.push(complex);
    }
    
    query += ` ORDER BY is_pinned DESC, ${orderBy} LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/tables/notices', (req, res) => {
  req.url = '/api/notices';
  app.handle(req, res);
});

app.post('/api/notices', async (req, res) => {
  try {
    const body = req.body;
    
    const query = `
      INSERT INTO notices (
        title, content, author, is_pinned, complex_code
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      body.title,
      body.content,
      body.author || 'Admin',
      body.is_pinned || false,
      body.complex_code || null
    ];
    
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    
    const query = `
      UPDATE notices 
      SET title = $1, content = $2, author = $3, is_pinned = $4, 
          complex_code = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
    
    const values = [
      body.title,
      body.content,
      body.author,
      body.is_pinned,
      body.complex_code,
      id
    ];
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/notices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM notices WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    
    res.json({ message: 'Notice deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= STATISTICS API =============

app.get('/api/statistics/dashboard', async (req, res) => {
  try {
    const totalContractsResult = await pool.query('SELECT COUNT(*) FROM pilates_contracts');
    const approvedContractsResult = await pool.query('SELECT COUNT(*) FROM pilates_contracts WHERE status = $1', ['approved']);
    const waitingContractsResult = await pool.query('SELECT COUNT(*) FROM pilates_contracts WHERE status = $1', ['waiting']);
    const totalInquiriesResult = await pool.query('SELECT COUNT(*) FROM pilates_inquiries');
    const pendingInquiriesResult = await pool.query('SELECT COUNT(*) FROM pilates_inquiries WHERE status = $1', ['pending']);
    
    const programStatsResult = await pool.query(`
      SELECT lesson_type, COUNT(*) as count 
      FROM pilates_contracts 
      WHERE lesson_type IS NOT NULL 
      GROUP BY lesson_type
    `);
    
    const programStats = {};
    programStatsResult.rows.forEach(row => {
      programStats[row.lesson_type] = parseInt(row.count);
    });
    
    res.json({
      totalContracts: parseInt(totalContractsResult.rows[0].count),
      approvedContracts: parseInt(approvedContractsResult.rows[0].count),
      waitingContracts: parseInt(waitingContractsResult.rows[0].count),
      totalInquiries: parseInt(totalInquiriesResult.rows[0].count),
      pendingInquiries: parseInt(pendingInquiriesResult.rows[0].count),
      programStats
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export as Vercel serverless function
module.exports = app;
