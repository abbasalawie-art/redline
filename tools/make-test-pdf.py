import sys
out = sys.argv[1]
objs = []
def add(s): objs.append(s); return len(objs)
# 1 catalog, 2 pages, 3 page1, 4 page2 (rotated 90), 5 font, 6 content1, 7 content2
content1 = b"BT /F1 24 Tf 60 520 Td (Page 1 - normal A4 landscape) Tj ET\n0.6 G 1 w 100 100 300 200 re S 500 150 200 150 re S\n"
content2 = b"BT /F1 24 Tf 60 780 Td (Page 2 - stored portrait, Rotate 90) Tj ET\n0.6 G 1 w 100 100 200 300 re S\n"
add(b"<< /Type /Catalog /Pages 2 0 R >>")
add(b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>")
add(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>")
add(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Rotate 90 /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>")
add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
add(b"<< /Length %d >>\nstream\n" % len(content1) + content1 + b"endstream")
add(b"<< /Length %d >>\nstream\n" % len(content2) + content2 + b"endstream")
buf = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
offs = []
for i, o in enumerate(objs, 1):
    offs.append(len(buf))
    buf += b"%d 0 obj\n" % i + o + b"\nendobj\n"
xref = len(buf)
buf += b"xref\n0 %d\n" % (len(objs)+1)
buf += b"0000000000 65535 f \n"
for o in offs: buf += b"%010d 00000 n \n" % o
buf += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs)+1, xref)
open(out, "wb").write(buf)
print("wrote", out, len(buf))
