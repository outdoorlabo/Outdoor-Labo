#!/usr/bin/env python3
"""Delete tag definition files that no post uses.

A tag definition (content/tag/<slug>/_index.md) with zero posts using it
only clutters the Decap tag picker. This script recomputes usage from the
current posts at run time (never a stale list), prints what it will delete,
and removes those files. Run by .github/workflows/cleanup-tags.yml; the
workflow commits the result. Safe to re-run: once clean, it deletes nothing.

Guard: refuses to run if the computed delete count looks wrong (<10 or
>400), which would indicate a parsing problem rather than real unused tags.
"""
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS = os.path.join(ROOT, "content", "posts")
TAGDIR = os.path.join(ROOT, "content", "tag")

INLINE_RE = re.compile(r"^tag:\s*\[(.*)\]\s*$", re.M)
BLOCK_RE = re.compile(r"^tag:\s*\n((?:\s*-\s*.+\n)+)", re.M)
TOKEN_RE = re.compile(r'"([^"]*)"|\'([^\']*)\'|([^,\s]+)')


def post_tags(path):
    text = open(path, encoding="utf-8").read()
    if not text.startswith("---"):
        return []
    end = text.find("\n---", 3)
    fm = text[:end] if end > 0 else ""
    m = INLINE_RE.search(fm)
    if m:
        return [next(g for g in t.groups() if g is not None)
                for t in TOKEN_RE.finditer(m.group(1))]
    m = BLOCK_RE.search(fm)
    if m:
        return [ln.strip().lstrip("-").strip().strip("\"'")
                for ln in m.group(1).splitlines() if ln.strip()]
    return []


def main():
    usage = Counter()
    for name in sorted(os.listdir(POSTS)):
        if name.endswith(".md"):
            for tag in set(post_tags(os.path.join(POSTS, name))):
                usage[tag] += 1
    defs = [d for d in sorted(os.listdir(TAGDIR))
            if os.path.isfile(os.path.join(TAGDIR, d, "_index.md"))]
    unused = [d for d in defs if usage[d] == 0]
    print(f"posts scanned, defs: {len(defs)}, used: {len([d for d in defs if usage[d] > 0])}, unused: {len(unused)}")
    if not (10 <= len(unused) <= 400):
        print(f"ABORT: unused count {len(unused)} is outside the expected range; refusing to delete.")
        return 1
    for slug in unused:
        target = os.path.join(TAGDIR, slug, "_index.md")
        os.remove(target)
        try:
            os.rmdir(os.path.dirname(target))
        except OSError:
            pass
        print(f"deleted: content/tag/{slug}/_index.md")
    print(f"done: {len(unused)} definition(s) deleted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
