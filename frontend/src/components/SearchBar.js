import React from 'react';
export default function SearchBar({ value, onChange, onSearch }) {
  return <div className="search-bar"><input value={value} onChange={onChange} onKeyDown={(e) => e.key === 'Enter' && onSearch()} placeholder="Search by title, topic, or keyword…" /><button className="button" onClick={onSearch}>Search</button></div>;
}
