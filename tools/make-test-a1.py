# Makes test drawings: an A1 sheet with fine linework and small text, and a "secured" copy
# (opens without a password but has an owner password), like many consultant PDFs.
#   python tools/make-test-a1.py tests/test-a1.pdf tests/test-a1-secured.pdf
import sys, math, pymupdf

out, secured = sys.argv[1], sys.argv[2]
W, H = 2384, 1684                      # A1 landscape in points
doc = pymupdf.open()
page = doc.new_page(width=W, height=H)
sh = page.new_shape()
sh.draw_rect(pymupdf.Rect(40, 40, W - 40, H - 40)); sh.finish(color=(0, 0, 0), width=2)
for i in range(1, 24):                 # grid lines
    x = 40 + i * (W - 80) / 24
    sh.draw_line((x, 40), (x, H - 40))
for j in range(1, 17):
    y = 40 + j * (H - 80) / 17
    sh.draw_line((40, y), (W - 40, y))
sh.finish(color=(0.75, 0.75, 0.75), width=0.25)
for n in range(60):                    # "rooms" and "fittings"
    x = 120 + (n % 10) * 215; y = 140 + (n // 10) * 240
    sh.draw_rect(pymupdf.Rect(x, y, x + 180, y + 190)); sh.finish(color=(0, 0, 0), width=1)
    for k in range(6):
        cx = x + 25 + k * 26; cy = y + 150
        sh.draw_circle((cx, cy), 6); sh.finish(color=(0, 0, 0.6), width=0.5)
        sh.draw_line((cx - 6, cy), (cx + 6, cy)); sh.draw_line((cx, cy - 6), (cx, cy + 6)); sh.finish(color=(0, 0, 0.6), width=0.35)
sh.commit()
for n in range(60):
    x = 120 + (n % 10) * 215; y = 140 + (n // 10) * 240
    page.insert_text((x + 8, y + 18), f"ROOM {n + 1:02d}", fontsize=9, fontname="helv")
    page.insert_text((x + 8, y + 30), "GPO 10A  DB-L1  CCT 12", fontsize=5, fontname="helv", color=(0.2, 0.2, 0.2))
page.insert_text((W - 620, H - 70), "E-101  LEVEL 1 POWER LAYOUT  1:100 @ A1", fontsize=22, fontname="hebo")
p2 = doc.new_page(width=H, height=W)   # second sheet stored portrait and rotated, as CAD often does
p2.insert_text((80, 120), "E-102  LEVEL 2 (stored portrait, rotated 90)", fontsize=30, fontname="hebo")
p2.draw_rect(pymupdf.Rect(60, 60, H - 60, W - 60), color=(0, 0, 0), width=2)
p2.set_rotation(90)
doc.save(out, deflate=True)
doc.save(secured, deflate=True, encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="owner-only", user_pw="",
         permissions=pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_ACCESSIBILITY)
print("wrote", out, "and", secured)
