const paperModel = require('../models/paperModel');

async function getLibrary(_req, res) {
  try { return res.json(await paperModel.list()); }
  catch (error) { return res.status(500).json({ error: 'Unable to load library.' }); }
}

async function getPaper(req, res) {
  try {
    const paper = await paperModel.findById(req.params.id);
    return paper ? res.json(paper) : res.status(404).json({ error: 'Paper not found.' });
  } catch (error) { return res.status(500).json({ error: 'Unable to load paper.' }); }
}

async function deletePaper(req, res) {
  try {
    const deleted = await paperModel.remove(req.params.id);
    return deleted ? res.status(204).send() : res.status(404).json({ error: 'Paper not found.' });
  } catch (error) { return res.status(500).json({ error: 'Unable to delete paper.' }); }
}

module.exports = { getLibrary, getPaper, deletePaper };