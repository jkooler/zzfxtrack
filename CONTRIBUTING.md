# Contributing

Thanks for your interest in contributing to ZzFXTrack.

## Before Opening a Pull Request

- Check existing issues and pull requests first to avoid duplicate work.
- Prefer small, focused changes over broad refactors.
- If the change affects export behavior, mention the expected user-facing impact clearly.
- If the change affects the hosted/demo build, call that out explicitly.

## Development

Install dependencies:

```bash
npm install
```

Start the app locally:

```bash
npm run dev
```

Build the hosted/demo bundle:

```bash
npm run build:pages
```

## Project Expectations

- Preserve the existing app structure and behavior unless the change intentionally improves them.
- Avoid checking in secrets, private tokens, or machine-specific configuration.
- Keep user-facing copy clear and concise.
- Update documentation when behavior changes in a way users will notice.

## Pull Request Notes

When opening a PR, include:

- what changed
- why it changed
- how you tested it
- screenshots or short recordings for UI changes when helpful

## Licensing

By contributing, you agree that your contributions are provided under the repository's existing license terms.
