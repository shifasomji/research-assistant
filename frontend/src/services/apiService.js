import axios from 'axios';

export const cleanAbstract = (value) => {
  let text = String(value || '');
  for (let pass = 0; pass < 2; pass += 1) {
    text = text.replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
  }
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || 'No abstract available.';
};

export const searchPapers = (query) => axios.get('/api/search', { params: { query } });
export const getLibrary = () => axios.get('/api/library');
export const getPaper = (id) => axios.get(`/api/library/${id}`);
export const savePaper = (paper) => axios.post('/api/search/save', paper);
export const deletePaper = (id) => axios.delete(`/api/library/${id}`);
export const uploadPaper = (formData) => axios.post('/api/upload', formData);
export const askAI = (payload) => axios.post('/api/llm', payload);