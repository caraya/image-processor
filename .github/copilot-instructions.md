# Copilot Instructions

This document provides guidance for AI agents to effectively contribute to this codebase.

## Project Overview

This is a command-line interface (CLI) tool built with TypeScript for converting images between various formats. It uses the `sharp` library for common formats and falls back to the external `cjxl` command-line tool for JPEG XL (`.jxl`) support.

The main application logic is contained within `src/index.ts`.

## Key Files

- `src/index.ts`: The single entry point for the CLI. It handles argument parsing, file processing, and calls to the conversion libraries.
- `package.json`: Defines scripts and dependencies.
- `tests/image_converter_cli.spec.ts`: Contains end-to-end tests for the CLI.

## Developer Workflow

### Setup

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  For full format support, install `cjxl`. On macOS with Homebrew, you can either run `brew install jpeg-xl` or use the included `Brewfile`:
    ```bash
    brew bundle install
    ```

### Running the CLI

To run the CLI for development and testing:

```bash
npx tsx src/index.ts <path-to-image-or-dir> --formats <format1> <format2> --out <output-dir> [--width <pixels>] [--height <pixels>] [--no-enlargement]
```

- Example:
  ```bash
  npx tsx src/index.ts ./images/my-image.png --formats webp avif --out ./converted
  ```

- Example with resizing:
  ```bash
  npx tsx src/index.ts ./images/my-image.png --formats jpg --width 300 --out ./resized
  ```

- Example with resizing (no enlargement):
  ```bash
  npx tsx src/index.ts ./images/my-image.png --formats jpg --width 3000 --no-enlargement --out ./resized
  ```

### Testing

Tests are written with Playwright and are located in the `tests/` directory. They execute the CLI as a child process and verify the output files.

To run the test suite:

```bash
npm run test
```

The tests will create a `tests/converted-test` directory for output, which is cleaned up before and after test runs.

## Architectural Notes

- **Image Conversion:** The `convertImage` function in `src/index.ts` is the core of the application. It handles the logic for both `sharp` and `cjxl` based on the requested format.
- **External Dependency:** The tool has a runtime dependency on the `cjxl` binary for JPEG XL conversion. The `checkCjxlAvailability` function checks if it's present in the system's PATH.
- **User Prompts:** The CLI includes interactive prompts for overwriting existing files, handled by the `promptOverwrite` function.
- Although modularity is limited, keep the code in a single file to maintain simplicity for this small project.
