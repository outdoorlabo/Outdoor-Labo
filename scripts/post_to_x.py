#!/usr/bin/env python3
"""Post newly published articles to X (Twitter).

Called by .github/workflows/post-to-x.yml on pushes to main that add files
under content/posts/. For each added post this script builds the public URL
from the front matter (date + slug, permalink /:year/:month/:day/:slug/) and
posts "title + URL" via the X API v2 using OAuth 1.0a user credentials taken
from environment variables (GitHub Secrets):
  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET

Safety guards:
  - Posts whose date is older than MAX_AGE_HOURS are skipped, so merges of
    old branches or migration replays never spam X. --force bypasses this
    (used only by manual workflow_dispatch runs).
  - draft: true posts are skipped.
  - --dry-run prints what would be posted without calling the API.
"""
import argparse
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import yaml

SITE_BASE = "https://outdoorlabo.a-ce.com"
MAX_AGE_HOURS = 72


def parse_front_matter(path):
    text = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    if not m:
        raise ValueError(f"no front matter: {path}")
    return yaml.safe_load(m.group(1)) or {}


def build_url(fm, path):
    date = fm.get("date")
    if isinstance(date, str):
        date = datetime.fromisoformat(date.replace("Z", "+00:00"))
    if date is None:
        raise ValueError(f"no date in front matter: {path}")
    slug = fm.get("slug") or os.path.splitext(os.path.basename(path))[0]
    return date, f"{SITE_BASE}/{date.year:04d}/{date.month:02d}/{date.day:02d}/{slug}/"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help="post markdown files to consider")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="ignore the recency guard")
    args = ap.parse_args()

    now = datetime.now(timezone.utc)
    client = None
    posted = 0
    for path in args.files:
        try:
            fm = parse_front_matter(path)
            date, url = build_url(fm, path)
        except Exception as e:
            print(f"skip {path}: {e}")
            continue
        if fm.get("draft") is True:
            print(f"skip {path}: draft")
            continue
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        if not args.force and now - date > timedelta(hours=MAX_AGE_HOURS):
            print(f"skip {path}: older than {MAX_AGE_HOURS}h ({date.isoformat()})")
            continue
        text = f"{fm.get('title', '').strip()}\n{url}"
        if args.dry_run:
            print(f"[dry-run] would post:\n{text}\n---")
            posted += 1
            continue
        if client is None:
            import tweepy

            client = tweepy.Client(
                consumer_key=os.environ["X_API_KEY"],
                consumer_secret=os.environ["X_API_SECRET"],
                access_token=os.environ["X_ACCESS_TOKEN"],
                access_token_secret=os.environ["X_ACCESS_SECRET"],
            )
        resp = client.create_tweet(text=text)
        print(f"posted for {path}: tweet id {resp.data['id']} ({url})")
        posted += 1
    print(f"done: {posted} post(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
