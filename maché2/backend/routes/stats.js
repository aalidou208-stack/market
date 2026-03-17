const express = require('express');
const router = express.Router();

module.exports = function (db) {

  // ─── Public stats — returns real data only ───
  router.get('/public', async (req, res) => {
    try {
      const sellers = await db.query("SELECT COUNT(*) as count FROM sellers WHERE status = 'approved'");
      const products = await db.query("SELECT COUNT(*) as count FROM products WHERE is_active = TRUE");
      const orders = await db.query("SELECT COUNT(*) as count FROM orders WHERE payment_status = 'paid'");

      res.json({
        sellers: parseInt(sellers.rows[0].count),
        products: parseInt(products.rows[0].count),
        orders: parseInt(orders.rows[0].count),
      });
    } catch (err) {
      // On error, return zeros — frontend will hide the section
      res.json({ sellers: 0, products: 0, orders: 0 });
    }
  });

  // ─── Categories ───
  router.get('/', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM categories ORDER BY sort_order ASC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  return router;
};