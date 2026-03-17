const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

module.exports = function (db) {

  // ─── Send OTP ───
  router.post('/send-otp', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: 'Numéro de téléphone requis' });

      // Generate 6-digit code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

      // Invalidate previous codes
      await db.query(
        'UPDATE otp_codes SET used = TRUE WHERE phone = $1 AND used = FALSE',
        [phone]
      );

      // Store code
      await db.query(
        'INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)',
        [phone, code, expiresAt]
      );

      // In production: send SMS via Twilio/Orange API
      // await smsService.send(phone, `Votre code Afrimarket: ${code}`);

      console.log(`[OTP] ${phone} → ${code}`); // Dev only

      res.json({ message: 'Code envoyé', expires_in: 300 });
    } catch (err) {
      console.error('send-otp error:', err);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Verify OTP ───
  router.post('/verify-otp', async (req, res) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) return res.status(400).json({ message: 'Téléphone et code requis' });

      const result = await db.query(
        `SELECT id FROM otp_codes 
         WHERE phone = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [phone, code]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ message: 'Code incorrect ou expiré' });
      }

      // Mark OTP as used
      await db.query('UPDATE otp_codes SET used = TRUE WHERE id = $1', [result.rows[0].id]);

      // Create or get user
      let user = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);

      if (user.rows.length === 0) {
        const userId = uuidv4();
        await db.query(
          'INSERT INTO users (id, phone, phone_verified, full_name) VALUES ($1, $2, TRUE, $3)',
          [userId, phone, 'Utilisateur']
        );
        user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
      } else {
        await db.query('UPDATE users SET phone_verified = TRUE WHERE phone = $1', [phone]);
      }

      const u = user.rows[0];

      // Generate JWT
      const token = jwt.sign(
        { id: u.id, phone: u.phone, role: u.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
      );

      res.json({ token, user: { id: u.id, phone: u.phone, full_name: u.full_name, role: u.role } });
    } catch (err) {
      console.error('verify-otp error:', err);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  // ─── Me ───
  router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
    try {
      const result = await db.query(
        'SELECT id, phone, full_name, email, role FROM users WHERE id = $1',
        [req.user.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: 'Utilisateur non trouvé' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  });

  return router;
};