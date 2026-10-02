const path = require('path');
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const paperModel = require('../models/paperModel');
const { parseLocalText, enrichWithGrobid } = require('../services/pdfMetadata');

async function uploadPaper(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Please upload a PDF file.' });
  try {
    const parser = new PDFParse({ data: req.file.buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    const localMetadata = parseLocalText(parsed.text, req.file.originalname);
    const metadata = await enrichWithGrobid(req.file.buffer, localMetadata);
    const filename = `${Date.now()}-${req.file.originalname.replace(/[^a-z0-9.-]/gi, '_')}`;
    const pdfPath = path.join(__dirname, '..', 'uploads', filename);
    fs.writeFileSync(pdfPath, req.file.buffer);
    const paper = await paperModel.create({
      title: req.body.title || metadata.title,
      authors: req.body.authors ? req.body.authors.split(',').map((author) => author.trim()) : metadata.authors,
      abstract: req.body.abstract || metadata.abstract,
      year: req.body.year || metadata.year,
      pdfPath: `/uploads/${filename}`,
      fullText: parsed.text,
      source: 'upload',
    });
    return res.status(201).json(paper);
  } catch (error) {
    return res.status(422).json({ error: 'The PDF could not be processed.' });
  }
}

module.exports = { uploadPaper };