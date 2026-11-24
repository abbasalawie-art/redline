# Redline

Simple PDF markup for site work on iPad and iPhone. Clouds, callouts, arrows and text; your own legend symbols as stickers; numbered pins with site photos; measuring; form filling and signing; a site report in Word, PDF or Excel. Markups save as real PDF markups that Revu can edit.

The plan, the feature breakdown and what is next are in [PLAN.md](PLAN.md).

## Try it on this PC

```powershell
node tools/serve.mjs
```

Then open <http://localhost:5173>. Drag a PDF onto the window or use **Open a PDF**.

## Put it on the iPad

Redline is live at **<https://abbasalawie-art.github.io/redline/>** (GitHub Pages). Only the program is hosted. Your PDFs, photos and symbols never leave the device.

1. On the iPad, open that address in **Safari** (not Chrome), tap **Share**, then **Add to Home Screen**.
2. Open Redline from the home screen once while online. After that it opens with no signal.

## Use it on a PC

It is the same app at the same address: open **<https://abbasalawie-art.github.io/redline/>** in Chrome or Edge. To give it its own window and taskbar icon, click the install icon at the right-hand end of the address bar (Chrome: *Install Redline*; Edge: *App available*). It then opens with no signal as well.

- Drag a PDF onto the window, or use **Open a PDF**. Mouse wheel zooms, Shift + wheel moves sideways, the middle button drags the page.
- Keys: V select, C cloud, K cloud+, Q callout, T text, A arrow, P pen, H highlight, R box, E ellipse, N pin, M measure, Ctrl+Z undo, Ctrl+F find.
- Each browser keeps its own copy of the tray and of the drawings. Load the symbol set once per browser (**Symbols › Symbol set**).

### Moving a drawing between the iPad and the PC

The PDF is what travels. On the device you are leaving: **Export › Editable markups**, and save it to OneDrive. On the other device: open that file in Redline. The markups come back editable, with their symbols, photos, pins and scale. Work you have not exported stays on the device it was done on.

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
| Cloud | Drag a box. **Shape** in the options bar switches to *Corners* (tap each corner, then Done) or *Freehand* (draw a loop). |
| Cloud+ | Drag the cloud, then tap where the note goes and type. |
| Callout | Drag from the thing you are pointing at to where the text goes, then type. |
| Text | Tap and type. **Retype** covers existing words (see below). |
| Arrow | Drag. The head is at the end of the drag. Set the head to *None* for a plain line. |
| Pen, Highlight | Draw. |
| Shape | Drag. Box or Ellipse. |
| Symbols | Opens the tray. Pick a symbol, then tap the drawing to place it. It keeps placing until you pick another tool. |
| Pin | Tap. A numbered marker appears and a sheet opens for a note and a photo. |
| Measure | Length (drag), Run (tap along a cable route, then Done) or Area (tap the corners). Needs the drawing scale, asked for the first time. |
| Lock | Keeps the current tool on instead of dropping back to Select. |

Tapping the tool that is already on turns it off and goes back to Select.

- Pinch to zoom and two fingers to move the page, in any tool.
- After an Apple Pencil touches the screen, the Pencil draws and a finger moves the page (change this under ⋯ › Settings).
- The options bar along the bottom changes the selected markup, or the next one you draw. Each tool remembers its own options.
- **★ Save** in the options bar keeps a tool with its colours and sizes. Saved tools are at the top of the Symbols tray.
- Everything is saved on the device as you go. **Files** lists what is stored.

### Symbols, stickers and stamps

The tray (the **Symbols** button) holds:

- **Symbol sets.** Legend symbols as true line work: sharp at any zoom, and they can be turned and resized. Tap **Symbol set** and choose a `.redlinekit` file to add one. Symbol sets are kept on the device. A set saved as `app/kits/built-in.redlinekit` comes with the app instead: it is in the tray on every device with nothing to load, but it is then public along with the rest of the hosted app.
- **Markup or Design.** The switch at the top of the tray, and in the options bar while placing, sets how symbols go down. **Markup** puts them in your markup colour (red unless you change **Colour**), so they stand apart from the drawing. **Design** puts them down exactly as they are on the legend. A group the legend already draws in the markup colour (dry fire is red, like the usual markup red) goes down in a second colour instead, pink unless you change it: with one of those symbols in hand, **Colour** sets the second colour and leaves the main one alone. Tap a placed symbol to switch it afterwards. Photos and logos brought in with **Picture** always keep their own colours.
- **Your own stickers.** **New sticker**, then drag a box around anything on any PDF. It is saved to the tray as a picture with a see-through background. **Picture** adds a photo or logo from the device.
- **Stamps.** Words in a box: DEFECT, NOT INSTALLED, RELOCATE and so on. **New stamp** adds your own.
- **Signature.** Sign once with a finger or the Pencil, then tap wherever it goes.
- **Edit** removes things from the tray. Symbols already placed on drawings stay.

