const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './uploads'),
  filename: (req, file, cb) => cb(null, `product-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = function (db) {

  // ─── List products (public) ───
  router.get('/', async (req, res) => {
    try {
      const { category, limit = 20, offset = 0, sort = 'recent', search, exclude } = req.query;

      let query = `
        SELECT p.*, s.shop_name as seller_name, s.seller_type, c.name as category
        FROM products p
        JOIN sellers s ON s.id = p.seller_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = TRUE AND s.status = 'approved'
      `;
      const params = [];
      let paramIndex = 1;

      if (category) {
        query += ` AND (p.category_id = $${paramIndex} OR c.slug = $${paramIndex})`;
        params.push(category);
        paramIndex++;
      }

      if (search) {
        query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (exclude) {
        query += ` AND p.id != $${paramIndex}`;
        params.push(exclude);
        paramIndex++;
      }

      // Sort
      switch (sort) {
        case 'price_asc': query += ' ORDER BY p.price ASC'; break;
        case 'price_desc': query += ' ORDER BY p.price DESC'; break;
        case 'popular': query += ' ORDER BY p.order_count DESC'; break;
        case 'rating': query += ' ORDER BY p.avg_rating DESC'; break;
        default: query += ' ORDER BY p.created_at DESC';
      }

      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await db.query(query, params);

      res.json({ products: result.rows, total: result.rowCount });
    } catch (err) {
      console.error('products list error:', err);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Get single product ───
  router.get('/:id', async (req, res) => {
    try {
      const result = await db.query(`
        SELECT p.*,
          s.shop_name as seller_name, s.shop_description as seller_description,
          s.seller_type, s.created_at as seller_joined,
          c.name as category
        FROM products p
        JOIN sellers s ON s.id = p.seller_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = $1
      `, [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Produit non trouvé' });
      }

      // Increment view count
      await db.query('UPDATE products SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);

      const product = result.rows[0];
      product.rating = parseFloat(product.avg_rating);

      res.json(product);
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Create product ───
  router.post('/', authMiddleware, async (req, res) => {
    try {
      const seller = await db.query('SELECT id, seller_type, status FROM sellers WHERE user_id = $1', [req.user.id]);
      if (seller.rows.length === 0) return res.status(404).json({ message: 'Boutique non trouvée' });
      if (seller.rows[0].status !== 'approved') return res.status(403).json({ message: 'Boutique non encore approuvée' });

      const s = seller.rows[0];
      const {
        name, description, price, original_price,
        category_id, stock, images, variants,
        download_url, download_limit
      } = req.body;

      if (!name || !price) return res.status(400).json({ message: 'Nom et prix requis' });

      const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

      const id = uuidv4();
      await db.query(`
        INSERT INTO products (id, seller_id, category_id, name, slug, description, price, original_price,
          stock, images, variants, seller_type, download_url, download_limit)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        id, s.id, category_id || null, name, slug, description || null,
        parseInt(price), original_price ? parseInt(original_price) : null,
        parseInt(stock) || 0, JSON.stringify(images || []),
        JSON.stringify(variants || []), s.seller_type,
        download_url || null, download_limit || null
      ]);

      res.status(201).json({ id, slug, message: 'Produit créé' });
    } catch (err) {
      console.error('create product error:', err);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Update product ───
  router.put('/:id', authMiddleware, async (req, res) => {
    try {
      const seller = await db.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (seller.rows.length === 0) return res.status(404).json({ message: 'Boutique non trouvée' });

      const { name, description, price, original_price, stock, images, variants, is_active, category_id } = req.body;

      await db.query(`
        UPDATE products SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          price = COALESCE($3, price),
          original_price = $4,
          stock = COALESCE($5, stock),
          images = COALESCE($6, images),
          variants = COALESCE($7, variants),
          is_active = COALESCE($8, is_active),
          category_id = COALESCE($9, category_id),
          updated_at = NOW()
        WHERE id = $10 AND seller_id = $11
      `, [
        name, description, price ? parseInt(price) : null,
        original_price ? parseInt(original_price) : null,
        stock != null ? parseInt(stock) : null,
        images ? JSON.stringify(images) : null,
        variants ? JSON.stringify(variants) : null,
        is_active, category_id,
        req.params.id, seller.rows[0].id
      ]);

      res.json({ message: 'Produit mis à jour' });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Delete product ───
  router.delete('/:id', authMiddleware, async (req, res) => {
    try {
      const seller = await db.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      if (seller.rows.length === 0) return res.status(404).json({ message: 'Boutique non trouvée' });

      await db.query(
        'DELETE FROM products WHERE id = $1 AND seller_id = $2',
        [req.params.id, seller.rows[0].id]
      );

      res.json({ message: 'Produit supprimé' });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Upload product image ───
  router.post('/images', authMiddleware, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Image manquante' });
      res.json({ url: `/uploads/${req.file.filename}` });
    } catch (err) {
      res.status(500).json({ message: 'Erreur upload' });
    }
  });

  // ─── Reviews ───
  router.get('/:id/reviews', async (req, res) => {
    try {
      const result = await db.query(
        'SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC',
        [req.params.id]
      );
      res.json({ reviews: result.rows });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  router.post('/:id/reviews', authMiddleware, async (req, res) => {
    try {
      const { rating, comment } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Note de 1 à 5 requise' });
      }

      const user = await db.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
      const author = user.rows[0]?.full_name || 'Anonyme';

      await db.query(
        'INSERT INTO reviews (product_id, user_id, author, rating, comment) VALUES ($1,$2,$3,$4,$5)',
        [req.params.id, req.user.id, author, rating, comment || null]
      );

      // Update product average
      const avg = await db.query(
        'SELECT AVG(rating)::numeric(2,1) as avg, COUNT(*) as count FROM reviews WHERE product_id = $1',
        [req.params.id]
      );
      await db.query(
        'UPDATE products SET avg_rating = $1, review_count = $2 WHERE id = $3',
        [avg.rows[0].avg, avg.rows[0].count, req.params.id]
      );

      res.status(201).json({ message: 'Avis ajouté' });
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  return router;
};