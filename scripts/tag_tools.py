#!/usr/bin/env python3
"""OUTDOOR LABO — タグ整理ツール（定義と記事側の付け替えをセットで行う）

使い方:
  python3 scripts/tag_tools.py inventory [--root PATH]
  python3 scripts/tag_tools.py merge OLD_SLUG NEW_SLUG [--apply] [--root PATH]
  python3 scripts/tag_tools.py delete SLUG [--apply] [--root PATH]

- inventory: 定義ごとの使用件数、未使用の定義、定義のない使用中タグを表示する。
- merge: 全記事の tag リスト内の OLD を NEW に付け替える（重複は除く）。
- delete: 全記事の tag リストから SLUG を外す。
- merge/delete は既定でドライラン（変更内容の表示のみ）。--apply で実際に書き換え、
  あわせて定義ファイル content/tag/<slug>/_index.md も削除する
  （merge で定義を残したい場合は --keep-def を付ける）。

記事の front matter は tag 行だけを書き換え、他の部分はバイト単位で保持する。
対応形式: インライン形式 tag: ["a", "b"] と、ブロック形式（tag: の下に - 項目）。
"""
import argparse
import os
import re
import sys
from collections import Counter

INLINE_RE = re.compile(r'^(tag:\s*)\[(.*)\]\s*$', re.M)
BLOCK_RE = re.compile(r'^tag:\s*\n((?:\s*-\s*.+\n)+)', re.M)
TOKEN_RE = re.compile(r'"([^"]*)"|\'([^\']*)\'|([^,\s]+)')


def split_front_matter(text):
    if not text.startswith('---'):
        return None, text
    end = text.find('\n---', 3)
    if end < 0:
        return None, text
    return text[:end], text[end:]


def parse_tokens(list_text):
    tokens = []
    for m in TOKEN_RE.finditer(list_text):
        tokens.append(next(g for g in m.groups() if g is not None))
    return tokens


def get_tags(fm):
    m = INLINE_RE.search(fm)
    if m:
        return parse_tokens(m.group(2))
    m = BLOCK_RE.search(fm)
    if m:
        return [ln.strip().lstrip('-').strip().strip('"\'') for ln in m.group(1).splitlines() if ln.strip()]
    m = re.search(r'^tag:\s*(\S+)\s*$', fm, re.M)
    if m:
        return [m.group(1).strip('"\'')]
    return []


def set_tags(fm, tags):
    rendered = '[' + ', '.join('"%s"' % t for t in tags) + ']'
    m = INLINE_RE.search(fm)
    if m:
        return fm[:m.start()] + m.group(1) + rendered + fm[m.end():]
    m = BLOCK_RE.search(fm)
    if m:
        return fm[:m.start()] + 'tag: ' + rendered + '\n' + fm[m.end():]
    m = re.search(r'^tag:\s*\S+\s*$', fm, re.M)
    if m:
        return fm[:m.start()] + 'tag: ' + rendered + fm[m.end():]
    return fm


def load_posts(root):
    posts_dir = os.path.join(root, 'content', 'posts')
    posts = []
    for name in sorted(os.listdir(posts_dir)):
        if not name.endswith('.md'):
            continue
        path = os.path.join(posts_dir, name)
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
        fm, rest = split_front_matter(text)
        if fm is None:
            continue
        posts.append({'path': path, 'fm': fm, 'rest': rest, 'tags': get_tags(fm)})
    return posts


def load_defs(root):
    tag_dir = os.path.join(root, 'content', 'tag')
    defs = {}
    if not os.path.isdir(tag_dir):
        return defs
    for slug in sorted(os.listdir(tag_dir)):
        index = os.path.join(tag_dir, slug, '_index.md')
        if not os.path.isfile(index):
            continue
        with open(index, encoding='utf-8') as fh:
            text = fh.read()
        m = re.search(r'^title:\s*"?([^"\n]*)"?\s*$', text, re.M)
        defs[slug] = m.group(1) if m else ''
    return defs


def cmd_inventory(root):
    posts = load_posts(root)
    defs = load_defs(root)
    usage = Counter()
    for post in posts:
        for tag in set(post['tags']):
            usage[tag] += 1
    print('記事数: %d / タグ定義: %d / 使用中タグ: %d' % (len(posts), len(defs), len(usage)))
    unused = [s for s in defs if usage[s] == 0]
    print('\n== 未使用の定義（%d件）==' % len(unused))
    for slug in unused:
        print('  %s（%s）' % (slug, defs[slug]))
    undefined = [t for t in usage if t not in defs]
    print('\n== 定義のない使用中タグ（%d件）==' % len(undefined))
    for slug in sorted(undefined, key=lambda s: -usage[s]):
        print('  %s: %d記事' % (slug, usage[slug]))
    single = [t for t in usage if usage[t] == 1]
    print('\n== 1記事だけに付いたタグ: %d件 ==' % len(single))
    print('\n== 使用件数トップ30 ==')
    for slug, count in usage.most_common(30):
        print('  %s（%s）: %d' % (slug, defs.get(slug, '定義なし'), count))
    return 0


def rewrite(root, transform, target_slug, apply, keep_def):
    posts = load_posts(root)
    changed = 0
    for post in posts:
        new_tags = transform(post['tags'])
        if new_tags != post['tags']:
            changed += 1
            print('%s: %s -> %s' % (os.path.basename(post['path']), post['tags'], new_tags))
            if apply:
                new_fm = set_tags(post['fm'], new_tags)
                with open(post['path'], 'w', encoding='utf-8') as fh:
                    fh.write(new_fm + post['rest'])
    print('対象記事: %d件' % changed)
    def_file = os.path.join(root, 'content', 'tag', target_slug, '_index.md')
    if os.path.isfile(def_file) and not keep_def:
        print('定義ファイルを削除: %s' % def_file)
        if apply:
            os.remove(def_file)
            try:
                os.rmdir(os.path.dirname(def_file))
            except OSError:
                pass
    if not apply:
        print('（ドライランです。実際に変更するには --apply を付けてください）')
    return 0


def main():
    parser = argparse.ArgumentParser(description='OUTDOOR LABO タグ整理ツール')
    parser.add_argument('--root', default='.', help='レポのルート（既定: カレント）')
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('inventory')
    p_merge = sub.add_parser('merge')
    p_merge.add_argument('old')
    p_merge.add_argument('new')
    p_merge.add_argument('--apply', action='store_true')
    p_merge.add_argument('--keep-def', action='store_true')
    p_del = sub.add_parser('delete')
    p_del.add_argument('slug')
    p_del.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    if args.cmd == 'inventory':
        return cmd_inventory(args.root)
    if args.cmd == 'merge':
        if args.old == args.new:
            print('OLD と NEW が同じです', file=sys.stderr)
            return 2

        def merge_tags(tags):
            out = []
            for tag in tags:
                tag = args.new if tag == args.old else tag
                if tag not in out:
                    out.append(tag)
            return out

        return rewrite(args.root, merge_tags, args.old, args.apply, args.keep_def)
    if args.cmd == 'delete':
        return rewrite(
            args.root,
            lambda tags: [t for t in tags if t != args.slug],
            args.slug, args.apply, False,
        )
    return 2


if __name__ == '__main__':
    sys.exit(main())