Each symbol is saved in the PDF as a stamp named after the symbol, so Revu's markups list can count them too.

#### Making a symbol set from a legend

```powershell
python tools/make-kit.py "legend.pdf" "kits/My legend.redlinekit" --name "My legend" --sheet contact.png
```

This cuts each row of a legend sheet (a vector PDF plotted from CAD) into a symbol with its description as the name, and writes a contact sheet picture to check by eye. Where the columns sit on the sheet is set at the top of the script. It needs Python with PyMuPDF. The `kits` folder is not uploaded anywhere: symbol sets are private.

### Pins, photos and the site report

- A **pin** is a numbered marker with a note and a photo. Tap a selected pin again to change them.
- **Export** adds a page at the back of the PDF for each photo, with its number and note (this can be turned off).
- The list button (or ⋯ › *Markups and report*) shows every pin, measurement and note, with **symbol counts** per page and for the whole drawing. Tap a row to jump to it.
- **Word report**, **PDF report** and **Excel** build a site report: each pin with its note, a picture of where it is on the drawing and its photo, then symbol counts, measurements and notes.

### Measuring

Set the scale printed on the sheet (⋯ › *Drawing scale*), for this page or every page. If the PDF is a reduced print or has no scale, draw a Length over a dimension you know, tap it, and tap **Calibrate**. Changing the scale updates the measurements already drawn.

### Forms and signing

Fillable PDFs show their fields tinted blue. In Select, tap a field to type, tick or choose. Answers are written into the PDF's own form fields on export, or made permanent with *Flattened*. Place your signature from the Symbols tray.

### Pages

**Pages** (the page number in the top bar) lists the sheets. The buttons at the top act on the page you are viewing: Turn, move Earlier or Later, add a Blank page, Add a PDF at the end, Pull out pages into a new PDF, Delete. Page changes cannot be undone, and text notes stay upright when a page is turned, so turn pages before marking them up.

### Finding, retyping and copying text

- ⋯ › **Find text** searches every page. Matches are highlighted and the bar at the top steps through them.
- **Text › Retype**: tap a line of typed text and it is covered with a white patch carrying the same words, ready to change. On drawings whose text is drawn as lines, drag a box instead to cover it and type on top. The old text is covered, not removed: this is not redaction.
- ⋯ › **Text to Word** copies the words of the PDF into a Word file. Layout, tables and pictures are not kept.

### Export

**Export** gives *Editable markups* (Revu can still move and restyle them) or *Flattened* (burnt into the page). Opening an exported file in Redline again, on any device, brings the markups back as editable, with their symbols and photos.

## What is where

```
app/            the app (this is what gets hosted)
  js/           geometry, shapes, viewer, tools, export … see PLAN.md section 6
  vendor/       PDF.js (draws pages) and pdf-lib (writes markups), bundled for offline use
tools/          local server, offline-list builder, publisher, symbol-set maker
tests/          export tests and test drawings
kits/           symbol sets made from legends (private: git ignores this folder)
```

## Tests

```powershell
node tests/export-test.mjs tests/test-2page.pdf tests/out/check.pdf
```

Writes every kind of markup onto a normal page and a rotated page, reads them back, and checks nothing is lost: markups, symbols, photos, the drawing scale and the page count. `tests/secured-test.mjs` does the same on an author-locked PDF, and `tests/office-test.mjs` writes a sample Word and Excel file. `tests/harness.js` drives the running app from the browser console.

## Limits worth knowing

- Text markups cannot be turned, and characters outside standard Latin become `?`.
- Find and Retype only see typed text. CAD drawings often draw their text as lines.
- Stickers you cut yourself are pictures (sharp, but not line work). Symbol sets are line work.
- Measurements are saved as lines and shapes carrying the value as a comment, not as Revu's own measurement markups.
- A web app cannot appear in the iOS "Open in…" menu. Open PDFs from inside Redline.

## Libraries

- [PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0)
- [pdf-lib, cantoo fork](https://github.com/cantoo-scribe/pdf-lib) (MIT)
