# Redline — site markup app for iPad / iPhone

Working name: **Redline** (rename any time; it is one string in `app/manifest.webmanifest` and `app/index.html`).

A PDF markup app built around a handful of simple tools you can use standing on site with one hand. Not a Revu clone: the ten things you reach for every day, done well, with big touch targets.

---

## 1. The idea

| Principle | What it means in the app |
|---|---|
| Simple tools | Ten tools on one rail. No ribbons, no nested menus. |
| Few taps | Pick tool → drag → type → done. Every tool remembers its last colour and size. |
| Made for site | Big buttons, works with a finger or Apple Pencil, works with no signal. |
| Your files stay yours | PDFs never leave the iPad. No account, no upload, no subscription. |
| Plays nice with Revu | Markups are saved as real PDF markups, so Revu on the PC can open, move, restyle and reply to them. |
| Never lose work | Every change is saved on the iPad straight away. Close the app, come back, carry on. |

## 2. How it runs on iOS (decision)

**Built as an installable web app (PWA).** You open one web address in Safari on the iPad, tap Share → *Add to Home Screen*, and it becomes an app icon that opens full screen and works offline.

Why this route:

- This PC is Windows. A native App Store app needs a Mac with Xcode to build, plus an Apple Developer account (about AUD 149 a year) and App Review.
- A web app can be built, tested and updated from this PC today. Updates reach the iPad the next time the app opens online.
- The same code runs on iPhone, iPad and the PC browser.

What it costs us (known limits of web apps on iOS):

- It cannot appear in the iOS "Open in…" / share menu of other apps. You open PDFs from inside Redline through the Files picker (OneDrive, iCloud, On My iPad all show there).
- Saving goes through the iOS share sheet (Save to Files, Mail, AirDrop, Teams) rather than silently overwriting the original.

**Later, if it earns it:** wrap the same code with Capacitor and ship it through the App Store. That fixes both limits above. Needs an Apple Developer account and a cloud Mac build service. Nothing built now is thrown away.

## 3. Ideas taken from Revu

Looked at how Revu 21 builds its markups on this PC (through the Bluebeam connector, on a scratch test PDF).

| Revu | Redline |
|---|---|
| Cloud = polygon with a "cloudy" border, about 14 pt bump spacing | Same shape and bump proportions, drawn by dragging a box |
| Cloud+ = a cloud grouped with a borderless text note and a straight leader that snaps to the nearest bump | Same: drag the cloud, tap where the note goes, type |
| Callout = text box + leader with a short "knee" stub (about 22 pt) + arrowhead | Same geometry; arrowhead is optional |
| Each markup has line colour, fill colour, text colour, opacity, line width, font size, line-end style | Same set, cut down to chips you can hit with a thumb |
| Tools remember their last properties | Each tool remembers its own colour, width, size |
| Double-click a tool to keep it active | A lock button: off = back to Select after one markup, on = keep drawing |
| Tool Chest: symbols and saved tools | The Symbols tray: legend symbols, your own stickers, stamps, saved tools |
| Markups list with counts | Markups list with symbol counts, and a site report |
| Measurements with a page scale | Length, cable run and area, with a scale per page or per drawing |
| Layers, studio | Left out on purpose |

## 4. Features

### v1 (this build)

Tools:

| # | Tool | Gesture | Options |
|---|---|---|---|
| 1 | Select | Tap a markup to select. Drag to move. Drag handles to resize. Drag empty space to pan. | — |
| 2 | **Cloud** | Drag a box. | Line colour, fill, width, opacity |
| 3 | **Cloud + leader + text** | Drag the cloud, tap where the note goes, type. | Line colour, fill, text colour, text size, width, opacity |
| 4 | **Leader + text (callout)** | Drag from the thing you are pointing at to where the text goes, type. | Arrowhead: filled / open / dot / none. Line colour, fill, text colour, text size, width, box border on/off |
| 5 | Text | Tap, type. | Text colour, text size, fill, border on/off |
| 6 | Arrow / line | Drag. | Arrowhead: filled / open / dot / none. Colour, width |
| 7 | Pen | Draw. | Colour, width |
| 8 | Highlighter | Draw. | Colour, width |
| 9 | Rectangle | Drag. | Line colour, fill, width, opacity |
| 10 | Ellipse | Drag. | Line colour, fill, width, opacity |

