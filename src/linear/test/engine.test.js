/* The solver, checked against cases where the right answer is known by hand.
 *
 * A cutting plan is trusted at the saw. Somebody buys twelve bars because this
 * said twelve, and cuts the expensive material to a layout nobody re-derived.
 * So the tests here are not about code paths; they are about the two ways this
 * can cost a person money: telling them a piece fits when it does not, and
 * buying more bars than the job needs.
 */
const assert = require('assert');
const LC = require('../engine.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-6),
  (msg || '') + ' expected ' + b + ', got ' + a);

/* ---- 1. The kerf is charged, and charged on the last piece too ---------
 * A 1000 bar, four 250 pieces, 3mm kerf. Without a kerf they fit exactly.
 * With one, they cannot: 4 x 250 + 4 x 3 = 1012. Three fit, 1000 - 759 = 241
 * is left. A tool that says four fit has just cost somebody a bar. */
{
  const r = LC.plan({
    parts: [{ label: 'A', length: 250, qty: 4 }],
    stock: [{ label: 'Bar', length: 1000, qty: null }],
    kerf: 3,
  });
  assert.strictEqual(r.bars[0].pieces.length, 3, 'three 250s fit a 1000 bar once the saw is paid for');
  near(r.bars[0].offcut, 241, 1e-6, 'the remainder after three cuts:');
  assert.strictEqual(r.summary.barsUsed, 2, 'the fourth piece needs a second bar');
}

/* ---- 2. With no kerf, exact fits are exact ----------------------------- */
{
  const r = LC.plan({
    parts: [{ label: 'A', length: 250, qty: 4 }],
    stock: [{ label: 'Bar', length: 1000, qty: null }],
    kerf: 0,
  });
  assert.strictEqual(r.summary.barsUsed, 1, 'four 250s are one 1000 bar when the blade is free');
  near(r.bars[0].offcut, 0, 1e-6, 'nothing left over:');
  assert.strictEqual(r.summary.yieldPct, 100, 'a perfect fit is 100% yield');
}

/* ---- 3. Trim comes off before anything is placed ----------------------- */
{
  const r = LC.plan({
    parts: [{ label: 'A', length: 500, qty: 2 }],
    stock: [{ label: 'Bar', length: 1000, qty: null }],
    kerf: 0, trimStart: 10, trimEnd: 10,
  });
  assert.strictEqual(r.summary.barsUsed, 2, 'two 500s no longer share a 1000 bar once 20 is trimmed off');
  assert.strictEqual(r.bars[0].pieces[0].start, 10, 'the first piece starts after the trim, not at zero');
}

/* ---- 4. Positions are cumulative and include the kerf ------------------
 * This is what somebody marks on the bar with a tape, so an error here is
 * an error on the material. */
{
  const r = LC.plan({
    parts: [{ label: 'A', length: 300, qty: 1 }, { label: 'B', length: 200, qty: 1 },
            { label: 'C', length: 100, qty: 1 }],
    stock: [{ label: 'Bar', length: 1000, qty: null }],
    kerf: 5, trimStart: 20,
  });
  const p = r.bars[0].pieces;
  assert.strictEqual(p.length, 3, 'all three fit');
  near(p[0].start, 20, 1e-6, 'first piece after trim:');
  near(p[1].start, 325, 1e-6, '20 + 300 + 5:');
  near(p[2].start, 530, 1e-6, '325 + 200 + 5:');
}

/* ---- 5. A piece longer than the stock is refused, before the run -------- */
{
  const r = LC.plan({
    parts: [{ label: 'Beam', length: 4000, qty: 1 }],
    stock: [{ label: 'Bar', length: 3000, qty: null }],
    kerf: 3,
  });
  assert.ok(r.problems.some(p => p.kind === 'toolong'), 'an impossible part is called out');
  assert.ok(/Beam/.test(r.problems.find(p => p.kind === 'toolong').text), 'and it is named');
}

/* ---- 6. Limited stock is respected, and the shortfall is reported ------ */
{
  const r = LC.plan({
    parts: [{ label: 'A', length: 900, qty: 5 }],
    stock: [{ label: 'Bar', length: 1000, qty: 2 }],
    kerf: 0,
  });
  assert.strictEqual(r.summary.barsUsed, 2, 'it cannot use more bars than exist');
  assert.strictEqual(r.summary.unplaced, 3, 'and it says how many pieces are left over');
  assert.ok(r.problems.some(p => p.kind === 'unplaced'), 'with a problem the panel can show');
}

/* ---- 7. It picks the stock length that wastes least --------------------
 * Six 900s. From 1000 bars that is six bars and 600 wasted. From 2000 bars it
 * is three bars and 600 wasted, but half the buying. Either is defensible;
 * what is NOT defensible is using more bars than necessary. */
{
  const r = LC.plan({
    parts: [{ label: 'A', length: 900, qty: 6 }],
    stock: [{ label: 'Short', length: 1000, qty: null }, { label: 'Long', length: 2000, qty: null }],
    kerf: 0,
  });
  assert.ok(r.summary.barsUsed <= 6, 'never worse than one piece per short bar');
  assert.ok(r.summary.yieldPct >= 89.9, 'yield on this job should be about 90%, got ' + r.summary.yieldPct);
}

