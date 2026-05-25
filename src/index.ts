#!/usr/bin/env node

// Node built-in modules
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
// Third-party modules
import * as readline from 'readline'
import { Command } from 'commander'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

type FormatQuality = {
  jpg?: number
  png?: number
  webp?: number
  avif?: number
  jpegxl?: number
}

const DEFAULT_FORMAT_QUALITY: Required<FormatQuality> = {
  jpg: 80,
  png: 100,
  webp: 80,
  avif: 50,
  jpegxl: 85,
}

// Supported formats directly by sharp
const SHARP_FORMATS = ['jpg', 'png', 'webp', 'avif']
// All supported formats including jpegxl via cjxl fallback
const SUPPORTED_FORMATS = [...SHARP_FORMATS, 'jpegxl']

// Setup readline interface for interactive prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

let overwriteAll = false

/**
 * Checks if the `cjxl` command-line tool is available in the system's PATH.
 * Logs a warning if it is not found.
 */
function checkCjxlAvailability() {
  try {
    execSync('cjxl --version', { stdio: 'ignore' })
  } catch {
    console.warn('⚠️  cjxl is not installed or not in your PATH. JPEG XL output will fail.')
  }
}

/**
 * Parses and validates a quality option (1-100).
 */
function parseQualityOption(value: string | undefined, optionName: string): number | undefined {
  if (!value) return undefined

  const parsed = parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
    console.error(`❌ ${optionName} must be an integer between 1 and 100.`)
    process.exit(1)
  }

  return parsed
}

/**
 * Prompts the user to confirm overwriting an existing file.
 *
 * @param filePath - The path of the file that already exists.
 * @returns A promise that resolves to the user's choice: 'yes', 'no', 'all', or 'quit'.
 */
