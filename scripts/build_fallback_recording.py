"""Assemble real browser capture scenes with permanent, honest evidence labels."""

import argparse
import json
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def build(capture: Path, ffmpeg: Path, font: Path, output: Path) -> None:
    """Keep simulation labels inside the video rather than depending on player captions."""
    timing = json.loads((capture / "timing.json").read_text())
    if timing["status"] != "PASS" or not timing["natural_expiry"]:
        raise ValueError("A passing natural-expiry capture is required")
    output.parent.mkdir(parents=True, exist_ok=True)
    parts = capture / "parts"
    parts.mkdir(exist_ok=True)
    label = ImageFont.truetype(str(font), 25)
    heading = ImageFont.truetype(str(font), 33)
    caption_font = ImageFont.truetype(str(font), 26)
    segments = []
    scenes = timing["scenes"]
    for index, scene in enumerate(scenes):
        end = (
            scenes[index + 1]["seconds"] if index + 1 < len(scenes) else timing["duration_seconds"]
        )
        video = timing["videos"][scene["actor"]]
        start = max(0, scene["seconds"] - video["origin_seconds"])
        duration = end - scene["seconds"]
        overlay = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        draw.rectangle((0, 0, 1920, 97), fill="#10261e")
        draw.rectangle((0, 982, 1920, 1080), fill="#10261e")
        draw.text(
            (38, 10),
            "OWL PLATE | FIXTURE VISION | SIMULATED NOTIFICATIONS | SYNTHETIC STUDENTS",
            font=label,
            fill="#f4c74d",
        )
        draw.text((38, 48), scene["title"], font=heading, fill="white")
        for line_index, line in enumerate(textwrap.wrap(scene["caption"], width=125)):
            draw.text((38, 995 + 32 * line_index), line, font=caption_font, fill="white")
        overlay_path = parts / f"overlay-{index:02}.png"
        overlay.save(overlay_path)
        segment = parts / f"scene-{index:02}.mp4"
        subprocess.run(
            [
                str(ffmpeg),
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                str(start),
                "-t",
                str(duration),
                "-i",
                video["path"],
                "-loop",
                "1",
                "-i",
                str(overlay_path),
                "-filter_complex",
                "[0:v]scale=1920:884:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:98:color=0x132D25[base];[base][1:v]overlay=0:0:shortest=1",
                "-t",
                str(duration),
                "-an",
                "-r",
                "25",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "22",
                "-pix_fmt",
                "yuv420p",
                str(segment),
            ],
            check=True,
        )
        segments.append(segment)
    concat = parts / "concat.txt"
    concat.write_text("".join(f"file '{path.resolve()}'\n" for path in segments))
    subprocess.run(
        [
            str(ffmpeg),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(output),
        ],
        check=True,
    )
    subprocess.run(
        [str(ffmpeg), "-hide_banner", "-loglevel", "error", "-i", str(output), "-f", "null", "-"],
        check=True,
    )
    print(
        f"Built and decoded {output}; silent captioned browser recording; physical receipts pending."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("capture", type=Path)
    parser.add_argument("--ffmpeg", type=Path, required=True)
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("submission/Owl_Plate_Fallback.mp4"))
    args = parser.parse_args()
    build(args.capture, args.ffmpeg, args.font, args.output)
