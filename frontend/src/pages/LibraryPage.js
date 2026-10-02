import React, { useEffect, useState } from 'react';
import { cleanAbstract, getLibrary, deletePaper } from '../services/apiService';
export default function LibraryPage() {
  const [papers, setPapers] = useState([]);
  useEffect(() => { getLibrary().then((response) => setPapers(response.data)); }, []);
  const remove = async (id) => { await deletePaper(id); setPapers(papers.filter((paper) => paper.id !== id)); };
  return <><div className="section-heading"><div><p className="eyebrow">YOUR RESEARCH</p><h1>My library</h1></div><span>{papers.length} saved</span></div><div className="paper-grid">{papers.map((paper) => <article className="paper-card" key={paper.id}><div className="paper-meta">{paper.source === 'upload' ? 'UPLOADED PDF' : 'SAVED PAPER'} · {paper.year || 'YEAR'}</div><h3><a href={`/paper/${paper.id}`}>{paper.title}</a></h3><p>{paper.abstract ? cleanAbstract(paper.abstract) : 'Ready for AI analysis.'}</p><div className="card-actions"><a href={`/paper/${paper.id}`}>Ask Questions →</a><button className="text-button danger" onClick={() => remove(paper.id)}>Remove</button></div></article>)}</div>{!papers.length && <div className="empty-state">Your library is empty. Search for a paper or upload a PDF to get started.</div>}</>;
}