Options:

- **Colours for everything:** line, fill and text colour are separate. Twelve swatches plus "none" for fill.
- **Text sizes:** Auto, 8, 10, 12, 14, 18, 24, 36, 48, 72 pt. *Auto* picks a size that is readable for the sheet (12 pt on A4/A3, 18 on A2, 24 on A1, 36 on A0).
- **Line widths:** 1, 2, 3, 4, 6, 10 pt.
- **Opacity:** 100, 75, 50, 25 %.
- **Arrowheads:** filled, open, dot, none.

Viewer:

- Pinch to zoom, two fingers to pan, at any time and in any tool.
- Sharp at any zoom (re-renders the visible area after you stop moving).
- Page buttons and a page grid for multi-sheet sets.
- Apple Pencil: once a Pencil touches the screen, the Pencil draws and a finger pans.
- Rotated sheets handled (landscape drawings stored as rotated portrait pages).

Editing:

- Undo / redo.
- Select → move, resize, restyle, edit text, duplicate, delete.

Files:

- Open PDFs from the Files picker.
- A "Recent" shelf: the last documents stay on the iPad with their markups, ready offline.
- Autosave after every change.
- Export through the iOS share sheet:
  - **Editable** — real PDF markups. Revu, Acrobat and this app can all still edit them.
  - **Flattened** — burnt into the page so nobody can move them.
- Re-opening an exported file in Redline brings its markups back as editable.

### v2 (built 24 Nov 2026)

| Feature | What it does |
|---|---|
| **Symbols tray** | Legend symbols as stickers, in groups. Tap to place, keeps placing. Turn, resize, recolour. Loaded from a symbol set file made from the legend (`tools/make-kit.py`), kept on the device. |
| **Markup / Design switch** | Markup places symbols in the markup colour so they stand apart from the drawing; Design places them as they are on the legend. One switch, in the tray and in the options bar; a placed symbol can be switched afterwards. A group the legend already draws in the markup colour (dry fire, red) marks up in a second colour (pink). |
| **PC as well as iPad** | The same app in Chrome or Edge, installable. On a PC it opens a PDF from its folder (and from *Open with*), and Ctrl+S saves the markups back into that same file. Each device recognises a drawing it already has and works out which copy is newer. |
| **Revu's keyboard shortcuts** | The same keys as Revu for every tool and command Redline shares with it. F1 lists them. |
| **Your own stickers** | Drag a box around anything on any PDF: it becomes a sticker. Or bring in a picture. |
| **Stamps** | Words in a box (DEFECT, NOT INSTALLED, RELOCATE and so on), plus your own. |
| **Saved tools** | The star keeps a tool with its colours and sizes for one-tap reuse. |
| **Pins and site photos** | Numbered marker with a note and a photo from the camera or library. Photos become pages at the back of the export. |
| **Markups list** | Every pin, measurement and note, tap to jump. Symbol counts per page and per drawing. |
| **Site report** | Word, PDF or Excel: each pin with its note, where it is on the drawing and its photo; symbol counts; measurements; notes. |
| **Measure** | Length, cable run, area. Scale from the sheet (1:100 and so on) or calibrated from a known length. |
| **Forms and signing** | Fill text, tick, choice and drop-down fields. Saved signature placed with a tap. |
| **Page tools** | Turn, move, blank page, add a PDF, pull pages out, delete. |
| **Cloud shapes** | Box, corners (polygon) or freehand. |
| **Find text** | Search every page, step through matches. |
| **Retype** | Cover a line of text with a white patch carrying the same words, ready to change. Or cover any area and type on top. |
| **Text to Word** | The words of a PDF as a plain Word file. |

### Later

- Edit markups that were made in Revu, not just show them.
- Characters outside standard Latin, and text that turns. Both need an embedded font.
- Stickers cut on the iPad as line work rather than pictures.
- Compare / overlay two revisions.
- App Store build (see section 2).

## 5. Screen layout

The tool rail, top to bottom: Select · Cloud, Cloud+, Callout, Text · Arrow, Pen, Highlight, Shape · Symbols, Pin, Measure · Lock.
The top bar: Files, the drawing's name, pages, undo and redo, the markups list, More, Export.
The options bar along the bottom shows the options of the tool in hand or the markup selected.

