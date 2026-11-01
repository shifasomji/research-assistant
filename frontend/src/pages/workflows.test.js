import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SearchPage from './SearchPage';
import LibraryPage from './LibraryPage';
import PaperDetailsPage from './PaperDetailsPage';
import * as api from '../services/apiService';

jest.mock('../services/apiService', () => ({
  ...jest.requireActual('../services/apiService'),
  searchPapers: jest.fn(), uploadPaper: jest.fn(), savePaper: jest.fn(),
  getLibrary: jest.fn(), deletePaper: jest.fn(), getPaper: jest.fn(), askAI: jest.fn(),
}));
const paper = { id: 1, title: 'Research findings', authors: ['Ada'], abstract: 'The abstract', year: 2024, source: 'search' };
beforeEach(() => jest.clearAllMocks());
const searchInput = () => screen.getByPlaceholderText('Search by title, topic, or keyword…');
const runSearch = () => {
  fireEvent.change(searchInput(), { target: { value: 'AI' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
};
test('blank search and upload without a file do not call the API', () => {
  render(<SearchPage />);
  fireEvent.change(searchInput(), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByRole('button', { name: 'Upload PDF' }));
  expect(api.searchPapers).not.toHaveBeenCalled();
  expect(api.uploadPaper).not.toHaveBeenCalled();
});
test('search via Enter orders results newest first, with missing years last', async () => {
  api.searchPapers.mockResolvedValue({ data: [{ ...paper, id: 2, title: 'Undated', year: null }, paper, { ...paper, id: 3, title: 'Newest', year: 2026 }] });
  render(<SearchPage />);
  fireEvent.change(searchInput(), { target: { value: 'AI' } });
  fireEvent.keyDown(searchInput(), { key: 'Enter' });
  await screen.findByText('Newest');
  expect(api.searchPapers).toHaveBeenCalledWith('AI');
  expect(screen.getAllByRole('heading', { level: 3 }).map(x => x.textContent)).toEqual(['Newest', 'Research findings', 'Undated']);
});
test('empty search results render without paper cards', async () => {
  api.searchPapers.mockResolvedValue({ data: [] });
  render(<SearchPage />); runSearch();
  await waitFor(() => expect(screen.queryByText('Searching…')).not.toBeInTheDocument());
  expect(screen.queryAllByRole('article')).toHaveLength(0);
});
for (const [error, message] of [[{ response: { data: { error: 'Provider unavailable' } } }, 'Provider unavailable'], [new Error('offline'), 'Search failed.']]) {
  test(`search displays ${message}`, async () => {
    api.searchPapers.mockRejectedValue(error);
    render(<SearchPage />); runSearch();
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
}
test('saving a search result shows success and a failed save can be retried', async () => {
  api.searchPapers.mockResolvedValue({ data: [paper] });
  api.savePaper.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: paper });
  render(<SearchPage />); runSearch();
  const save = await screen.findByRole('button', { name: 'Save to library' });
  fireEvent.click(save);
  await waitFor(() => expect(api.savePaper).toHaveBeenCalledTimes(1));
  fireEvent.click(save);
  expect(await screen.findByRole('button', { name: 'Saved ✓' })).toBeInTheDocument();
  expect(api.savePaper).toHaveBeenLastCalledWith(paper);
});
test('PDF upload sends multipart data and displays processing errors', async () => {
  api.uploadPaper.mockRejectedValue({ response: { data: { error: 'The PDF could not be processed.' } } });
  const { container } = render(<SearchPage />);
  const file = new File(['invalid PDF'], 'paper.pdf', { type: 'application/pdf' });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload PDF' }));
  expect(await screen.findByText('The PDF could not be processed.')).toBeInTheDocument();
  expect(api.uploadPaper.mock.calls[0][0].get('file')).toBe(file);
});
test('library shows saved papers and removes them after API success', async () => {
  api.getLibrary.mockResolvedValue({ data: [paper] });
  api.deletePaper.mockResolvedValue({});
  render(<LibraryPage />);
  expect(await screen.findByRole('link', { name: paper.title })).toHaveAttribute('href', '/paper/1');
  expect(screen.getByText('1 saved')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(await screen.findByText(/Your library is empty/)).toBeInTheDocument();
  expect(api.deletePaper).toHaveBeenCalledWith(1);
});
test('empty library offers getting started guidance', async () => {
  api.getLibrary.mockResolvedValue({ data: [] });
  render(<LibraryPage />);
  await waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(1));
  expect(screen.getByText(/Your library is empty/)).toBeInTheDocument();
});
function renderDetails() {
  api.getPaper.mockResolvedValue({ data: paper });
  render(<MemoryRouter initialEntries={['/paper/1']}><Routes><Route path="/paper/:id" element={<PaperDetailsPage />} /></Routes></MemoryRouter>);
}
test('paper details summarize and answer questions, blocking blank input and concurrent requests', async () => {
  let resolveSummary;
  api.askAI.mockImplementationOnce(() => new Promise(resolve => { resolveSummary = resolve; }));
  renderDetails();
  expect(screen.getByText('Loading paper…')).toBeInTheDocument();
  await screen.findByRole('heading', { name: paper.title });
  const ask = screen.getByRole('button', { name: 'Ask AI' });
  expect(ask).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Summarize paper' }));
  expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
  expect(ask).toBeDisabled();
  expect(api.askAI).toHaveBeenCalledWith({ paperId: '1', question: '', mode: 'summary' });
  resolveSummary({ data: { answer: 'Summary text' } });
  await screen.findByText('Summary text');
  const input = screen.getByPlaceholderText('Ask a question about the paper…');
  fireEvent.change(input, { target: { value: '   ' } }); expect(ask).toBeDisabled();
  fireEvent.change(input, { target: { value: 'What are the findings?' } });
  api.askAI.mockResolvedValueOnce({ data: { answer: 'Findings answer' } });
  fireEvent.click(ask);
  expect(await screen.findByText('Findings answer')).toBeInTheDocument();
  expect(api.askAI).toHaveBeenLastCalledWith({ paperId: '1', question: 'What are the findings?', mode: 'question' });
});
for (const [error, message] of [[{ response: { data: { error: 'AI unavailable' } } }, 'AI unavailable'], [new Error('offline'), 'AI request failed.']]) {
  test(`AI displays ${message} and allows retry`, async () => {
    api.askAI.mockRejectedValueOnce(error);
    renderDetails();
    fireEvent.click(await screen.findByRole('button', { name: 'Summarize paper' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Summarize paper' })).toBeEnabled();
  });
}
