const axios = require('axios');
const paperModel = require('../models/paperModel');

async function askLLM(req, res) {
  const { paperId, question, mode = 'question' } = req.body;
  if (!paperId || !question && mode !== 'summary') return res.status(400).json({ error: 'A paper and question are required.' });
  const paper = await paperModel.findById(paperId);
  if (!paper) return res.status(404).json({ error: 'Paper not found.' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Set OPENAI_API_KEY in backend/.env to enable AI features.' });
  const prompt = mode === 'summary'
    ? 'Summarize this research paper in 5 concise bullet points, including its contribution, method, results, and limitations.'
    : `Answer this question using only the paper text. If the answer is not present, say so.\nQuestion: ${question}`;
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: (paper.fullText || paper.abstract).slice(0, 120000) }],
      temperature: 0.2,
    }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 60000 });
    return res.json({ answer: response.data.choices[0].message.content });
  } catch (error) {
    return res.status(502).json({ error: 'The AI service could not answer right now.' });
  }
}

module.exports = { askLLM };