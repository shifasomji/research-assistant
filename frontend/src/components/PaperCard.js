import React, { useState } from 'react';
import { cleanAbstract, savePaper } from '../services/apiService';

export default function PaperCard({ paper }) {
  const [saved, setSaved] = useState(false);
  const save = async () => { try { await savePaper(paper); setSaved(true); } catch (error) { setSaved(false); } };
  return <article className="paper-card"><div className="paper-meta">{paper.year || 'YEAR'} · {(paper.authors || []).slice(0, 3).join(', ') || 'Unknown authors'}</div><h3>{paper.title}</h3><p>{cleanAbstract(paper.abstract)}</p><div className="card-actions">{paper.link && <a href={paper.link} target="_blank" rel="noreferrer">Read paper ↗</a>}<button className="text-button" onClick={save}>{saved ? 'Saved ✓' : 'Save to library'}</button></div></article>;
}
