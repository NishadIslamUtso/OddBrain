"""
pngread.py — minimal PNG reader used to verify the Claude screenshot spec.

Only the standard library (zlib + struct) is needed: no Pillow, no numpy.
Handles 8-bit, non-interlaced PNGs, colour types 0/2/3/4/6.

    import pngread
    img = pngread.read_png('spec/screenshots/Screenshot 2026-10-10 191547.png')
    print(img['w'], img['h'])          # 1920 1020
    print(pngread.hexof(img['px'](200, 600)))   # '#111111'

See spec/MEASURED_PIXELS.md for the values this produced.
"""
import zlib
import struct


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a png'
    pos = 8
    idat = b''
    w = h = bitdepth = colortype = None
    plte = None
    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos:pos + 4])
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if ctype == b'IHDR':
            w, h, bitdepth, colortype, _comp, _filt, interlace = struct.unpack('>IIBBBBB', chunk)
            assert bitdepth == 8, f'bitdepth {bitdepth} unsupported'
            assert interlace == 0, 'interlaced unsupported'
        elif ctype == b'IDAT':
            idat += chunk
        elif ctype == b'PLTE':
            plte = chunk
        elif ctype == b'IEND':
            break
        pos += 12 + length

    raw = zlib.decompress(idat)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colortype]
    bpp = channels
    stride = w * bpp
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        ftype = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if ftype == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        out[y * stride:(y + 1) * stride] = line
        prev = line

    def px(x, y):
        i = y * stride + x * bpp
        if colortype == 6:
            return tuple(out[i:i + 4])
        if colortype == 2:
            return tuple(out[i:i + 3]) + (255,)
        if colortype == 0:
            v = out[i]
            return (v, v, v, 255)
        if colortype == 4:
            v = out[i]
            return (v, v, v, out[i + 1])
        if colortype == 3:
            idx = out[i]
            r, g, b = plte[idx * 3:idx * 3 + 3]
            return (r, g, b, 255)
        raise ValueError(f'unsupported colour type {colortype}')

    return {'w': w, 'h': h, 'colortype': colortype, 'px': px}


def hexof(rgb):
    return '#%02x%02x%02x' % (rgb[0], rgb[1], rgb[2])
