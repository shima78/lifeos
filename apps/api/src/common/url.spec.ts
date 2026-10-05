import { ValidationError } from './errors';
import { normalizeUrl } from './url';

describe('normalizeUrl', () => {
  it('strips utm_* and other tracking params but keeps meaningful ones', () => {
    expect(
      normalizeUrl(
        'https://jobs.example.com/job/123?utm_source=linkedin&utm_medium=social&gclid=abc&jobId=123&trk=x',
      ),
    ).toBe('https://jobs.example.com/job/123?jobId=123');
  });

  it('removes trailing slashes and fragments', () => {
    expect(normalizeUrl('https://jobs.example.com/job/123/#apply')).toBe(
      'https://jobs.example.com/job/123',
    );
    expect(normalizeUrl('https://jobs.example.com/job/123///')).toBe(
      'https://jobs.example.com/job/123',
    );
    expect(normalizeUrl('https://jobs.example.com/')).toBe('https://jobs.example.com');
    expect(normalizeUrl('https://jobs.example.com/?id=1')).toBe('https://jobs.example.com?id=1');
  });

  it('lowercases scheme and host but preserves path case', () => {
    expect(normalizeUrl('HTTPS://Jobs.Example.COM/Job/ABC')).toBe(
      'https://jobs.example.com/Job/ABC',
    );
  });

  it('drops default ports and sorts remaining params', () => {
    expect(normalizeUrl('https://example.com:443/a?b=2&a=1')).toBe('https://example.com/a?a=1&b=2');
  });

  it('maps variants of the same posting to one value', () => {
    const variants = [
      'https://careers.example.com/jobs/42',
      'https://CAREERS.example.com/jobs/42/',
      'https://careers.example.com/jobs/42?utm_campaign=fall#top',
      ' https://careers.example.com/jobs/42/?UTM_SOURCE=x ',
    ];
    expect(new Set(variants.map(normalizeUrl)).size).toBe(1);
  });

  it('rejects non-http URLs', () => {
    expect(() => normalizeUrl('ftp://example.com/file')).toThrow(ValidationError);
    expect(() => normalizeUrl('not a url')).toThrow(ValidationError);
  });
});
