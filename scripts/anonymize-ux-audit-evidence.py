"""Redact local paths and identifiers from committed UX-audit evidence.

The audit screenshots use synthetic records.  This deterministic pass removes the
remaining machine-specific path text before evidence is shared outside the local
workspace, while keeping the screenshots' layout and dimensions unchanged.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs" / "ux-audit" / "2026-09-01"

# Coordinates are intentionally limited to the path rows identified by the audit
# DOM snapshots.  They are kept in image coordinates so the result is repeatable.
PATH_MASKS: dict[str, tuple[tuple[int, int, int, int], ...]] = {
    "audit-en-matter-initial.png": ((282, 699, 1004, 727),),
    "audit-en-delete-confirmations.png": ((282, 464, 411, 490),),
    "audit-en-document-narrow-metrics.png": ((252, 350, 678, 378),),
}


def redact_image(path: Path) -> None:
    with Image.open(path) as source:
        image = source.convert("RGB")
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default()
        for left, top, right, bottom in PATH_MASKS[path.name]:
            sample = image.getpixel((left, bottom - 1))
            draw.rectangle((left, top, right, bottom), fill=sample)
            draw.text((left + 4, top + 5), "[local path redacted]", fill=(111, 106, 96), font=font)
        image.save(path, format="PNG", optimize=True)


def redact_observations(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    for observation in data.get("observations", []):
        screenshot = observation.get("screenshot")
        if isinstance(screenshot, str):
            observation["screenshot"] = f"docs/ux-audit/2026-09-01/{Path(screenshot).name}"
        url = observation.get("url")
        if isinstance(url, str):
            observation["url"] = re.sub(
                r"file:///C:/~/Development/MatterDock/out/renderer/index\.html",
                "file:///redacted/renderer/index.html",
                url,
            )
        if isinstance(observation.get("body"), str):
            observation["body"] = re.sub(
                r"C:\\workspace\\temp\\[^\\]+\\documents\\<redacted-id>",
                "[local path redacted]",
                observation["body"],
            )
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    for filename in PATH_MASKS:
        redact_image(EVIDENCE / filename)
    redact_observations(EVIDENCE / "full-audit-observations.json")


if __name__ == "__main__":
    main()
