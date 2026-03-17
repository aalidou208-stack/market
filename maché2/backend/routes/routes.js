const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.send('API OK 🚀');
});

router.get('/categories', (req, res) => {
  res.json([]);
});

router.get('/products', (req, res) => {
  res.json([]);
});

module.exports = router;