async function promptOverwrite(filePath: string): Promise<'yes' | 'no' | 'all' | 'quit'> {
  return new Promise((resolve) => {
    rl.question(`⚠️  File already exists: ${filePath}\nOverwrite? [y]es / [n]o / [a]ll / [q]uit: `, (answer) => {
      const response = answer.trim().toLowerCase()
      if (['y', 'yes'].includes(response)) return resolve('yes')
      if (['n', 'no'].includes(response)) return resolve('no')
      if (['a', 'all'].includes(response)) return resolve('all')
      if (['q', 'quit'].includes(response)) return resolve('quit')
      return resolve('no')
    })
  })
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
 * @param options.quality.jpegxl - JPEG XL quality value (1-100), passed to cjxl.
 */
async function convertImage(
  filePath: string,
  formats: string[],
  options: {
    outputDir?: string
    verbose?: boolean
    width?: number
    height?: number
    withoutEnlargement?: boolean
    rotate?: number
    grayscale?: boolean
    toSrgb?: boolean
    quality?: FormatQuality
  }
): Promise<void> {
  const { outputDir, verbose, width, height, withoutEnlargement, rotate, grayscale, toSrgb, quality } = options
  const ext = path.extname(filePath)
  const baseName = path.basename(filePath, ext)
  const inputDir = path.dirname(filePath)

  for (const format of formats) {
    const targetDir = outputDir || inputDir
    await fs.promises.mkdir(targetDir, { recursive: true })
    const outputBase = path.join(targetDir, baseName)

    // Special handling for jpegxl using cjxl CLI
    if (format === 'jpegxl') {
      const intermediatePng = `${outputBase}.temp.png`
      const finalJxl = `${outputBase}.jxl`
      const jpegxlQuality = quality?.jpegxl

      if (verbose) console.log(`🔧 Creating intermediate PNG for JXL: ${intermediatePng}`)
      const jxlExists = fs.existsSync(finalJxl)

      // Check if file exists and confirm overwrite
      if (jxlExists && !overwriteAll) {
        const choice = await promptOverwrite(finalJxl)
        if (choice === 'no') continue
        if (choice === 'quit') {
          rl.close()
          console.log('🛑 Aborted by user.')
          process.exit(0)
        }
        if (choice === 'all') overwriteAll = true
      }

      try {
        // Convert original file to intermediate PNG
        const sharpInstance = sharp(filePath)
        if (rotate !== undefined) {
          sharpInstance.rotate(rotate)
        } else {
          sharpInstance.rotate()
        }
        if (grayscale) sharpInstance.grayscale()
        if (toSrgb) sharpInstance.toColourspace('srgb')

        if (width || height) {
          sharpInstance.resize({ width, height, withoutEnlargement })
        }
        await sharpInstance.toFormat('png').toFile(intermediatePng)
        const cjxlArgs = [intermediatePng, finalJxl]
        if (jpegxlQuality !== undefined) {
          cjxlArgs.push('--quality', String(jpegxlQuality))
        }
        if (verbose) console.log(`📦 Running: cjxl ${cjxlArgs.join(' ')}`)

        // Spawn cjxl subprocess to convert PNG to JXL
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('cjxl', cjxlArgs, {
            stdio: verbose ? 'inherit' : 'ignore',
          })
          proc.on('error', (err) => reject(new Error(`cjxl error: ${err.message}`)))
          proc.on('exit', (code) => {
            if (code !== 0) reject(new Error(`cjxl exited with code ${code}`))
            else {
              fs.unlink(intermediatePng, () => {}) // remove temp file
              resolve()
            }
          })
        })

        console.log(`✅ Created: ${finalJxl}`)
      } catch (err: any) {
        console.error(`❌ Failed to convert to jpegxl: ${err.message}`)
      }
      continue
    }

    // Handle regular sharp-supported formats
    const outputPath = `${outputBase}.${format}`
    if (verbose) console.log(`🔍 Converting: ${filePath} → ${outputPath}`)

    // Confirm overwrite if file already exists
    if (fs.existsSync(outputPath) && !overwriteAll) {
      const choice = await promptOverwrite(outputPath)
      if (choice === 'no') continue
      if (choice === 'quit') {
        rl.close()
        console.log('🛑 Aborted by user.')
        process.exit(0)
      }
      if (choice === 'all') overwriteAll = true
    }

    try {
      const sharpInstance = sharp(filePath)
      if (rotate !== undefined) {
        sharpInstance.rotate(rotate)
      } else {
        sharpInstance.rotate()
      }
      if (grayscale) sharpInstance.grayscale()
      if (toSrgb) sharpInstance.toColourspace('srgb')

      if (width || height) {
        sharpInstance.resize({ width, height, withoutEnlargement })
      }
      const formatQuality = quality?.[format as keyof FormatQuality]
      if (formatQuality !== undefined) {
        await sharpInstance
          .toFormat(format as keyof sharp.FormatEnum, { quality: formatQuality } as any)
          .toFile(outputPath)
      } else {
        await sharpInstance.toFormat(format as keyof sharp.FormatEnum).toFile(outputPath)
      }
      console.log(`✅ Converted: ${filePath} -> ${outputPath}`)
    } catch (err: any) {
      console.error(`❌ Failed to convert to ${format}: ${err.message}`)
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
 * @param options.quality.jpegxl - JPEG XL quality value (1-100), passed to cjxl.
 */
async function convertDirectory(
  dirPath: string,
  formats: string[],
  options: {
    outputDir?: string
    verbose?: boolean
    width?: number
    height?: number
    withoutEnlargement?: boolean
    rotate?: number
    grayscale?: boolean
    toSrgb?: boolean
    quality?: FormatQuality
  }
) {
  const entries = await fs.promises.readdir(dirPath)
  const imageFiles = entries.filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(path.extname(f).toLowerCase()))
  for (const file of imageFiles) {
    await convertImage(path.join(dirPath, file), formats, options)
  }
}

const program = new Command()

program
  .name('image-converter')
  .description('Convert images to different formats using sharp and cjxl')
  .version(pkg.version)

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
  .action(async (source: string, options: {
    formats: string[]
    out?: string
    verbose?: boolean
    width?: string
    height?: string
    rotate?: string
    jpgQuality?: string
    pngQuality?: string
    webpQuality?: string
    avifQuality?: string
    jpegxlQuality?: string
    enlargement: boolean
    grayscale?: boolean
    toSrgb?: boolean
  }) => {
    checkCjxlAvailability() // Warn if cjxl isn't available

    let formats: string[] = []
    // Allow 'all' keyword to select all supported formats
    if (options.formats.includes('all')) {
      formats = SUPPORTED_FORMATS
      if (options.verbose) console.log(`📦 Using all formats: ${formats.join(', ')}`)
    } else {
      // Validate provided formats
      const invalid = options.formats.filter(f => !SUPPORTED_FORMATS.includes(f))
      if (invalid.length > 0) {
        console.error(`❌ Invalid formats: ${invalid.join(', ')}`)
        process.exit(1)
      }
      formats = options.formats
    }

    const width = options.width ? parseInt(options.width, 10) : undefined
    const height = options.height ? parseInt(options.height, 10) : undefined
    const rotate = options.rotate ? parseInt(options.rotate, 10) : undefined
    const quality: FormatQuality = {
      ...DEFAULT_FORMAT_QUALITY,
      jpg: parseQualityOption(options.jpgQuality, '--jpg-quality'),
      png: parseQualityOption(options.pngQuality, '--png-quality'),
      webp: parseQualityOption(options.webpQuality, '--webp-quality'),
      avif: parseQualityOption(options.avifQuality, '--avif-quality'),
      jpegxl: parseQualityOption(options.jpegxlQuality, '--jpegxl-quality'),
    }

    // Preserve defaults for flags that were not provided.
    if (quality.jpg === undefined) quality.jpg = DEFAULT_FORMAT_QUALITY.jpg
    if (quality.png === undefined) quality.png = DEFAULT_FORMAT_QUALITY.png
    if (quality.webp === undefined) quality.webp = DEFAULT_FORMAT_QUALITY.webp
    if (quality.avif === undefined) quality.avif = DEFAULT_FORMAT_QUALITY.avif
    if (quality.jpegxl === undefined) quality.jpegxl = DEFAULT_FORMAT_QUALITY.jpegxl

    try {
      const stat = await fs.promises.stat(source)
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
        })
      } else if (stat.isDirectory()) {
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
        })
      } else {
        console.error('❌ Source must be a file or directory.')
        process.exit(1)
      }
      rl.close()
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`)
      rl.close()
      process.exit(1)
    }
  })

// Show help if no arguments are passed
if (process.argv.length <= 2) {
  program.outputHelp()
  process.exit(0)
}

// Parse command-line arguments and execute
program.parse(process.argv)