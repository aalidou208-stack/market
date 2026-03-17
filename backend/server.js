// ============================================================
// AfriMarket — Backend Entry Point
// backend/server.js
// ============================================================

require('dotenv').config();
const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');
const path        = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Sécurité ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:5500', 'http://127.0.0.1:5500'],
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logs ──────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ──────────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter   = rateLimit({ windowMs: 15*60*1000, max: 10,  message: { message: 'Trop de tentatives. Réessayez dans 15 minutes.' } });
const otpLimiter    = rateLimit({ windowMs: 60*1000,    max: 3,   message: { message: 'Trop de demandes OTP. Attendez 1 minute.' } });

app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',     authLimiter, require('./src/routes/auth.routes'));
app.use('/api/auth/otp', otpLimiter);
app.use('/api/sellers',  require('./src/routes/seller.routes'));
app.use('/api/products', require('./src/routes/product.routes'));
app.use('/api/stores',   require('./src/routes/store.routes'));
app.use('/api/orders',   require('./src/routes/order.routes'));
app.use('/api/payments', require('./src/routes/payment.routes'));
app.use('/api/admin',    require('./src/routes/admin.routes'));
app.use('/api/stats',    require('./src/routes/stats.routes'));

// ── Health check ───────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── 404 ────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: 'Route introuvable.' }));

// ── Erreurs globales ───────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Fichier trop volumineux (max 5 Mo).' });
    return res.status(400).json({ message: err.message });
  }
  console.error('[ERROR]', err.stack || err);
  res.status(err.status || 500).json({ message: err.message || 'Erreur interne du serveur.' });
});

app.listen(PORT, () => console.log(`✅ AfriMarket API démarrée sur http://localhost:${PORT}`));

module.exports = app;
