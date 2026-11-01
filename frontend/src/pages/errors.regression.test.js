import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LibraryPage from './LibraryPage';
import PaperDetailsPage from './PaperDetailsPage';
import * as api from '../services/apiService';

jest.mock('../services/apiService', () => ({
  ...jest.requireActual('../services/apiService'),
  getLibrary: jest.fn(), deletePaper: jest.fn(), getPaper: jest.fn(),
}));
beforeEach(() => jest.resetAllMocks());
// These are intentionally failing robustness regressions: Jest must report the
// application's unhandled rejections. No catch/global rejection suppression or
// invented error message is used. Allow the event-loop turn to finish in-test.
const finishRequest = async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
};

test('[DEFECT] library load failure does not escape as an unhandled rejection', async () => {
  api.getLibrary.mockRejectedValueOnce(Object.assign(new Error('Library load rejected'), { response: { status: 500, data: { error: 'Unable to load library.' } } }));
  render(<LibraryPage />);
  await finishRequest();
  expect(api.getLibrary).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'My library' })).toBeInTheDocument();
});

test('[DEFECT] library deletion failure preserves the paper without an unhandled rejection', async () => {
  const paper = { id: 1, title: 'Keep this paper', abstract: 'Saved abstract', year: 2024 };
  api.getLibrary.mockResolvedValueOnce({ data: [paper] });
  api.deletePaper.mockRejectedValueOnce(Object.assign(new Error('Library deletion rejected'), { response: { status: 500, data: { error: 'Unable to delete paper.' } } }));
  render(<LibraryPage />);
  await screen.findByRole('link', { name: paper.title });
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  await finishRequest();
  expect(api.deletePaper).toHaveBeenCalledWith(1);
  expect(screen.getByRole('link', { name: paper.title })).toBeInTheDocument();
  expect(screen.getByText('1 saved')).toBeInTheDocument();
});

test('[DEFECT] paper load failure does not escape as an unhandled rejection', async () => {
  api.getPaper.mockRejectedValueOnce(Object.assign(new Error('Paper load rejected'), { response: { status: 404, data: { error: 'Paper not found.' } } }));
  render(<MemoryRouter initialEntries={['/paper/404']}><Routes><Route path="/paper/:id" element={<PaperDetailsPage />} /></Routes></MemoryRouter>);
  await finishRequest();
  expect(api.getPaper).toHaveBeenCalledWith('404');
  expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
});
