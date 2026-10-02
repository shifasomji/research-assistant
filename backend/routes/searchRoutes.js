const express = require('express');
const { searchPapers, savePaper } = require('../controllers/searchController');
const router = express.Router();
router.get('/', searchPapers);
router.post('/save', savePaper);
module.exports = router;