#!/usr/bin/env node
// Node built-in modules
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
// Third-party modules
import * as readline from 'readline';
import { Command } from 'commander';
import encodeJxl, { init as initJxlEncoder } from '@jsquash/jxl/encode.js';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const DEFAULT_FORMAT_QUALITY = {
    jpg: 80,
    png: 100,
    webp: 80,
    avif: 50,
    jpegxl: 85,
};
// Supported formats directly by sharp
const SHARP_FORMATS = ['jpg', 'png', 'webp', 'avif'];
// All supported formats including jpegxl via cjxl fallback
const SUPPORTED_FORMATS = [...SHARP_FORMATS, 'jpegxl'];
// Setup readline interface for interactive prompts
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
let overwriteAll = false;
let jxlEncoderReady = null;
/**
 * Loads and initializes the JXL WASM module explicitly for Node runtimes.
 */
async function ensureJxlEncoderReady() {
    if (!jxlEncoderReady) {
        jxlEncoderReady = (async () => {
            const wasmUrl = new URL('../node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm', import.meta.url);
            const wasmBytes = await fs.promises.readFile(fileURLToPath(wasmUrl));
            const wasmModule = await WebAssembly.compile(new Uint8Array(wasmBytes));
            await initJxlEncoder(wasmModule);
        })();
    }
    await jxlEncoderReady;
}
/**
 * Parses and validates a quality option (1-100).
 */
function parseQualityOption(value, optionName) {
    if (!value)
        return undefined;
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
        console.error(`❌ ${optionName} must be an integer between 1 and 100.`);
        process.exit(1);
    }
    return parsed;
}
/**
 * Produces a safe, human-readable error message from unknown thrown values.
 */
function getErrorMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === 'string')
        return err;
    try {
        return JSON.stringify(err);
    }
    catch {
        return String(err);
    }
}
/**
 * Prints full error details (stack/object) when verbose mode is enabled.
 */
function logVerboseErrorDetails(err, verbose) {
    if (!verbose)
        return;
    if (err instanceof Error) {
        console.error(err.stack ?? err.message);
        return;
    }
    console.error(err);
}
/**
 * TIFFs from some sources can include minor decode issues. Use tolerant mode.
 */
function createSharpInstance(filePath, verbose) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.tif' || ext === '.tiff') {
        if (verbose) {
            console.log(`ℹ️  TIFF tolerant decode enabled for: ${filePath}`);
        }
        return sharp(filePath, { failOn: 'none' });
    }
    return sharp(filePath);
}
/**
 * Creates a non-conflicting output path by appending a numeric suffix.
 */
function makeNumberedOutputPath(filePath) {
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    let counter = 1;
    let candidate = path.join(dir, `${baseName}-${counter}${ext}`);
    while (fs.existsSync(candidate)) {
        counter += 1;
        candidate = path.join(dir, `${baseName}-${counter}${ext}`);
    }
    return candidate;
}
/**
 * Prevents in-place output from overwriting the source file by renaming output.
 */
function ensureOutputDoesNotClobberInput(outputPath, inputPath, verbose) {
    const resolvedOutputPath = path.resolve(outputPath);
    const resolvedInputPath = path.resolve(inputPath);
    if (resolvedOutputPath !== resolvedInputPath) {
        return outputPath;
    }
    const safeOutputPath = makeNumberedOutputPath(outputPath);
    if (verbose) {
        console.log(`ℹ️  Output matches input file; using: ${safeOutputPath}`);
    }
    return safeOutputPath;
}
/**
 * Prompts the user to confirm overwriting an existing file.
 *
 * @param filePath - The path of the file that already exists.
 * @returns A promise that resolves to the user's choice: 'yes', 'no', 'all', or 'quit'.
 */
async function promptOverwrite(filePath) {
    return new Promise((resolve) => {
        rl.question(`⚠️  File already exists: ${filePath}\nOverwrite? [y]es / [n]o / [a]ll / [q]uit: `, (answer) => {
            const response = answer.trim().toLowerCase();
            if (['y', 'yes'].includes(response))
                return resolve('yes');
            if (['n', 'no'].includes(response))
                return resolve('no');
            if (['a', 'all'].includes(response))
                return resolve('all');
            if (['q', 'quit'].includes(response))
                return resolve('quit');
            return resolve('no');
        });
    });
}
/**
 * Converts a single image file to the specified formats.
 *
 * @param filePath - The path to the source image file.
 * @param formats - An array of target formats (e.g., ['jpg', 'webp']).
 * @param options - Configuration options for the conversion.
 * @param options.outputDir - Optional directory to save the converted images. Defaults to source directory.
 * @param options.verbose - Whether to enable verbose logging.
 * @param options.width - Optional width to resize the image to.
 * @param options.height - Optional height to resize the image to.
 * @param options.withoutEnlargement - Whether to skip resizing if the image is smaller than the target dimensions.
 * @param options.rotate - Optional angle to rotate the image by.
 * @param options.grayscale - Whether to convert the image to grayscale.
 * @param options.toSrgb - Whether to convert the image to sRGB color space.
 * @param options.quality - Optional per-format quality overrides/defaults used during output.
 * @param options.quality.jpg - JPEG quality value (1-100).
 * @param options.quality.png - PNG quality value (1-100).
 * @param options.quality.webp - WebP quality value (1-100).
 * @param options.quality.avif - AVIF quality value (1-100).
 * @param options.quality.jpegxl - JPEG XL quality value (1-100), passed to the WASM encoder.
 */
