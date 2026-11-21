/* Inline the geometry into the page, so what ships is one file that works
 * with the network off, while the geometry stays a separate testable module.
 *
 *   node build.js                      the page, no canonical tag
 *   node build.js https://host/path/   with canonical, Open Graph and JSON-LD
 *
 * A canonical tag pointing at the wrong address is worse than none, so with
 * no URL those tags are left out rather than guessed.
 */
const fs = require('fs'), path = require('path');

const SRC = path.join(__dirname, 'src', 'pattern');
const OUT = path.join(__dirname, 'transition-pattern');
const url = process.argv[2] || null;
if (url && !/^https:\/\/\S+$/.test(url)) { console.log('  ! the URL must start with https://'); process.exit(1); }

const S = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let page = S('page.html');
const geom = S('geometry.js');

if (!page.includes('/* GEOMETRY_INLINE */')) { console.log('  ! the geometry marker is gone'); process.exit(1); }
page = page.replace('/* GEOMETRY_INLINE */', () => geom);

const TITLE = 'Flat Pattern Layout for Cones and Square to Round Transitions';
const DESC = 'Develops the flat pattern for a cone, a frustum or a square to round transition ' +
  'by triangulation, and gives the true lengths to mark it out with a tape and trammel. ' +
  'Runs in the browser and sends nothing anywhere.';

const head = [
  `<meta name="description" content="${DESC}">`,
  url ? `<link rel="canonical" href="${url}">` : null,
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${TITLE}">`,
  `<meta property="og:description" content="${DESC}">`,
  url ? `<meta property="og:url" content="${url}">` : null,
  `<meta name="twitter:card" content="summary">`,
  `<script type="application/ld+json">` + JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Flat Pattern Layout',
    description: DESC,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any, runs in a web browser',
    ...(url ? { url } : {}),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Flat pattern for a cone or frustum, round to round',
      'Flat pattern for a square or rectangle to round transition',
      'Offset round end supported',
      'True lengths by triangulation, for marking out with a trammel',
      'Sector radii and included angle for cones',
      'Works offline',
    ],
  }) + `</script>`,
].filter(Boolean).join('\n');

page = page.replace('<!-- HEAD_EXTRA -->', () => head);

/* Links to the two cutting tools. Somebody developing a transition piece is
 * cutting the plate it comes out of on the same afternoon. */
page = page.replace('<!-- SIBLING -->', () =>
  '<p><b>Cutting the plate it comes out of?</b> The <a href="../linear-cut/">linear cut optimizer</a> ' +
  'works out bar, pipe and angle with the saw kerf subtracted, and the ' +
  '<a href="../cutlist/">cut list calculator</a> does the same for sheet.</p>');

const bad = [
  [!page.includes('/* GEOMETRY_INLINE */'), 'the geometry marker is still there'],
  [page.includes('root.Pattern = api'), 'the geometry did not inline'],
  [!/<!-- (HEAD_EXTRA|SIBLING) -->/.test(page), 'a placeholder was left in the page'],
  [(page.match(/<title>/g) || []).length === 1, 'there is more than one title tag'],
  [!url || page.includes(`<link rel="canonical" href="${url}">`), 'the canonical tag did not go in'],
  /* The whole claim of the page is that it contacts nothing, so this looks for
   * things the browser FETCHES. A canonical tag carries a URL and loads
   * nothing, so matching every https in an href would flag the page's own
   * metadata and teach us to ignore the check. Only resource-loading rel
   * values count, plus any element with a remote src. */
  [!/(<(?:script|img|iframe|source|embed|video|audio)\b[^>]*\bsrc=["']https?:)/i.test(page),
   'an element loads from another host, and the page claims it does not'],
  [!/<link\b[^>]*\brel=["'](?:stylesheet|preload|prefetch|preconnect|dns-prefetch|icon|manifest)["'][^>]*\bhref=["']https?:/i.test(page),
   'a stylesheet, font or icon is fetched from another host'],
  [!/@import|url\(["']?https?:/i.test(page), 'the CSS fetches something remote'],
  [!/fetch\s*\(|XMLHttpRequest/.test(page), 'the page makes a request'],
].filter(([ok]) => !ok).map(([, m]) => m);
if (bad.length) { bad.forEach(m => console.log('  !', m)); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), page);
console.log('transition-pattern/index.html', (page.length / 1024).toFixed(1) + 'KB',
            '| canonical:', url || 'left out, no URL given');
