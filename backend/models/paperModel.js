const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', 'database.sqlite'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS papers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    authors TEXT DEFAULT '[]',
    abstract TEXT DEFAULT '',
    year INTEGER,
    link TEXT DEFAULT '',
    pdf_path TEXT DEFAULT '',
    full_text TEXT DEFAULT '',
    source TEXT DEFAULT 'upload',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

const parsePaper = (paper) => ({
  ...paper,
  authors: JSON.parse(paper.authors || '[]'),
});

const list = () => new Promise((resolve, reject) => {
  db.all('SELECT * FROM papers ORDER BY created_at DESC', (error, rows) => {
    if (error) reject(error); else resolve(rows.map(parsePaper));
  });
});

const findById = (id) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM papers WHERE id = ?', [id], (error, row) => {
    if (error) reject(error); else resolve(row ? parsePaper(row) : null);
  });
});

const create = (paper) => new Promise((resolve, reject) => {
  const values = [
    paper.title || 'Untitled paper',
    JSON.stringify(paper.authors || []),
    paper.abstract || '',
    paper.year || null,
    paper.link || '',
    paper.pdfPath || '',
    paper.fullText || '',
    paper.source || 'upload',
  ];
  db.run(
    `INSERT INTO papers (title, authors, abstract, year, link, pdf_path, full_text, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    values,
    function onInsert(error) {
      if (error) return reject(error);
      findById(this.lastID).then(resolve).catch(reject);
    },
  );
});

const remove = (id) => new Promise((resolve, reject) => {
  db.run('DELETE FROM papers WHERE id = ?', [id], function onDelete(error) {
    if (error) reject(error); else resolve(this.changes > 0);
  });
});

module.exports = { list, findById, create, remove };