const express = require('express');
const multer = require('multer');
const { uploadPaper } = require('../controllers/uploadController');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf') });
router.post('/', upload.single('file'), uploadPaper);
module.exports = router;