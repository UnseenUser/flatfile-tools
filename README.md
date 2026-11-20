# flatfile.github.io

Two public pages, served by GitHub Pages.

| Path | What it is | Who needs it |
|---|---|---|
| `/cutlist/` | The free cut list calculator | Anyone searching for one. This page is the only organic channel Cutlist has. |
| `/sheetgrab/privacy.html` | The Sheetgrab privacy policy | The Chrome Web Store and the Google OAuth consent screen both ask for its URL before they will let the extension through. |

Both pages are static, run no script from anywhere else, and fetch nothing
once loaded. `/cutlist/` carries its fonts inside the file, which is why it is
100KB and why it works with the network off.

## Rebuilding them

Neither page is edited here. Both are generated, so that a change to the
product cannot drift away from what is published:

```
node build-page.js https://your-url/cutlist/   # writes cutlist/index.html
node build-privacy.js                          # writes sheetgrab/privacy.html
```

`build-page.js` takes the live URL so it can write the canonical tag. Without
it the page still works and simply has no canonical tag, which is better than
one pointing at the wrong address.
