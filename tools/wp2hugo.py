#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WordPress → Hugo 一括変換スクリプト (標準ライブラリのみ)

使い方(リポジトリ直下で実行):
  # 1) まず10件だけ試す
  python3 tools/wp2hugo.py --site https://outdoorlabo.a-ce.com --out . --limit 10
  # 2) 問題なければ全件
  python3 tools/wp2hugo.py --site https://outdoorlabo.a-ce.com --out .
  # REST API が使えない場合: 管理画面「ツール > エクスポート」で出した XML から
  python3 tools/wp2hugo.py --site https://outdoorlabo.a-ce.com --wxr export.xml --out .

出力:
  content/posts/<slug>.md          記事 (URL は /YYYY/MM/DD/slug/ になる)
  content/<slug>.md                固定ページ (url: /<slug>/)
  content/category/<slug>/_index.md, content/tag/<slug>/_index.md   表示名の定義
  static/wp-content/uploads/...    画像 (WordPress と同じパスで保存 → 画像URLが変わらない)
"""
import argparse, html, json, os, re, sys, time
import urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
BLOCK_COMMENT = re.compile(r'<!--\s*/?wp:.*?-->', re.S)
BLOCK_START = re.compile(
    r'^\s*<(?:/?(?:div|figure|table|ul|ol|li|h[1-6]|pre|blockquote|p|hr|iframe|script|style|'
    r'section|figcaption|details|form|center)\b|!--)', re.I)


def slug_of(s):
    return urllib.parse.unquote(s or "").strip().lower()


FALLBACK_DATE = datetime(2000, 1, 1, tzinfo=JST)


def parse_local(s):
    """'YYYY-MM-DDTHH:MM:SS' を JST の datetime に。未設定・壊れた日付(-0001-11-30 等)は None。"""
    try:
        s = str(s).replace("T", " ")[:19]
        if s.startswith(("-", "0000")):
            return None
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=JST)
    except (ValueError, TypeError):
        return None


def safe_name(s):
    """Windows のファイル名に使えない文字を置き換える。"""
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "-", s).strip(" .")
    return s or "post"


# ------------------------------------------------------------------ 取得 (REST API)
def http_get(url, retries=3):
    err = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 wp2hugo"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read(), r.headers
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                raise
            err = e
        except Exception as e:  # noqa
            err = e
        time.sleep(1.5 * (i + 1))
    raise err


def fetch_all(api, path, extra=""):
    items, page = [], 1
    while True:
        url = f"{api}/{path}?per_page=100&page={page}{extra}"
        try:
            body, headers = http_get(url)
        except urllib.error.HTTPError as e:
            if e.code == 400:  # 最終ページより先
                break
            raise
        items += json.loads(body)
        total = int(headers.get("X-WP-TotalPages", "1"))
        print(f"  {path}: {page}/{total}", file=sys.stderr)
        if page >= total:
            break
        page += 1
    return items


def parse_api_payload(cats_raw, tags_raw, posts_raw, pages_raw):
    idcat = {c["id"]: c for c in cats_raw}
    idtag = {t["id"]: t for t in tags_raw}
    cats = {}
    for c in cats_raw:
        parent = idcat.get(c.get("parent") or 0)
        cats[slug_of(c["slug"])] = {
            "name": html.unescape(c["name"]),
            "parent": slug_of(parent["slug"]) if parent else None,
        }
    tags = {slug_of(t["slug"]): html.unescape(t["name"]) for t in tags_raw}

    def conv(p):
        date = parse_local(p.get("date")) or parse_local(p.get("modified")) or FALLBACK_DATE
        media = None
        emb = (p.get("_embedded") or {}).get("wp:featuredmedia")
        if isinstance(emb, list) and emb and isinstance(emb[0], dict):
            media = emb[0].get("source_url")
        return {
            "id": p["id"],
            "slug": slug_of(p.get("slug")) or str(p["id"]),
            "title": html.unescape(re.sub(r"<[^>]+>", "", p["title"]["rendered"])),
            "date": date,
            "modified": parse_local(p.get("modified")) or date,
            "html": p["content"]["rendered"],
            "cats": [slug_of(idcat[i]["slug"]) for i in p.get("categories", []) if i in idcat],
            "tags": [slug_of(idtag[i]["slug"]) for i in p.get("tags", []) if i in idtag],
            "image": media,
        }

    return cats, tags, [conv(p) for p in posts_raw], [conv(p) for p in pages_raw]


def from_api(site):
    api = site.rstrip("/") + "/wp-json/wp/v2"
    print("カテゴリ・タグを取得中...", file=sys.stderr)
    cats = fetch_all(api, "categories")
    tags = fetch_all(api, "tags")
    print("記事を取得中...", file=sys.stderr)
    posts = fetch_all(api, "posts", "&_embed=wp:featuredmedia")
    print("固定ページを取得中...", file=sys.stderr)
    pages = fetch_all(api, "pages", "&_embed=wp:featuredmedia")
    return parse_api_payload(cats, tags, posts, pages)


# ------------------------------------------------------------------ 取得 (WXR)
def autop(t):
    out = []
    for p in re.split(r"\n\s*\n", t.strip()):
        p = p.strip()
        if not p:
            continue
        out.append(p if BLOCK_START.match(p) else "<p>" + p.replace("\n", "<br />\n") + "</p>")
    return "\n\n".join(out)


def parse_wxr(path):
    ns = {p: u for _, (p, u) in ET.iterparse(path, events=["start-ns"])}
    ch = ET.parse(path).getroot().find("channel")

    def t(el, tag):
        x = el.find(tag, ns)
        return (x.text or "") if x is not None else ""

    cats = {}
    for c in ch.findall("wp:category", ns):
        cats[slug_of(t(c, "wp:category_nicename"))] = {
            "name": t(c, "wp:cat_name"),
            "parent": slug_of(t(c, "wp:category_parent")) or None,
        }
    tags = {slug_of(t(x, "wp:tag_slug")): t(x, "wp:tag_name") for x in ch.findall("wp:tag", ns)}
    items = ch.findall("item")
    att = {t(i, "wp:post_id"): t(i, "wp:attachment_url") for i in items if t(i, "wp:post_type") == "attachment"}
    posts, pages = [], []
    for it in items:
        typ = t(it, "wp:post_type")
        if typ not in ("post", "page") or t(it, "wp:status") != "publish":
            continue
        thumb = None
        for m in it.findall("wp:postmeta", ns):
            if t(m, "wp:meta_key") == "_thumbnail_id":
                thumb = att.get(t(m, "wp:meta_value").strip())
        pc, pt = [], []
        for c in it.findall("category"):
            dom, s = c.get("domain"), slug_of(c.get("nicename"))
            if dom == "category":
                pc.append(s)
                cats.setdefault(s, {"name": c.text or s, "parent": None})
            elif dom == "post_tag":
                pt.append(s)
                tags.setdefault(s, c.text or s)
        pid = t(it, "wp:post_id")
        rec = {
            "id": pid,
            "slug": slug_of(t(it, "wp:post_name")) or pid,
            "title": (it.findtext("title") or "").strip(),
            "date": parse_local(t(it, "wp:post_date")) or parse_local(t(it, "wp:post_modified")) or FALLBACK_DATE,
            "modified": parse_local(t(it, "wp:post_modified")) or parse_local(t(it, "wp:post_date")) or FALLBACK_DATE,
            "html": autop(BLOCK_COMMENT.sub("", t(it, "content:encoded"))),
            "cats": pc, "tags": pt, "image": thumb,
        }
        (posts if typ == "post" else pages).append(rec)
    return cats, tags, posts, pages


# ------------------------------------------------------------------ 変換
def headings_to_md(h):
    """目次(TOC)を効かせるため h2〜h4 だけ Markdown の見出しに変換する。
    元の class は Hugo の見出し属性 {.クラス名} として残す(wp-block-heading は除く)。"""
    def rep(m):
        inner = html.unescape(re.sub(r"<[^>]+>", "", m.group(3))).strip().replace("\n", " ")
        for a, b in (("\\", "\\\\"), ("*", "\\*"), ("_", "\\_"), ("`", "\\`"), ("<", "&lt;")):
            inner = inner.replace(a, b)
        cm = re.search(r"""class=(["'])(.*?)\1""", m.group(2))
        classes = [c for c in (cm.group(2).split() if cm else [])
                   if c != "wp-block-heading" and re.fullmatch(r"[\w-]+", c)]
        attr = " {" + " ".join("." + c for c in classes) + "}" if classes else ""
        return f"\n\n{'#' * int(m.group(1))} {inner}{attr}\n\n"
    return re.sub(r"<h([2-4])\b([^>]*)>(.*?)</h\1>", rep, h, flags=re.S | re.I)


def process_html(h, host):
    h = BLOCK_COMMENT.sub("", h)
    h = headings_to_md(h)
    h = re.sub(rf"https?://(?:www\.)?{re.escape(host)}/", "/", h)
    # 階層カテゴリURL /category/a/b/ → /category/b/
    h = re.sub(r'(["\'])/(category|tag)/(?:[^/"\']+/)*?([^/"\']+)/(["\'])', r"\1/\2/\3/\4", h)
    h = re.sub(r"\n{3,}", "\n\n", h)
    if not re.search(r"<pre|<code", h):
        h = re.sub(r"(?m)^[ \t]+", "", h)  # 行頭インデントがコードブロック扱いになるのを防ぐ
    return h.strip() + "\n"


def uploads_re(host):
    return re.compile(rf"https?://(?:www\.)?{re.escape(host)}/wp-content/uploads/[^\s\"')<>,]+")


def to_path(url):
    return urllib.parse.urlparse(url).path


CJK = "\u3000-\u9fff\uff00-\uffef"


def plain_description(h, n=110):
    s = BLOCK_COMMENT.sub("", h)
    s = re.sub(r"</?(?:strong|em|b|i|a|span|mark|u|small|sup|sub|code|font)\b[^>]*>", "", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"\[/?[a-z_0-9-]+[^\]]*\]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(rf"(?:(?<=[{CJK}])\s+|\s+(?=[{CJK}]))", "", s)  # 日本語の前後の余計な空白を詰める
    return s if len(s) <= n else s[:n].rstrip() + "…"


def fix_lazy_images(h):
    """lozad などの遅延読み込み(data-src)を通常の src に直す。"""
    def rep(m):
        tag = m.group(0)
        ds = re.search(r"\sdata-src=([\"'])(.*?)\1", tag)
        if not ds:
            return tag
        tag = re.sub(r"\ssrc=([\"']).*?\1", "", tag, count=1)
        tag = re.sub(r"\sdata-src=([\"']).*?\1", "", tag, count=1)
        tag = re.sub(r"\sdata-srcset=", " srcset=", tag)
        return tag.replace("<img", f'<img src="{ds.group(2)}"', 1)
    return re.sub(r"<img\b[^>]*>", rep, h, flags=re.I)


def with_ancestors(slugs, cats):
    out = list(dict.fromkeys(slugs))
    for s in list(out):
        cur, seen = (cats.get(s) or {}).get("parent"), set()
        while cur and cur not in seen:
            seen.add(cur)
            if cur not in out:
                out.append(cur)
            cur = (cats.get(cur) or {}).get("parent")
    return out


def front_matter(d):
    lines = ["---"]
    for k, v in d.items():
        if v in (None, "", []):
            continue
        if isinstance(v, datetime):
            lines.append(f"{k}: {v.isoformat()}")
        else:
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def download_all(urls, host, out_dir, workers=8):
    todo = []
    for u in sorted(urls):
        dest = os.path.join(out_dir, urllib.parse.unquote(to_path(u)).lstrip("/"))
        if not os.path.exists(dest):
            todo.append((u, dest))
    print(f"画像: {len(urls)}件中 {len(todo)}件をダウンロード", file=sys.stderr)
    failed = []

    def get(args):
        u, dest = args
        try:
            body, _ = http_get(u)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(body)
        except Exception as e:  # noqa
            failed.append(f"{u}\t{e}")

    with ThreadPoolExecutor(workers) as ex:
        for i, _ in enumerate(ex.map(get, todo), 1):
            if i % 50 == 0:
                print(f"  {i}/{len(todo)}", file=sys.stderr)
    return failed


def convert(cats, tags, posts, pages, host, out, skip_pages, download):
    ur = uploads_re(host)
    images, classes, shortcode_posts = set(), Counter(), []
    used_cats, used_tags = set(), set()
    names = set()

    def build(p, is_page):
        raw = fix_lazy_images(p["html"])
        images.update(ur.findall(raw))
        if p.get("image"):
            images.add(p["image"])
        img = p.get("image")
        if not img:
            m = re.search(r'<img[^>]+src=["\']([^"\']+)', raw)
            img = m.group(1) if m else None
        if img:
            img = ur.sub(lambda m: to_path(m.group(0)), img)
            img = re.sub(rf"^https?://(?:www\.)?{re.escape(host)}", "", img)
        for c in re.findall(r'class="([^"]+)"', raw):
            classes.update(c.split())
        if re.search(r"\[[a-z_][a-z_0-9-]*(?:\s[^\]]*)?\]", BLOCK_COMMENT.sub("", re.sub(r"<[^>]+>", "", raw))):
            shortcode_posts.append(p["slug"])
        body = process_html(ur.sub(lambda m: to_path(m.group(0)), raw), host)
        fm = {
            "title": p["title"],
            "date": p["date"],
            "lastmod": p["modified"],
            "slug": None if is_page else p["slug"],
            "url": f"/{p['slug']}/" if is_page else None,
            "category": [] if is_page else with_ancestors(p["cats"], cats),
            "tag": [] if is_page else p["tags"],
            "image": img,
            "description": plain_description(raw),
            "wpid": int(p["id"]) if str(p["id"]).isdigit() else None,
        }
        used_cats.update(fm["category"] or [])
        used_tags.update(fm["tag"] or [])
        return front_matter(fm) + body

    for p in posts:
        name = safe_name(p["slug"])
        if name in names:
            name = f"{name}-{p['id']}"
        names.add(name)
        write(os.path.join(out, "content", "posts", f"{name}.md"), build(p, False))
    for p in pages:
        if p["slug"] in skip_pages:
            continue
        write(os.path.join(out, "content", f"{safe_name(p['slug'])}.md"), build(p, True))

    for s, c in cats.items():
        write(os.path.join(out, "content", "category", s, "_index.md"), front_matter({"title": c["name"]}))
    for s, n in tags.items():
        write(os.path.join(out, "content", "tag", s, "_index.md"), front_matter({"title": n}))

    failed = []
    if download:
        failed = download_all({u for u in images if re.match(r"https?://", u) and host in u},
                              host, os.path.join(out, "static"))
        if failed:
            write(os.path.join(out, "wp2hugo-failed.txt"), "\n".join(failed) + "\n")

    print(f"\n完了: 記事 {len(posts)} / 固定ページ {len([p for p in pages if p['slug'] not in skip_pages])} "
          f"/ カテゴリ {len(cats)} / タグ {len(tags)} / 画像 {len(images)}", file=sys.stderr)
    if failed:
        print(f"画像のダウンロード失敗 {len(failed)}件 → wp2hugo-failed.txt", file=sys.stderr)
    top = [f"{c}({n})" for c, n in classes.most_common(25)]
    print("記事内で使われているCSSクラス(上位): " + ", ".join(top), file=sys.stderr)
    if shortcode_posts:
        print(f"ショートコード風の文字列が残っている記事: {len(shortcode_posts)}件 "
              f"(例: {', '.join(shortcode_posts[:5])})", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description="WordPress → Hugo 変換")
    ap.add_argument("--site", required=True, help="WordPress のURL 例: https://outdoorlabo.a-ce.com")
    ap.add_argument("--wxr", help="エクスポートXML(指定時は REST API を使わない)")
    ap.add_argument("--out", default=".", help="Hugo サイトのルート")
    ap.add_argument("--limit", type=int, help="試験用: 先頭N件だけ変換")
    ap.add_argument("--no-images", action="store_true", help="画像をダウンロードしない")
    ap.add_argument("--grep", help="調査用: WordPress の本文に指定の文字列が含まれる記事を探して表示(ファイルは作らない)")
    ap.add_argument("--skip-pages", default="site-map,contact", help="変換しない固定ページのスラッグ(カンマ区切り)")
    a = ap.parse_args()
    host = urllib.parse.urlparse(a.site).netloc
    cats, tags, posts, pages = parse_wxr(a.wxr) if a.wxr else from_api(a.site)
    if a.grep:
        hits = [p for p in posts + pages if a.grep in p["html"]]
        print(f"\n'{a.grep}' を含む記事: {len(hits)}件 / 全{len(posts) + len(pages)}件")
        for p in hits[:2]:
            h = p["html"]
            i = h.index(a.grep)
            print(f"\n--- {p['slug']} ---")
            print(h[max(0, i - 300): i + 700])
            print(f"\n[変換後にも残るか] {a.grep in process_html(h, host)}")
        return
    if a.limit:
        posts, pages = posts[: a.limit], pages[: min(len(pages), 2)]
    convert(cats, tags, posts, pages, host, a.out,
            {s.strip() for s in a.skip_pages.split(",") if s.strip()}, not a.no_images)


if __name__ == "__main__":
    main()
