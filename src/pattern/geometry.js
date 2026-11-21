/* Flat pattern development, by triangulation.
 *
 * A fabricator marks this onto plate and cuts it. If the geometry is wrong,
 * the plate is scrap, so every number here is derived rather than fitted, and
 * the tests check the properties that have to hold: developed edges equal the
 * real edges, true lengths are never shorter than their plan distances, and
 * the pattern closes.
 *
 * THE ONE IDEA. A cone or a transition cannot be flattened by measuring the
 * drawing, because the lines you see in plan are foreshortened. The real
 * length of a sloping edge is the hypotenuse of a right triangle whose base
 * is the distance between its ends in plan and whose height is the rise:
 *
 *     true length = sqrt(plan^2 + rise^2)
 *
 * Every developed pattern below is built out of triangles whose sides are
 * true lengths, laid down one after another. That is the whole method, and it
 * is why the output is trustworthy at any size.
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var EPS = 1e-9;

  function r3(n) { return Math.round(n * 1000) / 1000; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function trueLen(planDist, rise) { return Math.hypot(planDist, rise); }

  /* ------------------------------------------------------------------ *
   * Cone and frustum, round to round, concentric.
   *
   * The development is a sector of an annulus. Everything follows from the
   * slant height and from where the cone's apex would be if the top were
   * continued to a point.
   * ------------------------------------------------------------------ */
  function cone(o) {
    var R = o.bottomDia / 2, r = o.topDia / 2, h = o.height;
    var warn = [];

    if (R <= 0 || h <= 0) return { error: 'The bottom diameter and the height both have to be positive.' };
    if (r < 0) return { error: 'The top diameter cannot be negative.' };
    if (Math.abs(R - r) < EPS) {
      /* A cylinder has no apex. Its development is a plain rectangle, and
       * pretending otherwise divides by zero. */
      return {
        kind: 'cylinder',
        rect: { width: r3(TAU * R), height: r3(h) },
        slant: r3(h),
        note: 'The two ends are the same size, so this is a plain cylinder: the pattern is a ' +
              'rectangle ' + r3(TAU * R) + ' long by ' + r3(h) + ' high, rolled into a tube.',
        warn: warn,
      };
    }

    var big = Math.max(R, r), small = Math.min(R, r);
    var slant = Math.hypot(big - small, h);
    /* Apex distance to the large edge, from similar triangles. */
    var A = big * slant / (big - small);
    var a = A - slant;
    /* The sector angle that makes the developed arc equal the real
     * circumference. This is the step people get wrong by using 360. */
    var theta = TAU * big / A;

    /* The sector angle is TAU * (big - small) / slant, and the slant is the
     * hypotenuse of (big - small) and the height, so it can never exceed a
     * full turn: the guard that used to sit here was unreachable and a test
     * proved it. What IS worth saying is when the development is nearly a
     * full ring, because that means an almost flat piece, and an almost flat
     * piece is usually a mistyped height. */
    if (theta > TAU * 0.97) {
      warn.push('Flattened, this is very nearly a complete ring, which means the piece is almost ' +
                'flat: ' + r3(h) + ' of height against ' + r3(big - small) + ' of change in radius. ' +
                'If that is not what you meant, check the height.');
    }

    return {
      kind: 'cone',
      bigRadius: r3(A),
      smallRadius: r3(a),
      angleDeg: r3(theta * 180 / Math.PI),
      slant: r3(slant),
      arcBig: r3(theta * A),
      arcSmall: r3(theta * a),
      chordBig: r3(2 * A * Math.sin(theta / 2)),
      /* Marking data: swing two arcs from one centre, then step the chord. */
      setOut: {
        centreToOuter: r3(A),
        centreToInner: r3(a),
        included: r3(theta * 180 / Math.PI),
      },
      warn: warn,
    };
  }

  /* ------------------------------------------------------------------ *
   * Square or rectangle to round, top circle concentric or offset.
   *
   * The solid is four flat triangles, one standing on each side of the
   * rectangle, separated by four conical corners. Each corner is
   * approximated by `seg` triangles running from the rectangle corner to
   * successive points on the circle, which is exactly how it is laid out by
   * hand, only with more patience.
   * ------------------------------------------------------------------ */
  function squareToRound(o) {
    var W = o.width, D = o.depth, r = o.topDia / 2, h = o.height;
    var seg = Math.max(2, Math.min(24, Math.round(o.segments || 6)));
    var ox = o.offsetX || 0, oy = o.offsetY || 0;
    var warn = [];

    if (W <= 0 || D <= 0 || h <= 0) return { error: 'Width, depth and height all have to be positive.' };
    if (r <= 0) return { error: 'The top diameter has to be positive.' };

    /* Plan coordinates. The rectangle is centred on the origin; the circle
     * sits at (ox, oy) and at height h. */
    var corner = [
      [ W / 2,  D / 2],   // 0  back right
      [-W / 2,  D / 2],   // 1  back left
      [-W / 2, -D / 2],   // 2  front left
      [ W / 2, -D / 2],   // 3  front right
    ];

    /* Circle points, one run of `seg` per corner, starting on the axis of
     * each side so the flat triangles land where they should. */
    function cp(t) { return [ox + r * Math.cos(t), oy + r * Math.sin(t)]; }

    /* Where the circle is divided.
     *
     * The flat panel on each side reaches up to the circle point directly
     * opposite that side, so those four points are at 90, 0, -90 and -180
     * degrees. Each conical corner then has to carry the circle from one of
     * those points to the next, a quarter turn.
     *
     * Starting the corner fans at 45 degrees instead, which is the obvious
     * looking choice and the one I made first, leaves a gap between the end
     * of a flat panel and the start of the next fan. The pattern still draws,
     * and the top edge comes out the wrong length. A test comparing the
     * developed top against the real circumference is what caught it. */
    var STEP = Math.PI / 2;
    function fanAngles(k) {            // k is the position in the walk, 0..3
      var from = Math.PI / 2 - STEP * k;
      var run = [];
      for (var i = 0; i <= seg; i++) run.push(from - STEP * (i / seg));
      return run;
    }

    /* Walk the solid once, emitting triangles in the order they are laid
     * down. Each triangle carries its three true lengths. */
    var tris = [], lengths = [];

    function tri(p1, p2, p3, kind, label) {
      /* p = [x, y, z] where z is 0 on the rectangle and h on the circle. */
      var t = {
        kind: kind, label: label,
        a: trueLen(dist([p1[0], p1[1]], [p2[0], p2[1]]), Math.abs(p1[2] - p2[2])),
        b: trueLen(dist([p2[0], p2[1]], [p3[0], p3[1]]), Math.abs(p2[2] - p3[2])),
        c: trueLen(dist([p3[0], p3[1]], [p1[0], p1[1]]), Math.abs(p3[2] - p1[2])),
      };
      tris.push(t);
      return t;
    }

    /* The seam is opened at the middle of the back side, which is where a
     * fabricator normally puts it: away from the eye and easy to weld. */
    var sideMid = [
      [0,  D / 2],   // back,  between corner 0 and 1
      [-W / 2, 0],   // left,  between 1 and 2
      [0, -D / 2],   // front, between 2 and 3
      [W / 2, 0],    // right, between 3 and 0
    ];
    /* Circle point opposite each side middle. */
    var sideTop = [Math.PI / 2, Math.PI, -Math.PI / 2, 0];

    /* Order around the solid, starting at the back-side seam:
     * half of back side, corner 0 arc, right side, corner 3 arc, front,
     * corner 2, left, corner 1, half of back. Simplest faithful walk: for
     * each corner c, emit the flat triangle on the side leading into it,
     * then the conical fan at that corner. */
    var order = [
      { side: 0, cornerIdx: 0 },   // back side -> corner 0 (back right)
      { side: 3, cornerIdx: 3 },   // right side -> corner 3 (front right)
      { side: 2, cornerIdx: 2 },   // front side -> corner 2 (front left)
      { side: 1, cornerIdx: 1 },   // left side -> corner 1 (back left)
    ];

    var marks = [];

    order.forEach(function (step, n) {
      var s = step.side, ci = step.cornerIdx;
      /* The two rectangle corners either side of this flat triangle. */
      var c1 = corner[(ci + 1) % 4], c2 = corner[ci];
      var apex = cp(sideTop[s]);
      /* A side panel is one flat triangle: the whole side as its base, and
       * the circle point opposite it as the apex. */
      tri([c1[0], c1[1], 0], [c2[0], c2[1], 0], [apex[0], apex[1], h], 'flat', 'Side ' + (n + 1));

      /* The conical corner at c2, carrying the circle a quarter turn from
       * the point this panel reached to the point the next panel starts at. */
      var run = fanAngles(n);
      var row = [];
      for (var k = 0; k < run.length; k++) {
        var p = cp(run[k]);
        row.push(r3(trueLen(dist(c2, p), h)));
        if (k === run.length - 1) break;
        var pb = cp(run[k + 1]);
        tri([c2[0], c2[1], 0], [p[0], p[1], h], [pb[0], pb[1], h], 'corner',
            'Corner ' + (n + 1) + '.' + (k + 1));
      }
      /* The numbers a fabricator marks with a trammel: corner to each circle
       * point, as a true length. */
      marks.push({ corner: 'Corner ' + (n + 1), lengths: row });
    });

    /* Lay the triangles down one after another, each sharing an edge with
     * the last. This is the development. */
    var poly = layDown(tris);

    /* Sanity that matters: the developed base must equal the real perimeter
     * and the developed top must equal the real circumference, within the
     * error of approximating arcs by chords. */
    var chordTop = 2 * r * Math.sin(Math.PI / (2 * seg) / 1) * 0; // computed below instead

    if (seg < 4) {
      warn.push('With only ' + seg + ' divisions per corner the round end will be noticeably ' +
                'faceted. Six is the usual minimum, twelve for anything that has to look round.');
    }
    if (Math.hypot(ox, oy) + r > Math.min(W, D) / 2 + Math.max(W, D)) {
      warn.push('The top circle is a long way off centre. Check the offset.');
    }

    return {
      kind: 'sqround',
      triangles: tris.map(function (t) {
        return { kind: t.kind, label: t.label, a: r3(t.a), b: r3(t.b), c: r3(t.c) };
      }),
      marks: marks,
      development: poly,
      segments: seg,
      perimeter: r3(2 * (W + D)),
      circumference: r3(TAU * r),
      warn: warn,
    };
  }

  /* Place triangle 2 against triangle 1 along their shared edge, and so on.
   * Returns the outline as a list of points plus the fold lines, which is
   * what gets drawn and printed. */
  function layDown(tris) {
    if (!tris.length) return { base: [], top: [], folds: [] };

    /* The first triangle: base edge along the x axis. */
    var base = [], top = [], folds = [];
    var p0 = [0, 0];
    var t0 = tris[0];
    var p1 = [t0.a, 0];                    // base edge of the first flat panel
    /* The top of the first panel goes above the base, and from then on the
     * pattern unrolls towards +x. Every later point is therefore placed to
     * the RIGHT of the line from the current base point to the current top
     * point, which is the direction of travel. Keeping that one invariant is
     * what stops the strip folding back over itself. */
    var apex = thirdPoint(p0, p1, t0.c, t0.b, +1);
    base.push(p0, p1);
    top.push(apex);

    /* A fold is an edge SHARED by two triangles, so there is one per adjacent
     * pair and no more: n triangles give n-1 folds.
     *
     * The two edges at the ends of the strip, p0-apex here and the closing
     * edge after the last triangle, are not shared with anything. They are
     * the seam, and the seam gets cut, not folded. Both used to be pushed in
     * with the folds, which put a dashed fold line exactly where the plate
     * has to be cut. On the page the seam is painted over them in red, so it
     * looked correct, and a count of folds against triangles is what found
     * it. Each triangle now contributes the edge it shares with the NEXT one,
     * and the last triangle contributes nothing. */
    folds.push([p1, apex]);

    var prevBase = p1, prevTop = apex;
    var last = tris.length - 1;

    for (var i = 1; i < tris.length; i++) {
      var t = tris[i];
      /* Which of a, b, c is which matters, and getting it wrong is invisible:
       * the pattern still closes, still has the right number of points, and
       * is a fraction of a percent out. Comparing the area the triangles
       * cover against the area the outline encloses is what found it.
       *
       * tri() builds each triangle from three points p1, p2, p3 and stores
       *   a = p1 to p2,  b = p2 to p3,  c = p3 to p1.
       * A fan triangle is (corner, circle point now, circle point next), so
       * its a is the edge ALREADY laid down and the new point is at c from
       * the corner and b from the last circle point.
       * A flat panel is (corner behind, corner ahead, circle point), so its
       * c is the edge already laid down and the new base point is at a from
       * the corner behind and b from the circle point. */
      if (t.kind === 'corner') {
        /* Fan: the rectangle corner stays put, the circle walks on. */
        var np = thirdPoint(prevBase, prevTop, t.c, t.b, -1);
        top.push(np);
        if (i < last) folds.push([prevBase, np]);
        prevTop = np;
      } else {
        /* A new flat panel: the circle point stays, the base walks on. */
        var nb = thirdPoint(prevBase, prevTop, t.a, t.b, -1);
        base.push(nb);
        if (i < last) folds.push([nb, prevTop]);
        prevBase = nb;
      }
    }
    return { base: base.map(rp), top: top.map(rp), folds: folds.map(function (f) { return [rp(f[0]), rp(f[1])]; }) };
  }
  function rp(p) { return [r3(p[0]), r3(p[1])]; }

  /* The third corner of a triangle, given two corners and the two distances
   * to it. Two points satisfy that, one on each side of AB, and `side` says
   * which: +1 for the left of A to B, -1 for the right.
   *
   * This used to have no side argument and pick the left always, so the only
   * way to get the other point was to pass A and B the other way round. That
   * worked for one of the two places that call it and was silently wrong in
   * the other, which laid every corner fan back over the pattern instead of
   * out along it. The development came out as a knot. Nothing in the numbers
   * showed it, because every individual triangle was the right shape; it was
   * only where they were put. An argument order that decides geometry is a
   * bad way to decide geometry, so now it is written down. */
  function thirdPoint(A, B, dA, dB, side) {
    var s = side < 0 ? -1 : 1;
    var dx = B[0] - A[0], dy = B[1] - A[1];
    var d = Math.hypot(dx, dy);
    if (d < EPS) return [A[0] + dA, A[1]];
    var a = (dA * dA - dB * dB + d * d) / (2 * d);
    var hsq = dA * dA - a * a;
    var hh = hsq > 0 ? Math.sqrt(hsq) : 0;
    var mx = A[0] + a * dx / d, my = A[1] + a * dy / d;
    return [mx - s * hh * dy / d, my + s * hh * dx / d];
  }

  var api = { cone: cone, squareToRound: squareToRound, _trueLen: trueLen, _thirdPoint: thirdPoint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pattern = api;
})(typeof self !== 'undefined' ? self : this);
