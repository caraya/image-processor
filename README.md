# 🖼️ Image Converter CLI

A powerful and flexible CLI tool to convert image files or directories of images into various formats using [Sharp](https://github.com/lovell/sharp) and a WebAssembly JPEG XL encoder.

## ✨ Features

* Convert single images or entire directories
* Supports output formats: `jpg`, `png`, `webp`, `avif`, `jpegxl`
* Optional verbose logging
* Handles overwriting with prompts (`yes`, `no`, `all`, `quit`)
* Prevents in-place overwrite by appending numeric suffixes (for example, `-1`)
* Supports output to custom directory
* Uses `@jsquash/jxl` (WASM) for JPEG XL conversion with no system-level dependency
* Interactive CLI prompts for safer operations

---

## 📦 Installation

Clone this repo and install dependencies:

```bash
npm install
```

No additional system packages are required for JPEG XL conversion.

## 🧪 Usage

```bash
npx tsx src/index.ts <source> --formats <formats...> [options]
```

If `--formats` is omitted, the CLI converts to all supported output formats by default.

## 🔤 Arguments

* `<source>`: A path to an image file or directory

## ⚙️ Options

| Flag | Description |
| --- | --- |
| -f, --formats | Output format(s). Use multiple (e.g. jpg png). If omitted (or set to "all"), all supported output formats are used |
| -o, --out | Output directory. Defaults to same directory as source |
| --jpg-quality | JPEG quality (1-100). Default: 80 |
| --png-quality | PNG quality (1-100). Default: 100 |
| --webp-quality | WebP quality (1-100). Default: 80 |
| --avif-quality | AVIF quality (1-100). Default: 50 |
| --jpegxl-quality | JPEG XL quality (1-100). Default: 85 |
| -w, --width | Resize to width (pixels) |
| -h, --height | Resize to height (pixels) |
| -r, --rotate | Rotate image by angle (degrees) |
| --no-enlargement | Do not enlarge image if source is smaller than target dimensions |
| --grayscale | Convert to grayscale |
| --to-srgb | Convert to sRGB color space |
| --verbose | Enable detailed logging, including full error stacks/details on failures |
| -h, --help | Show usage information |
