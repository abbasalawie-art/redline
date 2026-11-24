# Redline

Simple PDF markup for site work on iPad and iPhone: clouds, clouds with a leader and note, callouts with an arrow, text, arrows, pen, highlighter, boxes and ellipses. Colours, widths and text sizes for everything. Markups save as real PDF markups that Revu can edit.

The plan, the feature breakdown and what is next are in [PLAN.md](PLAN.md).

## Try it on this PC

```powershell
node tools/serve.mjs
```

Then open <http://localhost:5173>. Drag a PDF onto the window or use **Open a PDF**.

## Put it on the iPad

Redline is live at **<https://abbasalawie-art.github.io/redline/>** (GitHub Pages). Only the program is hosted. Your PDFs never leave the device.

1. On the iPad, open that address in **Safari** (not Chrome), tap **Share**, then **Add to Home Screen**.
2. Open Redline from the home screen once while online. After that it opens with no signal.

### Publishing an update

The `app` folder is the whole app: plain files, no build step. After changing anything in it:

```powershell
node tools/publish.mjs
```

That refreshes the offline file list and uploads the `app` folder to the `gh-pages` branch of the GitHub repository `abbasalawie-art/redline`, which is what the address serves. The site updates within a minute or two. The iPad picks up the new version the next time Redline is opened online (it shows on the launch after that).

`node tools/publish.mjs --dry` lists what would go up without uploading. The rest of the project (plan, tools, tests) is on the `main` branch; save it with a normal `git commit` and `git push`.

### Quick look on the iPad without hosting

With the iPad on the same Wi-Fi as this PC:

```powershell
node tools/serve.mjs --lan
```

Open `http://<this PC's IP address>:5173` in Safari on the iPad. This is for a look only: it needs the PC running, and offline use and installing properly need the `https://` address above.

## Using it

| Tool | How |
|---|---|
| Select | Tap a markup. Drag to move it, drag the dots to resize. Tap a selected note again to edit its text. Drag empty space to move the page. |
| Cloud | Drag a box. |
| Cloud+ | Drag the cloud, then tap where the note goes and type. |
| Callout | Drag from the thing you are pointing at to where the text goes, then type. |
| Text | Tap and type. |
| Arrow | Drag. The head is at the end of the drag. Set the head to *None* for a plain line. |
| Pen, Highlight | Draw. |
| Box, Ellipse | Drag. |
| Lock | Keeps the current tool on instead of dropping back to Select. |

- Pinch to zoom and two fingers to move the page, in any tool.
- After an Apple Pencil touches the screen, the Pencil draws and a finger moves the page (change this in Settings, the ⋯ button).
- The options bar along the bottom changes the selected markup, or the next one you draw. Each tool remembers its own options.
- **Export** gives two choices: *Editable markups* (Revu can still move and restyle them) or *Flattened* (burnt into the page).
- Everything is saved on the device as you go. **Files** lists what is stored.

## What is where

```
app/            the app (this is what gets hosted)
  js/           geometry, shapes, viewer, tools, export … see PLAN.md section 6
  vendor/       PDF.js (draws pages) and pdf-lib (writes markups), bundled for offline use
tools/          local server, offline-list builder, icon and test-file makers
tests/          export tests and test drawings
```

## Tests

```powershell
node tests/export-test.mjs tests/test-2page.pdf tests/out/check.pdf
```

Writes every kind of markup onto a normal page and a rotated page, reads them back, and checks nothing is lost. `tests/secured-test.mjs` does the same on an author-locked PDF.

## Libraries

- [PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0)
- [pdf-lib, cantoo fork](https://github.com/cantoo-scribe/pdf-lib) (MIT)
