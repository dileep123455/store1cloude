const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Secret key for JWT signing
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

// PostgreSQL Database Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize database tables on server start
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        date_of_birth DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        color VARCHAR(30) DEFAULT '#1e293b',
        is_pinned BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database tables initialized successfully.');
  } catch (err) {
    console.error('Error initializing database tables:', err);
  }
}
initDB();

// Middleware: Verify JWT Token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. Token missing.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
}

// ================= API ENDPOINTS =================

// 1. SIGN UP
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, dob } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, date_of_birth) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email',
      [name, email, hashedPassword, dob || null]
    );

    const token = jwt.sign({ userId: newUser.rows[0].id, name: newUser.rows[0].full_name }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Account created!', token, user: newUser.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. LOG IN
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please provide email and password.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id, name: user.full_name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful!', token, user: { id: user.id, full_name: user.full_name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET ALL NOTES
app.get('/api/notes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notes WHERE user_id = $1 ORDER BY is_pinned DESC, created_at DESC',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. CREATE A NOTE
app.post('/api/notes', authenticateToken, async (req, res) => {
  const { title, content, color } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO notes (user_id, title, content, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.userId, title || 'Untitled Note', content, color || '#1e293b']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. TOGGLE PIN STATUS
app.patch('/api/notes/:id/pin', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { is_pinned } = req.body;
  try {
    await pool.query('UPDATE notes SET is_pinned = $1 WHERE id = $2 AND user_id = $3', [is_pinned, id, req.user.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. DELETE A NOTE
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
