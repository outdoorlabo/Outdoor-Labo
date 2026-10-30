#!/usr/bin/env python3
"""Mirror Hugo taxonomy branch bundles into flat Pages CMS reference collections."""
from pathlib import Path
import shutil
import yaml

SOURCES = {
    Path("content/category"): Path("data/pages-cms/category-options"),
    Path("content/tag"): Path("data/pages-cms/tag-options"),
}

def read_front_matter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\\n"):
        raise ValueError(f"Missing YAML front matter: {path}")
    end = text.find("\\n---", 4)
    if end < 0:
        raise ValueError(f"Unclosed YAML front matter: {path}")
    data = yaml.safe_load(text[4:end]) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping front matter: {path}")
    return data

def main() -> None:
    total = 0
    for source, target in SOURCES.items():
        if not source.is_dir():
            raise SystemExit(f"Missing taxonomy directory: {source}")
        target.mkdir(parents=True, exist_ok=True)
        expected = set()
        for index_file in sorted(source.glob("*/_index.md")):
            slug = index_file.parent.name
            metadata = read_front_matter(index_file)
            stored_slug = str(metadata.get("slug", "")).strip()
            title = metadata.get("title")
            if stored_slug != slug:
                raise SystemExit(f"Slug mismatch in {index_file}: {stored_slug!r} != {slug!r}")
            if not isinstance(title, str) or not title.strip():
                raise SystemExit(f"Missing title in {index_file}")
            output = target / f"{slug}.yml"
            expected.add(output.name)
            payload = {"title": title, "slug": slug}
            output.write_text(
                yaml.safe_dump(payload, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
            )
            total += 1
        for stale in target.glob("*.yml"):
            if stale.name not in expected:
                stale.unlink()
    print(f"Synced {total} taxonomy terms into flat Pages CMS reference collections.")

if __name__ == "__main__":
    main()