async function convertImage(filePath, formats, options) {
    const { outputDir, verbose, width, height, withoutEnlargement, rotate, grayscale, toSrgb, quality } = options;
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const inputDir = path.dirname(filePath);
    for (const format of formats) {
        const targetDir = outputDir || inputDir;
        await fs.promises.mkdir(targetDir, { recursive: true });
        const outputBase = path.join(targetDir, baseName);
        // Special handling for jpegxl using @jsquash/jxl WASM encoder
        if (format === 'jpegxl') {
            const finalJxl = ensureOutputDoesNotClobberInput(`${outputBase}.jxl`, filePath, verbose);
            const jpegxlQuality = quality?.jpegxl;
            const jxlExists = fs.existsSync(finalJxl);
            // Check if file exists and confirm overwrite
            if (jxlExists && !overwriteAll) {
                const choice = await promptOverwrite(finalJxl);
                if (choice === 'no')
                    continue;
                if (choice === 'quit') {
                    rl.close();
                    console.log('🛑 Aborted by user.');
                    process.exit(0);
                }
                if (choice === 'all')
                    overwriteAll = true;
            }
            try {
                // Produce raw RGBA bytes so they can be encoded by the WASM JXL codec.
                const sharpInstance = createSharpInstance(filePath, verbose);
                if (rotate !== undefined) {
                    sharpInstance.rotate(rotate);
                }
                else {
                    sharpInstance.rotate();
                }
                if (grayscale)
                    sharpInstance.grayscale();
                if (toSrgb)
                    sharpInstance.toColourspace('srgb');
                if (width || height) {
                    sharpInstance.resize({ width, height, withoutEnlargement });
                }
                const { data, info } = await sharpInstance
                    .ensureAlpha()
                    .raw()
                    .toBuffer({ resolveWithObject: true });
                const imageDataLike = {
                    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
                    width: info.width,
                    height: info.height,
                };
                if (verbose)
                    console.log('📦 Encoding JPEG XL using @jsquash/jxl (WASM)');
                await ensureJxlEncoderReady();
                const jxlBuffer = await encodeJxl(imageDataLike, {
                    quality: jpegxlQuality,
                });
                await fs.promises.writeFile(finalJxl, Buffer.from(jxlBuffer));
                console.log(`✅ Created: ${finalJxl}`);
            }
            catch (err) {
                console.error(`❌ Failed to convert to jpegxl: ${getErrorMessage(err)}`);
                logVerboseErrorDetails(err, verbose);
            }
            continue;
        }
        // Handle regular sharp-supported formats
        const outputPath = ensureOutputDoesNotClobberInput(`${outputBase}.${format}`, filePath, verbose);
        if (verbose)
            console.log(`🔍 Converting: ${filePath} → ${outputPath}`);
        // Confirm overwrite if file already exists
        if (fs.existsSync(outputPath) && !overwriteAll) {
            const choice = await promptOverwrite(outputPath);
            if (choice === 'no')
                continue;
            if (choice === 'quit') {
                rl.close();
                console.log('🛑 Aborted by user.');
                process.exit(0);
            }
            if (choice === 'all')
                overwriteAll = true;
        }
        try {
            const sharpInstance = createSharpInstance(filePath, verbose);
            if (rotate !== undefined) {
                sharpInstance.rotate(rotate);
            }
            else {
                sharpInstance.rotate();
            }
            if (grayscale)
                sharpInstance.grayscale();
            if (toSrgb)
                sharpInstance.toColourspace('srgb');
            if (width || height) {
                sharpInstance.resize({ width, height, withoutEnlargement });
            }
            const formatQuality = quality?.[format];
            if (formatQuality !== undefined) {
                await sharpInstance
                    .toFormat(format, { quality: formatQuality })
                    .toFile(outputPath);
            }
            else {
                await sharpInstance.toFormat(format).toFile(outputPath);
            }
            console.log(`✅ Converted: ${filePath} -> ${outputPath}`);
        }
        catch (err) {
            console.error(`❌ Failed to convert to ${format}: ${getErrorMessage(err)}`);
            logVerboseErrorDetails(err, verbose);
        }
    }
}
/**
 * Converts all supported image files in a directory to the specified formats.
 *
 * @param dirPath - The path to the directory containing images.
 * @param formats - An array of target formats.
 * @param options - Configuration options for the conversion.
 * @param options.outputDir - Optional directory to save the converted images.
 * @param options.verbose - Whether to enable verbose logging.
 * @param options.width - Optional width to resize the images to.
 * @param options.height - Optional height to resize the images to.
 * @param options.withoutEnlargement - Whether to skip resizing if the image is smaller than the target dimensions.
 * @param options.rotate - Optional angle to rotate the images by.
 * @param options.grayscale - Whether to convert the images to grayscale.
 * @param options.toSrgb - Whether to convert the images to sRGB color space.
 * @param options.quality - Optional per-format quality overrides/defaults used during output.
 * @param options.quality.jpg - JPEG quality value (1-100).
 * @param options.quality.png - PNG quality value (1-100).
 * @param options.quality.webp - WebP quality value (1-100).
 * @param options.quality.avif - AVIF quality value (1-100).
 * @param options.quality.jpegxl - JPEG XL quality value (1-100), passed to the WASM encoder.
 */
