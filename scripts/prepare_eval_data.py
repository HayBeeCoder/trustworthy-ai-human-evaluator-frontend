from __future__ import annotations

import csv
import json
import random
from pathlib import Path
RAW_BASE_MODEL = "https://raw.githubusercontent.com/Trustworthy-Explainable-AI/Geographic-Bias-in-Multimodal-AI/refs/heads/haybee/open-ended-tests/result-3196"
RAW_BASE = "https://raw.githubusercontent.com/HayBeeCoder/4k-dollarstreet/refs/heads/main"
MAX_ITEMS = 4000
MODELS = {
    "clip_vitb32": f"{RAW_BASE_MODEL}/clip_vitb32_predictions.csv",
    "gemini": f"{RAW_BASE_MODEL}/gemini_predictions.csv",
    "qwen_vl": f"{RAW_BASE_MODEL}/qwen_vl_predictions.csv",
}


def extract_filenames_with_extensions(images_root: Path) -> dict[str, str]:
    """Map image_id to exact filename (with extension) from the local 4k-dollarstreet folder."""
    mapping: dict[str, str] = {}
    for file_path in images_root.rglob("*"):
        if not file_path.is_file():
            continue
        image_id = file_path.stem
        # Keep first occurrence if duplicates exist.
        mapping.setdefault(image_id, file_path.name)
    return mapping


def load_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    frontend_root = Path(__file__).resolve().parents[1]
    repo_root = frontend_root.parent
    images_root = repo_root / "4k-dollarstreet"

    if not images_root.exists():
        raise SystemExit(f"Missing image folder: {images_root}")

    filename_map = extract_filenames_with_extensions(images_root)
    if not filename_map:
        raise SystemExit("No images found in 4k-dollarstreet folder")

    items: list[dict[str, str]] = []
    task_id = 1

    for model_name, relative_csv in MODELS.items():
        rows = load_rows(repo_root / relative_csv)
        for row in rows:
            image_id = row["image_id"]
            filename = filename_map.get(image_id)
            if not filename:
                continue

            items.append(
                {
                    "task_id": str(task_id),
                    "image_id": image_id,
                    "image_filename": filename,
                    "image_url": f"{RAW_BASE}/{filename}",
                    "model": model_name,
                    "region": row.get("region", ""),
                    "income_quintile": row.get("income_quintile", ""),
                    "predicted": row.get("predicted", ""),
                }
            )
            task_id += 1

    # Stable random order for evaluator fairness.
    random.Random(42).shuffle(items)

    data_dir = frontend_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    items = items[:MAX_ITEMS]

    (data_dir / "image_filename_map.json").write_text(
        json.dumps(filename_map, separators=(",", ":")), encoding="utf-8"
    )
    (data_dir / "items.json").write_text(
        json.dumps(items, separators=(",", ":")), encoding="utf-8"
    )

    runtime = {
        "targetSampleSize": 120,
        "sampledTaskIds": [item["task_id"] for item in items[:120]],
        "responses": [],
    }
    (data_dir / "runtime.json").write_text(
        json.dumps(runtime, separators=(",", ":")), encoding="utf-8"
    )

    print(f"extracted_filenames={len(filename_map)}")
    print(f"items_written={len(items)}")
    print(f"initial_sample_size={len(runtime['sampledTaskIds'])}")


if __name__ == "__main__":
    main()
