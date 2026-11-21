/* The built page, in a real browser.
 *
 * The geometry tests prove the maths. These prove the drawing, which is the
 * part that can be wrong while every number on the page is right: an SVG at
 * the wrong scale, a dropped point, a sector swept with the wrong radius.
 * So these tests read the geometry back out of the rendered SVG and check it
 * against the numbers the page itself printed, rather than trusting either.
 */
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const FILE = 'file://' + path.join(__dirname, '..', '..', '..', 'transition-pattern', 'index.html');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol,
  (msg || '') + ' expected ' + b + ', got ' + a + ' (tolerance ' + tol + ')');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });

  const errs = [], external = [];
  p.on('pageerror', e => errs.push('page error: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });

  await p.goto(FILE);
  await p.waitForTimeout(400);

  /* 1. It opens on a developed cone, not an empty form. */
  let tiles = await p.$$eval('.tile .v', els => els.map(e => e.textContent.trim()));
  assert.ok(tiles.length >= 4, 'the page should develop the example on load, got ' + tiles.length + ' tiles');
  const outer = parseFloat(tiles[0].replace(/,/g, ''));
  const inner = parseFloat(tiles[1].replace(/,/g, ''));
  const angle = parseFloat(tiles[2]);
  assert.ok(outer > inner && inner > 0, 'the two trammel radii look wrong: ' + outer + ' / ' + inner);
  assert.ok(angle > 0 && angle < 360, 'the included angle is impossible: ' + angle);

  /* 2. The sector that is DRAWN uses those two radii.
   *
   * This is the check worth having. The numbers in the tiles come straight
   * from the engine, but the path is built separately, and a sector drawn at
   * the slant height instead of the apex distance would look perfectly
   * plausible and be unmarkable. So pull the radii back out of the arc
   * commands and compare, and confirm the sweep really is the stated angle
   * by measuring the chord across the outer arc. */
  const arc = await p.$eval('svg.pat path.cut', el => el.getAttribute('d'));
  const radii = [...arc.matchAll(/A\s+([\d.]+)\s+([\d.]+)/g)].map(m => +m[1]);
  assert.strictEqual(radii.length, 2, 'the drawing should sweep two arcs, found ' + radii.length);
  near(radii[0], outer, 0.01, 'the drawn outer arc is not at the trammel radius:');
  near(radii[1], inner, 0.01, 'the drawn inner arc is not at the trammel radius:');

  /* Counting the numbers in the path is how I got this wrong the first time:
   * an arc command carries a rotation and two flags between its radii and its
   * endpoint, so the endpoint is not where you would guess. Match the two
   * commands by shape instead. */
  const ends = await p.$eval('svg.pat path.cut', el => {
    const d = el.getAttribute('d');
    const m = d.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/);
    const a = d.match(/A\s+[\d.]+\s+[\d.]+\s+-?[\d.]+\s+[01]\s+[01]\s+(-?[\d.]+)\s+(-?[\d.]+)/);
    return m && a ? { start: [+m[1], +m[2]], end: [+a[1], +a[2]] } : null;
  });
  assert.ok(ends, 'the sector path could not be read');
  const chord = Math.hypot(ends.end[0] - ends.start[0], ends.end[1] - ends.start[1]);
  near(chord, 2 * outer * Math.sin(angle * Math.PI / 360), 0.05,
    'the drawn sweep does not match the stated included angle:');

  /* 3. Equal diameters must say cylinder and draw a rectangle, not divide by
   *    zero looking for an apex. */
  await p.fill('#cTop', '400');
  await p.click('#go');
  await p.waitForTimeout(200);
  let txt = await p.$eval('#out', el => el.innerText);
  assert.ok(/plain cylinder/.test(txt), 'equal ends should be called a cylinder, got: ' + txt.slice(0, 120));
  const rect = await p.$$eval('svg.pat rect.cut', els => els.length);
  assert.strictEqual(rect, 1, 'a cylinder should draw one rectangle');

  /* 4. Nonsense is refused in words. */
  await p.fill('#cTop', '-20');
  await p.click('#go');
  await p.waitForTimeout(200);
  txt = await p.$eval('#out', el => el.innerText);
  assert.ok(/cannot be negative/.test(txt), 'a negative diameter must be refused in words');
  assert.strictEqual(await p.$$eval('svg.pat', e => e.length), 0,
    'a refused job must not leave the previous drawing on screen');

  /* 5. Square to round: the development that is DRAWN must close.
   *
   * Sum the base polyline the browser actually rendered and compare it with
   * the perimeter the page printed. If the SVG is at the wrong scale, or a
   * point was dropped laying the triangles down, this is where it shows. */
  await p.selectOption('#shape', 'sqround');
  await p.waitForTimeout(300);
  tiles = await p.$$eval('.tile .v', els => els.map(e => e.textContent.trim()));
  const perim = parseFloat(tiles[0].replace(/,/g, ''));
  const circ = parseFloat(tiles[1].replace(/,/g, ''));
  const segs = parseInt(tiles[3], 10);

  const sums = await p.$$eval('svg.pat polyline.cut', els => els.map(el => {
    const pts = el.getAttribute('points').trim().split(/\s+/).map(s => s.split(',').map(Number));
    let t = 0;
    for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
    return { len: t, n: pts.length };
  }));
  assert.strictEqual(sums.length, 2, 'the pattern should draw a base edge and a top edge');
  near(sums[0].len, perim, 0.05, 'the drawn base does not add up to the rectangle perimeter:');
  /* The top is chords across arcs, so it is shorter than the circumference by
   * a known amount, not equal to it. At eight divisions per corner that gap
   * is well under a percent, and it must be on the SHORT side: a drawn top
   * longer than the circle it came from would mean the fans overlap. */
  assert.ok(sums[1].len < circ, 'chords across an arc cannot be longer than the arc: ' +
    sums[1].len + ' vs ' + circ);
  assert.ok(sums[1].len > circ * 0.99, 'the drawn top is too far off the circumference: ' +
    sums[1].len + ' vs ' + circ);

  /* 6. Every fold has a line, and the marking table has a row per corner. */
  /* A fold is an edge shared by two triangles, so the page must draw one per
   * adjacent pair and not one more. The page prints the triangle count, so
   * this compares the drawing against the page's own number rather than
   * against arithmetic of mine. */
  const tri = parseInt(tiles[2], 10);
  const folds = await p.$$eval('svg.pat line.fold', els => els.length);
  assert.strictEqual(folds, tri - 1,
    tri + ' triangles share ' + (tri - 1) + ' edges, but the drawing has ' + folds + ' fold lines');
  /* and the seam is drawn as a cut at both ends of the strip */
  assert.strictEqual(await p.$$eval('svg.pat line.seam', e => e.length), 2,
    'both ends of the pattern are seams and should be drawn as such');
  const rows = await p.$$eval('table.t tbody tr', els => els.map(r => r.children.length));
  assert.strictEqual(rows.length, 4, 'one marking row per rectangle corner');
  rows.forEach(c => assert.strictEqual(c, segs + 2,
    'a corner row wants a label and ' + (segs + 1) + ' lengths, got ' + c + ' cells'));

  /* 7. Offsetting the circle must visibly change the pattern. A control that
   *    is quietly ignored is worse than one that is not there. */
  const before = await p.$eval('svg.pat polyline.cut', el => el.getAttribute('points'));
  await p.fill('#sOX', '90');
  await p.click('#go');
  await p.waitForTimeout(250);
  const after = await p.$eval('svg.pat polyline.cut', el => el.getAttribute('points'));
  assert.notStrictEqual(before, after, 'a 90 offset changed nothing in the drawing');

  /* 8. The claim the page makes twice, in writing. */
  assert.deepStrictEqual(external, [], 'the page contacted: ' + external.join(', '));
  assert.deepStrictEqual(errs, [], errs.join(' | '));

  /* 9. Phone width, no sideways scroll. The marking table is wide, so this is
   *    a real risk rather than a formality. */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(250);
  const sideways = await p.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.strictEqual(sideways, false, 'the page scrolls sideways on a phone');

  await b.close();
  console.log('ALL CHECKS PASSED  (drawn sector matches the trammel radii, drawn base closes, offline, phone width)');
})().catch(e => { console.log('  ! ' + e.message); process.exit(1); });
