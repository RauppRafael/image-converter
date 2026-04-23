# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A CLI tool for batch image conversion/compression (Sharp) and Portuguese-BR audio transcription (OpenAI Whisper). Recursively processes directories and preserves folder structure.

## Commands

```bash
# Run the CLI (interactive prompts for operation, input/output directories)
npm run work

# Tests (vitest)
npm test

# Lint
npm run lint
```

## Architecture

- **index.ts** - CLI entry point using inquirer for interactive prompts. Offers four operations: Convert to WebP, Convert to JPG, Compress, Transcribe Audio.
- **src/ImageHandler.ts** - Image processing class wrapping Sharp. Recursively processes directories, maintaining folder structure in output.
- **src/AudioHandler.ts** - Spawns the Python transcription script (`scripts/transcribe.py`), which requires `openai-whisper`.
- **src/ImageHandler.test.ts** - Vitest tests for `ImageHandler` (generates fixture images on-the-fly).

### ImageHandler Operations

- `toWebp()` - Converts images to WebP with max 2400x2400 dimensions and quality 90
- `toJpg()` - Converts images to JPEG with quality 85
- `compress({ maxWidth?, maxHeight?, maxMegapixels?, quality? })` - Compresses images in their native format (HEIF → JPG). All caps are optional; when multiple are set, the tightest one wins. `maxMegapixels` (e.g. 25 for Shopify) is ratio-agnostic. EXIF orientation is applied to pixels before measuring, so phone photos are sized correctly regardless of stored orientation.

### Supported Formats

- **Input**: jpeg, png, webp, tiff, avif, gif, heif, jpg
- **Output**: jpeg, png, webp, tiff, avif, gif

> **HEIC note:** `.heic` (HEVC-compressed HEIF) is intentionally unsupported. Sharp's prebuilt libheif ships without an HEVC encoder on most platforms, so re-encoding would fail at runtime (`heifsave: Unsupported compression`). AV1-compressed HEIF (`.heif`) still works. If HEIC support is needed later, bundle a libheif build with HEVC or preconvert upstream.

## Code Style

Uses `@defihub/eslint-config` with Node.js globals. Run ESLint before committing.
