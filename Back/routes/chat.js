const express = require('express');
const { chat, getChatHistory } = require('../controller/chatController');
const router = express.Router();

router.post('/', chat);
router.get('/history', getChatHistory);

module.exports = router;