async function convertDirectory(dirPath, formats, options) {
    const entries = await fs.promises.readdir(dirPath);
    const imageFiles = entries.filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff'].includes(path.extname(f).toLowerCase()));
    for (const file of imageFiles) {
        await convertImage(path.join(dirPath, file), formats, options);
    }
}
const program = new Command();
program
    .name('image-converter')
    .description('Convert images to different formats using sharp and a WASM JPEG XL encoder')
    .version(pkg.version);
program
    .argument('<source>', 'Image file or directory path')
    .option('-f, --formats <formats...>', 'Target formats (jpg, png, webp, avif, jpegxl, or all)', [])
    .option('-o, --out <dir>', 'Output directory (default: same as source)')
    .option('--verbose', 'Enable detailed logging', false)
    .option('--jpg-quality <number>', 'JPEG output quality (1-100)')
    .option('--png-quality <number>', 'PNG output quality (1-100)')
    .option('--webp-quality <number>', 'WebP output quality (1-100)')
    .option('--avif-quality <number>', 'AVIF output quality (1-100)')
    .option('--jpegxl-quality <number>', 'JPEG XL output quality (1-100)')
    .option('-w, --width <number>', 'Resize to width (pixels)')
    .option('-h, --height <number>', 'Resize to height (pixels)')
    .option('-r, --rotate <angle>', 'Rotate image by angle (degrees)')
    .option('--no-enlargement', 'Do not enlarge image if source is smaller')
    .option('--grayscale', 'Convert to grayscale')
    .option('--to-srgb', 'Convert to sRGB color space')
    .action(async (source, options) => {
    let formats = [];
    // Use all supported output formats by default when --formats is omitted.
    if (options.formats.length === 0 || options.formats.includes('all')) {
        formats = SUPPORTED_FORMATS;
        if (options.verbose)
            console.log(`📦 Using all formats: ${formats.join(', ')}`);
    }
    else {
        // Validate provided formats
        const invalid = options.formats.filter(f => !SUPPORTED_FORMATS.includes(f));
        if (invalid.length > 0) {
            console.error(`❌ Invalid formats: ${invalid.join(', ')}`);
            process.exit(1);
        }
        formats = options.formats;
    }
    const width = options.width ? parseInt(options.width, 10) : undefined;
    const height = options.height ? parseInt(options.height, 10) : undefined;
    const rotate = options.rotate ? parseInt(options.rotate, 10) : undefined;
    const qualityOverrides = {
        jpg: parseQualityOption(options.jpgQuality, '--jpg-quality'),
        png: parseQualityOption(options.pngQuality, '--png-quality'),
        webp: parseQualityOption(options.webpQuality, '--webp-quality'),
        avif: parseQualityOption(options.avifQuality, '--avif-quality'),
        jpegxl: parseQualityOption(options.jpegxlQuality, '--jpegxl-quality'),
    };
    const quality = {
        ...DEFAULT_FORMAT_QUALITY,
        ...Object.fromEntries(Object.entries(qualityOverrides).filter(([, value]) => value !== undefined)),
    };
    try {
        const stat = await fs.promises.stat(source);
        // Process single file or entire directory
        if (stat.isFile()) {
            await convertImage(source, formats, {
                outputDir: options.out,
                verbose: options.verbose,
                width,
                height,
                withoutEnlargement: !options.enlargement,
                rotate,
                grayscale: options.grayscale,
                toSrgb: options.toSrgb,
                quality,
            });
        }
        else if (stat.isDirectory()) {
            await convertDirectory(source, formats, {
                outputDir: options.out,
                verbose: options.verbose,
                width,
                height,
                withoutEnlargement: !options.enlargement,
                rotate,
                grayscale: options.grayscale,
                toSrgb: options.toSrgb,
                quality,
            });
        }
        else {
            console.error('❌ Source must be a file or directory.');
            process.exit(1);
        }
        rl.close();
    }
    catch (err) {
        console.error(`❌ Error: ${getErrorMessage(err)}`);
        logVerboseErrorDetails(err, options.verbose);
        rl.close();
        process.exit(1);
    }
});
// Show help if no arguments are passed
if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
}
// Parse command-line arguments and execute
program.parse(process.argv);
