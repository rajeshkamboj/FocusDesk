#!/usr/bin/env python3
"""Generate the companion's icon set from the FocusDesk app icon.

The widget should look like the product it belongs to, so the icons are derived
from `public/icons/icon-192.png` (the PWA icon) instead of being invented here.

Outputs (committed, so a normal build needs no Python):

    companion/src-tauri/icons/32x32.png
    companion/src-tauri/icons/128x128.png
    companion/src-tauri/icons/128x128@2x.png
    companion/src-tauri/icons/icon.png
    companion/src-tauri/icons/icon.ico        (16/32/48/64/128 BMP + 256 PNG)

Run:  python3 companion/tools/make-icons.py
Only the standard library is used (zlib + struct).
"""

from __future__ import annotations

import os
import struct
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, os.pardir, "public", "icons", "icon-192.png")
TARGET = os.path.join(ROOT, "src-tauri", "icons")


# --------------------------------------------------------------------- #
# PNG decoding (8/16-bit RGB and RGBA, non-interlaced)                   #
# --------------------------------------------------------------------- #

def read_png(path: str) -> tuple[int, int, list[list[tuple[int, int, int, int]]]]:
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG file")

    width = height = bit_depth = color_type = 0
    idat = bytearray()
    offset = 8
    while offset < len(data):
        (length,) = struct.unpack(">I", data[offset : offset + 4])
        chunk_type = data[offset + 4 : offset + 8]
        chunk = data[offset + 8 : offset + 8 + length]
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            if interlace:
                raise ValueError("interlaced PNGs are not supported")
            if color_type not in (2, 6):
                raise ValueError(f"unsupported colour type {color_type}")
            if bit_depth not in (8, 16):
                raise ValueError(f"unsupported bit depth {bit_depth}")
        elif chunk_type == b"IDAT":
            idat += chunk
        elif chunk_type == b"IEND":
            break
        offset += 12 + length

    channels = 4 if color_type == 6 else 3
    sample_bytes = 2 if bit_depth == 16 else 1
    stride = width * channels * sample_bytes
    raw = zlib.decompress(bytes(idat))

    pixels: list[list[tuple[int, int, int, int]]] = []
    previous = bytearray(stride)
    position = 0
    for _ in range(height):
        filter_type = raw[position]
        position += 1
        line = bytearray(raw[position : position + stride])
        position += stride
        _unfilter(filter_type, line, previous, channels * sample_bytes)
        row: list[tuple[int, int, int, int]] = []
        for x in range(width):
            base = x * channels * sample_bytes
            if sample_bytes == 2:
                values = [line[base + i * 2] for i in range(channels)]  # high byte only
            else:
                values = [line[base + i] for i in range(channels)]
            if channels == 4:
                row.append((values[0], values[1], values[2], values[3]))
            else:
                row.append((values[0], values[1], values[2], 255))
        pixels.append(row)
        previous = line

    return width, height, pixels


def _unfilter(filter_type: int, line: bytearray, previous: bytearray, bpp: int) -> None:
    for i in range(len(line)):
        left = line[i - bpp] if i >= bpp else 0
        up = previous[i]
        up_left = previous[i - bpp] if i >= bpp else 0
        if filter_type == 1:
            line[i] = (line[i] + left) & 0xFF
        elif filter_type == 2:
            line[i] = (line[i] + up) & 0xFF
        elif filter_type == 3:
            line[i] = (line[i] + ((left + up) >> 1)) & 0xFF
        elif filter_type == 4:
            estimate = left + up - up_left
            pa, pb, pc = abs(estimate - left), abs(estimate - up), abs(estimate - up_left)
            predictor = left if (pa <= pb and pa <= pc) else (up if pb <= pc else up_left)
            line[i] = (line[i] + predictor) & 0xFF
        elif filter_type != 0:
            raise ValueError(f"unknown filter {filter_type}")


# --------------------------------------------------------------------- #
# Resizing (box filter in premultiplied alpha)                          #
# --------------------------------------------------------------------- #

