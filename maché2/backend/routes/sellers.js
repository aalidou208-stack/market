const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

module.exports = function (db) {

  // ─── Check slug availability ───
  router.get('/check-slug/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const result = await db.query('SELECT id FROM sellers WHERE shop_slug = $1', [slug]);
      res.json({ available: result.rows.length === 0, slug });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Upload document ───
  router.post('/documents', authMiddleware, upload.single('document'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Fichier manquant' });

      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({ url: fileUrl, filename: req.file.filename, size: req.file.size });
    } catch (err) {
      console.error('upload error:', err);
      res.status(500).json({ message: 'Erreur upload' });
    }
  });

  // ─── Register seller ───
  router.post('/register', authMiddleware, async (req, res) => {
    try {
      const {
        full_name, phone, email,
        seller_type, shop_name, shop_slug, shop_description,
        doc_type, momo_provider, momo_number, momo_name,
        delivery_methods, pickup_address
      } = req.body;

      // Validate required fields
      if (!seller_type || !shop_name || !shop_slug) {
        return res.status(400).json({ message: 'Données incomplètes' });
      }

      // Check slug unique
      const slugCheck = await db.query('SELECT id FROM sellers WHERE shop_slug = $1', [shop_slug]);
      if (slugCheck.rows.length > 0) {
        return res.status(400).json({ message: 'Cette URL de boutique est déjà prise' });
      }

      // Update user info
      await db.query(
        'UPDATE users SET full_name = $1, email = $2, role = $3 WHERE id = $4',
        [full_name || 'Vendeur', email, 'seller', req.user.id]
      );

      // Generate application ID
      const applicationId = 'AM-' + Date.now().toString(36).toUpperCase();

      // Create seller
      const sellerId = uuidv4();
      await db.query(`
        INSERT INTO sellers (
          id, user_id, shop_name, shop_slug, shop_description,
          seller_type, doc_type,
          momo_provider, momo_number, momo_name,
          delivery_methods, pickup_address,
          application_id, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
      `, [
        sellerId, req.user.id,
        shop_name, shop_slug, shop_description || null,
        seller_type, doc_type || null,
        momo_provider, momo_number, momo_name,
        JSON.stringify(delivery_methods || []),
        pickup_address || null,
        applicationId
      ]);

      res.status(201).json({
        message: 'Demande envoyée avec succès',
        application_id: applicationId,
        seller_id: sellerId,
        status: 'pending'
      });
    } catch (err) {
      console.error('register seller error:', err);
      if (err.code === '23505') {
        return res.status(400).json({ message: 'Vous avez déjà une boutique enregistrée' });
      }
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Dashboard ───
  router.get('/dashboard', authMiddleware, async (req, res) => {
    try {
      const seller = await db.query(`
        SELECT s.*, u.full_name, u.phone, u.email
        FROM sellers s
        JOIN users u ON u.id = s.user_id
        WHERE s.user_id = $1
      `, [req.user.id]);

      if (seller.rows.length === 0) {
        return res.status(404).json({ message: 'Boutique non trouvée' });
      }

      const s = seller.rows[0];

      // Get stats
      const productCount = await db.query(
        'SELECT COUNT(*) as count FROM products WHERE seller_id = $1 AND is_active = TRUE',
        [s.id]
      );

      const orderStats = await db.query(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(total_amount), 0) as revenue
        FROM orders WHERE seller_id = $1 AND payment_status = 'paid'
      `, [s.id]);

      // Recent orders
      const recentOrders = await db.query(`
        SELECT id, order_number, customer_name, total_amount as amount, status, created_at
        FROM orders WHERE seller_id = $1
        ORDER BY created_at DESC LIMIT 5
      `, [s.id]);

      res.json({
        ...s,
        full_name: s.full_name,
        product_count: parseInt(productCount.rows[0].count),
        order_count: parseInt(orderStats.rows[0].total),
        total_revenue: parseInt(orderStats.rows[0].revenue),
        available_balance: parseInt(s.available_balance),
        recent_orders: recentOrders.rows
      });
    } catch (err) {
      console.error('dashboard error:', err);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Orders ───
  router.get('/orders', authMiddleware, async (req, res) => {
    try {
      const seller = await db.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (seller.rows.length === 0) return res.status(404).json({ message: 'Boutique non trouvée' });

      const { status } = req.query;
      let query = `
        SELECT o.*, p.name as product_name
        FROM orders o
        LEFT JOIN products p ON p.id = o.product_id
        WHERE o.seller_id = $1
      `;
      const params = [seller.rows[0].id];

      if (status) {
        query += ' AND o.status = $2';
        params.push(status);
      }

      query += ' ORDER BY o.created_at DESC';

      const result = await db.query(query, params);
      res.json({ orders: result.rows });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Update order status ───
  router.put('/orders/:id', authMiddleware, async (req, res) => {
    try {
      const { status } = req.body;
      const seller = await db.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (seller.rows.length === 0) return res.status(404).json({ message: 'Boutique non trouvée' });

      await db.query(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND seller_id = $3',
        [status, req.params.id, seller.rows[0].id]
      );

      res.json({ message: 'Commande mise à jour' });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Products ───
  router.get('/products', authMiddleware, async (req, res) => {
    try {
      const seller = await db.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (seller.rows.length === 0) return res.status(404).json({ message: 'Boutique non trouvée' });

      const result = await db.query(
        'SELECT * FROM products WHERE seller_id = $1 ORDER BY created_at DESC',
        [seller.rows[0].id]
      );
      res.json({ products: result.rows });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Payments ───
  router.get('/payments', authMiddleware, async (req, res) => {
    try {
      const seller = await db.query(
        'SELECT id, available_balance, pending_balance, total_withdrawn FROM sellers WHERE user_id = $1',
        [req.user.id]
      );
      if (seller.rows.length === 0) return res.status(404).json({ message: 'Boutique non trouvée' });

      const s = seller.rows[0];

      const txns = await db.query(
        'SELECT * FROM transactions WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 50',
        [s.id]
      );

      res.json({
        available_balance: parseInt(s.available_balance),
        pending_amount: parseInt(s.pending_balance),
        total_withdrawn: parseInt(s.total_withdrawn),
        transactions: txns.rows
      });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Update profile ───
  router.put('/profile', authMiddleware, async (req, res) => {
    try {
      const { shop_name, shop_description, momo_provider, momo_number } = req.body;

      await db.query(`
        UPDATE sellers SET
          shop_name = COALESCE($1, shop_name),
          shop_description = COALESCE($2, shop_description),
          momo_provider = COALESCE($3, momo_provider),
          momo_number = COALESCE($4, momo_number),
          updated_at = NOW()
        WHERE user_id = $5
      `, [shop_name, shop_description, momo_provider, momo_number, req.user.id]);

      res.json({ message: 'Profil mis à jour' });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  return router;
};