# Developer Guide

This document explains how to test and develop the PeerJS Server locally.

## Local Testing Commands

### Install Dependencies

```bash
# Install dependencies (generates package-lock.json)
npm install

# Or use clean install (requires existing package-lock.json)
npm ci
```

### Build and Test

```bash
# Build the project
npm run build

# Run linter
npm run lint

# Run tests with coverage
npm run test
npm run coverage

# Format code
npm run format
npm run format:check
```

### Start Development Server

```bash
# Run in development mode with auto-reload
npm run dev

# Or build and start manually
npm run build
npm start
```

## Semantic Release (NPM Publishing)

### Overview

This project uses `semantic-release` to automatically:
- Determine version bumps based on commit messages
- Generate release notes and changelog
- Publish to NPM
- Create GitHub releases

### Local Testing (Dry Run)

To test semantic-release locally without actually publishing:

```bash
# Set required environment variables
export NPM_TOKEN=your_npm_token
export GITHUB_TOKEN=your_github_token

# Run dry-run mode
npx semantic-release --dry-run
```

**Note:** Even with `--dry-run`, tokens must be set for authentication verification.

### Required Tokens

| Variable | Purpose | How to Get |
|----------|---------|-----------|
| `NPM_TOKEN` | Publish to NPM | `npm token create` or https://www.npmjs.com/settings/tokens |
| `GITHUB_TOKEN` | Create releases | Personal access token from https://github.com/settings/personal-access-tokens |

### Release Branches

Configured in `.releaserc.json`:
- `master` - Production releases
- `stable` - Production releases (legacy)
- `rc` - Pre-release versions

### Commit Message Format

Semantic-release uses Conventional Commits:

| Commit Type | Version Bump | Example |
|-------------|--------------|---------|
| `feat:` | Minor (x.Y.z) | `feat: add IP-based discovery` |
| `fix:` | Patch (x.y.Z) | `fix: handle null IP address` |
| `BREAKING CHANGE:` | Major (X.y.z) | `BREAKING CHANGE: remove legacy API` |
| `chore:` | No release | `chore: update dependencies` |

### GitHub Actions Release

The `release.yml` workflow runs on every push to `master`:

```yaml
- Release to NPM (requires NPM_TOKEN secret)
- Create GitHub release (uses built-in GITHUB_TOKEN)
- Generate changelog
```

## GitHub Actions Workflows

### Available Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `node.js.yml` | PR to `master`, manual dispatch | CI testing on Node 16/18/20 |
| `release.yml` | Push to `master` | NPM publish + GitHub release |
| `prettier.yml` | PRs, manual dispatch | Code formatting check |
| `master_localbytes.yml` | Push to `master`, manual dispatch | Build and deploy to Azure App Service |

### Running Workflows Locally

Use `act` to run GitHub Actions locally:

```bash
# Install act (macOS)
brew install act

# Run specific workflow
act -W .github/workflows/node.js.yml

# Run on push event
act push

# Run with secrets
act -s NPM_TOKEN=fake_token -s GITHUB_TOKEN=fake_token push
```

### Workflow Execution Order

When opening a pull request to `master`, these workflows run:

1. **node.js.yml** - Build, lint, and coverage across Node 16/18/20
2. **prettier.yml** - Format check

When pushing to `master`, these workflows run:

1. **release.yml** - Semantic release
2. **master_localbytes.yml** - Build and deploy to Azure

The Azure deployment workflow installs dependencies with `npm ci`, builds the project, uploads the full repository artifact, and deploys it so runtime files such as `server.js` and `index.html` are available in App Service.

## Environment Setup

### Required Node Version

- Minimum: Node 14 (see `engines` in package.json)
- Recommended: Node 20.x
- CI tests: 16.x, 18.x, 20.x

### VS Code Extensions (Recommended)

- Prettier - Code: formatter
- ESLint
- TypeScript Importer

### Common Issues

#### `npm ci` fails
```bash
# If package-lock.json is missing, run:
npm install
# Then use npm ci for subsequent installs
```

#### Lint errors
```bash
# Auto-fix many linting issues
npm run format
npm run lint -- --fix
```

#### TypeScript version warning
The project uses TypeScript 5.x, which may show warnings with `@typescript-eslint`. This is expected and doesn't affect functionality.
