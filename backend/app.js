const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const searchRoutes = require('./routes/searchRoutes');
const libraryRoutes = require('./routes/libraryRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const llmRoutes = require('./routes/llmRoutes');

app.use('/api/search', searchRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/llm', llmRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});