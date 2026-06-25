# Approved Reels

This directory is the only source that automated reel posting may read.

Rules:

- Do not put draft or review-only manifests here.
- Every JSON file must set `approvalStatus` to `approved`.
- Every post must include `designReview.screenshots` and all required `designReview.checks`.
- Every birthday reel must include `designReview.miniCharacters` with each ranked birth day, reduced 1-9 family, and expected `birthday-family-N-chibi.png` asset.
- Threads captions must start with `無料占いはプロフィールURLから👀✨` and contain exactly one hashtag.
- Posting scripts must not read manifests under `videos/social/instagram/**`.

Use `npm run social:guard` before claiming the posting pipeline is safe.
