const express = require('express');
const { register, login, getMe } = require('../controller/authController');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, getMe);

module.exports = router;
