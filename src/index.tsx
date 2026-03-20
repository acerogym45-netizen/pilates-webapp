import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for all API routes
app.use('/api/*', cors())
app.use('/tables/*', cors())

// ============================================
// Utility Functions
// ============================================

function generateId(): string {
  return crypto.randomUUID()
}

function getCurrentTimestamp(): string {
  return new Date().toISOString()
}

// Parse query parameters for filtering and pagination
function parseQueryParams(c: any) {
  const limit = parseInt(c.req.query('limit') || '1000')
  const sort = c.req.query('sort') || '-created_at'
  const complex = c.req.query('complex')
  
  let orderBy = 'created_at DESC'
  if (sort.startsWith('-')) {
    orderBy = `${sort.slice(1)} DESC`
  } else {
    orderBy = `${sort} ASC`
  }
  
  return { limit, orderBy, complex }
}

// ============================================
// Health Check
// ============================================

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    version: '12.2.6',
    timestamp: getCurrentTimestamp()
  })
})

// ============================================
// Programs API (프로그램 관리)
// ============================================

// GET /api/programs - 모든 프로그램 조회
// GET /tables/programs
app.get('/api/programs', async (c) => {
  try {
    const { env } = c
    const { limit, orderBy, complex } = parseQueryParams(c)
    
    let query = 'SELECT * FROM programs WHERE 1=1'
    const params: any[] = []
    
    if (complex) {
      query += ' AND complex_code = ?'
      params.push(complex)
    }
    
    query += ` ORDER BY display_order ASC, ${orderBy} LIMIT ?`
    params.push(limit)
    
    const { results } = await env.DB.prepare(query).bind(...params).all()
    
    return c.json(results || [])
  } catch (error: any) {
    console.error('Error fetching programs:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.get('/tables/programs', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// GET /api/programs/:id - 특정 프로그램 조회
app.get('/api/programs/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    const { results } = await env.DB.prepare(
      'SELECT * FROM programs WHERE id = ?'
    ).bind(id).all()
    
    if (!results || results.length === 0) {
      return c.json({ error: 'Program not found' }, 404)
    }
    
    return c.json(results[0])
  } catch (error: any) {
    console.error('Error fetching program:', error)
    return c.json({ error: error.message }, 500)
  }
})

// POST /api/programs - 새 프로그램 생성
// POST /tables/programs
app.post('/api/programs', async (c) => {
  try {
    const { env } = c
    const body = await c.req.json()
    
    const id = generateId()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      INSERT INTO programs (
        id, name, description, price, max_capacity, 
        display_order, is_active, is_personal_lesson, 
        available_times, complex_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.name,
      body.description || null,
      body.price || 0,
      body.max_capacity || 6,
      body.display_order || 0,
      body.is_active !== undefined ? body.is_active : 1,
      body.is_personal_lesson || 0,
      body.available_times || null,
      body.complex_code || 'cheongju-sk',
      now,
      now
    ).run()
    
    return c.json({ id, success: true }, 201)
  } catch (error: any) {
    console.error('Error creating program:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.post('/tables/programs', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PUT /api/programs/:id - 프로그램 전체 수정
// PUT /tables/programs/:id
app.put('/api/programs/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      UPDATE programs SET
        name = ?, description = ?, price = ?, max_capacity = ?,
        display_order = ?, is_active = ?, is_personal_lesson = ?,
        available_times = ?, complex_code = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      body.name,
      body.description || null,
      body.price || 0,
      body.max_capacity || 6,
      body.display_order || 0,
      body.is_active !== undefined ? body.is_active : 1,
      body.is_personal_lesson || 0,
      body.available_times || null,
      body.complex_code || 'cheongju-sk',
      now,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating program:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.put('/tables/programs/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PATCH /api/programs/:id - 프로그램 부분 수정
// PATCH /tables/programs/:id
app.patch('/api/programs/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    const updates: string[] = []
    const values: any[] = []
    
    Object.keys(body).forEach(key => {
      if (key !== 'id') {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    })
    
    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }
    
    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)
    
    await env.DB.prepare(
      `UPDATE programs SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error patching program:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.patch('/tables/programs/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// DELETE /api/programs/:id - 프로그램 삭제
// DELETE /tables/programs/:id
app.delete('/api/programs/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    await env.DB.prepare('DELETE FROM programs WHERE id = ?').bind(id).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting program:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/tables/programs/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// ============================================
// Contracts API (신청서/계약서)
// ============================================

// GET /api/contracts - 모든 계약서 조회
// GET /tables/pilates_contracts
app.get('/api/contracts', async (c) => {
  try {
    const { env } = c
    const { limit, orderBy, complex } = parseQueryParams(c)
    
    let query = 'SELECT * FROM pilates_contracts WHERE 1=1'
    const params: any[] = []
    
    if (complex) {
      query += ' AND complex_code = ?'
      params.push(complex)
    }
    
    query += ` ORDER BY ${orderBy} LIMIT ?`
    params.push(limit)
    
    const { results } = await env.DB.prepare(query).bind(...params).all()
    
    return c.json(results || [])
  } catch (error: any) {
    console.error('Error fetching contracts:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.get('/tables/pilates_contracts', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// GET /api/contracts/:id - 특정 계약서 조회
app.get('/api/contracts/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    const { results } = await env.DB.prepare(
      'SELECT * FROM pilates_contracts WHERE id = ?'
    ).bind(id).all()
    
    if (!results || results.length === 0) {
      return c.json({ error: 'Contract not found' }, 404)
    }
    
    return c.json(results[0])
  } catch (error: any) {
    console.error('Error fetching contract:', error)
    return c.json({ error: error.message }, 500)
  }
})

// POST /api/contracts - 새 계약서 생성
// POST /tables/pilates_contracts
app.post('/api/contracts', async (c) => {
  try {
    const { env } = c
    const body = await c.req.json()
    
    const id = generateId()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      INSERT INTO pilates_contracts (
        id, dong, ho, name, phone, lesson_type, preferred_time,
        start_date, agreement, terms_agreement, signature,
        signature_image, signature_date, status, complex_code,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.dong,
      body.ho,
      body.name,
      body.phone,
      body.lesson_type,
      body.preferred_time,
      body.start_date || null,
      body.agreement || 0,
      body.terms_agreement || 0,
      body.signature || null,
      body.signature_image || null,
      body.signature_date || null,
      body.status || 'approved',
      body.complex_code || 'cheongju-sk',
      now,
      now
    ).run()
    
    return c.json({ id, success: true }, 201)
  } catch (error: any) {
    console.error('Error creating contract:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.post('/tables/pilates_contracts', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PUT /api/contracts/:id - 계약서 전체 수정
// PUT /tables/pilates_contracts/:id
app.put('/api/contracts/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      UPDATE pilates_contracts SET
        dong = ?, ho = ?, name = ?, phone = ?,
        lesson_type = ?, preferred_time = ?, start_date = ?,
        agreement = ?, terms_agreement = ?, signature = ?,
        signature_image = ?, signature_date = ?, status = ?,
        complex_code = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      body.dong,
      body.ho,
      body.name,
      body.phone,
      body.lesson_type,
      body.preferred_time,
      body.start_date || null,
      body.agreement || 0,
      body.terms_agreement || 0,
      body.signature || null,
      body.signature_image || null,
      body.signature_date || null,
      body.status || 'approved',
      body.complex_code || 'cheongju-sk',
      now,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating contract:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.put('/tables/pilates_contracts/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PATCH /api/contracts/:id - 계약서 부분 수정
// PATCH /tables/pilates_contracts/:id
app.patch('/api/contracts/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    const updates: string[] = []
    const values: any[] = []
    
    Object.keys(body).forEach(key => {
      if (key !== 'id') {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    })
    
    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }
    
    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)
    
    await env.DB.prepare(
      `UPDATE pilates_contracts SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error patching contract:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.patch('/tables/pilates_contracts/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// DELETE /api/contracts/:id - 계약서 삭제
// DELETE /tables/pilates_contracts/:id
app.delete('/api/contracts/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    await env.DB.prepare('DELETE FROM pilates_contracts WHERE id = ?').bind(id).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting contract:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/tables/pilates_contracts/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// ============================================
// Inquiries API (문의사항)
// ============================================

// GET /api/inquiries - 모든 문의사항 조회
// GET /tables/pilates_inquiries
app.get('/api/inquiries', async (c) => {
  try {
    const { env } = c
    const { limit, orderBy } = parseQueryParams(c)
    const publicOnly = c.req.query('public') === 'true'
    
    let query = 'SELECT * FROM pilates_inquiries WHERE 1=1'
    const params: any[] = []
    
    if (publicOnly) {
      query += ' AND is_public = 1'
    }
    
    query += ` ORDER BY ${orderBy} LIMIT ?`
    params.push(limit)
    
    const { results } = await env.DB.prepare(query).bind(...params).all()
    
    return c.json(results || [])
  } catch (error: any) {
    console.error('Error fetching inquiries:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.get('/tables/pilates_inquiries', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// GET /api/inquiries/:id - 특정 문의사항 조회
app.get('/api/inquiries/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    const { results } = await env.DB.prepare(
      'SELECT * FROM pilates_inquiries WHERE id = ?'
    ).bind(id).all()
    
    if (!results || results.length === 0) {
      return c.json({ error: 'Inquiry not found' }, 404)
    }
    
    return c.json(results[0])
  } catch (error: any) {
    console.error('Error fetching inquiry:', error)
    return c.json({ error: error.message }, 500)
  }
})

// POST /api/inquiries - 새 문의사항 생성
// POST /tables/pilates_inquiries
app.post('/api/inquiries', async (c) => {
  try {
    const { env } = c
    const body = await c.req.json()
    
    const id = generateId()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      INSERT INTO pilates_inquiries (
        id, dong, ho, name, phone, title, content,
        is_public, reply, reply_date, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.dong,
      body.ho,
      body.name,
      body.phone,
      body.title,
      body.content,
      body.is_public || 0,
      body.reply || null,
      body.reply_date || null,
      body.status || 'pending',
      now,
      now
    ).run()
    
    return c.json({ id, success: true }, 201)
  } catch (error: any) {
    console.error('Error creating inquiry:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.post('/tables/pilates_inquiries', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PUT /api/inquiries/:id - 문의사항 전체 수정
// PUT /tables/pilates_inquiries/:id
app.put('/api/inquiries/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      UPDATE pilates_inquiries SET
        dong = ?, ho = ?, name = ?, phone = ?,
        title = ?, content = ?, is_public = ?,
        reply = ?, reply_date = ?, status = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      body.dong,
      body.ho,
      body.name,
      body.phone,
      body.title,
      body.content,
      body.is_public || 0,
      body.reply || null,
      body.reply_date || null,
      body.status || 'pending',
      now,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating inquiry:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.put('/tables/pilates_inquiries/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PATCH /api/inquiries/:id - 문의사항 부분 수정
// PATCH /tables/pilates_inquiries/:id
app.patch('/api/inquiries/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    const updates: string[] = []
    const values: any[] = []
    
    Object.keys(body).forEach(key => {
      if (key !== 'id') {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    })
    
    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }
    
    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)
    
    await env.DB.prepare(
      `UPDATE pilates_inquiries SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error patching inquiry:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.patch('/tables/pilates_inquiries/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// DELETE /api/inquiries/:id - 문의사항 삭제
// DELETE /tables/pilates_inquiries/:id
app.delete('/api/inquiries/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    await env.DB.prepare('DELETE FROM pilates_inquiries WHERE id = ?').bind(id).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting inquiry:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/tables/pilates_inquiries/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// ============================================
// Notices API (공지사항)
// ============================================

// GET /api/notices - 모든 공지사항 조회
// GET /tables/notices
app.get('/api/notices', async (c) => {
  try {
    const { env } = c
    const { limit, orderBy, complex } = parseQueryParams(c)
    
    let query = 'SELECT * FROM notices WHERE 1=1'
    const params: any[] = []
    
    if (complex) {
      query += ' AND complex_code = ?'
      params.push(complex)
    }
    
    query += ` ORDER BY pinned DESC, ${orderBy} LIMIT ?`
    params.push(limit)
    
    const { results } = await env.DB.prepare(query).bind(...params).all()
    
    return c.json(results || [])
  } catch (error: any) {
    console.error('Error fetching notices:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.get('/tables/notices', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// GET /api/notices/:id - 특정 공지사항 조회
app.get('/api/notices/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    const { results } = await env.DB.prepare(
      'SELECT * FROM notices WHERE id = ?'
    ).bind(id).all()
    
    if (!results || results.length === 0) {
      return c.json({ error: 'Notice not found' }, 404)
    }
    
    // Increment views
    await env.DB.prepare(
      'UPDATE notices SET views = views + 1 WHERE id = ?'
    ).bind(id).run()
    
    return c.json(results[0])
  } catch (error: any) {
    console.error('Error fetching notice:', error)
    return c.json({ error: error.message }, 500)
  }
})

// POST /api/notices - 새 공지사항 생성
// POST /tables/notices
app.post('/api/notices', async (c) => {
  try {
    const { env } = c
    const body = await c.req.json()
    
    const id = generateId()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      INSERT INTO notices (
        id, title, content, author, is_active,
        pinned, views, complex_code,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.title,
      body.content,
      body.author || 'admin',
      body.is_active !== undefined ? body.is_active : 1,
      body.pinned || 0,
      0,
      body.complex_code || 'cheongju-sk',
      now,
      now
    ).run()
    
    return c.json({ id, success: true }, 201)
  } catch (error: any) {
    console.error('Error creating notice:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.post('/tables/notices', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PUT /api/notices/:id - 공지사항 전체 수정
// PUT /tables/notices/:id
app.put('/api/notices/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      UPDATE notices SET
        title = ?, content = ?, author = ?,
        is_active = ?, pinned = ?, complex_code = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      body.title,
      body.content,
      body.author || 'admin',
      body.is_active !== undefined ? body.is_active : 1,
      body.pinned || 0,
      body.complex_code || 'cheongju-sk',
      now,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating notice:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.put('/tables/notices/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PATCH /api/notices/:id - 공지사항 부분 수정
// PATCH /tables/notices/:id
app.patch('/api/notices/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    const updates: string[] = []
    const values: any[] = []
    
    Object.keys(body).forEach(key => {
      if (key !== 'id') {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    })
    
    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }
    
    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)
    
    await env.DB.prepare(
      `UPDATE notices SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error patching notice:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.patch('/tables/notices/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// DELETE /api/notices/:id - 공지사항 삭제
// DELETE /tables/notices/:id
app.delete('/api/notices/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    await env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(id).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting notice:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/tables/notices/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// ============================================
// Instructors API (강사 관리)
// ============================================

// GET /api/instructors - 모든 강사 조회
// GET /tables/instructors
app.get('/api/instructors', async (c) => {
  try {
    const { env } = c
    const { limit, orderBy, complex } = parseQueryParams(c)
    
    let query = 'SELECT * FROM instructors WHERE 1=1'
    const params: any[] = []
    
    if (complex) {
      query += ' AND complex_code = ?'
      params.push(complex)
    }
    
    query += ` ORDER BY display_order ASC, ${orderBy} LIMIT ?`
    params.push(limit)
    
    const { results } = await env.DB.prepare(query).bind(...params).all()
    
    return c.json(results || [])
  } catch (error: any) {
    console.error('Error fetching instructors:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.get('/tables/instructors', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// GET /api/instructors/:id - 특정 강사 조회
app.get('/api/instructors/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    const { results } = await env.DB.prepare(
      'SELECT * FROM instructors WHERE id = ?'
    ).bind(id).all()
    
    if (!results || results.length === 0) {
      return c.json({ error: 'Instructor not found' }, 404)
    }
    
    return c.json(results[0])
  } catch (error: any) {
    console.error('Error fetching instructor:', error)
    return c.json({ error: error.message }, 500)
  }
})

// POST /api/instructors - 새 강사 생성
// POST /tables/instructors
app.post('/api/instructors', async (c) => {
  try {
    const { env } = c
    const body = await c.req.json()
    
    const id = generateId()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      INSERT INTO instructors (
        id, name, bio, profile_image, certifications,
        specialties, email, phone, is_active,
        display_order, complex_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.name,
      body.bio || null,
      body.profile_image || null,
      body.certifications || null,
      body.specialties || null,
      body.email || null,
      body.phone || null,
      body.is_active !== undefined ? body.is_active : 1,
      body.display_order || 0,
      body.complex_code || 'cheongju-sk',
      now,
      now
    ).run()
    
    return c.json({ id, success: true }, 201)
  } catch (error: any) {
    console.error('Error creating instructor:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.post('/tables/instructors', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PUT /api/instructors/:id - 강사 전체 수정
// PUT /tables/instructors/:id
app.put('/api/instructors/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      UPDATE instructors SET
        name = ?, bio = ?, profile_image = ?,
        certifications = ?, specialties = ?,
        email = ?, phone = ?, is_active = ?,
        display_order = ?, complex_code = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      body.name,
      body.bio || null,
      body.profile_image || null,
      body.certifications || null,
      body.specialties || null,
      body.email || null,
      body.phone || null,
      body.is_active !== undefined ? body.is_active : 1,
      body.display_order || 0,
      body.complex_code || 'cheongju-sk',
      now,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating instructor:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.put('/tables/instructors/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PATCH /api/instructors/:id - 강사 부분 수정
// PATCH /tables/instructors/:id
app.patch('/api/instructors/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    const updates: string[] = []
    const values: any[] = []
    
    Object.keys(body).forEach(key => {
      if (key !== 'id') {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    })
    
    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }
    
    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)
    
    await env.DB.prepare(
      `UPDATE instructors SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error patching instructor:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.patch('/tables/instructors/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// DELETE /api/instructors/:id - 강사 삭제
// DELETE /tables/instructors/:id
app.delete('/api/instructors/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    await env.DB.prepare('DELETE FROM instructors WHERE id = ?').bind(id).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting instructor:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/tables/instructors/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// ============================================
// Curriculums API (커리큘럼)
// ============================================

// GET /api/curriculums - 모든 커리큘럼 조회
// GET /tables/curriculums
app.get('/api/curriculums', async (c) => {
  try {
    const { env } = c
    const { limit, orderBy, complex } = parseQueryParams(c)
    
    let query = 'SELECT * FROM curriculums WHERE 1=1'
    const params: any[] = []
    
    if (complex) {
      query += ' AND complex_code = ?'
      params.push(complex)
    }
    
    query += ` ORDER BY ${orderBy} LIMIT ?`
    params.push(limit)
    
    const { results } = await env.DB.prepare(query).bind(...params).all()
    
    return c.json(results || [])
  } catch (error: any) {
    console.error('Error fetching curriculums:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.get('/tables/curriculums', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// GET /api/curriculums/:id - 특정 커리큘럼 조회
app.get('/api/curriculums/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    const { results } = await env.DB.prepare(
      'SELECT * FROM curriculums WHERE id = ?'
    ).bind(id).all()
    
    if (!results || results.length === 0) {
      return c.json({ error: 'Curriculum not found' }, 404)
    }
    
    return c.json(results[0])
  } catch (error: any) {
    console.error('Error fetching curriculum:', error)
    return c.json({ error: error.message }, 500)
  }
})

// POST /api/curriculums - 새 커리큘럼 생성
// POST /tables/curriculums
app.post('/api/curriculums', async (c) => {
  try {
    const { env } = c
    const body = await c.req.json()
    
    const id = generateId()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      INSERT INTO curriculums (
        id, title, month, description, image_url,
        content, is_active, complex_code,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.title,
      body.month,
      body.description || null,
      body.image_url || null,
      body.content || null,
      body.is_active !== undefined ? body.is_active : 1,
      body.complex_code || 'cheongju-sk',
      now,
      now
    ).run()
    
    return c.json({ id, success: true }, 201)
  } catch (error: any) {
    console.error('Error creating curriculum:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.post('/tables/curriculums', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PUT /api/curriculums/:id - 커리큘럼 전체 수정
// PUT /tables/curriculums/:id
app.put('/api/curriculums/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      UPDATE curriculums SET
        title = ?, month = ?, description = ?,
        image_url = ?, content = ?, is_active = ?,
        complex_code = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      body.title,
      body.month,
      body.description || null,
      body.image_url || null,
      body.content || null,
      body.is_active !== undefined ? body.is_active : 1,
      body.complex_code || 'cheongju-sk',
      now,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating curriculum:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.put('/tables/curriculums/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PATCH /api/curriculums/:id - 커리큘럼 부분 수정
// PATCH /tables/curriculums/:id
app.patch('/api/curriculums/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    const updates: string[] = []
    const values: any[] = []
    
    Object.keys(body).forEach(key => {
      if (key !== 'id') {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    })
    
    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }
    
    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)
    
    await env.DB.prepare(
      `UPDATE curriculums SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error patching curriculum:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.patch('/tables/curriculums/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// DELETE /api/curriculums/:id - 커리큘럼 삭제
// DELETE /tables/curriculums/:id
app.delete('/api/curriculums/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    await env.DB.prepare('DELETE FROM curriculums WHERE id = ?').bind(id).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting curriculum:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/tables/curriculums/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// ============================================
// Cancellations API (취소/환불 신청)
// ============================================

// GET /api/cancellations - 모든 취소/환불 신청 조회
// GET /tables/pilates_cancellations
app.get('/api/cancellations', async (c) => {
  try {
    const { env } = c
    const { limit, orderBy } = parseQueryParams(c)
    
    const query = `SELECT * FROM pilates_cancellations ORDER BY ${orderBy} LIMIT ?`
    const { results } = await env.DB.prepare(query).bind(limit).all()
    
    return c.json(results || [])
  } catch (error: any) {
    console.error('Error fetching cancellations:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.get('/tables/pilates_cancellations', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// GET /api/cancellations/:id - 특정 취소/환불 신청 조회
app.get('/api/cancellations/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    const { results } = await env.DB.prepare(
      'SELECT * FROM pilates_cancellations WHERE id = ?'
    ).bind(id).all()
    
    if (!results || results.length === 0) {
      return c.json({ error: 'Cancellation not found' }, 404)
    }
    
    return c.json(results[0])
  } catch (error: any) {
    console.error('Error fetching cancellation:', error)
    return c.json({ error: error.message }, 500)
  }
})

// POST /api/cancellations - 새 취소/환불 신청 생성
// POST /tables/pilates_cancellations
app.post('/api/cancellations', async (c) => {
  try {
    const { env } = c
    const body = await c.req.json()
    
    const id = generateId()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      INSERT INTO pilates_cancellations (
        id, contract_id, dong, ho, name, phone,
        lesson_type, reason, refund_bank, refund_account,
        refund_holder, status, admin_note, processed_date,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.contract_id || null,
      body.dong,
      body.ho,
      body.name,
      body.phone,
      body.lesson_type,
      body.reason,
      body.refund_bank || null,
      body.refund_account || null,
      body.refund_holder || null,
      body.status || 'pending',
      body.admin_note || null,
      body.processed_date || null,
      now,
      now
    ).run()
    
    return c.json({ id, success: true }, 201)
  } catch (error: any) {
    console.error('Error creating cancellation:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.post('/tables/pilates_cancellations', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PUT /api/cancellations/:id - 취소/환불 신청 전체 수정
// PUT /tables/pilates_cancellations/:id
app.put('/api/cancellations/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      UPDATE pilates_cancellations SET
        contract_id = ?, dong = ?, ho = ?, name = ?,
        phone = ?, lesson_type = ?, reason = ?,
        refund_bank = ?, refund_account = ?, refund_holder = ?,
        status = ?, admin_note = ?, processed_date = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      body.contract_id || null,
      body.dong,
      body.ho,
      body.name,
      body.phone,
      body.lesson_type,
      body.reason,
      body.refund_bank || null,
      body.refund_account || null,
      body.refund_holder || null,
      body.status || 'pending',
      body.admin_note || null,
      body.processed_date || null,
      now,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating cancellation:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.put('/tables/pilates_cancellations/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PATCH /api/cancellations/:id - 취소/환불 신청 부분 수정
// PATCH /tables/pilates_cancellations/:id
app.patch('/api/cancellations/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    const updates: string[] = []
    const values: any[] = []
    
    Object.keys(body).forEach(key => {
      if (key !== 'id') {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    })
    
    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }
    
    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)
    
    await env.DB.prepare(
      `UPDATE pilates_cancellations SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error patching cancellation:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.patch('/tables/pilates_cancellations/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// DELETE /api/cancellations/:id - 취소/환불 신청 삭제
// DELETE /tables/pilates_cancellations/:id
app.delete('/api/cancellations/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    await env.DB.prepare('DELETE FROM pilates_cancellations WHERE id = ?').bind(id).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting cancellation:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/tables/pilates_cancellations/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// ============================================
// Complex Settings API (단지 관리)
// ============================================

// GET /api/complex-settings - 모든 단지 설정 조회
// GET /tables/complex_settings
app.get('/api/complex-settings', async (c) => {
  try {
    const { env } = c
    const { limit } = parseQueryParams(c)
    
    const query = 'SELECT * FROM complex_settings ORDER BY display_order ASC LIMIT ?'
    const { results } = await env.DB.prepare(query).bind(limit).all()
    
    return c.json(results || [])
  } catch (error: any) {
    console.error('Error fetching complex settings:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.get('/tables/complex_settings', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// GET /api/complex-settings/:id - 특정 단지 설정 조회
app.get('/api/complex-settings/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    const { results } = await env.DB.prepare(
      'SELECT * FROM complex_settings WHERE id = ? OR complex_code = ?'
    ).bind(id, id).all()
    
    if (!results || results.length === 0) {
      return c.json({ error: 'Complex setting not found' }, 404)
    }
    
    return c.json(results[0])
  } catch (error: any) {
    console.error('Error fetching complex setting:', error)
    return c.json({ error: error.message }, 500)
  }
})

// POST /api/complex-settings - 새 단지 설정 생성
// POST /tables/complex_settings
app.post('/api/complex-settings', async (c) => {
  try {
    const { env } = c
    const body = await c.req.json()
    
    const id = generateId()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      INSERT INTO complex_settings (
        id, complex_code, complex_name, address,
        contact_phone, contact_email, admin_password,
        master_password, is_active, display_order,
        settings_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.complex_code,
      body.complex_name,
      body.address || null,
      body.contact_phone || null,
      body.contact_email || null,
      body.admin_password || 'admin1234',
      body.master_password || null,
      body.is_active !== undefined ? body.is_active : 1,
      body.display_order || 0,
      body.settings_json || null,
      now,
      now
    ).run()
    
    return c.json({ id, success: true }, 201)
  } catch (error: any) {
    console.error('Error creating complex setting:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.post('/tables/complex_settings', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PUT /api/complex-settings/:id - 단지 설정 전체 수정
// PUT /tables/complex_settings/:id
app.put('/api/complex-settings/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    await env.DB.prepare(`
      UPDATE complex_settings SET
        complex_code = ?, complex_name = ?, address = ?,
        contact_phone = ?, contact_email = ?,
        admin_password = ?, master_password = ?,
        is_active = ?, display_order = ?,
        settings_json = ?, updated_at = ?
      WHERE id = ? OR complex_code = ?
    `).bind(
      body.complex_code,
      body.complex_name,
      body.address || null,
      body.contact_phone || null,
      body.contact_email || null,
      body.admin_password || 'admin1234',
      body.master_password || null,
      body.is_active !== undefined ? body.is_active : 1,
      body.display_order || 0,
      body.settings_json || null,
      now,
      id,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error updating complex setting:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.put('/tables/complex_settings/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// PATCH /api/complex-settings/:id - 단지 설정 부분 수정
// PATCH /tables/complex_settings/:id
app.patch('/api/complex-settings/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    const body = await c.req.json()
    const now = getCurrentTimestamp()
    
    const updates: string[] = []
    const values: any[] = []
    
    Object.keys(body).forEach(key => {
      if (key !== 'id') {
        updates.push(`${key} = ?`)
        values.push(body[key])
      }
    })
    
    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }
    
    updates.push('updated_at = ?')
    values.push(now)
    values.push(id)
    values.push(id)
    
    await env.DB.prepare(
      `UPDATE complex_settings SET ${updates.join(', ')} WHERE id = ? OR complex_code = ?`
    ).bind(...values).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error patching complex setting:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.patch('/tables/complex_settings/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// DELETE /api/complex-settings/:id - 단지 설정 삭제
// DELETE /tables/complex_settings/:id
app.delete('/api/complex-settings/:id', async (c) => {
  try {
    const { env } = c
    const id = c.req.param('id')
    
    await env.DB.prepare(
      'DELETE FROM complex_settings WHERE id = ? OR complex_code = ?'
    ).bind(id, id).run()
    
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting complex setting:', error)
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/tables/complex_settings/:id', async (c) => {
  return app.fetch(c.req.raw, c.env)
})

// ============================================
// Statistics API (통계)
// ============================================

// GET /api/statistics/dashboard - 대시보드 통계
app.get('/api/statistics/dashboard', async (c) => {
  try {
    const { env } = c
    const complex = c.req.query('complex') || 'cheongju-sk'
    
    // 총 신청서 수
    const { results: contractsCount } = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM pilates_contracts WHERE complex_code = ?'
    ).bind(complex).all()
    
    // 승인된 신청서 수
    const { results: approvedCount } = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM pilates_contracts WHERE complex_code = ? AND status = ?'
    ).bind(complex, 'approved').all()
    
    // 대기 중인 신청서 수
    const { results: waitingCount } = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM pilates_contracts WHERE complex_code = ? AND status = ?'
    ).bind(complex, 'waiting').all()
    
    // 총 문의사항 수
    const { results: inquiriesCount } = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM pilates_inquiries'
    ).all()
    
    // 처리 대기 중인 문의사항 수
    const { results: pendingInquiriesCount } = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM pilates_inquiries WHERE status = ?'
    ).bind('pending').all()
    
    // 프로그램별 신청 현황
    const { results: programStats } = await env.DB.prepare(`
      SELECT lesson_type, COUNT(*) as count 
      FROM pilates_contracts 
      WHERE complex_code = ? AND status = ?
      GROUP BY lesson_type
      ORDER BY count DESC
    `).bind(complex, 'approved').all()
    
    return c.json({
      totalContracts: contractsCount?.[0]?.total || 0,
      approvedContracts: approvedCount?.[0]?.total || 0,
      waitingContracts: waitingCount?.[0]?.total || 0,
      totalInquiries: inquiriesCount?.[0]?.total || 0,
      pendingInquiries: pendingInquiriesCount?.[0]?.total || 0,
      programStats: programStats || []
    })
  } catch (error: any) {
    console.error('Error fetching statistics:', error)
    return c.json({ error: error.message }, 500)
  }
})

// ============================================
// Default Routes
// ============================================

// Redirect root to index.html
app.get('/', (c) => {
  return c.redirect('/index.html')
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err)
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

export default app
