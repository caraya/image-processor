#!/usr/bin/env node

// Node built-in modules
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
// Third-party modules
import * as readline from 'readline'
import { Command } from 'commander'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

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
 */
async function convertImage(
  filePath: string,
  formats: string[],
  options: {
    outputDir?: string
    verbose?: boolean
    width?: number
    height?: number
  }
): Promise<void> {
  const { outputDir, verbose, width, height } = options
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
        if (width || height) {
          sharpInstance.resize(width, height)
        }
        await sharpInstance.toFormat('png').toFile(intermediatePng)
        if (verbose) console.log(`📦 Running: cjxl ${intermediatePng} ${finalJxl}`)

        // Spawn cjxl subprocess to convert PNG to JXL
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('cjxl', [intermediatePng, finalJxl], {
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
      if (width || height) {
        sharpInstance.resize(width, height)
      }
      await sharpInstance.toFormat(format as keyof sharp.FormatEnum).toFile(outputPath)
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
 */
async function convertDirectory(
  dirPath: string,
  formats: string[],
  options: {
    outputDir?: string
    verbose?: boolean
    width?: number
    height?: number
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
  .option('-w, --width <number>', 'Resize to width (pixels)')
  .option('-h, --height <number>', 'Resize to height (pixels)')
  .action(async (source: string, options: {
    formats: string[]
    out?: string
    verbose?: boolean
    width?: string
    height?: string
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

    try {
      const stat = await fs.promises.stat(source)
      // Process single file or entire directory
      if (stat.isFile()) {
        await convertImage(source, formats, {
          outputDir: options.out,
          verbose: options.verbose,
          width,
          height,
        })
      } else if (stat.isDirectory()) {
        await convertDirectory(source, formats, {
          outputDir: options.out,
          verbose: options.verbose,
          width,
          height,
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