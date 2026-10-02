import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import LibraryPage from './pages/LibraryPage';
import PaperDetailsPage from './pages/PaperDetailsPage';
import './App.css';

function App() {
  return (
    <Router><div className="app-shell">
      <header className="topbar"><a className="brand" href="/">ResearchLLM</a><nav><a href="/">Home</a><a href="/library">My Library</a></nav></header>
      <main className="content"><Routes><Route path="/" element={<SearchPage />} /><Route path="/library" element={<LibraryPage />} /><Route path="/paper/:id" element={<PaperDetailsPage />} /></Routes></main>
    </div></Router>
  );
}

export default App;