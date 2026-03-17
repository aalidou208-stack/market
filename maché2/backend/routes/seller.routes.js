// ============================================================
// AfriMarket — Backend : Route + Controller Seller Apply
// backend/src/routes/seller.routes.js
// ============================================================

const router     = require('express').Router();
const multer     = require('multer');
const path       = require('path');
const { body, validationResult } = require('express-validator');
const sellerCtrl = require('../controllers/seller.controller');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');

// ── Upload documents (mémoire, puis vers cloud storage) ────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter(req, file, cb) {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Format non supporté. Utilisez JPG, PNG ou PDF.'));
    }
    cb(null, true);
  },
});

const uploadDocs = upload.fields([
  { name: 'docFront',  maxCount: 1 },
  { name: 'docBack',   maxCount: 1 },
  { name: 'selfie',    maxCount: 1 },
]);

// ── Validation rules ────────────────────────────────────────
const applyRules = [
  body('personal.firstName').trim().isLength({ min: 2, max: 100 }).withMessage('Prénom requis (2–100 chars)'),
  body('personal.lastName').trim().isLength({ min: 2, max: 100 }).withMessage('Nom requis (2–100 chars)'),
  body('personal.email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('personal.phone').matches(/^\+\d{8,15}$/).withMessage('Numéro de téléphone invalide'),
  body('personal.password').isLength({ min: 8 }).withMessage('Mot de passe : minimum 8 caractères'),
  body('personal.country').isLength({ min: 2, max: 2 }).toUpperCase(),
  body('store.name').trim().isLength({ min: 3, max: 80 }).withMessage('Nom boutique requis (3–80 chars)'),
  body('store.slug').matches(/^[a-z0-9][a-z0-9-]{1,}[a-z0-9]$/).withMessage('URL invalide'),
  body('store.desc').trim().isLength({ min: 20, max: 1000 }).withMessage('Description requise (20–1000 chars)'),
  body('store.category').notEmpty().withMessage('Catégorie requise'),
  body('store.type').isIn(['physical', 'digital']).withMessage('Type invalide'),
  body('payment.provider').isIn(['orange_money', 'wave', 'mtn_momo', 'moov_money']).withMessage('Fournisseur invalide'),
  body('payment.phone').matches(/^\+\d{8,15}$/).withMessage('Numéro Mobile Money invalide'),
];

// ── Routes ──────────────────────────────────────────────────

/**
 * POST /api/sellers/apply
 * Soumettre une candidature vendeur (avec documents uploadés)
 */
router.post('/apply', uploadDocs, applyRules, sellerCtrl.apply);

/**
 * GET /api/sellers/check-slug/:slug
 * Vérifier si un slug est disponible
 */
router.get('/check-slug/:slug', sellerCtrl.checkSlug);

/**
 * GET /api/sellers/me
 * Récupérer le profil vendeur du compte connecté
 */
router.get('/me', verifyToken, requireRole('seller', 'admin'), sellerCtrl.getMe);

/**
 * PUT /api/sellers/me
 * Mettre à jour le profil vendeur
 */
router.put('/me', verifyToken, requireRole('seller'), sellerCtrl.updateMe);

/**
 * GET /api/sellers/me/stats
 * Stats du dashboard (commandes, revenus, vues)
 */
router.get('/me/stats', verifyToken, requireRole('seller'), sellerCtrl.getStats);

/**
 * GET /api/sellers/me/orders
 * Commandes reçues par le vendeur
 */
router.get('/me/orders', verifyToken, requireRole('seller'), sellerCtrl.getOrders);

/**
 * PATCH /api/sellers/me/orders/:orderId
 * Mettre à jour le statut d'une commande
 */
router.patch('/me/orders/:orderId', verifyToken, requireRole('seller'), sellerCtrl.updateOrderStatus);

module.exports = router;


// ============================================================
// backend/src/controllers/seller.controller.js
// ============================================================

const db      = require('../models/db');
const storage = require('../services/storage.service');
const email   = require('../services/email.service');
const sms     = require('../services/sms.service');
const bcrypt  = require('bcrypt');
const { validationResult } = require('express-validator');
const config  = require('../../config/app.config');

exports.apply = async (req, res) => {
  // 1. Validation
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ message: errors.array()[0].msg, errors: errors.array() });
  }

  const { personal, store, payment, delivery, processing } = req.body;
  const files = req.files || {};

  // 2. Documents obligatoires
  if (!files.docFront?.[0]) {
    return res.status(422).json({ message: 'Document d\'identité recto requis.' });
  }
  if (!files.selfie?.[0]) {
    return res.status(422).json({ message: 'Selfie avec pièce d\'identité requis.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 3. Vérifier email unique
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [personal.email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé.' });
    }

    // 4. Vérifier slug unique
    const slugExist = await client.query('SELECT id FROM stores WHERE slug = $1', [store.slug]);
    if (slugExist.rows.length > 0) {
      return res.status(409).json({ message: 'Cette URL de boutique est déjà prise.' });
    }

    // 5. Hash du mot de passe
    const passwordHash = await bcrypt.hash(personal.password, config.security.bcryptRounds);

    // 6. Créer l'utilisateur (status pending jusqu'à approbation admin)
    const userResult = await client.query(`
      INSERT INTO users (first_name, last_name, email, phone, password_hash, role, status, country_code)
      VALUES ($1, $2, $3, $4, $5, 'seller', 'pending', $6)
      RETURNING id`,
      [personal.firstName, personal.lastName, personal.email, personal.phone, passwordHash, personal.country]
    );
    const userId = userResult.rows[0].id;

    // 7. Uploader les documents vers le cloud storage (chiffrés)
    const docFrontUrl = await storage.uploadPrivate(files.docFront[0], `kyc/${userId}/doc_front`);
    const selfieUrl   = await storage.uploadPrivate(files.selfie[0],    `kyc/${userId}/selfie`);
    let docBackUrl = null;
    if (files.docBack?.[0]) {
      docBackUrl = await storage.uploadPrivate(files.docBack[0], `kyc/${userId}/doc_back`);
    }

    // 8. Créer la boutique (status pending)
    const storeResult = await client.query(`
      INSERT INTO stores (
        seller_id, name, slug, description, tagline, status,
        category_id, country_code, whatsapp_number
      ) VALUES ($1, $2, $3, $4, $5, 'pending',
        (SELECT id FROM categories WHERE slug = $6 LIMIT 1),
        $7, $8)
      RETURNING id`,
      [userId, store.name, store.slug, store.desc, store.tagline || null,
       store.category, personal.country, store.whatsapp || null]
    );
    const storeId = storeResult.rows[0].id;

    // 9. Enregistrer le dossier KYC
    await client.query(`
      INSERT INTO seller_kyc (
        user_id, store_id, store_type,
        doc_type, doc_front_url, doc_back_url, selfie_url,
        mm_provider, mm_phone, mm_account_name,
        delivery_methods, processing_time,
        status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')`,
      [
        userId, storeId, store.type,
        'cni', docFrontUrl, docBackUrl, selfieUrl,
        payment.provider, payment.phone, payment.name,
        delivery ? JSON.stringify(delivery) : '["digital"]',
        processing || '1_day',
      ]
    );

    await client.query('COMMIT');

    // 10. Notifier l'admin
    await email.sendToAdmin('new_seller_application', { userId, storeId, name: store.name });
    await sms.send(personal.phone,
      `AfriMarket : Votre dossier vendeur pour "${store.name}" a été reçu. Réponse sous 24-48h.`
    );

    // 11. Log activité
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4)',
      [userId, 'seller_application_submitted', 'store', storeId]
    );

    return res.status(201).json({
      message: 'Candidature soumise avec succès. Vous serez notifié sous 24-48h.',
      applicationId: storeId,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seller apply error:', err);
    return res.status(500).json({ message: 'Erreur serveur. Réessayez ou contactez le support.' });
  } finally {
    client.release();
  }
};

exports.checkSlug = async (req, res) => {
  const { slug } = req.params;
  if (!/^[a-z0-9][a-z0-9-]{1,}[a-z0-9]$/.test(slug)) {
    return res.status(422).json({ message: 'Format de slug invalide.' });
  }
  const result = await db.query('SELECT id FROM stores WHERE slug = $1', [slug]);
  if (result.rows.length > 0) {
    return res.status(409).json({ message: 'Cette URL est déjà utilisée.' });
  }
  return res.json({ available: true });
};

exports.getMe = async (req, res) => {
  const result = await db.query(
    `SELECT s.*, u.first_name, u.last_name, u.email, u.phone
     FROM stores s JOIN users u ON u.id = s.seller_id
     WHERE s.seller_id = $1`,
    [req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ message: 'Boutique introuvable.' });
  res.json({ store: result.rows[0] });
};

exports.updateMe = async (req, res) => {
  const { name, tagline, description, whatsappNumber, primaryColor } = req.body;
  await db.query(
    `UPDATE stores SET name=$1, tagline=$2, description=$3, whatsapp_number=$4, primary_color=$5
     WHERE seller_id=$6`,
    [name, tagline, description, whatsappNumber, primaryColor, req.user.id]
  );
  res.json({ message: 'Boutique mise à jour.' });
};

exports.getStats = async (req, res) => {
  const storeRes = await db.query('SELECT id FROM stores WHERE seller_id = $1', [req.user.id]);
  if (!storeRes.rows.length) return res.status(404).json({ message: 'Boutique introuvable.' });
  const storeId = storeRes.rows[0].id;

  const [revenue, orders, views, products] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(total),0) AS total FROM orders WHERE store_id=$1 AND status='delivered'`, [storeId]),
    db.query(`SELECT COUNT(*) AS count FROM orders WHERE store_id=$1`, [storeId]),
    db.query(`SELECT COALESCE(SUM(view_count),0) AS total FROM products WHERE store_id=$1`, [storeId]),
    db.query(`SELECT COUNT(*) AS count FROM products WHERE store_id=$1 AND status='active'`, [storeId]),
  ]);

  res.json({
    revenue:      parseInt(revenue.rows[0].total),
    orders:       parseInt(orders.rows[0].count),
    views:        parseInt(views.rows[0].total),
    products:     parseInt(products.rows[0].count),
    rating:       null, // Calculé séparément depuis la table reviews
  });
};

exports.getOrders = async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const storeRes = await db.query('SELECT id FROM stores WHERE seller_id = $1', [req.user.id]);
  if (!storeRes.rows.length) return res.status(404).json({ message: 'Boutique introuvable.' });
  const storeId = storeRes.rows[0].id;
  const offset  = (page - 1) * limit;

  let query  = `SELECT o.*, u.first_name || ' ' || u.last_name AS customer_name
                FROM orders o JOIN users u ON u.id = o.customer_id
                WHERE o.store_id = $1`;
  const params = [storeId];
  if (status) { query += ` AND o.status = $2`; params.push(status); }
  query += ` ORDER BY o.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
  params.push(limit, offset);

  const result = await db.query(query, params);
  const countR = await db.query(`SELECT COUNT(*) FROM orders WHERE store_id=$1${status ? " AND status=$2" : ""}`,
    status ? [storeId, status] : [storeId]);

  res.json({ data: result.rows, total: parseInt(countR.rows[0].count), page: +page, limit: +limit });
};

exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status, trackingCode } = req.body;
  const allowed = ['confirmed','processing','shipped','cancelled'];
  if (!allowed.includes(status)) return res.status(422).json({ message: 'Statut invalide.' });

  const storeRes = await db.query('SELECT id FROM stores WHERE seller_id = $1', [req.user.id]);
  if (!storeRes.rows.length) return res.status(404).json({ message: 'Boutique introuvable.' });

  await db.query(
    `UPDATE orders SET status=$1, tracking_code=COALESCE($2,tracking_code),
     shipped_at = CASE WHEN $1='shipped' THEN NOW() ELSE shipped_at END
     WHERE id=$3 AND store_id=$4`,
    [status, trackingCode || null, orderId, storeRes.rows[0].id]
  );

  // Notifier le client
  // await notifyCustomer(orderId, status);

  res.json({ message: 'Commande mise à jour.' });
};
