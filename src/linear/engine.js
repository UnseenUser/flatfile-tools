/* The solver. One-dimensional cutting stock, with a saw that eats material.
 *
 * This is the part a general calculator site cannot copy onto a page, because
 * it is not a formula. Deciding which pieces share a bar so that the fewest
 * bars are bought is bin packing, which is NP-hard, so what follows is a good
 * heuristic rather than a proof of the optimum, and the panel says so.
 *
 * THE KERF RULE, which is the thing people get wrong.
 *
 * Every cut turns a few millimetres of bar into dust. A piece therefore costs
 * its own length PLUS one kerf, including the last piece on the bar: you cut
 * it free of the remainder, and that cut is real. The only cut that does not
 * exist is the one past the end of the bar, so when pieces finish flush the
 * model has charged one kerf too many.
 *
 * That error is deliberate and it is always in the safe direction. A plan that
 * is one kerf pessimistic leaves 3mm spare. A plan that is one kerf optimistic
 * leaves the last piece 3mm short, and a short piece is scrap.
 */
(function (root) {
  'use strict';

  var EPS = 1e-9;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* What one bar of this stock can hold once the ends are trimmed. */
  function usable(stock, o) {
    return stock.length - (o.trimStart || 0) - (o.trimEnd || 0);
  }

  /* Expand "4 of 820mm" into four pieces, longest first. Ties are broken by a
   * supplied jitter so restarts explore genuinely different packings rather
   * than recomputing the same one. */
  function expand(parts, jitter) {
    var out = [];
    parts.forEach(function (p, i) {
      var n = Math.max(0, Math.round(p.qty || 0));
      for (var k = 0; k < n; k++) {
        out.push({ label: p.label || ('Part ' + (i + 1)), length: p.length, src: i, j: jitter ? jitter() : 0 });
      }
    });
    out.sort(function (a, b) { return (b.length - a.length) || (a.j - b.j); });
    return out;
  }

  /* Fill one bar as full as it will go: repeatedly take the longest piece that
   * still fits. Best-fit-decreasing, which is what a person does by eye and is
   * within a few percent of optimal on real cutting lists. */
  function fillBar(room, pool, kerf) {
    var pieces = [], left = room;
    for (var pass = 0; pass < pool.length; pass++) {
      var bestIdx = -1;
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].taken) continue;
        if (pool[i].length + kerf <= left + EPS) { bestIdx = i; break; }  // pool is sorted desc
      }
      if (bestIdx < 0) break;
      pool[bestIdx].taken = true;
      pieces.push(pool[bestIdx]);
      left -= pool[bestIdx].length + kerf;
    }
    return { pieces: pieces, left: left };
  }

  /* One complete attempt. Opens bars until every piece is placed, choosing the
   * stock type for each bar by what it actually wastes rather than by size. */
  function attempt(parts, stock, o, jitter) {
    var kerf = o.kerf || 0;
    var pool = expand(parts, jitter);
    var remaining = {};                       // how many bars of each type are left
    stock.forEach(function (s, i) { remaining[i] = (s.qty === null || s.qty === undefined) ? Infinity : s.qty; });

    var bars = [], guard = 0;
    while (pool.some(function (p) { return !p.taken; })) {
      if (++guard > 10000) break;             // nothing should need this; it stops a hang

      var best = null;
      for (var si = 0; si < stock.length; si++) {
        if (remaining[si] <= 0) continue;
        var room = usable(stock[si], o);
        if (room <= 0) continue;

        /* Try this bar on a copy of the pool, so the trial does not consume. */
        var marks = pool.map(function (p) { return p.taken; });
        var got = fillBar(room, pool, kerf);
        pool.forEach(function (p, i) { p.taken = marks[i]; });

        if (!got.pieces.length) continue;
        var cost = stock[si].cost || 0;
        /* Rank by waste per unit of bar bought, so a long bar is not preferred
         * merely for swallowing more pieces, and cost breaks the tie when the
         * user gave prices. */
        var score = (got.left / room) + (cost ? cost / 1e6 : 0);
        if (!best || score < best.score - EPS) best = { si: si, score: score, room: room };
      }

      if (!best) break;                        // nothing left that fits anything

      var room2 = best.room;
      var filled = fillBar(room2, pool, kerf);
      remaining[best.si]--;
      bars.push({ stock: best.si, pieces: filled.pieces, left: filled.left, room: room2 });
    }

    var unplaced = pool.filter(function (p) { return !p.taken; });
    return { bars: bars, unplaced: unplaced, stock: stock, o: o };
  }

  function score(sol, stock) {
    var cost = 0;
    sol.bars.forEach(function (b) { cost += (stock[b.stock].cost || 0); });
    var waste = sol.bars.reduce(function (a, b) { return a + b.left; }, 0);
    /* Unplaced pieces dominate everything: a plan that leaves work out is not
     * a cheaper plan, it is a wrong one. */
    return [sol.unplaced.length, sol.bars.length, cost, waste];
  }

  function better(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] < b[i] - EPS) return true;
      if (a[i] > b[i] + EPS) return false;
    }
    return false;
  }

  /* A small deterministic generator, so the same input always gives the same
   * plan. A cutting list that changed between two presses of the button would
   * be impossible to trust or to check against a printout. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function plan(input) {
    var parts = (input.parts || []).filter(function (p) { return p.length > 0 && p.qty > 0; });
    var stock = (input.stock || []).filter(function (s) { return s.length > 0; });
    var o = {
      kerf: input.kerf || 0,
      trimStart: input.trimStart || 0,
      trimEnd: input.trimEnd || 0,
      minOffcut: input.minOffcut || 0,
    };

    var problems = [];
    if (!parts.length) problems.push({ kind: 'empty', text: 'No parts yet. Add what you need cut.' });
    if (!stock.length) problems.push({ kind: 'empty', text: 'No stock yet. Add the lengths you can buy.' });

    /* A piece longer than any bar can never be cut, and saying so before the
     * run is worth more than discovering it in the results. */
    var longest = 0;
    stock.forEach(function (s) { longest = Math.max(longest, usable(s, o)); });
    parts.forEach(function (p) {
      if (p.length + o.kerf > longest + EPS) {
        problems.push({
          kind: 'toolong',
          text: '"' + (p.label || 'A part') + '" is ' + p.length + ' long. The longest bar gives you ' +
                round(longest) + ' after trim, and the cut takes ' + o.kerf + ' more. It cannot be cut from this stock.',
        });
      }
    });

    if (!parts.length || !stock.length) {
      return { bars: [], problems: problems, summary: null };
    }

    /* Several attempts, keeping the best. The first is the plain
     * longest-first pass; the rest shuffle ties. */
    var best = attempt(parts, stock, o, null), bestScore = score(best, stock);
    for (var t = 1; t < 24; t++) {
      var r = rng(t * 7919);
      var s2 = attempt(parts, stock, o, function () { return r(); });
      var sc = score(s2, stock);
      if (better(sc, bestScore)) { best = s2; bestScore = sc; }
    }

    return present(best, stock, o, problems);
  }

  function round(n) { return Math.round(n * 1000) / 1000; }
  /* Percentages are read by a person standing at a saw, not by another
   * program, and "24.767% used" is three digits of false confidence about a
   * bar that is a quarter full. One decimal, and none when it is whole. */
  function pct(n) { return String(Math.round(n * 10) / 10); }

  function present(sol, stock, o, problems) {
    var bars = sol.bars.map(function (b, i) {
      var at = o.trimStart || 0, pieces = [];
      b.pieces.forEach(function (p) {
        pieces.push({ label: p.label, length: p.length, start: round(at) });
        at += p.length + o.kerf;
      });
      var cuts = b.pieces.length;
      var offcut = b.left;
      return {
        index: i + 1,
        stockLabel: stock[b.stock].label || ('Stock ' + (b.stock + 1)),
        stockLength: stock[b.stock].length,
        room: round(b.room),
        pieces: pieces,
        cuts: cuts,
        kerfTotal: round(cuts * (o.kerf || 0)),
        offcut: round(offcut),
        /* An offcut long enough to be worth racking is not waste, and a shop
         * that treats it as waste throws away money. */
        keep: offcut >= (o.minOffcut || 0) && (o.minOffcut || 0) > 0,
        usedPct: round(100 * (1 - offcut / b.room)),
      };
    });

    var byStock = {};
    sol.bars.forEach(function (b) {
      var k = stock[b.stock].label || ('Stock ' + (b.stock + 1));
      byStock[k] = (byStock[k] || 0) + 1;
    });

    var boughtLength = sol.bars.reduce(function (a, b) { return a + stock[b.stock].length; }, 0);
    var partLength = sol.bars.reduce(function (a, b) {
      return a + b.pieces.reduce(function (x, p) { return x + p.length; }, 0);
    }, 0);
    var kerfLength = sol.bars.reduce(function (a, b) { return a + b.pieces.length * (o.kerf || 0); }, 0);
    var trimLength = sol.bars.length * ((o.trimStart || 0) + (o.trimEnd || 0));
    var offcutLength = sol.bars.reduce(function (a, b) { return a + b.left; }, 0);
    var kept = bars.filter(function (b) { return b.keep; });

    var cost = sol.bars.reduce(function (a, b) { return a + (stock[b.stock].cost || 0); }, 0);

    /* Why the yield is what it is.
     *
     * A fabricator who sees 52% assumes the tool is bad. Often the job is just
     * shaped that way: when a piece is more than half a bar, no second piece
     * can ever join it, and one per bar IS the optimum. Saying so is the
     * difference between a number and an answer, and it is the thing a
     * one-formula clone of this page cannot do. */
    var notes = [];
    var over = {};
    sol.bars.forEach(function (b) {
      var room = b.room;
      b.pieces.forEach(function (p) {
        if (p.length + (o.kerf || 0) > room / 2) {
          over[p.label] = (over[p.label] || 0) + 1;
        }
      });
    });
    var overNames = Object.keys(over);
    var overCount = overNames.reduce(function (a, k) { return a + over[k]; }, 0);
    if (overCount) {
      notes.push({
        kind: 'halfbar',
        text: overCount + ' piece' + (overCount === 1 ? '' : 's') + ' (' + overNames.join(', ') +
              ') take more than half a bar, so nothing else can share with them. Those bars are ' +
              'already as full as they can be, and the waste on them is the job rather than the plan. ' +
              'A different stock length is the only thing that changes it.',
      });
    }

    var lastBar = bars[bars.length - 1];
    if (bars.length > 1 && lastBar && lastBar.usedPct < 40) {
      notes.push({
        kind: 'tail',
        text: 'The last bar is only ' + pct(lastBar.usedPct) + '% used. If this job can carry a few spare ' +
              'pieces, adding them costs nothing: that bar is bought either way.',
      });
    }

    if (sol.unplaced.length) {
      problems = problems.concat([{
        kind: 'unplaced',
        text: sol.unplaced.length + ' piece' + (sol.unplaced.length === 1 ? '' : 's') +
              ' could not be placed. Either the stock ran out, or they are longer than any bar.',
      }]);
    }

    return {
      bars: bars,
      problems: problems,
      notes: notes,
      summary: {
        barsUsed: sol.bars.length,
        byStock: byStock,
        boughtLength: round(boughtLength),
        partLength: round(partLength),
        kerfLength: round(kerfLength),
        trimLength: round(trimLength),
        offcutLength: round(offcutLength),
        keptCount: kept.length,
        keptLength: round(kept.reduce(function (a, b) { return a + b.offcut; }, 0)),
        /* Yield is the honest headline: how much of what you buy leaves as
         * parts. Everything else is dust, trim and remainder. */
        yieldPct: boughtLength ? round(100 * partLength / boughtLength) : 0,
        cost: round(cost),
        unplaced: sol.unplaced.length,
      },
    };
  }

  var api = { plan: plan, _usable: usable, _expand: expand };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LinearCut = api;
})(typeof self !== 'undefined' ? self : this);
