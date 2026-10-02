const axios = require('axios');
const FormData = require('form-data');

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value) {
  return cleanText(value)
    .replace(/\s*(?:alphabetic|alphabetical)\s+author\s+list\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanAbstract(value) {
  return cleanText(value)
    .replace(/^[*∗]?\s*see\s+section\s+\d+[^.]*\.\s*/i, '')
    .replace(/^\d*\s*arxiv:\S+\s+\[[^\]]+\]\s+\d+\s+\w+\s+\d{4}\s+--\s+\d+\s+of\s+\d+\s+--\s*/i, '')
    .trim();
}

function tagValue(xml, tag, attributes = '') {
  const match = xml.match(new RegExp(`<${tag}\\b${attributes}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? cleanText(match[1]) : '';
}

function parseGrobidResponse(xml) {
  const authors = [...xml.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/gi)]
    .map((match) => {
      const person = match[1];
      const given = tagValue(person, 'forename');
      const surname = tagValue(person, 'surname');
      return [given, surname].filter(Boolean).join(' ');
    })
    .filter(Boolean);
  const year = tagValue(xml, 'date', 'type="published"') || tagValue(xml, 'date');
  return {
    title: cleanTitle(tagValue(xml, 'title', 'level="a"') || tagValue(xml, 'title')),
    authors,
    abstract: cleanAbstract(tagValue(xml, 'abstract')),
    year: Number((year.match(/\d{4}/) || [])[0]) || null,
  };
}

function parseLocalText(text, filename) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const abstractIndex = lines.findIndex((line) => /^abstract\b/i.test(line));
  const abstract = abstractIndex >= 0
    ? lines.slice(abstractIndex + 1, abstractIndex + 18).join(' ')
    : '';
  const candidates = lines.slice(0, abstractIndex >= 0 ? abstractIndex : 20).filter((line) => (
    line.length > 8
    && line.length < 180
    && !/^(proceedings|pages?|copyright|©|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|https?:|www\.|[\w.-]+@)/i.test(line)
    && !/^(January|February|March|April|May|June|July|August|September|October|November|December)\b.*\b(19|20)\d{2}\b/i.test(line)
    && !/\bpages?\s+\d+[-–]\d+\b/i.test(line)
  ));
  return {
    title: candidates.find((line) => !/university|institute|department|laborator|college|school/i.test(line))
      || filename.replace(/\.pdf$/i, ''),
    authors: [],
    abstract: cleanAbstract(abstract.replace(/^(abstract\s*:?\s*)/i, '')),
    year: Number((text.match(/\b(19|20)\d{2}\b/) || [])[0]) || null,
  };
}

async function enrichWithGrobid(buffer, fallback) {
  const grobidUrl = process.env.GROBID_URL || 'http://localhost:8070';
  const form = new FormData();
  form.append('input', buffer, { filename: 'paper.pdf', contentType: 'application/pdf' });
  try {
    const response = await axios.post(`${grobidUrl.replace(/\/$/, '')}/api/processHeaderDocument`, form, {
      headers: { ...form.getHeaders(), Accept: 'application/xml' },
      timeout: 20000,
      maxBodyLength: Infinity,
    });
    const parsed = parseGrobidResponse(response.data);
    const grobidAbstractIsFootnote = /^\*?\s*(see|for details|author contributions)\b/i.test(parsed.abstract)
      || parsed.abstract.length < 120;
    return {
      title: parsed.title || fallback.title,
      authors: parsed.authors.length ? parsed.authors : fallback.authors,
      abstract: grobidAbstractIsFootnote ? fallback.abstract : parsed.abstract,
      year: parsed.year || fallback.year,
    };
  } catch (error) {
    console.warn(`GROBID metadata extraction unavailable: ${error.code || error.message}`);
    return fallback;
  }
}

module.exports = { parseLocalText, enrichWithGrobid };
