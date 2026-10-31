#!/usr/bin/env python3
"""Validate Decap CMS taxonomy parent references without changing Hugo bundle paths."""
from pathlib import Path
import re
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
CATEGORY_DIR = ROOT / "content" / "category"
CONFIG = ROOT / "static" / "admin" / "config.yml"


def frontmatter(path):
    text = path.read_text(encoding="utf-8")
    match = re.match(r"^---\\s*\\n(.*?)\\n---(?:\\n|$)", text, re.S)
    if not match:
        raise ValueError(f"{path.relative_to(ROOT)}: missing YAML front matter")
    data = yaml.safe_load(match.group(1)) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path.relative_to(ROOT)}: front matter must be a mapping")
    return data


def main():
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    collections = config.get("collections", [])
    names = [item.get("name") for item in collections]
    if names[:3] != ["posts", "categories", "tags"]:
        raise ValueError("Decap sidebar order must begin with posts, categories, tags")

    terms = {}
    for file in CATEGORY_DIR.glob("*/_index.md"):
        slug = file.parent.name
        data = frontmatter(file)
        parent = data.get("parent") or ""
        terms[slug] = str(parent).strip() if parent else ""

    for slug, parent in terms.items():
        if parent and parent not in terms:
            raise ValueError(f"Category '{slug}' refers to missing parent '{parent}'")
        if parent == slug:
            raise ValueError(f"Category '{slug}' cannot be its own parent")

    for slug in terms:
        seen = set()
        current = slug
        while current and terms.get(current):
            if current in seen:
                chain = " -> ".join([*seen, current])
                raise ValueError(f"Category parent cycle detected: {chain}")
            seen.add(current)
            current = terms[current]

    print(f"Validated Decap config and {len(terms)} category bundles; parent links are valid.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
