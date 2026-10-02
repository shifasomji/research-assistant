const axios = require('axios');
const paperModel = require('../models/paperModel');

function cleanAbstract(value) {
  let text = String(value || '');
  for (let pass = 0; pass < 2; pass += 1) {
    text = text
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
  }
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || 'No abstract available.';
}

async function searchPapers(req, res) {
  const query = String(req.query.query || '').trim();
  if (!query) return res.status(400).json({ error: 'A search query is required.' });
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    try {
      const response = await axios.get('https://api.semanticscholar.org/graph/v1/paper/search', {
        params: { query, limit, fields: 'title,authors,abstract,year,url,openAccessPdf,externalIds' },
        headers: process.env.SEMANTIC_SCHOLAR_API_KEY ? { 'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY } : {},
        timeout: 15000,
      });
      const papers = response.data.data || [];
      if (papers.length > 0) return res.json(papers.map((paper) => ({
        id: paper.paperId || paper.externalIds?.DOI || paper.url,
        title: paper.title || 'Untitled paper',
        authors: (paper.authors || []).map((author) => author.name),
        abstract: cleanAbstract(paper.abstract),
        year: paper.year,
        link: paper.openAccessPdf?.url || paper.url || '',
      })));
      throw new Error('Semantic Scholar returned no results');
    } catch (semanticScholarError) {
      const response = await axios.get('https://api.crossref.org/works', {
        params: { query, rows: limit, select: 'DOI,title,author,abstract,published,URL' },
        timeout: 15000,
      });
      return res.json((response.data.message.items || []).map((paper) => ({
        id: paper.DOI,
        title: paper.title?.[0] || 'Untitled paper',
        authors: (paper.author || []).map((author) => [author.given, author.family].filter(Boolean).join(' ')),
        abstract: cleanAbstract(paper.abstract),
        year: paper.published?.['date-parts']?.[0]?.[0],
        link: paper.URL || `https://doi.org/${paper.DOI}`,
      })));
    }
  } catch (error) {
    return res.status(502).json({ error: 'Paper search is temporarily unavailable.' });
  }
}

async function savePaper(req, res) {
  try {
    const paper = await paperModel.create({ ...req.body, abstract: cleanAbstract(req.body.abstract), source: 'search' });
    return res.status(201).json(paper);
  } catch (error) {
    return res.status(500).json({ error: 'Unable to save paper.' });
  }
}

module.exports = { searchPapers, savePaper };