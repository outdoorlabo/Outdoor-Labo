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
  - Posts dated in the future (scheduled posts) are skipped here; the
    scheduled-publish workflow posts them with --catch-up once their
    date has passed.
  - --dry-run prints what would be posted without calling the API.
"""
import argparse
import glob
import os
import re
import subprocess
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


FUTURE_GRACE_HOURS = 1
CATCHUP_WINDOW_HOURS = 26


def git_added_time(path):
    """Commit time of the commit that first added the file, or None."""
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--format=%cI", "--reverse", "--", path],
            capture_output=True, text=True, timeout=30,
        )
    except Exception:
        return None
    lines = [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]
    if not lines:
        return None
    try:
        return datetime.fromisoformat(lines[0].replace("Z", "+00:00"))
    except ValueError:
        return None


def catchup_candidates(now):
    """Posts that were scheduled in advance and have just become due.

    A post counts as scheduled when its file was added to the repo more
    than an hour before its front-matter date. Immediately published
    posts (added at or after their date) are left to the push workflow,
    so nothing is posted twice.
    """
    selected = []
    for path in sorted(glob.glob("content/posts/*.md")):
        try:
            fm = parse_front_matter(path)
            date, _url = build_url(fm, path)
        except Exception:
            continue
        if fm.get("draft") is True:
            continue
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone(timedelta(hours=9)))
        if date > now:
            continue
        if now - date > timedelta(hours=CATCHUP_WINDOW_HOURS):
            continue
        added = git_added_time(path)
        if added is None or added > date - timedelta(hours=1):
            continue
        selected.append(path)
    return selected


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*", help="post markdown files to consider")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="ignore the recency guard")
    ap.add_argument("--catch-up", action="store_true",
                    help="post scheduled articles that have just become due")
    args = ap.parse_args()

    now = datetime.now(timezone.utc)
    if args.catch_up:
        args.files = catchup_candidates(now)
        print(f"catch-up: {len(args.files)} candidate(s)")
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
            # Front matter dates without an offset are JST wall time
            # (Hugo timeZone = Asia/Tokyo); never interpret them as UTC.
            date = date.replace(tzinfo=timezone(timedelta(hours=9)))
        if not args.force and now - date > timedelta(hours=MAX_AGE_HOURS):
            print(f"skip {path}: older than {MAX_AGE_HOURS}h ({date.isoformat()})")
            continue
        if not args.force and date - now > timedelta(hours=FUTURE_GRACE_HOURS):
            print(f"skip {path}: scheduled for the future ({date.isoformat()}); catch-up will post it")
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
