# OUTDOOR LABO Article Draft Template

Use this as a starting point, not a mandatory outline. Delete sections that do not serve the article and add sections that the subject requires.

## Hugo front matter

```yaml
---
title: ""
date: {{ .Date }}
slug: ""
category: []
tag: []
image: ""
description: ""
draft: true
---
```

- `title`: Published article title.
- `date`: Original publication date or intended publication date, in Japan time.
- `slug`: Existing or approved URL slug. For migrated posts, preserve the WordPress URL mapping.
- `category` / `tag`: Use existing taxonomy slugs where possible. Do not create near-duplicates.
- `image`: Featured image path, normally under `/wp-content/uploads/`.
- `description`: A concise, accurate summary. Do not invent claims.
- `draft`: Keep `true` until the author approves publication.

## Draft notes (remove before publishing)

- Article type: Review / Comparison / DIY / Experiment / Field report / How-to / Other
- What prompted this article:
- Intended reader or use case:
- What I actually did / used:
- Products or previous experiences worth comparing:
- Facts that need checking:
- Photos available and what each photo shows:
- Questions or missing details:

## Suggested body structure

Start with the real context: what happened, what problem appeared, or why this subject became interesting.

Then choose only the sections that fit:

## Why I chose it

Explain the need, alternatives considered, and the reason for this choice.

## Product / subject overview

Introduce only the details needed to understand the article. Separate official specifications from personal observations.

## Actual use / process

Describe the real setting, duration, conditions, setup, and method where relevant. Be specific about what was and was not tested.

## What worked well

Use concrete examples. Explain why each point matters in practice.

## What did not work / points to note

Include genuine limitations, compromises, surprises, and conditions where the result may differ.

## Comparison with other options

Compare only where there is a meaningful shared use case. Include the author's actual experience where available.

## Conclusion

Summarize what the experience means. Explain who may find it suitable, who may want another option, and what remains uncertain.

## Optional technical details

- Specifications:
- Dimensions / weight:
- Materials:
- Settings / version:
- Price and date checked:
- Sources:

## Image notes

For each image, record:
- File path:
- What is visible:
- Where it belongs:
- Alt text that describes the image naturally.

## Related articles

- [Related article title](URL)
