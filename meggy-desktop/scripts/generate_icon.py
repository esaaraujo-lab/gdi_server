#!/usr/bin/env python3
"""
v1.0.0 — Generates a 512x512 PNG icon for the Meggy desktop app.

Creates a gradient background (deep purple → magenta → pink) with a white
"M" letter in the center, matching the Meggy brand identity.

The generated icon.png is used by `tauri icon` to produce all required
sizes (32x32, 128x128, 128x128@2x, icon.ico, icon.icns).
"""

from PIL import Image, ImageDraw, ImageFont
import os

def generate_icon(output_path):
    size = 512
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Diagonal gradient: deep purple (#1A0A2E) → magenta (#7B1FA2) → pink (#FF8B9F)
    for y in range(size):
        progress = y / size
        if progress < 0.5:
            # First half: purple → magenta
            t = progress * 2
            r = int(26 + (123 - 26) * t)
            g = int(10 + (31 - 10) * t)
            b = int(46 + (162 - 46) * t)
        else:
            # Second half: magenta → pink
            t = (progress - 0.5) * 2
            r = int(123 + (255 - 123) * t)
            g = int(31 + (139 - 31) * t)
            b = int(162 + (159 - 162) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Draw a soft white circle in the center (poodle silhouette abstraction)
    center = size // 2
    radius = size // 3
    for r_offset in range(radius, 0, -1):
        alpha = int(40 * (1 - r_offset / radius))
        draw.ellipse(
            [center - r_offset, center - r_offset, center + r_offset, center + r_offset],
            fill=(255, 255, 255, alpha)
        )

    # Draw "M" letter — try system fonts, fall back to default
    font = None
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
        "/System/Library/Fonts/Helvetica.ttc",                    # macOS
        "C:\\Windows\\Fonts\\arialbd.ttf",                        # Windows
    ]
    for fp in font_paths:
        try:
            font = ImageFont.truetype(fp, 260)
            break
        except (OSError, IOError):
            continue
    if font is None:
        font = ImageFont.load_default()

    # Draw "M" centered
    text = "M"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2 - bbox[0]
    y = (size - text_h) // 2 - bbox[1]
    
    # Shadow
    draw.text((x + 3, y + 3), text, fill=(0, 0, 0, 80), font=font)
    # Main letter
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

    # Save
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, 'PNG')
    print(f"✓ Icon generated: {output_path} ({size}x{size})")

if __name__ == '__main__':
    generate_icon('src-tauri/icons/icon.png')
