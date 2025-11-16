const express = require('express');
const { submit, getTickets } = require('../controller/supportController');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/', submit);
router.get('/', auth, getTickets);

module.exports = router;
