const express = require('express');
const { askLLM } = require('../controllers/llmController');
const router = express.Router();
router.post('/', askLLM);
module.exports = router;