const express = require('express');
const { chat, getChatHistory, logConversation } = require('../controller/chatController');
const router = express.Router();

router.post('/', chat);
router.post('/log', logConversation);
router.get('/history', getChatHistory);

module.exports = router;
