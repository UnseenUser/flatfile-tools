/* The geometry, checked against things that must be true.
 *
 * This output gets marked onto steel plate with a trammel and cut. There is
 * no undo. So these are not unit tests of code paths, they are checks of the
 * physical facts: a developed edge has to equal the real edge it came from,
 * a true length can never be shorter than its shadow in plan, and the pattern
 * has to close.
 */
const assert = require('assert');
const P = require('../geometry.js');
const TAU = Math.PI * 2;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol,
  (msg || '') + ' expected ' + b + ', got ' + a + ' (tolerance ' + tol + ')');

/* ===== Cones ========================================================= */

/* 1. Equal ends is a cylinder, and must not try to find an apex. */
{
  const c = P.cone({ bottomDia: 300, topDia: 300, height: 500 });
  assert.strictEqual(c.kind, 'cylinder', 'equal ends is a plain tube');
  near(c.rect.width, TAU * 150, 1e-3, 'the rectangle wraps the circumference:');
  near(c.rect.height, 500, 1e-3, 'and stands the full height:');
}

/* 2. A frustum: the developed arcs must equal the real circumferences.
 *    This is the step people get wrong by sweeping 360 degrees. */
{
  const R = 400 / 2, r = 200 / 2, h = 300;
  const c = P.cone({ bottomDia: 400, topDia: 200, height: 300 });
  near(c.arcBig, TAU * R, 1e-3, 'the outer arc must equal the big circumference:');
  near(c.arcSmall, TAU * r, 1e-3, 'the inner arc must equal the small circumference:');
  near(c.bigRadius - c.smallRadius, c.slant, 1e-3,
    'the radial width of the ring must be the slant height:');
  /* The engine rounds to 0.001, which is far finer than any saw or plasma
   * torch, so the tolerance here is that rounding and not a looser claim. */
  near(c.slant, Math.hypot(R - r, h), 1e-3, 'slant height:');
  assert.ok(c.angleDeg > 0 && c.angleDeg < 360, 'this one should be under a full turn, got ' + c.angleDeg);
}

/* 3. A full cone, top diameter zero: the pattern is a plain sector. */
{
  const c = P.cone({ bottomDia: 500, topDia: 0, height: 600 });
  near(c.smallRadius, 0, 1e-9, 'a full cone develops to a sector with no hole:');
  near(c.bigRadius, Math.hypot(250, 600), 1e-3, 'and its radius is the slant height:');
  near(c.arcBig, TAU * 250, 1e-3, 'with the arc equal to the base circumference:');
}

/* 4. The sector can never exceed a full turn, however extreme the shape.
 *    theta = 360 * (R - r) / slant, and slant is the hypotenuse of (R - r)
 *    and the height, so the fraction is always under one. Writing this down
 *    is what showed that an earlier guard against theta > 360 was dead code. */
{
  [[1000, 950, 10], [1000, 10, 5], [600, 100, 1], [80, 79.9, 0.5]].forEach(function (p) {
    const c = P.cone({ bottomDia: p[0], topDia: p[1], height: p[2] });
    assert.ok(c.angleDeg <= 360 + 1e-6,
      'a sector over a full turn is geometrically impossible, got ' + c.angleDeg + ' for ' + p.join('/'));
  });
  /* and a nearly flat piece is flagged, because it is usually a typo */
  const flat = P.cone({ bottomDia: 1000, topDia: 950, height: 0.4 });
  assert.ok(flat.angleDeg > 350, 'this one should be close to a full ring, got ' + flat.angleDeg);
  assert.ok(flat.warn.length > 0, 'and an almost flat piece should be questioned');
  /* while an ordinary cone is not nagged about */
  assert.strictEqual(P.cone({ bottomDia: 400, topDia: 200, height: 300 }).warn.length, 0,
    'a normal cone should produce no warnings');
}

/* 5. Nonsense in, refusal out. */
assert.ok(P.cone({ bottomDia: 0, topDia: 0, height: 0 }).error, 'zero sizes are refused');
assert.ok(P.cone({ bottomDia: 300, topDia: -5, height: 100 }).error, 'a negative diameter is refused');

/* ===== Square to round =============================================== */

const sq = P.squareToRound({ width: 400, depth: 400, topDia: 250, height: 350, segments: 6 });

/* 6. A true length is never shorter than its plan distance, and never
 *    shorter than the rise. Anything else is a measuring error that would
 *    put a short edge on the plate. */
{
  assert.ok(!sq.error, 'the example should develop: ' + sq.error);
  sq.triangles.forEach(t => {
    [t.a, t.b, t.c].forEach(L => assert.ok(L > 0, t.label + ': a zero-length edge'));
  });
  /* every sloping edge must be at least the height */
  sq.marks.forEach(m => m.lengths.forEach(L =>
    assert.ok(L >= 350 - 1e-6, m.corner + ': a corner-to-circle length shorter than the rise')));
}

