/* Inline the engine into the page, so what ships is one file that works with
 * the network off, while the engine stays a separate testable module.
 *
 *   node build.js                      the page, no canonical tag
 *   node build.js https://host/path/   with canonical, Open Graph and JSON-LD
 *
 * A canonical tag pointing at the wrong address is worse than none, so with
 * no URL those tags are left out rather than guessed.
 */
const fs = require('fs'), path = require('path');

const SRC = path.join(__dirname, 'src', 'linear');
const OUT = path.join(__dirname, 'linear-cut');
const url = process.argv[2] || null;
if (url && !/^https:\/\/\S+$/.test(url)) { console.log('  ! the URL must start with https://'); process.exit(1); }

const S = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let page = S('page.html');
const engine = S('engine.js');

if (!page.includes('/* ENGINE_INLINE */')) { console.log('  ! the engine marker is gone'); process.exit(1); }
page = page.replace('/* ENGINE_INLINE */', () => engine);

const TITLE = 'Linear Cut Optimizer for Bar, Pipe and Profile';
const DESC = 'Work out how to cut bar, pipe, tube, angle or rebar with the least waste. ' +
  'Subtracts the saw kerf from every cut, handles several stock lengths at once, and shows ' +
  'which offcuts are worth keeping. Runs in the browser and sends nothing anywhere.';

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
    name: 'Linear Cut Optimizer',
    description: DESC,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any, runs in a web browser',
    ...(url ? { url } : {}),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Cutting plan for bar, pipe, tube, angle and rebar',
      'Saw kerf subtracted from every cut',
      'Several stock lengths compared at once',
      'Limited stock respected',
      'Offcuts worth keeping marked',
      'Works offline',
    ],
  }) + `</script>`,
].filter(Boolean).join('\n');

page = page.replace('<!-- HEAD_EXTRA -->', () => head);

/* A link to the sheet-goods tool, so the two pages feed each other. Somebody
 * cutting bar this week is cutting sheet next week. */
page = page.replace('<!-- SIBLING -->', () =>
  '<p><b>Cutting sheet goods instead?</b> The <a href="../cutlist/">cut list calculator</a> does ' +
  'the same job for plywood, MDF and any sheet material, with the grain direction respected.</p>' +
  '<p><b>Making a cone or a transition piece?</b> The <a href="../transition-pattern/">flat pattern ' +
  'layout</a> develops it and gives the true lengths to mark it out.</p>' +
  /* The one line on this page that is selling something. It goes last, it
   * says what the free tool already does so nobody buys what they have, and
   * it names the single thing a page with no memory cannot do. */
  '<p><b>Cutting the same material every week?</b> This page forgets your offcuts the moment ' +
  'you close it. <a href="https://flatfile.gumroad.com/l/cutpro">Cut Optimizer Pro</a> keeps a ' +
  'rack of them between jobs and cuts the next job out of the rack before you order anything ' +
  'new. Same solver, same offline file, $49 once.</p>');

const bad = [
  [!page.includes('/* ENGINE_INLINE */'), 'the engine marker is still there'],
  [page.includes('LinearCut'), 'the engine did not inline'],
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
console.log('linear-cut/index.html', (page.length / 1024).toFixed(1) + 'KB',
            '| canonical:', url || 'left out, no URL given');
