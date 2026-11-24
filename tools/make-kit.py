"""Cuts the symbols out of a legend sheet (a vector PDF plotted from CAD) and writes them as a Redline symbol set.

    python tools/make-kit.py <legend.pdf> <out.redlinekit> [--sheet contact.png] [--name "My legend"]

Each legend row becomes one symbol: the line work to the left of its description, with any tag text.
The layout of the sheet (where each legend's symbol column and description column sit) is in SECTIONS below;
adjust it when the legend sheet is rearranged. Needs PyMuPDF (pip install pymupdf).
"""
import json, re, sys
import pymupdf

# name, group, x range of the symbol column, x where descriptions start, y range of the rows
SECTIONS = [
    ("Communication", 552, 612, 185, 600),
    ("Power",         540, 612, 735, 1490),
    ("Security",      912, 976, 185, 670),
    ("Single line",   900, 990, 712, 1500),
    ("Lighting",      1232, 1309, 185, 1490),
    ("Dry fire",      1696, 1771, 185, 1250),
]
GROUP_ORDER = ["Emergency lighting", "Lighting", "Power", "Communication", "Security", "Dry fire", "Single line"]
KEEP_UPPER = {"CCTV", "GPO", "TV", "PV", "USBC", "UPS", "RCD", "EWIS", "CO2", "ABE", "WAP", "LED", "MSB", "DB", "CT", "FTV", "MATV", "PTV", "RX/TX", "KG", "EM", "AC", "USB", "NTD", "P/T/Z", "M.E.N"}


def hexcol(c):
    if c is None:
        return None
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v * 255))) for v in c[:3])


