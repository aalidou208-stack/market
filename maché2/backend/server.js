require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database ───
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test DB connection
db.query('SELECT NOW()')
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch(err => console.error('❌ PostgreSQL connection error:', err.message));

// ─── Middleware ───
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static uploads ───
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// ─── Request logging ───
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ─── API Routes ───
app.use('/api/auth', require('./routes/auth')(db));
app.use('/api/sellers', require('./routes/sellers')(db));
app.use('/api/products', require('./routes/products')(db));
app.use('/api/orders', require('./routes/orders')(db));
app.use('/api/stats', require('./routes/stats')(db));
app.use('/api/categories', require('./routes/stats')(db)); // reuse categories from stats

// ─── Health check ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 ───
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
});

// ─── Error handler ───
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Erreur serveur interne' });
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`\n🚀 Afrimarket API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'any origin'}\n`);
});