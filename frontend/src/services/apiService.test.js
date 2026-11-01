import axios from 'axios';
import { searchPapers, getLibrary, getPaper, savePaper, deletePaper, uploadPaper, askAI, cleanAbstract } from './apiService';

jest.mock('axios');
beforeEach(() => jest.resetAllMocks());
const paper = { id: 7, title: 'A paper', authors: ['Ada'] };
const form = new FormData();
form.append('file', new File(['PDF'], 'paper.pdf', { type: 'application/pdf' }));
const question = { paperId: '7', question: 'Why?', mode: 'question' };
test.each([
  ['search', searchPapers, ['AI & research'], 'get', ['/api/search', { params: { query: 'AI & research' } }]],
  ['library', getLibrary, [], 'get', ['/api/library']],
  ['paper', getPaper, [7], 'get', ['/api/library/7']],
  ['save', savePaper, [paper], 'post', ['/api/search/save', paper]],
  ['delete', deletePaper, [7], 'delete', ['/api/library/7']],
  ['upload', uploadPaper, [form], 'post', ['/api/upload', form]],
  ['AI', askAI, [question], 'post', ['/api/llm', question]],
])('%s uses the correct HTTP request and returns the response unchanged', async (_name, method, args, verb, expected) => {
  const response = { status: 200, data: { result: 'response fixture' } };
  axios[verb].mockResolvedValueOnce(response);
  expect(await method(...args)).toBe(response);
  expect(axios[verb]).toHaveBeenCalledTimes(1);
  expect(axios[verb]).toHaveBeenCalledWith(...expected);
  expect(axios.get.mock.calls.length + axios.post.mock.calls.length + axios.delete.mock.calls.length).toBe(1);
});
test('API failures propagate unchanged so pages can handle provider errors', async () => {
  const error = { response: { status: 502, data: { error: 'Unavailable' } } };
  axios.get.mockRejectedValueOnce(error);
  await expect(searchPapers('AI')).rejects.toBe(error);
});
test.each([undefined, '', '<p> &nbsp; </p>'])('empty abstract %p gets readable fallback', value => {
  expect(cleanAbstract(value)).toBe('No abstract available.');
});
test('abstract cleanup decodes nested entities, removes tags and normalizes whitespace', () => {
  expect(cleanAbstract('&amp;lt;p&amp;gt;A&nbsp;&amp;amp; B &#160; &quot;C&quot; &#39;D&apos;&amp;lt;/p&amp;gt;')).toBe('A & B "C" \'D\'');
});