/* 7. The developed base must equal the real perimeter.
 *    If this is out, the finished piece does not meet its own seam. */
{
  const b = sq.development.base;
  let sum = 0;
  for (let i = 1; i < b.length; i++) sum += Math.hypot(b[i][0] - b[i-1][0], b[i][1] - b[i-1][1]);
  near(sum, sq.perimeter, 1e-2, 'the developed base edges must add up to the rectangle perimeter:');
}

/* 8. The developed top must equal the circumference, to within the error of
 *    approximating the arc by chords, and must get closer as the number of
 *    divisions goes up. A development that drifts the other way is wrong. */
{
  const err = n => {
    const s = P.squareToRound({ width: 400, depth: 400, topDia: 250, height: 350, segments: n });
    const t = s.development.top;
    let sum = 0;
    for (let i = 1; i < t.length; i++) sum += Math.hypot(t[i][0] - t[i-1][0], t[i][1] - t[i-1][1]);
    return Math.abs(sum - s.circumference) / s.circumference;
  };
  const e4 = err(4), e12 = err(12), e24 = err(24);
  assert.ok(e12 < e4, 'more divisions must fit the circle better (4: ' + e4.toFixed(5) + ', 12: ' + e12.toFixed(5) + ')');
  assert.ok(e24 < e12, 'and better again at 24 (' + e24.toFixed(5) + ')');
  assert.ok(e24 < 0.002, 'at 24 divisions the top should be within 0.2% of the circumference, got ' +
    (e24 * 100).toFixed(3) + '%');
}

/* 9. A square with a centred circle is symmetric: the four side panels are
 *    identical and so are the four corner fans. Asymmetry here would mean the
 *    walk around the solid is wrong. */
{
  const flats = sq.triangles.filter(t => t.kind === 'flat');
  assert.strictEqual(flats.length, 4, 'four sides, four flat panels');
  flats.forEach(f => {
    near(f.a, flats[0].a, 1e-6, 'side panels differ on the base edge:');
    near(f.b, flats[0].b, 1e-6, 'side panels differ on a sloping edge:');
    near(f.c, flats[0].c, 1e-6, 'side panels differ on the other sloping edge:');
  });
  const corners = sq.triangles.filter(t => t.kind === 'corner');
  assert.strictEqual(corners.length, 4 * 6, 'four corners of six triangles each');
  /* the first triangle of each corner fan should match across corners */
  for (let k = 1; k < 4; k++) {
    near(corners[k * 6].a, corners[0].a, 1e-6, 'corner fans differ between corners:');
  }
}

/* 10. A rectangle is not square: opposite sides match, adjacent ones do not. */
{
  const rect = P.squareToRound({ width: 600, depth: 300, topDia: 250, height: 350, segments: 6 });
  const flats = rect.triangles.filter(t => t.kind === 'flat');
  const bases = flats.map(f => f.a).sort((x, y) => x - y);
  near(bases[0], 300, 1e-6, 'the two short sides:');
  near(bases[1], 300, 1e-6, 'the two short sides:');
  near(bases[2], 600, 1e-6, 'the two long sides:');
  near(bases[3], 600, 1e-6, 'the two long sides:');
}

/* 11. Offsetting the circle breaks the symmetry, and must actually change
 *     the pattern rather than being quietly ignored. */
{
  const off = P.squareToRound({ width: 400, depth: 400, topDia: 250, height: 350, segments: 6, offsetX: 80 });
  const flats = off.triangles.filter(t => t.kind === 'flat');
  const spread = Math.max.apply(null, flats.map(f => f.b)) - Math.min.apply(null, flats.map(f => f.b));
  assert.ok(spread > 1, 'an 80 offset should make the side panels clearly different, spread was ' + spread);
}

/* 12. The marking table has a row per corner and a length per division. */
{
  assert.strictEqual(sq.marks.length, 4, 'one row per corner');
  sq.marks.forEach(m => assert.strictEqual(m.lengths.length, 7,
    m.corner + ': six divisions means seven radial lengths'));
}