- iPad: tool rail on the left, options along the bottom.
- iPhone: tool rail becomes a scrolling strip above the options bar.
- Buttons are at least 48 px. Light and dark follow the device.

## 6. How it is built

No build step: plain HTML, CSS and JavaScript modules. Two libraries, both bundled in the app so it works offline:

- **PDF.js** (Mozilla) draws the pages.
- **pdf-lib** (cantoo fork) writes the markups into the PDF.

```
iPad app/
  PLAN.md               this file
  README.md             how to run it and put it on the iPad
  app/                  ← everything that gets hosted
    index.html
    manifest.webmanifest
    sw.js               offline cache
    css/app.css
    js/
      main.js           start-up, shared state, undo, opening and saving
      ui.js             top bar, tool rail, options bar, sheets, scale, export
      viewer.js         page rendering, zoom, pan
      tools.js          what each tool does with a drag or tap
      editor.js         typing into a text box
      shapes.js         turns a markup into lines, curves, text and pictures (one source for screen and PDF)
      geometry.js       cloud bumps, arrowheads, leaders, polygons
      text.js           text measuring and wrapping (Helvetica metrics)
      render-svg.js     draws shapes on screen
      pdf-export.js     writes shapes into the PDF as markups or flattened; fills forms; reads everything back
      assets.js         pictures and symbol drawings that markups point at
      kit.js            the Symbols tray: symbol sets, stickers, stamps, saved tools, signature
      pins.js           pins: note and photo
      forms.js          form fields over the page
      pages.js          page tools
      search.js         find text, retype, text to Word
      report.js         markups list, symbol counts, site report
      office.js         writes Word and Excel files
      files.js          PC: open a PDF from its folder, save back into it
      keys.js           keyboard shortcuts (Revu's)
      store.js          documents, pictures, the tray and settings on the device
      icons.js
    icons/
    vendor/pdfjs, vendor/pdf-lib
  tools/serve.mjs       tiny local web server for testing on this PC
  tools/make-kit.py     cuts a legend sheet into a symbol set
  tests/                export tests (run with Node, checked in Revu)
  kits/                 symbol sets (private, not in git)
```

Key design choice: **one drawing recipe for screen and file.** `shapes.js` turns each markup into a short list of paths and text lines. The screen draws that list as SVG; the exporter writes the same list into the PDF. What you see is what gets saved.

### Markup data (per markup)

```
id, page, type, color, fill, textColor, width, opacity, fontSize, head, border,
rect | p1,p2 | pts | tip + box | p, text, k (sheet-size factor)
symbols: sym (which picture or drawing), name, rot, tint     pins: n, note, photo     measurements: mpp (metres per point)
```

Coordinates are in page points as displayed (top-left origin), converted to PDF space on export, including rotated pages.

### What goes in the PDF

| Redline | PDF markup | Revu sees |
|---|---|---|
| Cloud | Polygon, cloudy border effect | Cloud |
| Cloud + text | Polygon (cloudy) + FreeText callout, grouped | Cloud+ (target) or cloud + callout |
| Callout | FreeText with callout line and line ending | Callout |
| Text | FreeText | Text Box |
| Arrow | Line with line ending | Arrow / Line |
| Pen, Highlighter | Ink | Pen / Highlight |
| Rectangle, Ellipse | Square, Circle | Rectangle / Ellipse |
| Symbol, sticker, stamp | Stamp, subject = the symbol's name | Stamp (counts by subject) |
| Pin | Stamp, comment = number and note | Stamp |
| Length, Run, Area | Line, PolyLine, Polygon, comment = the value | Line / Polyline / Polygon |
| Signature | Ink | Pen |

Pictures and symbol drawings that the markups use are kept inside the exported PDF as well, so the file opens on another device with everything editable. Photo pages added at export are taken off again when the file is re-opened.

Every markup carries its own drawn appearance, so it looks the same in iOS Files preview, Mail, Acrobat and Revu.

## 7. Build stages

