const express = require('express');
const { getLibrary, getPaper, deletePaper } = require('../controllers/libraryController');
const router = express.Router();
router.get('/', getLibrary);
router.get('/:id', getPaper);
router.delete('/:id', deletePaper);
module.exports = router;