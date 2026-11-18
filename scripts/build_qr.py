"""Generate separate demo and survey QR codes only from an explicit HTTPS origin."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

import qrcode
from PIL import Image, ImageDraw, ImageFont


def build(origin: str, output: Path, local_review: bool = False) -> None:
    """Make the target and unpublished local-review state visible beside each scannable code."""
    parsed = urlsplit(origin)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in {"", "/"}:
        raise ValueError("Use a complete HTTPS origin without a path")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Do not put credentials, queries or fragments in a QR origin")
    if (
        parsed.hostname in {"localhost", "127.0.0.1"} or parsed.hostname.endswith(".invalid")
    ) and not local_review:
        raise ValueError("Local/unassigned origins cannot be labeled public demo QR codes")
    output.mkdir(parents=True, exist_ok=True)
    targets = {"demo": origin.rstrip("/") + "/", "survey": origin.rstrip("/") + "/survey"}
    for label, url in targets.items():
        code = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4
        )
        code.add_data(url)
        code.make(fit=True)
        bitmap = code.make_image(fill_color="black", back_color="white").convert("RGB")
        canvas = Image.new("RGB", (max(720, bitmap.width + 40), bitmap.height + 155), "white")
        canvas.paste(bitmap, ((canvas.width - bitmap.width) // 2, 45))
        draw = ImageDraw.Draw(canvas)
        font = ImageFont.load_default(size=20)
        state = "LOCAL REVIEW ONLY — NOT FOR PHONE SHARING" if local_review else "OWL PLATE"
        draw.text((20, 12), state, fill="black", font=font)
        draw.text((20, bitmap.height + 60), f"{label.upper()}: {url}", fill="black", font=font)
        if local_review:
            draw.text(
                (20, bitmap.height + 100),
                "Public HTTPS URL pending deployment approval",
                fill="black",
                font=font,
            )
        canvas.save(output / f"{label}.png")
    (output / "links.json").write_text(
        json.dumps(
            {
                "state": "local_review_only" if local_review else "assigned_origin",
                "targets": targets,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--local-review", action="store_true")
    args = parser.parse_args()
    build(args.origin, args.output, args.local_review)
