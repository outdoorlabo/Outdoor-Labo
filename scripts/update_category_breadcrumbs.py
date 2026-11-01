#!/usr/bin/env python3
"""カテゴリーの階層パス（breadcrumb）を自動生成する。

content/category/<slug>/_index.md の front matter には title と parent
（親カテゴリーの slug）だけがある。Decap の一覧や選択 UI では親が slug の
まま表示されて分かりにくいため、タイトルをたどった階層パス
（例: 山行・エリア別 > 海外 > アメリカ）を breadcrumb キーとして書き込む。

- 依存ライブラリなし（front matter は単純な key: "value" 形式前提）
- 冪等：全て最新なら何も書き換えない
- 親が見つからない・循環している場合はそこで辿るのを止める
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CAT_DIR = os.path.join(ROOT, "content", "category")
KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$')


def unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == '"' and v[-1] == '"':
        out = ""
        i = 1
        while i < len(v) - 1:
            if v[i] == "\\" and i + 1 < len(v) - 1:
                out += v[i + 1]
                i += 2
            else:
                out += v[i]
                i += 1
        return out
    return v


def quote(v):
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'


def parse_frontmatter(text):
    """(entries, body) を返す。entries は (key, raw_value) の順序付きリスト。"""
    if not text.startswith("---"):
        return None, text
    end = text.find("\n---", 3)
    if end == -1:
        return None, text
    fm_text = text[3:end]
    body = text[end + 4:]
    if body.startswith("\n"):
        body = body[1:]
    entries = []
    for line in fm_text.split("\n"):
        line = line.rstrip("\n")
        if not line.strip():
            continue
        m = KEY_RE.match(line)
        if m:
            entries.append([m.group(1), m.group(2)])
    return entries, body


def get(entries, key):
    for k, v in entries:
        if k == key:
            return unquote(v)
    return None


def set_value(entries, key, value):
    for e in entries:
        if e[0] == key:
            e[1] = quote(value)
            return
    # parent の後、なければ title の後、それもなければ末尾に挿入
    idx = None
    for i, e in enumerate(entries):
        if e[0] == "parent":
            idx = i + 1
    if idx is None:
        for i, e in enumerate(entries):
            if e[0] == "title":
                idx = i + 1
    if idx is None:
        idx = len(entries)
    entries.insert(idx, [key, quote(value)])


def main():
    cats = {}
    files = {}
    for slug in sorted(os.listdir(CAT_DIR)):
        path = os.path.join(CAT_DIR, slug, "_index.md")
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as f:
            text = f.read()
        entries, body = parse_frontmatter(text)
        if entries is None:
            print(f"skip (no front matter): {path}")
            continue
        title = get(entries, "title")
        if title is None:
            print(f"skip (no title): {path}")
            continue
        cats[slug] = {"title": title, "parent": get(entries, "parent")}
        files[slug] = (path, entries, body)

    def breadcrumb(slug):
        chain = []
        seen = set()
        cur = slug
        while cur and cur in cats and cur not in seen:
            seen.add(cur)
            chain.append(cats[cur]["title"])
            cur = cats[cur]["parent"]
        chain.reverse()
        return " > ".join(chain)

    changed = 0
    for slug, (path, entries, body) in files.items():
        bc = breadcrumb(slug)
        if get(entries, "breadcrumb") == bc:
            continue
        set_value(entries, "breadcrumb", bc)
        fm = "\n".join(f"{k}: {v}" for k, v in entries)
        new_text = f"---\n{fm}\n---\n" + ("\n" + body if body else "\n")
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_text)
        changed += 1
        print(f"updated: {slug} -> {bc}")
    print(f"done: {changed} file(s) changed, {len(files)} categories total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
