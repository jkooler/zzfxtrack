# Releasing Guide (GitHub)

This guide is for this repository and assumes minimal GitHub release experience.

## Recommended Versioning Policy

Use Semantic Versioning in pre-1.0 mode:

- `0.y.z` while the app is still evolving quickly.
- Bump `y` (minor) for new features or behavior changes.
- Bump `z` (patch) for fixes and small non-breaking updates.
- Optional pre-release suffixes only when useful:
  - `0.2.0-alpha.1`
  - `0.2.0-beta.1`

Suggested starting sequence:

1. `0.1.0` first public release.
2. `0.1.1`, `0.1.2` for fixes.
3. `0.2.0` for larger feature updates.

## Should You Keep Older Versions?

Yes, keep all past releases available through Git tags and GitHub Releases.

- Good: users can pin older versions if needed.
- Simple support model: only latest release is supported.
- No need for multiple maintenance branches yet.

## One-Time GitHub Setup

1. Ensure repository is on GitHub.
2. Add this project description and topics (optional but useful).
3. Confirm `README.md`, `LICENSE`, `CHANGELOG.md`, and this `RELEASING.md` exist.
4. In repo settings, verify default branch (usually `main`).

## Release Checklist (Every Release)

1. Ensure working tree is clean and tests/manual checks are done.
2. Update version in `package.json`.
3. Add a new section to `CHANGELOG.md` with date and changes.
4. Commit changes:
   - `chore(release): vX.Y.Z`
5. Create annotated tag:
   - `git tag -a vX.Y.Z -m "vX.Y.Z"`
6. Push branch and tag:
   - `git push`
   - `git push origin vX.Y.Z`
7. Create GitHub Release from the tag (steps below).

## Creating A Release In GitHub UI

1. Open your repository on GitHub.
2. Click **Releases** (right sidebar) or go to `/releases`.
3. Click **Draft a new release**.
4. In **Choose a tag**, select existing `vX.Y.Z` (or type to create it).
5. Set **Release title** to `vX.Y.Z`.
6. For description:
   - Either click **Generate release notes** and edit,
   - Or paste the matching `CHANGELOG.md` section.
7. If it is alpha/beta, check **Set as a pre-release**.
8. Click **Publish release**.

## Alpha/Beta vs Stable

Use pre-release checkbox for:

- `-alpha.*` early testing.
- `-beta.*` feature-complete but still validating.

Leave unchecked for stable releases like `0.1.0`, `0.2.0`.

## Optional: Release Artifacts

If you want downloadable files (zip/json bundles), attach them to the release:

1. Build artifacts locally.
2. In release draft, drag files into **Attach binaries...**.
3. Publish release.

## Optional: GitHub CLI (Later)

If you want a terminal flow later:

- `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file RELEASE_NOTES.md`

Keep UI flow first until comfortable.

## Practical Rules For This Repo

1. Keep version in `package.json` aligned with release tag.
2. Keep `CHANGELOG.md` as source of truth.
3. Tag format always `vX.Y.Z`.
4. Keep old releases published; do not delete old tags unless mistaken.
5. Support latest only (documented in README).

## Suggested First Releases

1. `v0.1.0` - first public release.
2. `v0.1.1` - quick fixes from first feedback.
3. `v0.2.0` - next notable feature batch.
