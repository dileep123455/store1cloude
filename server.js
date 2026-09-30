const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Configure Cloudinary Credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer Memory Storage with 10MB upload limit
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

// PostgreSQL Pool Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize Database Tables & Migration
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS dob DATE;

      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        color VARCHAR(20) DEFAULT '#1e293b',
        is_pinned BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE notes ADD COLUMN IF NOT EXISTS file_url TEXT;
    `);
    console.log("Database initialized successfully with file attachment support.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
};
initDb();

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token." });
    req.user = user;
    next();
  });
};

// --- AUTH ENDPOINTS ---
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, dob, password } = req.body;
  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "User already exists with this email." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userDob = dob && dob.trim() !== '' ? dob : null;

    const newUser = await pool.query(
      'INSERT INTO users (full_name, email, dob, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email',
      [name, email, userDob, passwordHash]
    );

    const user = newUser.rows[0];
    const token = jwt.sign({ userId: user.id, name: user.full_name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ message: "Registration successful!", token, user });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error during signup: " + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign({ userId: user.id, name: user.full_name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: "Login successful!",
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login." });
  }
});

// --- NOTES ENDPOINTS ---
app.get('/api/notes', authenticateToken, async (req, res) => {
  try {
    const notes = await pool.query(
      'SELECT * FROM notes WHERE user_id = $1 ORDER BY is_pinned DESC, created_at DESC',
      [req.user.userId]
    );
    res.json(notes.rows);
  } catch (err) {
    console.error("Fetch notes error:", err);
    res.status(500).json({ error: "Failed to fetch notes." });
  }
});

// Create Note with Cloudinary Upload Stream (Supports Images, PDFs & Documents)
app.post('/api/notes', authenticateToken, upload.single('attachment'), async (req, res) => {
  const { title, content, color } = req.body;
  let fileUrl = null;

  try {
    if (req.file) {
      fileUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "cloudnotes_attachments",
            resource_type: "auto", // Auto-detects PDFs, images, and raw documents
            flags: "attachment"
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(req.file.buffer);
      });
    }

    const newNote = await pool.query(
      'INSERT INTO notes (user_id, title, content, color, file_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.userId, title, content, color || '#1e293b', fileUrl]
    );

    res.json(newNote.rows[0]);
  } catch (err) {
    console.error("Save note error:", err);
    res.status(500).json({ error: "Failed to save note: " + err.message });
  }
});

app.patch('/api/notes/:id/pin', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { is_pinned } = req.body;
  try {
    await pool.query('UPDATE notes SET is_pinned = $1 WHERE id = $2 AND user_id = $3', [is_pinned, id, req.user.userId]);
    res.json({ message: "Pin status updated" });
  } catch (err) {
    console.error("Pin note error:", err);
    res.status(500).json({ error: "Failed to update note." });
  }
});

app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    res.json({ message: "Note deleted successfully" });
  } catch (err) {
    console.error("Delete note error:", err);
    res.status(500).json({ error: "Failed to delete note." });
  }
});

// --- ADMIN USER LIST ENDPOINT ---
app.get('/api/users-list', async (req, res) => {
  const adminKey = req.query.key;
  const SECRET_ADMIN_KEY = process.env.ADMIN_KEY || 'mysecretadmin123';

  if (adminKey !== SECRET_ADMIN_KEY) {
    return res.status(403).send('<h2 style="color: red; font-family: sans-serif; text-align: center; margin-top: 50px;">403 Access Denied: Unauthorized</h2>');
  }

  try {
    const users = await pool.query('SELECT id, full_name, email, dob, created_at FROM users ORDER BY id DESC');
    
    let rows = users.rows.map(user => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #334155;">${user.id}</td>
        <td style="padding: 12px; border-bottom: 1px solid #334155; font-weight: 600;">${user.full_name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #334155; color: #38bdf8;">${user.email}</td>
        <td style="padding: 12px; border-bottom: 1px solid #334155; color: #a7f3d0;">${user.dob ? new Date(user.dob).toLocaleDateString() : 'N/A'}</td>
        <td style="padding: 12px; border-bottom: 1px solid #334155; color: #94a3b8;">${new Date(user.created_at).toLocaleString()}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>CloudNotes - Admin User Directory</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; margin: 0; }
          .container { max-width: 900px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
          h1 { margin-top: 0; color: #f8fafc; font-size: 24px; border-bottom: 2px solid #334155; padding-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; text-align: left; margin-top: 20px; }
          th { padding: 12px; background: #334155; color: #94a3b8; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
          tr:hover { background: #283548; }
          .badge { background: #0284c7; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; float: right; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Registered Users <span class="badge">Total: ${users.rows.length}</span></h1>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>DOB</th>
                <th>Joined Date</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #94a3b8;">No registered users found.</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    res.status(500).send(`<h2 style="color: red; font-family: sans-serif;">Error fetching users: ${err.message}</h2>`);
  }
});

// Fallback Route to serve index.html for single-page routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
