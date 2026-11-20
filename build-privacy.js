/* Render the privacy policy to a single plain HTML page.
 *
 * A reviewer at Google and a reviewer at the Chrome Web Store will both open
 * this. It has no script, no fonts to fetch and no tracking of any kind, which
 * is the least embarrassing arrangement for a page whose whole subject is that
 * nothing is collected.
 */
const fs = require('fs'), path = require('path');

const md = fs.readFileSync('/home/claude/work/sheetgrab/privacy.md', 'utf8');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const lines = md.split('\n');
const out = [];
let inTable = false, para = [];

const inline = s => esc(s)
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

const flush = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };

for (const raw of lines) {
  const l = raw.trim();
  if (/^\|/.test(l)) {
    flush();
    if (/^\|[\s:-]+\|$/.test(l.replace(/-+/g, '-'))) continue;   // the --- separator row
    const cells = l.split('|').slice(1, -1).map(c => c.trim());
    if (!inTable) { out.push('<table>'); inTable = true;
      out.push('<tr>' + cells.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr>'); continue; }
    out.push('<tr>' + cells.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>');
    continue;
  }
  if (inTable) { out.push('</table>'); inTable = false; }

  if (!l) { flush(); continue; }
  const h = l.match(/^(#{1,3})\s+(.*)$/);
  if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
  para.push(l);
}
flush();
if (inTable) out.push('</table>');

const page = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sheetgrab privacy policy</title>
<meta name="description" content="Sheetgrab collects nothing, stores nothing and contacts no host but Google's own Sheets API.">
<style>
:root{color-scheme:light dark}
body{margin:0 auto;max-width:68ch;padding:44px 20px 90px;
  font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#1a1a18;background:#fff}
@media (prefers-color-scheme:dark){body{color:#e8e6e0;background:#161614}}
h1{font-size:28px;line-height:1.2;margin:0 0 6px;letter-spacing:-.02em}
h2{font-size:19px;margin:34px 0 10px;letter-spacing:-.01em}
h3{font-size:16px;margin:22px 0 8px}
p{margin:0 0 14px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;
  background:rgba(128,128,128,.14);padding:1px 5px;border-radius:4px}
a{color:#1b63c4}
@media (prefers-color-scheme:dark){a{color:#7FAEF0}}
table{border-collapse:collapse;width:100%;margin:0 0 18px;font-size:15px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid rgba(128,128,128,.3);vertical-align:top}
th{font-weight:600}
</style></head><body>
${out.join('\n')}
</body></html>`;

const dest = path.join(__dirname, 'sheetgrab', 'privacy.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });

const bad = [
  [/drive\.file/.test(page), 'the scope is not named on the page, and both reviewers look for it'],
  [/Limited Use/.test(page), 'the Google API Services User Data Policy sentence is missing'],
  [!/<script/i.test(page), 'a privacy policy page should not run script'],
  /* Only things the browser FETCHES count. The page names several Google URLs
   * in its text, and a link the reader may click is not a request the page
   * makes, so the check looks at loading attributes rather than at any string
   * that happens to start with https. */
  [!/(<(?:script|img|iframe|source|embed)\b[^>]*\bsrc=|<link\b[^>]*\bhref=|@import|url\()/i.test(page),
   'the page loads something from another host'],
].filter(([ok]) => !ok).map(([, m]) => m);
if (bad.length) { bad.forEach(m => console.log('  !', m)); process.exit(1); }

fs.writeFileSync(dest, page);
console.log('sheetgrab/privacy.html', (page.length / 1024).toFixed(1) + 'KB, no script, no external requests');
