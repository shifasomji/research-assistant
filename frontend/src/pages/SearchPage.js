import React, { useState } from 'react';
import SearchBar from '../components/SearchBar';
import PaperCard from '../components/PaperCard';
import { searchPapers, uploadPaper } from '../services/apiService';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');
  const [file, setFile] = useState(null);
  const runSearch = async () => {
    if (!query.trim()) return;
    setStatus('Searching…');
    try {
      const papers = (await searchPapers(query)).data;
      setResults(papers.sort((a, b) => {
        const yearA = Number(a.year) || 0;
        const yearB = Number(b.year) || 0;
        return yearB - yearA;
      }));
      setStatus('');
    }
    catch (error) { setStatus(error.response?.data?.error || 'Search failed.'); }
  };
  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    setStatus('Extracting PDF text…');
    const form = new FormData(); form.append('file', file);
    try { const paper = (await uploadPaper(form)).data; window.location.href = `/paper/${paper.id}`; }
    catch (error) { setStatus(error.response?.data?.error || 'Upload failed.'); }
  };
  return <><section className="hero"><p className="eyebrow">AI RESEARCH WORKSPACE</p><h1>Find clarity in the literature.</h1><p>Search scholarly papers, build your local library, and use AI to understand the work faster.</p><SearchBar value={query} onChange={(e) => setQuery(e.target.value)} onSearch={runSearch} /></section>
    <section className="section-heading"><div><p className="eyebrow">DISCOVER</p><h2>Search results</h2></div><span>{results.length ? `${results.length} papers` : ''}</span></section>
    {status && <p className="notice">{status}</p>}<div className="paper-grid">{results.map((paper) => <PaperCard key={paper.id} paper={paper} />)}</div>
    <section className="upload-panel"><div><p className="eyebrow">PRIVATE LIBRARY</p><h2>Have a PDF already?</h2><p>Upload it and we’ll extract the text for summaries and questions.</p></div><form onSubmit={upload}><input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0])} /><button className="button" type="submit">Upload PDF</button></form></section>
  </>;
}
