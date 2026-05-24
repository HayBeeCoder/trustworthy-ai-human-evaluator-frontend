from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

RAW_BASE = "https://raw.githubusercontent.com/HayBeeCoder/4k-dollarstreet/refs/heads/main"
RESULTS_DIR = "result-3196-noncorrect"
NONCORRECT_FILES = [
    "clip_vitb32_predictions_non_correct.csv",
    "gemini_predictions_non_correct.csv",
    "qwen_vl_predictions_non_correct.csv",
]


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


def resolve_image_filename(image_id: str, filename_map: dict[str, str]) -> str | None:
    exact = filename_map.get(image_id)
    if exact:
        return exact

    prefix_matches = [filename for key, filename in filename_map.items() if key.startswith(f"{image_id}_")]
    if prefix_matches:
        return sorted(prefix_matches)[0]

    return None


def build_task_id(source_file: str, row_number: int) -> str:
    return f"{source_file}#{row_number:05d}"


def normalize_float(value: str | None) -> float | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def manifest_entry(
    *,
    source_file: str,
    row_number: int,
    row: dict[str, str],
    image_url: str,
    image_filename: str,
) -> dict[str, Any]:
    task_id = build_task_id(source_file, row_number)
    return {
        "task_id": task_id,
        "source_entry_id": task_id,
        "source_file": source_file,
        "source_row_number": row_number,
        "image_id": row.get("image_id", ""),
        "image_filename": image_filename,
        "image_url": image_url,
        "model": row.get("model", ""),
        "region": row.get("region", ""),
        "income_quintile": row.get("income_quintile", ""),
        "ground_truth": row.get("ground_truth", ""),
        "predicted": row.get("predicted", ""),
        "error_type": row.get("error_type", ""),
        "sem_similarity": normalize_float(row.get("sem_similarity")),
        "ctx_similarity": normalize_float(row.get("ctx_similarity")),
        "confidence": normalize_float(row.get("confidence")),
        "raw_response": row.get("raw_response", ""),
        "trace": {
            "source_file": source_file,
            "source_row_number": row_number,
            "source_entry_id": task_id,
            "row": row,
        },
    }


def main() -> None:
    frontend_root = Path(__file__).resolve().parents[1]
    repo_root = frontend_root.parent
    images_root = repo_root / "4k-dollarstreet"
    results_root = repo_root / RESULTS_DIR

    if not images_root.exists():
        raise SystemExit(f"Missing image folder: {images_root}")
    if not results_root.exists():
        raise SystemExit(f"Missing results folder: {results_root}")

    filename_map = extract_filenames_with_extensions(images_root)
    if not filename_map:
        raise SystemExit("No images found in 4k-dollarstreet folder")

    items: list[dict[str, Any]] = []
    manifest_entries: list[dict[str, Any]] = []

    for source_file in NONCORRECT_FILES:
        rows = load_rows(results_root / source_file)
        for index, row in enumerate(rows, start=1):
            image_id = row.get("image_id", "")
            filename = resolve_image_filename(image_id, filename_map)
            if not filename:
                raise SystemExit(f"Missing filename for image_id={image_id} in {source_file} row {index}")

            image_url = f"{RAW_BASE}/{filename}"
            entry = manifest_entry(
                source_file=source_file,
                row_number=index,
                row=row,
                image_url=image_url,
                image_filename=filename,
            )
            manifest_entries.append(entry)
            items.append(entry)

    data_dir = frontend_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    manifest_dir = repo_root / "xplanations" / "manifests"
    manifest_dir.mkdir(parents=True, exist_ok=True)

    (data_dir / "image_filename_map.json").write_text(
        json.dumps(filename_map, separators=(",", ":")), encoding="utf-8"
    )
    (data_dir / "items.json").write_text(
        json.dumps(items, separators=(",", ":")), encoding="utf-8"
    )

    runtime = {
        "targetSampleSize": len(items),
        "sampledTaskIds": [item["task_id"] for item in items],
        "roundStatus": "running",
        "responses": [],
        "skipped": [],
    }
    (data_dir / "runtime.json").write_text(
        json.dumps(runtime, separators=(",", ":")), encoding="utf-8"
    )

    manifest = {
        "source_dir": RESULTS_DIR,
        "source_files": NONCORRECT_FILES,
        "total_entries": len(manifest_entries),
        "entries": manifest_entries,
    }
    (manifest_dir / "noncorrect_catalog_manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":")), encoding="utf-8"
    )

    print(f"extracted_filenames={len(filename_map)}")
    print(f"items_written={len(items)}")
    print(f"initial_sample_size={len(runtime['sampledTaskIds'])}")


if __name__ == "__main__":
    main()
