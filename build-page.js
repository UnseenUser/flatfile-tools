/* Turn the free Cutlist file into a public web page.
 *
 *   node build-page.js                      builds without canonical or social tags
 *   node build-page.js https://host/path/   builds with them
 *
 * The source file is the product. This does not touch the calculator: it adds
 * the head tags a page needs to be found, rewrites the three lines that only
 * make sense for a file somebody downloaded from Gumroad, and appends the
 * prose that gives a search engine something to read, because a page that is
 * only a form ranks for nothing.
 *
 * A URL is optional on purpose. A canonical tag pointing at the wrong address
 * is worse than no canonical tag, so when no URL is given those tags are left
 * out rather than guessed.
 */
const fs = require('fs'), path = require('path');

/* The product file lives in the repo so this is reproducible anywhere, not
 * only on the machine it was first built on. */
const SRC = path.join(__dirname, 'src', 'cutlist-free.html');
const OUT = path.join(__dirname, 'cutlist');
const PAID = 'https://flatfile.gumroad.com/l/cutlist';
const url = process.argv[2] || null;
if (url && !/^https:\/\/\S+$/.test(url)) {
  console.log('  ! the URL must start with https://'); process.exit(1);
}

let s = fs.readFileSync(SRC, 'utf8');
const before = s.length;

/* --- the head --------------------------------------------------------- */

const TITLE = 'Cut List Calculator for Sheet Goods, free and offline';
const DESC = 'Work out how to cut plywood, MDF or any sheet material with the ' +
  'least waste. Subtracts your saw kerf, respects grain direction, and gives ' +
  'guillotine cuts a panel saw can actually make. Runs in the browser, sends ' +
  'nothing anywhere.';

const head = [
  `<meta name="description" content="${DESC}">`,
  url ? `<link rel="canonical" href="${url}">` : null,
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${TITLE}">`,
  `<meta property="og:description" content="${DESC}">`,
  url ? `<meta property="og:url" content="${url}">` : null,
  `<meta name="twitter:card" content="summary">`,
  /* WebApplication rather than SoftwareApplication: it runs in the browser and
   * is not downloaded, and offers is priced at 0 because it really is free. */
  `<script type="application/ld+json">` + JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Cutlist',
    description: DESC,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any, runs in a web browser',
    ...(url ? { url } : {}),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Cutting layout for sheet goods',
      'Saw kerf subtracted from every cut',
      'Grain direction respected',
      'Guillotine cuts only, so a panel saw can make them',
      'Works offline',
    ],
  }) + `</script>`,
].filter(Boolean).join('\n');

const oldTitle = '<title>Cutlist, free version</title>';
if (!s.includes(oldTitle)) { console.log('  ! the title is not where this expects it'); process.exit(1); }
s = s.replace(oldTitle, `<title>${TITLE}</title>\n${head}`);

/* --- the three lines written for a file, not a page -------------------- */

const swaps = [
  ['Updates are free and permanent. They appear in the same Gumroad library you downloaded this from, under the same purchase.',
   'This page is updated in place. Reload it and you have the current version. Nothing to download and nothing to keep up to date.'],
  ['Something wrong, or something missing? Reply to your purchase receipt. It reaches me and I read all of them.',
   'Something wrong, or a layout that came out worse than you could do by hand? Write to rahovichmichael@gmail.com. I read all of them, and a bad layout with the numbers that produced it is the most useful thing you can send.'],
  ['Free to use and free to pass on, whole and unchanged. Capped at ten distinct parts; the paid version removes the cap and changes nothing else.',
   'Free to use, for anything, including work you are paid for. Capped at ten distinct parts. The paid version removes the cap and changes nothing else.'],
];
for (const [from, to] of swaps) {
  if (!s.includes(from)) { console.log('  ! this line is not in the source any more:\n    ' + from.slice(0, 70)); process.exit(1); }
  s = s.replace(from, to);
}

/* --- what a search engine can read ------------------------------------- */