def resize(
    pixels: list[list[tuple[int, int, int, int]]], source_size: int, target_size: int
) -> list[list[tuple[int, int, int, int]]]:
    if source_size == target_size:
        return [row[:] for row in pixels]

    scale = source_size / target_size
    out: list[list[tuple[int, int, int, int]]] = []
    for ty in range(target_size):
        y0, y1 = int(ty * scale), max(int(ty * scale) + 1, int((ty + 1) * scale))
        row_out: list[tuple[int, int, int, int]] = []
        for tx in range(target_size):
            x0, x1 = int(tx * scale), max(int(tx * scale) + 1, int((tx + 1) * scale))
            r = g = b = a = 0.0
            count = 0
            for sy in range(y0, min(y1, source_size)):
                source_row = pixels[sy]
                for sx in range(x0, min(x1, source_size)):
                    pr, pg, pb, pa = source_row[sx]
                    alpha = pa / 255.0
                    r += pr * alpha
                    g += pg * alpha
                    b += pb * alpha
                    a += pa
                    count += 1
            if count == 0:
                row_out.append((0, 0, 0, 0))
                continue
            alpha_avg = a / count / 255.0
            if alpha_avg <= 0.001:
                row_out.append((0, 0, 0, 0))
            else:
                row_out.append(
                    (
                        min(255, round(r / count / alpha_avg)),
                        min(255, round(g / count / alpha_avg)),
                        min(255, round(b / count / alpha_avg)),
                        min(255, round(a / count)),
                    )
                )
        out.append(row_out)
    return out


# --------------------------------------------------------------------- #
# PNG / ICO writing                                                     #
# --------------------------------------------------------------------- #

def write_png(path: str, pixels: list[list[tuple[int, int, int, int]]]) -> bytes:
    height = len(pixels)
    width = len(pixels[0]) if height else 0
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)
    return png


def bmp_entry(pixels: list[list[tuple[int, int, int, int]]]) -> bytes:
    """A classic 32-bit BGRA DIB, as used inside .ico files."""
    height = len(pixels)
    width = len(pixels[0])
    header = struct.pack(
        ">IiiHHIIiiII",
        40,          # biSize
        width,       # biWidth
        height * 2,  # biHeight (XOR image + AND mask)
        1,           # biPlanes
        32,          # biBitCount
        0,           # biCompression
        0,           # biSizeImage
        0,           # biXPelsPerMeter
        0,           # biYPelsPerMeter
        0,           # biClrUsed
        0,           # biClrImportant
    )
    xor = bytearray()
    for row in reversed(pixels):
        for r, g, b, a in row:
            xor += bytes((b, g, r, a))

    mask_stride = ((width + 31) // 32) * 4
    mask = bytearray()
    for row in reversed(pixels):
        line = bytearray(mask_stride)
        for x, (_r, _g, _b, a) in enumerate(row):
            if a == 0:
                line[x // 8] |= 0x80 >> (x % 8)
        mask += line

    return bytes(header) + bytes(xor) + bytes(mask)


def write_ico(path: str, layers: list[tuple[int, bytes, bool]]) -> None:
    """layers: (size, data, is_png) — sorted ascending by size."""
    count = len(layers)
    directory = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries = b""
    payload = b""
    for size, data, is_png in layers:
        dimension = 0 if size >= 256 else size
        entries += struct.pack(
            "<BBBBHHII",
            dimension,
            dimension,
            0,
            0,
            1,
            32,
            len(data),
            offset,
        )
        offset += len(data)
        payload += data
        _ = is_png
    with open(path, "wb") as handle:
        handle.write(directory + entries + payload)


# --------------------------------------------------------------------- #

def main() -> int:
    source = os.path.abspath(SOURCE)
    if not os.path.exists(source):
        print(f"source icon not found: {source}", file=sys.stderr)
        return 1

    width, height, pixels = read_png(source)
    if width != height:
        print("expected a square icon", file=sys.stderr)
        return 1

    os.makedirs(TARGET, exist_ok=True)
    sizes: dict[int, list[list[tuple[int, int, int, int]]]] = {
        size: resize(pixels, width, size) for size in (16, 32, 48, 64, 128, 256)
    }

    write_png(os.path.join(TARGET, "32x32.png"), sizes[32])
    write_png(os.path.join(TARGET, "128x128.png"), sizes[128])
    write_png(os.path.join(TARGET, "128x128@2x.png"), sizes[256])
    write_png(os.path.join(TARGET, "icon.png"), sizes[256])

    layers: list[tuple[int, bytes, bool]] = [
        (16, bmp_entry(sizes[16]), False),
        (32, bmp_entry(sizes[32]), False),
        (48, bmp_entry(sizes[48]), False),
        (64, bmp_entry(sizes[64]), False),
        (128, bmp_entry(sizes[128]), False),
    ]
    # 256px is stored as PNG (the convention modern .ico files use).
    layers.append((256, open(os.path.join(TARGET, "icon.png"), "rb").read(), True))
    write_ico(os.path.join(TARGET, "icon.ico"), layers)

    for name in sorted(os.listdir(TARGET)):
        path = os.path.join(TARGET, name)
        print(f"{name}: {os.path.getsize(path)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
