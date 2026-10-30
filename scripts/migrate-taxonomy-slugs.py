#!/usr/bin/env python3
"""Add explicit Hugo taxonomy slugs without changing existing taxonomy URLs."""
from pathlib import Path
import re
import sys

ROOTS = (Path("content/category"), Path("content/tag"))
changed = 0
checked = 0

for root in ROOTS:
    if not root.is_dir():
        raise SystemExit(f"Missing taxonomy directory: {root}")
    for index_file in sorted(root.glob("*/_index.md")):
        checked += 1
        slug = index_file.parent.name
        text = index_file.read_text(encoding="utf-8")
        if not text.startswith("---\n"):
            raise SystemExit(f"Unexpected front matter format: {index_file}")
        end = text.find("\n---", 4)
        if end < 0:
            raise SystemExit(f"Unclosed YAML front matter: {index_file}")
        front = text[4:end]
        if re.search(r"(?m)^slug\s*:", front):
            existing = re.search(r'(?m)^slug\s*:\s*["\']?([^"\'\n]+)', front)
            if existing and existing.group(1).strip() != slug:
                raise SystemExit(f"Slug mismatch in {index_file}: {existing.group(1)} != {slug}")
            continue
        # Insert after the title line when possible; otherwise at the top of front matter.
        title_line = re.search(r"(?m)^title\s*:.*$", front)
        if title_line:
            pos = title_line.end()
            front = front[:pos] + f"\nslug: \"{slug}\"" + front[pos:]
        else:
            front = f"slug: \"{slug}\"\n" + front
        updated = "---\n" + front + text[end:]
        index_file.write_text(updated, encoding="utf-8")
        changed += 1

print(f"Checked {checked} taxonomy entries; updated {changed}.")
if checked == 0:
    raise SystemExit("No taxonomy entries found; refusing an empty migration.")