const PROSE = `
<section class="noprint" style="max-width:62ch;margin:0 auto;padding:36px 20px 72px;line-height:1.65">
  <h2 style="font-size:19px;margin:0 0 14px">What a cut list actually has to get right</h2>

  <p style="margin:0 0 14px">A cutting layout is not a packing puzzle. It is a packing puzzle with
  three constraints that most online calculators quietly drop, and dropping any one of them
  produces a plan that looks efficient on screen and does not work at the saw.</p>

  <h3 style="font-size:15px;margin:20px 0 8px">The blade takes a few millimetres every time</h3>
  <p style="margin:0 0 14px">Every cut turns some of the board into dust. That width is the kerf, and
  it is usually around 3mm on a table saw and 2.4mm on a track saw, but the only number worth using
  is the one you measure from a cut you made yourself. Half a millimetre of error does not matter
  once. Across twelve cuts on one sheet it is why the last part comes out 6mm short. This calculator
  subtracts the kerf from the material at every cut rather than treating cuts as free.</p>

  <h3 style="font-size:15px;margin:20px 0 8px">A panel saw cuts all the way across</h3>
  <p style="margin:0 0 14px">Layouts that nest parts into pockets assume you can stop a cut in the
  middle of a sheet. On a table saw or a panel saw you cannot. Each cut runs edge to edge and splits
  the piece in two, and every later cut happens on one of those halves. These are guillotine cuts,
  and a layout that respects them is slightly less efficient on paper and is the only kind you can
  actually follow. Everything here is guillotine cuts.</p>

  <h3 style="font-size:15px;margin:20px 0 8px">Grain runs one way</h3>
  <p style="margin:0 0 14px">Rotating a part ninety degrees often saves material, and on anything
  with a visible face it ruins the piece. Lock the grain on parts that will be seen and leave it
  unlocked on the rest, and the layout takes the saving where it is free.</p>

  <h3 style="font-size:15px;margin:20px 0 8px">What to do with the plan</h3>
  <p style="margin:0 0 14px">Cut the cheapest sheet first. Check the first two parts against the
  plan with a tape before you cut the third. If they are out, the kerf you entered is wrong, and
  you have lost one sheet instead of four.</p>

  <h2 style="font-size:19px;margin:28px 0 14px">About this one</h2>
  <p style="margin:0 0 14px">It runs entirely in your browser. There is no account, no upload, and
  no server: the page contacts nothing at all once it has loaded, not even for its fonts, and it
  keeps working with the network off. Nothing you type is sent anywhere, which for anyone pricing a
  job from a client's drawings is the only arrangement worth having.</p>

  <p style="margin:0 0 14px">This free version handles <strong>ten distinct parts</strong>, each with
  any quantity, which covers most single pieces of furniture.
  <a href="${PAID}" style="color:inherit">The full version</a> removes the cap and is otherwise the
  same file.</p>
</section>`;

if (!s.includes('</body>')) { console.log('  ! no closing body tag'); process.exit(1); }
s = s.replace('</body>', PROSE + '\n</body>');

/* --- checks before it goes anywhere ------------------------------------ */

const bad = [
  [!/Gumroad library/.test(s), 'the page still tells a visitor to look in their Gumroad library'],
  [!/purchase receipt/.test(s), 'the page still tells a visitor to reply to a purchase receipt'],
  [s.includes(PAID), 'the page does not link to the full version anywhere'],
  [(s.match(/<title>/g) || []).length === 1, 'there is more than one title tag'],
  [s.includes('application/ld+json'), 'the structured data did not go in'],
  [!url || s.includes(`<link rel="canonical" href="${url}">`), 'the canonical tag did not go in'],
  [s.length > before, 'the page got smaller, which means something was eaten'],
].filter(([ok]) => !ok).map(([, m]) => m);
if (bad.length) { bad.forEach(m => console.log('  !', m)); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), s);
console.log('cutlist/index.html', (s.length / 1024).toFixed(0) + 'KB',
            '| canonical:', url || 'left out, no URL given yet');
