import { ValidationError } from './errors';

/** Query parameters that only track where a click came from, never which job it is. */
const TRACKING_PARAMS = new Set([
  'gclid',
  'gclsrc',
  'dclid',
  'fbclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'ref',
  'ref_src',
  'refid',
  'trk',
  'trkinfo',
  'trackingid',
  'src',
  'source',
  'campaign',
  'si',
]);

const isTrackingParam = (name: string): boolean => {
  const key = name.toLowerCase();
  return key.startsWith('utm_') || TRACKING_PARAMS.has(key);
};

/**
 * Normalizes a job URL so the same posting always maps to the same string:
 * lowercase scheme/host, no default port, no tracking params, sorted remaining params,
 * no fragment, no trailing slash.
 */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ValidationError('Invalid URL', { url: raw });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('URL must use http or https', { url: raw });
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);

  url.pathname = url.pathname.replace(/\/+$/, '') || '/';

  // URL.toString() always renders an empty path as "/"; strip it for the root path.
  let result = url.toString();
  if (url.pathname === '/') {
    result = result.replace(/\/(\?|$)/, '$1');
  }
  return result;
}