- [x] 0. Study Revu, write this plan
- [x] 1. App shell, open a PDF, render, zoom and pan
- [x] 2. Markup engine: shapes, select, move, resize, undo
- [x] 3. Tools: cloud, cloud + text, callout, text, arrow, pen, highlighter, rectangle, ellipse
- [x] 4. Options bar: colours, widths, text sizes, arrowheads, opacity; per-tool memory
- [x] 5. Export (editable and flattened), re-import, share sheet
- [x] 6. Recent shelf, autosave, offline install
- [x] 7. Test: browser on this PC, exported files opened in Revu
- [x] 8. Put it on a web address: <https://abbasalawie-art.github.io/redline/> (GitHub Pages)
- [ ] 9. Install it on the iPad (Safari → Share → Add to Home Screen), test with Pencil, fix what feels wrong
- [x] 10. Toolkit: symbols tray, stickers, stamps, saved tools, pins and photos, list and counts, site report, measuring, forms and signing, page tools, find, retype, text to Word
- [x] 11. Symbol set cut from the company legend (157 symbols, kept in `kits/`, outside git)

### Where it stands (24 Nov 2026)

Stages 0 to 8 and the toolkit (10, 11) are done. The app is live at <https://abbasalawie-art.github.io/redline/>. Nothing has run on a real iPad yet.

The toolkit was checked in the browser on this PC and against Revu 21: every new tool draws, exports and re-imports; symbols, pins and measurements arrive in Revu as named stamps, lines and shapes with their values; a filled form reads back field by field; the Word and Excel reports open in Word and Excel; page tools keep the markups on the right pages; 150 symbols on an A1 sheet redraw in about 12 ms.

Open and save in place on the PC was checked with the browser's own file handles; the Windows dialogs themselves (Open, Save as, the permission question, *Open with* from Explorer) can only be clicked by a person and were not exercised.

Not checked for the toolkit, because it needs the device: the camera, the photo picker, choosing a symbol set through the Files app, and how the tray and sheets feel under a finger.

Where things live:

- **The website** is the `app` folder, on the `gh-pages` branch of the GitHub repository `abbasalawie-art/redline`. `node tools/publish.mjs` refreshes the offline list and uploads it.
- **Everything else** (this plan, tools, tests) is on the `main` branch of the same repository, pushed with plain `git push`.
- The repository is public, which free GitHub Pages requires. It holds the program only: no drawings and no personal details.

Checked and working:

- All ten tools, every option, undo and redo, move, resize, edit text, copy, delete, tool lock.
- Pinch zoom, finger pan, Pencil-draws-finger-pans and palm rejection, using simulated touch and Pencil input.
- Normal and 90°-rotated pages; an A1 sheet stays sharp when zoomed in.
- Exported files opened in Revu 21 and read back: type, subject, author, note text, line / fill / text colours, fill opacity, line width, font size, arrowhead and highlighter blend all come through exactly.
- Flattened export, re-opening an exported file with markups editable again, author-locked ("secured") PDFs.
- Phone-width layout, dark mode, files list, pages grid.

Not checked, because it needs the device:

- The iOS keyboard while typing a note, the iOS share sheet, a real Apple Pencil, installing to the home screen and running offline, and speed on a heavy real drawing set.

Things that turned out differently from the plan:

- **Cloud+ in Revu** arrives as a cloud and a callout grouped together (they move as one and both are editable), not as Revu's own single "Cloud+" object. Revu's private format for that could not be read from here.
- **Fill opacity** was added for clouds, boxes and ellipses (25 % by default) because a solid fill hides the drawing underneath.
- **Line widths** scale with the sheet like text does: "2" is 2 pt on A4/A3 and 4 pt on A1, so markups look the same weight at fit-to-screen on any sheet.
- **Author-locked PDFs:** Redline shows a notice, then lets you mark up; the exported copy is not locked.

## 8. How it gets tested

1. Local web server on this PC, driven in the built-in browser: open a test PDF, draw each markup, change options, undo.
2. Export a PDF and inspect it: render it to an image and check each markup.
3. Open the exported PDF in Revu and read the markups back through the Bluebeam connector: types, colours, text, sizes.
4. Rotated-page test (90° sheet).
5. On the iPad: touch, Pencil, keyboard, share sheet, offline. **This can only be done on the device.**

## 9. Open questions

- The symbol set was cut from `legend.pdf` plotted on 10 Nov 2026; the legend DWG was edited after that. Re-run `tools/make-kit.py` on a fresh plot if symbols changed.
- Name and icon. "Redline" is a working name. The name is also in the web address, so changing it later means installing again from the new address.
- Your markup author name as it should appear in Revu.