/* 13. A fold is a shared edge, so there is exactly one per adjacent pair of
 *     triangles, and never one lying on a seam.
 *
 *     This started as an arithmetic slip in a test and turned out to be a
 *     real defect: both ends of the strip were being listed as folds, which
 *     puts a dashed fold line exactly where the plate has to be cut. The page
 *     paints the seam over them in red, so it looked right. Counting is what
 *     caught it, so the count stays. */
{
  [4, 6, 8, 12].forEach(function (seg) {
    const s = P.squareToRound({ width: 400, depth: 400, topDia: 250, height: 350, segments: seg });
    const n = s.triangles.length, fd = s.development.folds;
    assert.strictEqual(fd.length, n - 1,
      seg + ' divisions: ' + n + ' triangles share ' + (n - 1) + ' edges, got ' + fd.length + ' folds');

    /* and neither seam edge is among them */
    const b = s.development.base, t = s.development.top;
    const seams = [[b[0], t[0]], [b[b.length - 1], t[t.length - 1]]];
    const same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
    fd.forEach(function (f) {
      seams.forEach(function (sm) {
        assert.ok(!((same(f[0], sm[0]) && same(f[1], sm[1])) || (same(f[0], sm[1]) && same(f[1], sm[0]))),
          seg + ' divisions: a fold line is sitting on the seam, which is a cut edge');
      });
    });

    /* every fold must run between the base and the top, never along either */
    const onBase = p => b.some(q => same(p, q));
    const onTop = p => t.some(q => same(p, q));
    fd.forEach(function (f) {
      assert.ok((onBase(f[0]) && onTop(f[1])) || (onTop(f[0]) && onBase(f[1])),
        seg + ' divisions: a fold does not run from the base edge to the top edge');
    });
  });
}

/* 14. The pattern must not overlap itself.
 *
 *     This is the test that matters most and the one I did not have. Every
 *     triangle can be the correct shape while being laid down in the wrong
 *     place, and no check on lengths will notice: the first version put each
 *     corner fan back over the pattern instead of out along it, and produced
 *     a knot. Two things catch it.
 *
 *     First, area. Laid down flat and side by side, the triangles tile the
 *     development exactly, so the area inside the outline must equal the sum
 *     of the triangle areas. Anything folded back is counted once by Heron
 *     and cancels itself in the shoelace sum, so the two disagree.
 *
 *     Second, the outline must be a simple polygon. Area alone can be fooled
 *     by an overlap that happens to cancel; edges that cross cannot. */
{
  const heron = (a, b, c) => {
    const s = (a + b + c) / 2;
    return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
  };
  const shoelace = pts => {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      s += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    return Math.abs(s) / 2;
  };
  /* Do segments AB and CD cross? Proper crossings only: shared endpoints
   * between neighbouring edges are not an overlap. */
  const side = (p, q, r) => Math.sign((q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0]));
  const crosses = (a, b, c, d) =>
    side(a,b,c) * side(a,b,d) < 0 && side(c,d,a) * side(c,d,b) < 0;

  [[400, 400, 250, 350, 0, 0, 8],
   [600, 300, 250, 350, 0, 0, 6],
   [400, 400, 250, 350, 80, 0, 10],
   [500, 400, 150, 600, -60, 40, 12],
   [300, 300, 290, 120, 0, 0, 6]].forEach(function (p) {
    const s = P.squareToRound({ width: p[0], depth: p[1], topDia: p[2], height: p[3],
                                offsetX: p[4], offsetY: p[5], segments: p[6] });
    const tag = p.join('/');
    assert.ok(!s.error, tag + ': ' + s.error);

    const tri = s.triangles.reduce((sum, t) => sum + heron(t.a, t.b, t.c), 0);
    const outline = s.development.base.concat(s.development.top.slice().reverse());
    const poly = shoelace(outline);
    /* The chords of the laid-down triangles are the polygon's own edges, so
     * this is an identity, not an approximation. A tenth of a percent covers
     * the engine rounding to 0.001 on every point. */
    assert.ok(Math.abs(poly - tri) / tri < 0.001,
      tag + ': the triangles cover ' + tri.toFixed(1) + ' but the outline encloses ' +
      poly.toFixed(1) + '. The pattern is folding back over itself.');

    for (let i = 0; i < outline.length; i++) {
      for (let j = i + 2; j < outline.length; j++) {
        if (i === 0 && j === outline.length - 1) continue;   // the closing edge
        if (crosses(outline[i], outline[(i+1) % outline.length],
                    outline[j], outline[(j+1) % outline.length])) {
          assert.fail(tag + ': the outline crosses itself between edge ' + i + ' and edge ' + j);
        }
      }
    }
  });
}

/* 15. Nonsense in, refusal out. */
assert.ok(P.squareToRound({ width: 0, depth: 400, topDia: 250, height: 350 }).error, 'zero width refused');
assert.ok(P.squareToRound({ width: 400, depth: 400, topDia: 0, height: 350 }).error, 'zero circle refused');

console.log('ALL CHECKS PASSED  (15 cases)');
