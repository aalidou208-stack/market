const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

module.exports = function (db) {

  // ─── Create order ───
  router.post('/', optionalAuth, async (req, res) => {
    try {
      const {
        product_id, quantity = 1, variants_selected,
        customer_name, customer_phone, customer_address,
        payment_method, delivery_method
      } = req.body;

      if (!product_id) return res.status(400).json({ message: 'Produit requis' });
      if (!customer_name || !customer_phone) {
        return res.status(400).json({ message: 'Nom et téléphone du client requis' });
      }

      // Get product
      const product = await db.query(
        'SELECT id, seller_id, price, stock, name FROM products WHERE id = $1 AND is_active = TRUE',
        [product_id]
      );
      if (product.rows.length === 0) return res.status(404).json({ message: 'Produit non trouvé' });

      const p = product.rows[0];
      const totalAmount = p.price * quantity;

      // Check stock
      if (p.stock !== null && p.stock < quantity) {
        return res.status(400).json({ message: 'Stock insuffisant' });
      }

      // Generate order number
      const orderNumber = 'ORD-' + Date.now().toString(36).toUpperCase();

      const orderId = uuidv4();
      await db.query(`
        INSERT INTO orders (
          id, order_number, buyer_id, seller_id, product_id,
          quantity, unit_price, total_amount, variants_selected,
          customer_name, customer_phone, customer_address,
          payment_method, delivery_method
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        orderId, orderNumber,
        req.user?.id || null, p.seller_id, product_id,
        quantity, p.price, totalAmount,
        JSON.stringify(variants_selected || {}),
        customer_name, customer_phone, customer_address || null,
        payment_method || 'mobile_money', delivery_method || null
      ]);

      // Update stock
      if (p.stock !== null) {
        await db.query(
          'UPDATE products SET stock = stock - $1, order_count = order_count + 1 WHERE id = $2',
          [quantity, product_id]
        );
      }

      res.status(201).json({
        order_id: orderId,
        order_number: orderNumber,
        total_amount: totalAmount,
        message: 'Commande créée'
      });
    } catch (err) {
      console.error('create order error:', err);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  return router;
};