def r2(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def drawing_path(d, ox, oy):
    """One PyMuPDF drawing → 'M..L..C..Z' in coordinates local to (ox, oy)."""
    out, cur = [], None
    def pt(p):
        return f"{r2(p.x - ox)} {r2(p.y - oy)}"
    def move(p):
        nonlocal cur
        if cur is None or abs(cur.x - p.x) > 0.005 or abs(cur.y - p.y) > 0.005:
            out.append("M" + pt(p))
    for it in d["items"]:
        k = it[0]
        if k == "l":
            move(it[1]); out.append("L" + pt(it[2])); cur = it[2]
        elif k == "c":
            move(it[1]); out.append("C" + " ".join(pt(p) for p in it[2:5])); cur = it[4]
        elif k == "re":
            r = it[1]
            out.append("M" + pt(r.tl) + "L" + pt(r.tr) + "L" + pt(r.br) + "L" + pt(r.bl) + "Z"); cur = None
        elif k == "qu":
            q = it[1]
            out.append("M" + pt(q.ul) + "L" + pt(q.ur) + "L" + pt(q.lr) + "L" + pt(q.ll) + "Z"); cur = None
    if d.get("closePath") and out and not out[-1].endswith("Z"):
        out.append("Z")
    return "".join(out)


def nice_name(lines):
    text = " ".join(lines)
    text = re.sub(r"\s+", " ", text).strip()
    parts = [p.strip() for p in text.split("|")]
    parts = [p for p in parts if p and not re.match(r"^(OR EQUIVALENT|REFER TO\b.*)$", p)]
    if len(parts) > 1 and " " not in parts[0]:
        parts = parts[1:]                                        # "MAKER | WHAT IT IS | OR EQUIVALENT": the name is what it is
    text = " ".join(parts) if parts else text
    text = text.replace("*", "")
    for cut in (" - HPM", " - D40", " - IP", " - HARD", ", MOUNT", " (DIRECT", " COMPLETE WITH", " MOUNTED AT 1", ", No.", " No. DENOTES", ". ", " (WHERE", " (DENOTES", " AS REQUIRED", " AS PER", "- RATING", " - RATING", " WHERE NOTED", " TO ACTIVATE", " FOR VISUAL", " FOR FRONT"):
        i = text.find(cut)
        if i > 6:
            text = text[:i]
    text = text.strip(" -.,*")
    words = []
    for i, w in enumerate(text.split(" ")):
        bare = w.strip("()*,")
        if bare in KEEP_UPPER or re.search(r"\d", bare) or (len(bare) <= 3 and bare.isupper() and bare in KEEP_UPPER):
            words.append(w)
        else:
            words.append(w.capitalize() if i == 0 else w.lower())
    return " ".join(words)[:60]


def build(pdf_path, kit_name):
    page = pymupdf.open(pdf_path)[0]
    drawings = page.get_drawings()
    lines = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for ln in b["lines"]:
            text = "".join(s["text"] for s in ln["spans"]).strip()
            if text:
                s0 = ln["spans"][0]
                lines.append({"text": text, "bbox": pymupdf.Rect(ln["bbox"]), "size": s0["size"], "color": s0["color"], "origin": s0["origin"]})
    images = [pymupdf.Rect(i["bbox"]) for i in page.get_image_info()]

    symbols, used = [], set()
    for group, sx0, descx, sy0, sy1 in SECTIONS:
        desc = [l for l in lines if descx - 4 <= l["bbox"].x0 <= descx + 45 and sy0 <= l["bbox"].y0 <= sy1 and len(l["text"]) >= 3]
        desc.sort(key=lambda l: l["bbox"].y0)
        entries = []
        for l in desc:
            if entries and l["bbox"].y0 - entries[-1]["y1"] < 6.5:
                entries[-1]["lines"].append(l["text"]); entries[-1]["y1"] = l["bbox"].y1; entries[-1]["x0"] = min(entries[-1]["x0"], l["bbox"].x0)
            else:
                entries.append({"lines": [l["text"]], "y0": l["bbox"].y0, "y1": l["bbox"].y1, "x0": l["bbox"].x0})
        for i, e in enumerate(entries):
            top = (entries[i - 1]["y1"] + e["y0"]) / 2 if i else e["y0"] - 16
            bot = (e["y1"] + entries[i + 1]["y0"]) / 2 if i + 1 < len(entries) else e["y1"] + 16
            top, bot = max(top, e["y0"] - 26), min(bot, e["y1"] + 26)
            cell = pymupdf.Rect(sx0, top, e["x0"] - 2.5, bot)
            inside = lambda r: cell.x0 <= (r.x0 + r.x1) / 2 <= cell.x1 and cell.y0 <= (r.y0 + r.y1) / 2 <= cell.y1
            ds = [(n, d) for n, d in enumerate(drawings) if n not in used and inside(d["rect"]) and d["rect"].width < 90 and d["rect"].height < 70]
            ts = [l for l in lines if inside(l["bbox"]) and l["bbox"].x1 <= e["x0"] - 1]
            ims = [r for r in images if inside(r)]
            if not ds:
                continue
            box = pymupdf.Rect()
            for _, d in ds:
                w = (d.get("width") or 0) / 2
                box |= d["rect"] + (-w, -w, w, w)
            for l in ts:
                box |= l["bbox"]
            for r in ims:
                box |= r
            box += (-1, -1, 1, 1)
            name = nice_name(e["lines"])
            if (box.width > 55 and box.width / max(box.height, 1) > 7 and not ts) or name.lower().startswith("cable trench"):
                continue                                      # cables, trays and trenches: a line, not a point symbol
            items = []
            def add(item):
                last = items[-1] if items else None
                if last and "d" in last and "d" in item and all(last.get(k) == item.get(k) for k in ("s", "f", "w", "eo", "dash")):
                    last["d"] += item["d"]
                else:
                    items.append(item)
            for n, d in ds:
                used.add(n)
                stroke, fill, width = hexcol(d.get("color")), hexcol(d.get("fill")), d.get("width") or 0
                if d["type"] == "f":
                    stroke = None
                if d["type"] == "s":
                    fill = None
                if fill and stroke and width < 0.05:
                    stroke = None                                # a filled shape with a hairline of its own colour
                if stroke and width < 0.05:
                    width = 0.25
                path = drawing_path(d, box.x0, box.y0)
                if not path:
                    continue
                item = {"d": path}
                if stroke: item["s"] = stroke; item["w"] = round(width, 2)
                if fill: item["f"] = fill
                if fill and d.get("even_odd"): item["eo"] = 1
                dash = re.findall(r"[\d.]+", (d.get("dashes") or "").split("]")[0])
                if stroke and dash and any(float(v) > 0 for v in dash):
                    item["dash"] = [round(float(v), 2) for v in dash]
                if stroke or fill:
                    add(item)
            for l in ts:
                text = l["text"]
                if group in ("Power", "Single line") and text in ("A", "AB", "3200H"):
                    continue                                     # stand-ins for a circuit or a height on the legend, not part of the symbol
                size = l["size"]
                helv = pymupdf.get_text_length(text, fontname="helv", fontsize=size)
                if helv > l["bbox"].width > 0:
                    size *= l["bbox"].width / helv               # Redline letters in Helvetica: shrink a touch rather than overflow
                c = l["color"]
                items.append({"t": text, "x": round((l["bbox"].x0 + l["bbox"].x1) / 2 - box.x0, 2), "y": round(l["origin"][1] - 0.36 * size - box.y0, 2), "z": round(size, 2),
                              "c": "#%06x" % c})
            tag = ""
            if group == "Lighting":
                codes = [l["text"] for l in ts if re.fullmatch(r"[A-Z]{1,4}\d{0,2}[A-Z]{0,2}", l["text"])]
                tag = codes[0] if len(codes) == 1 else ""
            grp = "Emergency lighting" if group == "Lighting" and re.search(r"EMERGENCY|EXIT SIGN|EM D40", " ".join(e["lines"])) else group
            key = re.sub(r"[^a-z0-9]+", "-", f"{grp}-{tag or name}".lower()).strip("-")
            while any(s["key"] == key for s in symbols):
                key += "-2"
            symbols.append({"key": key, "name": name, "tag": tag, "group": grp, "w": round(box.width, 2), "h": round(box.height, 2), "items": items, "_box": box, "_images": len(ims)})

    symbols.sort(key=lambda s: (GROUP_ORDER.index(s["group"]), s["_box"].y0))
    seen = {}
    for s in symbols:                                         # counts go by name, so two symbols must not share one
        label = (s["tag"] + " " if s["tag"] else "") + s["name"]
        seen[label] = seen.get(label, 0) + 1
        if seen[label] > 1:
            s["name"] += f" ({seen[label]})"
    return {"redlineKit": 1, "name": kit_name, "symbols": symbols}, page


def contact_sheet(kit, path, zoom=5):
    """Draw every symbol back from the kit data, with its name, to check the conversion by eye."""
    cols, cw, ch = 6, 190, 96
    rows = -(-len(kit["symbols"]) // cols)
    doc = pymupdf.open(); pg = doc.new_page(width=cols * cw, height=rows * ch)
    for i, s in enumerate(kit["symbols"]):
        x0, y0 = (i % cols) * cw + 8, (i // cols) * ch + 6
        scale = min(3.0, (cw - 20) / s["w"], 56 / s["h"])
        sh = pg.new_shape()
        for it in s["items"]:
            if "t" in it:
                size = it["z"] * scale
                w = pymupdf.get_text_length(it["t"], fontname="helv", fontsize=size)
                c = tuple(int(it["c"][j:j + 2], 16) / 255 for j in (1, 3, 5))
                sh.insert_text((x0 + it["x"] * scale - w / 2, y0 + it["y"] * scale + 0.36 * size), it["t"], fontname="helv", fontsize=size, color=c)
                continue
            for seg in re.findall(r"[MLCZ][^MLCZ]*", it["d"]):
                nums = [float(v) for v in seg[1:].split()]
                pts = [pymupdf.Point(x0 + nums[k] * scale, y0 + nums[k + 1] * scale) for k in range(0, len(nums), 2)]
                if seg[0] == "M": cur = pts[0]; start = cur
                elif seg[0] == "L": sh.draw_line(cur, pts[0]); cur = pts[0]
                elif seg[0] == "C": sh.draw_bezier(cur, pts[0], pts[1], pts[2]); cur = pts[2]
                elif seg[0] == "Z": sh.draw_line(cur, start); cur = start
            col = lambda h: tuple(int(h[j:j + 2], 16) / 255 for j in (1, 3, 5)) if h else None
            sh.finish(color=col(it.get("s")), fill=col(it.get("f")), width=it.get("w", 0) * scale, even_odd=bool(it.get("eo")), closePath=False,
                      dashes=("[%s] 0" % " ".join(str(v * scale) for v in it["dash"])) if it.get("dash") else None)
        sh.commit()
        label = (s["tag"] + " · " if s["tag"] else "") + s["name"]
        pg.insert_textbox(pymupdf.Rect(x0 - 4, y0 + 62, x0 + cw - 12, y0 + ch - 4), f"{i + 1}. {label}\n[{s['group']}] {len(s['items'])} items" + (" +IMG" if s["_images"] else ""), fontsize=6.5, color=(0.2, 0.2, 0.2))
    pg.get_pixmap(matrix=pymupdf.Matrix(zoom / 2.5, zoom / 2.5)).save(path)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opt = lambda k, d=None: (sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d)
    kit, page = build(args[0], opt("--name", "Legend"))
    if opt("--sheet"):
        contact_sheet(kit, opt("--sheet"))
    for s in kit["symbols"]:
        s.pop("_box"); s.pop("_images")
    with open(args[1], "w", encoding="utf-8") as f:
        json.dump(kit, f, separators=(",", ":"), ensure_ascii=False)
    groups = {}
    for s in kit["symbols"]:
        groups[s["group"]] = groups.get(s["group"], 0) + 1
    print(len(kit["symbols"]), "symbols:", groups)
