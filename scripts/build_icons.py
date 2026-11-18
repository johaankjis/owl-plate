"""Rasterize the existing geometric owl mark deterministically for PWA installation."""

from pathlib import Path

from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parents[1] / "apps/web/public"


def build_icons() -> None:
    """Preserve the SVG's colors and geometry without external graphics dependencies."""
    scale = 8
    image = Image.new("RGB", (128 * scale, 128 * scale), "#121214")
    draw = ImageDraw.Draw(image)

    def circle(x: int, y: int, radius: int, fill: str) -> None:
        draw.ellipse(
            (
                (x - radius) * scale,
                (y - radius) * scale,
                (x + radius) * scale,
                (y + radius) * scale,
            ),
            fill=fill,
        )

    circle(64, 64, 49, "#FDBB30")
    circle(64, 64, 43, "#1E1F24")
    for x in (48, 80):
        circle(x, 56, 10, "#FDBB30")
        circle(x, 56, 4, "#121214")
    draw.polygon(
        [(64 * scale, 64 * scale), (56 * scale, 78 * scale), (72 * scale, 78 * scale)],
        fill="#FDBB30",
    )
    curve = []
    for step in range(101):
        t = step / 100
        x = (1 - t) ** 3 * 40 + 3 * (1 - t) ** 2 * t * 52 + 3 * (1 - t) * t**2 * 76 + t**3 * 88
        y = (1 - t) ** 3 * 88 + 3 * (1 - t) ** 2 * t * 96 + 3 * (1 - t) * t**2 * 96 + t**3 * 88
        curve.append((x * scale, y * scale))
    draw.line(curve, fill="#FDBB30", width=5 * scale, joint="curve")
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        image.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / name)


if __name__ == "__main__":
    build_icons()
