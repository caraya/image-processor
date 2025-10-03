#!/usr/bin/env node
import { createRequire as _createRequire } from "module";
const __require = _createRequire(import.meta.url);
// Node built-in modules
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync, spawn } from 'node:child_process';
// Third-party modules
import * as readline from 'readline';
import { Command } from 'commander';
const sharp = __require("sharp");
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
// Check if cjxl CLI is available on the system
function checkCjxlAvailability() {
    try {
        execSync('cjxl --version', { stdio: 'ignore' });
    }
    catch {
        console.warn('⚠️  cjxl is not installed or not in your PATH. JPEG XL output will fail.');
    }
}
// Prompt user whether to overwrite an existing file
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
// Convert a single image file to multiple formats
async function convertImage(filePath, formats, outputDir, verbose = false) {
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const inputDir = path.dirname(filePath);
    for (const format of formats) {
        const targetDir = outputDir || inputDir;
        await fs.promises.mkdir(targetDir, { recursive: true });
        const outputBase = path.join(targetDir, baseName);
        // Special handling for jpegxl using cjxl CLI
        if (format === 'jpegxl') {
            const intermediatePng = `${outputBase}.temp.png`;
            const finalJxl = `${outputBase}.jxl`;
            if (verbose)
                console.log(`🔧 Creating intermediate PNG for JXL: ${intermediatePng}`);
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
                // Convert original file to intermediate PNG
                await sharp(filePath).toFormat('png').toFile(intermediatePng);
                if (verbose)
                    console.log(`📦 Running: cjxl ${intermediatePng} ${finalJxl}`);
                // Spawn cjxl subprocess to convert PNG to JXL
                await new Promise((resolve, reject) => {
                    const proc = spawn('cjxl', [intermediatePng, finalJxl], {
                        stdio: verbose ? 'inherit' : 'ignore',
                    });
                    proc.on('error', (err) => reject(new Error(`cjxl error: ${err.message}`)));
                    proc.on('exit', (code) => {
                        if (code !== 0)
                            reject(new Error(`cjxl exited with code ${code}`));
                        else {
                            fs.unlink(intermediatePng, () => { }); // remove temp file
                            resolve();
                        }
                    });
                });
                console.log(`✅ Created: ${finalJxl}`);
            }
            catch (err) {
                console.error(`❌ Failed to convert to jpegxl: ${err.message}`);
            }
            continue;
        }
        // Handle regular sharp-supported formats
        const outputPath = `${outputBase}.${format}`;
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
            await sharp(filePath).toFormat(format).toFile(outputPath);
            console.log(`✅ Converted: ${filePath} -> ${outputPath}`);
        }
        catch (err) {
            console.error(`❌ Failed to convert to ${format}: ${err.message}`);
        }
    }
}
// Convert all image files within a directory
async function convertDirectory(dirPath, formats, outputDir, verbose = false) {
    const entries = await fs.promises.readdir(dirPath);
    const imageFiles = entries.filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(path.extname(f).toLowerCase()));
    for (const file of imageFiles) {
        await convertImage(path.join(dirPath, file), formats, outputDir, verbose);
    }
}
const program = new Command();
program
    .name('image-converter')
    .description('Convert images to different formats using sharp and cjxl')
    .version('1.4.0');
program
    .argument('<source>', 'Image file or directory path')
    .option('-f, --formats <formats...>', 'Target formats (jpg, png, webp, avif, jpegxl, or all)', [])
    .option('-o, --out <dir>', 'Output directory (default: same as source)')
    .option('--verbose', 'Enable detailed logging', false)
    .action(async (source, options) => {
    checkCjxlAvailability(); // Warn if cjxl isn't available
    let formats = [];
    // Allow 'all' keyword to select all supported formats
    if (options.formats.includes('all')) {
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
    try {
        const stat = await fs.promises.stat(source);
        // Process single file or entire directory
        if (stat.isFile()) {
            await convertImage(source, formats, options.out, options.verbose);
        }
        else if (stat.isDirectory()) {
            await convertDirectory(source, formats, options.out, options.verbose);
        }
        else {
            console.error('❌ Source must be a file or directory.');
            process.exit(1);
        }
        rl.close();
    }
    catch (err) {
        console.error(`❌ Error: ${err.message}`);
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