/* ---- 8. A known-optimal mixed job -------------------------------------
 * Bars of 6000. Pieces: 2 x 2500, 2 x 2000, 2 x 1500, 2 x 1000 = 14000 total.
 * With no kerf the theoretical floor is ceil(14000/6000) = 3 bars, and 3 is
 * reachable: [2500+2000+1500], [2500+2000+1500], [1000+1000]. A heuristic that
 * needs four here is not good enough to put in front of a fabricator. */
{
  const r = LC.plan({
    parts: [{ label: 'a', length: 2500, qty: 2 }, { label: 'b', length: 2000, qty: 2 },
            { label: 'c', length: 1500, qty: 2 }, { label: 'd', length: 1000, qty: 2 }],
    stock: [{ label: 'Bar', length: 6000, qty: null }],
    kerf: 0,
  });
  assert.strictEqual(r.summary.barsUsed, 3, 'this job fits in three bars and the solver should find it');
  assert.strictEqual(r.summary.unplaced, 0, 'with nothing left out');
}

/* ---- 9. Everything that was asked for comes out, once ------------------
 * The quiet catastrophe: a plan that silently drops or duplicates a piece. */
{
  const parts = [{ label: 'a', length: 820, qty: 7 }, { label: 'b', length: 455, qty: 11 },
                 { label: 'c', length: 1200, qty: 3 }, { label: 'd', length: 90, qty: 20 }];
  const r = LC.plan({ parts, stock: [{ label: 'Bar', length: 3000, qty: null }], kerf: 3.2, trimStart: 5 });
  const want = {}; parts.forEach(p => { want[p.label] = p.qty; });
  const got = {};
  r.bars.forEach(b => b.pieces.forEach(p => { got[p.label] = (got[p.label] || 0) + 1; }));
  assert.deepStrictEqual(got, want, 'every piece appears exactly as many times as it was asked for');
  assert.strictEqual(r.summary.unplaced, 0);

  /* and nothing overhangs the bar it was put on */
  r.bars.forEach(b => {
    const last = b.pieces[b.pieces.length - 1];
    assert.ok(last.start + last.length <= b.stockLength + 1e-6,
      'bar ' + b.index + ': the last piece ends past the end of the bar');
    b.pieces.forEach((p, i) => {
      if (i === 0) return;
      const prev = b.pieces[i - 1];
      assert.ok(p.start >= prev.start + prev.length + 3.2 - 1e-6,
        'bar ' + b.index + ': two pieces overlap, or the kerf between them is missing');
    });
  });
}

/* ---- 10. The same input gives the same plan ----------------------------
 * Somebody prints this and takes it to the saw. If pressing the button again
 * produced a different layout, the printout could not be trusted. */
{
  const input = {
    parts: [{ label: 'a', length: 737, qty: 9 }, { label: 'b', length: 311, qty: 14 }],
    stock: [{ label: 'A', length: 2400, qty: null }, { label: 'B', length: 3600, qty: null }],
    kerf: 2.4,
  };
  const a = JSON.stringify(LC.plan(input).bars);
  const b = JSON.stringify(LC.plan(input).bars);
  assert.strictEqual(a, b, 'two runs of the same job must give the identical plan');
}

/* ---- 11. Offcuts worth keeping are marked, short ends are not ---------- */
{
  const r = LC.plan({
    parts: [{ label: 'a', length: 1000, qty: 1 }],
    stock: [{ label: 'Bar', length: 3000, qty: null }],
    kerf: 0, minOffcut: 500,
  });
  assert.strictEqual(r.bars[0].keep, true, '2000 left over is stock, not scrap');
  const r2 = LC.plan({
    parts: [{ label: 'a', length: 2800, qty: 1 }],
    stock: [{ label: 'Bar', length: 3000, qty: null }],
    kerf: 0, minOffcut: 500,
  });
  assert.strictEqual(r2.bars[0].keep, false, '200 left over is scrap');
}

/* ---- 12. The numbers in the summary add up to what was bought ---------- */
{
  const r = LC.plan({
    parts: [{ label: 'a', length: 640, qty: 13 }, { label: 'b', length: 1250, qty: 5 }],
    stock: [{ label: 'Bar', length: 4000, qty: null, cost: 28.5 }],
    kerf: 3, trimStart: 8, trimEnd: 4,
  });
  const s = r.summary;
  const accounted = s.partLength + s.kerfLength + s.trimLength + s.offcutLength;
  near(accounted, s.boughtLength, 1e-6,
    'parts + kerf + trim + offcut must equal the bar length bought:');
  near(s.cost, s.barsUsed * 28.5, 1e-6, 'cost is bars times price:');
}

console.log('ALL CHECKS PASSED  (12 cases)');
