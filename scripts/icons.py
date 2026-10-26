"""Generate the extension's simple geometric expand mark without dependencies."""
import os
import struct
import zlib
os.makedirs('public/icons', exist_ok=True)
for size in (16, 32, 48, 128):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            xx, yy = x / size, y / size
            a, b = min(xx, 1 - xx), min(yy, 1 - yy)
            mark = (0.24 <= a <= 0.31 and 0.24 <= b <= 0.44) or (0.24 <= b <= 0.31 and 0.24 <= a <= 0.44)
            row.extend((196, 180, 255, 255) if mark else (36, 30, 56, 255))
        rows.append(b'\x00' + row)
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
    with open('public/icons/%s.png' % size, 'wb') as out:
        out.write(png)
