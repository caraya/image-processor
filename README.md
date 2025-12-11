# 🖼️ Image Converter CLI

A powerful and flexible CLI tool to convert image files or directories of images into various formats using [Sharp](https://github.com/lovell/sharp) and [cjxl](https://github.com/libjxl/libjxl) for JPEG XL support.

## ✨ Features

* Convert single images or entire directories
* Supports output formats: `jpg`, `png`, `webp`, `avif`, `jpegxl`
* Optional verbose logging
* Handles overwriting with prompts (`yes`, `no`, `all`, `quit`)
* Supports output to custom directory
* Fallback to `cjxl` for JPEG XL conversion
* Interactive CLI prompts for safer operations

---

## 📦 Installation

Clone this repo and install dependencies:

```bash
npm install
```

Make sure you have cjxl installed and available in your system path for JPEG XL support.

## Install cjxl

### macOS (with Homebrew)

```bash
brew install jpeg-xl
```

### Ubuntu/Debian

```bash
sudo apt install libjxl-tools
```

## 🧪 Usage

```bash
npx tsx src/index.ts <source> --formats <formats...> [options]
```

## 🔤 Arguments

* `<source>`: A path to an image file or directory

## ⚙️ Options

| Flag | Description |
| --- | --- |
| -f, --formats | Output format(s). Use multiple (e.g. jpg png) or "all" for all supported |
| -o, --out | Output directory. Defaults to same directory as source |
| -w, --width | Resize to width (pixels) |
| -h, --height | Resize to height (pixels) |
| -r, --rotate | Rotate image by angle (degrees) |
| --no-enlargement | Do not enlarge image if source is smaller than target dimensions |
| --grayscale | Convert to grayscale |
| --to-srgb | Convert to sRGB color space |
| --verbose | Enable detailed logging |
| -h, --help | Show usage information |
