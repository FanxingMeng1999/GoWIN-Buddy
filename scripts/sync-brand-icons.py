#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import Iterable

from PIL import Image


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def center_square(image: Image.Image, size: int, pad_ratio: float = 0.08) -> Image.Image:
    src = image.convert("RGBA")
    bbox = src.getbbox()
    if bbox:
        src = src.crop(bbox)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = max(1, int(round(size * (1.0 - (pad_ratio * 2.0)))))
    fitted = src.resize((inner, inner), Image.Resampling.LANCZOS)
    offset = ((size - inner) // 2, (size - inner) // 2)
    canvas.alpha_composite(fitted, dest=offset)
    return canvas


def write_icon_set(icon_base: Image.Image, symbol_base: Image.Image, assets_dir: Path) -> None:
    icons_dir = assets_dir / "icons"
    ensure_dir(icons_dir)

    icon_png = center_square(icon_base, 1024, pad_ratio=0.06)
    icon_png.save(assets_dir / "icon.png")

    tray_png = center_square(icon_base, 512, pad_ratio=0.06)
    tray_png.save(assets_dir / "tray-icon.png")

    # mac template icon should be monochrome. We use symbol alpha mask only.
    symbol = center_square(symbol_base, 256, pad_ratio=0.08)
    alpha = symbol.split()[-1]
    template = Image.new("RGBA", (256, 256), (255, 255, 255, 0))
    template.putalpha(alpha)
    template.resize((22, 22), Image.Resampling.LANCZOS).save(assets_dir / "tray-iconTemplate.png")
    template.resize((44, 44), Image.Resampling.LANCZOS).save(assets_dir / "tray-iconTemplate@2x.png")

    for size in (16, 32, 48, 64, 128, 256, 512):
        center_square(icon_base, size, pad_ratio=0.06).save(icons_dir / f"{size}x{size}.png")

    ico_sizes: Iterable[tuple[int, int]] = ((16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256))
    center_square(icon_base, 512, pad_ratio=0.06).save(
        assets_dir / "icon.ico",
        format="ICO",
        sizes=list(ico_sizes),
    )


def write_runtime_brand_assets(icon_base: Image.Image, root: Path) -> None:
    out_dir = root / "assets" / "brand" / "runtime"
    ensure_dir(out_dir)
    center_square(icon_base, 1024, pad_ratio=0.06).save(out_dir / "gowin-app-icon.png")
    center_square(icon_base, 512, pad_ratio=0.06).save(
        out_dir / "gowin-app-icon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    # For dashboard/web surfaces.
    candidates = [
      ("assets/brand/extracted/png/wordmark_color.png", "gowin-dashboard-wordmark.png"),
      ("assets/brand/extracted/png/wordmark_dark.png", "gowin-dashboard-wordmark-dark.png"),
      ("assets/brand/extracted/png/symbol_primary.png", "gowin-dashboard-symbol.png"),
      ("assets/brand/extracted/svg/wordmark_color.svg", "gowin-dashboard-wordmark.svg"),
      ("assets/brand/extracted/svg/symbol_primary.svg", "gowin-dashboard-symbol.svg"),
    ]
    for rel_src, name in candidates:
        src = (root / rel_src).resolve()
        if src.exists():
            shutil.copyfile(src, out_dir / name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync GoWIN brand icon assets to runtime app icon slots.")
    parser.add_argument("--root", required=True, help="Workspace root")
    parser.add_argument(
        "--icon-source",
        default="assets/brand/extracted/png/app_tile_green.png",
        help="Primary icon source png path (relative to root)",
    )
    parser.add_argument(
        "--symbol-source",
        default="assets/brand/extracted/png/symbol_primary.png",
        help="Symbol source png path for monochrome template icon (relative to root)",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    icon_path = (root / args.icon_source).resolve()
    symbol_path = (root / args.symbol_source).resolve()
    assets_dir = (root / "apps" / "pet-desktop" / "assets").resolve()

    if not icon_path.exists():
        raise FileNotFoundError(f"icon source not found: {icon_path}")
    if not symbol_path.exists():
        raise FileNotFoundError(f"symbol source not found: {symbol_path}")
    if not assets_dir.exists():
        raise FileNotFoundError(f"pet assets directory not found: {assets_dir}")

    icon_base = Image.open(icon_path).convert("RGBA")
    symbol_base = Image.open(symbol_path).convert("RGBA")

    write_icon_set(icon_base, symbol_base, assets_dir)
    write_runtime_brand_assets(icon_base, root)
    print(f"synced brand icons -> {assets_dir}")


if __name__ == "__main__":
    main()
