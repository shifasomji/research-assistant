import React from 'react';
import { render, screen } from '@testing-library/react';
import PaperCard from './PaperCard';

test('paper card supplies readable fallbacks when optional metadata is absent', () => {
  render(<PaperCard paper={{ id: 1, title: 'Sparse paper' }} />);
  expect(screen.getByText('YEAR · Unknown authors')).toBeInTheDocument();
  expect(screen.getByText('No abstract available.')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save to library' })).toBeEnabled();
});
test('paper card limits author preview to three and links to the original paper', () => {
  render(<PaperCard paper={{ title: 'Full paper', authors: ['Ada', 'Grace', 'Alan', 'Fourth author'], year: 2025, abstract: '<p>Useful findings</p>', link: 'https://paper.test' }} />);
  expect(screen.getByText('2025 · Ada, Grace, Alan')).toBeInTheDocument();
  expect(screen.queryByText(/Fourth author/)).not.toBeInTheDocument();
  expect(screen.getByText('Useful findings')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: /Read paper/ });
  expect(link).toHaveAttribute('href', 'https://paper.test');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
});
