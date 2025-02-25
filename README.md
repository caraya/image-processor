# README

This is meant as a replacement for the Squoosh CLI application that is no longer available.

This app will:

* Use Node.js built-in modules: fs, path, process, and fs/promises
* Accept user input via command-line arguments
* Support the following CLI options:
  * Convert a single file to all available formats
  * Convert a single file to a specified format
  * Convert all files in a directory to all formats
  * Convert all files in a directory to a specified format

## Usage 🚀

Convert a single file to all formats:

```bash
node index.mjs image.png all
```

Convert a single file to a specific format:

```bash
node index.mjs image.png jpeg
```

Convert all files in a directory to all formats:

```bash
node index.mjs ./images all
```

Convert all files in a directory to a specific format:

```bash
node index.mjs ./images webp
```
