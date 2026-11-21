/* The built page, in a real browser.
 *
 * The engine tests prove the maths. These prove the thing a person actually
 * touches: that it opens on a worked example, that pressing Calculate changes
 * the answer, that the drawn bars match the numbers, and above all that the
 * page contacts nothing, which is a claim it makes in writing twice.
 */
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const FILE = 'file://' + path.join(__dirname, '..', '..', '..', 'linear-cut', 'index.html');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });

  const errs = [], external = [];
  p.on('pageerror', e => errs.push('page error: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });

  await p.goto(FILE);
  await p.waitForTimeout(400);

  /* 1. It opens on a real job, not an empty form. */
  const tiles = await p.$$eval('.tile .v', els => els.map(e => e.textContent.trim()));
  assert.ok(tiles.length >= 4, 'the page should show a worked result on load, got ' + tiles.length + ' tiles');
  const barsOnLoad = parseInt(tiles[0], 10);
  assert.ok(barsOnLoad > 0, 'the example should need at least one bar');

  /* 2. Identical bars are grouped, and the grouping is faithful.
   *
   * This is where a tidy-up can quietly lose work: if the headers say
   * "Bars 1 to 4" but only three bars existed, somebody buys the wrong
   * quantity. So the group counts must add back up to the bar total, and the
   * numbering must be continuous with no gaps and no repeats. */
  const drawn = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.barwrap').forEach(w => {
      const head = w.querySelector('.barhead b').textContent.trim();
      const range = head.match(/Bars\s+(\d+)\s+to\s+(\d+)\D+(\d+)\s+the same/);
      const single = head.match(/^Bar\s+(\d+)$/);
      out.push({
        head,
        first: range ? +range[1] : (single ? +single[1] : null),
        last: range ? +range[2] : (single ? +single[1] : null),
        claimed: range ? +range[3] : (single ? 1 : null),
        pieces: [...w.querySelectorAll('.seg.p')].length,
        cuts: [...w.querySelectorAll('.cuts span')].length,
      });
    });
    return out;
  });

  let counted = 0, expectNext = 1;
  drawn.forEach(d => {
    assert.ok(d.first !== null, 'a bar heading could not be read: "' + d.head + '"');
    assert.strictEqual(d.first, expectNext,
      'bar numbering jumps: expected ' + expectNext + ', heading says "' + d.head + '"');
    assert.strictEqual(d.last - d.first + 1, d.claimed,
      '"' + d.head + '": the range and the count disagree');
    assert.strictEqual(d.pieces, d.cuts,
      '"' + d.head + '": the drawing and the cut list disagree on how many pieces are on the bar');
    counted += d.claimed;
    expectNext = d.last + 1;
  });
  assert.strictEqual(counted, barsOnLoad,
    'the grouped headings account for ' + counted + ' bars but the summary says ' + barsOnLoad);
  assert.ok(drawn.length < barsOnLoad,
    'this example has repeated bars, so grouping should have shortened the plan');

  /* 3. Nothing on a bar is drawn wider than the bar. A segment that overflows
   *    would be a plan that overflows. */
  const overflow = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.stick').forEach((s, i) => {
      const total = [...s.children].reduce((a, c) => a + c.getBoundingClientRect().width, 0);
      if (total > s.getBoundingClientRect().width + 2) bad.push(i + 1);
    });
    return bad;
  });
  assert.deepStrictEqual(overflow, [], 'segments overflow the bar on: ' + overflow.join(', '));

  /* 4. Changing the input changes the answer. A bigger kerf cannot need fewer
   *    bars, and on this example it should need more. */
  await p.fill('#kerf', '200');
  await p.click('#go');
  await p.waitForTimeout(250);
  const after = parseInt(await p.$eval('.tile .v', e => e.textContent.trim()), 10);
  assert.ok(after >= barsOnLoad,
    'a 200 kerf cannot need fewer bars than a 3 kerf (' + after + ' vs ' + barsOnLoad + ')');

  /* 5. A piece longer than the stock is refused in words, not silently. */
  await p.fill('#kerf', '3');
  await p.evaluate(() => {
    document.querySelector('#parts .pl').value = '99999';
    document.querySelector('#parts .pl').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.click('#go');
  await p.waitForTimeout(250);
  const bad = await p.$eval('body', el => el.innerText);
  assert.ok(/cannot be cut from this stock/.test(bad), 'an impossible piece must be called out');

  /* 6. Every example loads and produces a plan. */
  for (const ex of ['handrail', 'rebar', 'trim', 'frame']) {
    await p.selectOption('#ex', ex);
    await p.waitForTimeout(300);
    const v = await p.$$eval('.tile .v', els => els.map(e => e.textContent.trim()));
    assert.ok(v.length >= 4 && parseInt(v[0], 10) > 0, 'example "' + ex + '" produced no plan');
    const y = parseFloat(v[1]);
    assert.ok(y > 0 && y <= 100, 'example "' + ex + '" has an impossible yield: ' + v[1]);
  }

  /* 7. The claim the page makes twice, in writing. */
  assert.deepStrictEqual(external, [], 'the page contacted: ' + external.join(', '));
  assert.deepStrictEqual(errs, [], errs.join(' | '));

  /* 8. It works at phone width without scrolling sideways. */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(250);
  const sideways = await p.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.strictEqual(sideways, false, 'the page scrolls sideways on a phone');

  await b.close();
  console.log('ALL CHECKS PASSED  (opens worked, drawing matches, offline, phone width)');
})().catch(e => { console.log('  ! ' + e.message); process.exit(1); });
