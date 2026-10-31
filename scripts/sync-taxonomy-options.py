#!/usr/bin/env python3
"""Generate flat Pages CMS reference entries while preserving taxonomy hierarchy.

The generated labels retain parent > child paths without changing Hugo term URLs.
"""
from pathlib import Path
import yaml

SOURCES = {
    Path("content/category"): Path("data/pages-cms/category-options"),
    Path("content/tag"): Path("data/pages-cms/tag-options"),
}

def read_front_matter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"Missing YAML front matter: {path}")
    end = text.find("\n---", 4)
    if end < 0:
        raise ValueError(f"Unclosed YAML front matter: {path}")
    data = yaml.safe_load(text[4:end]) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping front matter: {path}")
    return data

def load_terms(source: Path) -> dict:
    terms = {}
    for index_file in sorted(source.rglob("_index.md")):
        slug = str(index_file.parent.relative_to(source)).replace("\\", "/")
        # Hugo bundle path is authoritative; keep legacy flat slugs intact.
        if "/" in slug:
            raise ValueError(
                f"Nested taxonomy storage would change Hugo term URLs: {index_file}. "
                "Use the parent field instead of moving taxonomy bundles."
            )
        metadata = read_front_matter(index_file)
        stored_slug = str(metadata.get("slug", "")).strip()
        title = metadata.get("title")
        if stored_slug != slug:
            raise ValueError(f"Slug mismatch in {index_file}: {stored_slug!r} != {slug!r}")
        if not isinstance(title, str) or not title.strip():
            raise ValueError(f"Missing title in {index_file}")
        parent = str(metadata.get("parent", "") or "").strip()
        terms[slug] = {"title": title.strip(), "slug": slug, "parent": parent}
    for slug, term in terms.items():
        if term["parent"] and term["parent"] not in terms:
            raise ValueError(f"Unknown parent {term['parent']!r} for category {slug!r}")
        seen = {slug}
        current = term["parent"]
        while current:
            if current in seen:
                raise ValueError(f"Category parent cycle detected at {current!r}")
            seen.add(current)
            current = terms[current]["parent"]
    def hierarchy(slug):
        chain, current = [], slug
        while current:
            chain.append(terms[current]["title"])
            current = terms[current]["parent"]
        return " › ".join(reversed(chain))
    for slug, term in terms.items():
        term["hierarchy"] = hierarchy(slug)
    return terms

def main() -> None:
    total = 0
    for source, target in SOURCES.items():
        if not source.is_dir():
            raise SystemExit(f"Missing taxonomy directory: {source}")
        terms = load_terms(source)
        target.mkdir(parents=True, exist_ok=True)
        expected = set()
        for slug, term in terms.items():
            output = target / f"{slug}.yml"
            expected.add(output.name)
            payload = term if source.name == "category" else {
                "title": term["title"], "slug": slug
            }
            output.write_text(
                yaml.safe_dump(payload, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
            )
            total += 1
        for stale in target.glob("*.yml"):
            if stale.name not in expected:
                stale.unlink()
    print(f"Synced {total} taxonomy terms; category parent relationships retained.")

if __name__ == "__main__":
    main()
