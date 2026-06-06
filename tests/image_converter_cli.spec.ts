import { test, expect } from '@playwright/test'
import { execSync, spawn } from 'child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url';
import sharp from 'sharp'

// emulate __dirname in ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Path to the CLI entry file
const CLI_PATH = path.resolve(__dirname, '../src/index.ts')
// Path to a test image used for conversion
const IMAGE_PATH = path.resolve(__dirname, 'fixtures/test.jpg')
// Directory to store test output files
const OUTPUT_DIR = path.resolve(__dirname, 'converted-test')

// Create a file hash to verify overwrite behavior
function fileHash(filePath: string): string {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('md5').update(content).digest('hex')
}

// Ensure the output directory is clean before each test
function cleanOutput() {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

test.beforeEach(() => {
  cleanOutput()
})

test.afterAll(() => {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true })
})

test.describe('Basic Conversion', () => {
  // Test: Convert image without specifying --formats
  // Verifies default behavior outputs all sharp-native formats
  test('defaults to all output formats when --formats is omitted', async () => {
    execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --out ${OUTPUT_DIR}`, {
      encoding: 'utf-8',
    })

    const jpg = path.join(OUTPUT_DIR, 'test.jpg')
    const png = path.join(OUTPUT_DIR, 'test.png')
    const webp = path.join(OUTPUT_DIR, 'test.webp')
    const avif = path.join(OUTPUT_DIR, 'test.avif')

    expect(fs.existsSync(jpg)).toBeTruthy()
    expect(fs.existsSync(png)).toBeTruthy()
    expect(fs.existsSync(webp)).toBeTruthy()
    expect(fs.existsSync(avif)).toBeTruthy()
  })

  // Test: Convert image to a single format
  // Verifies PNG output is generated
  test('converts image to one format', async () => {
    const result = execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR}`, {
      encoding: 'utf-8',
    })
    const outputFile = path.join(OUTPUT_DIR, 'test.png')
    expect(fs.existsSync(outputFile)).toBeTruthy()
    expect(result).toContain('✅ Converted')
  })

  // Test: Convert image to multiple formats
  // Verifies JPG, WEBP, and AVIF outputs are generated
  test('converts image to multiple formats', async () => {
    const result = execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats jpg webp avif --out ${OUTPUT_DIR}`, {
      encoding: 'utf-8',
    })
    const jpg = path.join(OUTPUT_DIR, 'test.jpg')
    const webp = path.join(OUTPUT_DIR, 'test.webp')
    const avif = path.join(OUTPUT_DIR, 'test.avif')
    expect(fs.existsSync(jpg)).toBeTruthy()
    expect(fs.existsSync(webp)).toBeTruthy()
    expect(fs.existsSync(avif)).toBeTruthy()
    expect(result).toContain('✅ Converted')
  })
})

test.describe('CLI Behavior', () => {
  // Test: Show help output when no arguments are given
  // Ensures CLI displays usage information
  test('shows help message when no parameters are provided', async () => {
    const result = execSync(`npx tsx ${CLI_PATH}`, {
      encoding: 'utf-8',
    })
    expect(result).toContain('Usage:')
    expect(result).toContain('Convert images to different formats')
  })

  // Test: Handle invalid format argument
  // Ensures the CLI returns an appropriate error message
  test('handles invalid format input', async () => {
    try {
      execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats foo --out ${OUTPUT_DIR}`, {
        encoding: 'utf-8', stdio: 'pipe'
      })
    } catch (error: any) {
      expect(error.message).toContain('❌ Invalid formats')
    }
  })

  // Test: Handle overwrite prompt with "no" input
  // Ensures file is not overwritten
  test('prompts on overwrite and respects "no" answer', async () => {
    const filePath = path.join(OUTPUT_DIR, 'test.png')
    execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR}`, {
      encoding: 'utf-8'
    })
    const hashBefore = fileHash(filePath)
    const child = spawn('npx', ['tsx', CLI_PATH, IMAGE_PATH, '--formats', 'png', '--out', OUTPUT_DIR], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    child.stdin.write('n\n')
    child.stdin.end()
    await new Promise(resolve => child.on('exit', resolve))
    const hashAfter = fileHash(filePath)
    expect(hashAfter).toBe(hashBefore) // File should remain unchanged
  })

  // Test: Avoid in-place overwrite when source and output paths are identical
  // Ensures a numeric suffix is added instead of prompting for overwrite
  test('adds numeric suffix when output would overwrite input', async () => {
    const inputAvif = path.join(OUTPUT_DIR, 'source.avif')
    await sharp(IMAGE_PATH).toFormat('avif').toFile(inputAvif)

    execSync(`npx tsx ${CLI_PATH} ${inputAvif} --formats avif`, {
      encoding: 'utf-8',
    })

    const suffixedOutput = path.join(OUTPUT_DIR, 'source-1.avif')
    expect(fs.existsSync(inputAvif)).toBeTruthy()
    expect(fs.existsSync(suffixedOutput)).toBeTruthy()
  })
})

test.describe('JPEG XL (WASM)', () => {
  // Test: JPEG XL conversion via WASM encoder
  test('converts image to jpegxl using @jsquash/jxl', async () => {
    const result = execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats jpegxl --out ${OUTPUT_DIR}`, {
      encoding: 'utf-8',
    })
    const jxl = path.join(OUTPUT_DIR, 'test.jxl')
    expect(fs.existsSync(jxl)).toBeTruthy()
    expect(result).toContain('✅ Created:')
  })
})

test.describe('Resizing', () => {
  // Test: Resize image with specified width and height
  test('resizes image with given width and height', async () => {
    const width = 100
    const height = 80
    execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR} --width ${width} --height ${height}`, {
      encoding: 'utf-8',
    })
    const outputFile = path.join(OUTPUT_DIR, 'test.png')
    expect(fs.existsSync(outputFile)).toBeTruthy()

    const metadata = await sharp(outputFile).metadata()
    expect(metadata.width).toBe(width)
    expect(metadata.height).toBe(height)
  })

  // Test: Resize image with specified width, maintaining aspect ratio
  test('resizes image with given width and maintains aspect ratio', async () => {
    const width = 150
    execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR} --width ${width}`, {
      encoding: 'utf-8',
    })
    const outputFile = path.join(OUTPUT_DIR, 'test.png')
    expect(fs.existsSync(outputFile)).toBeTruthy()

    const metadata = await sharp(outputFile).metadata()
    const originalMetadata = await sharp(IMAGE_PATH).metadata()
    const expectedHeight = Math.round((originalMetadata.height! / originalMetadata.width!) * width)

    expect(metadata.width).toBe(width)
    expect(metadata.height).toBe(expectedHeight)
  })

  // Test: Resize image with specified height, maintaining aspect ratio
  test('resizes image with given height and maintains aspect ratio', async () => {
      const height = 120
      execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR} --height ${height}`, {
          encoding: 'utf-8',
      })
      const outputFile = path.join(OUTPUT_DIR, 'test.png')
      expect(fs.existsSync(outputFile)).toBeTruthy()

      const metadata = await sharp(outputFile).metadata()
      const originalMetadata = await sharp(IMAGE_PATH).metadata()
      const expectedWidth = Math.round((originalMetadata.width! / originalMetadata.height!) * height)

      expect(metadata.height).toBe(height)
      expect(metadata.width).toBe(expectedWidth)
  })

  // Test: Resize with enlargement (default behavior)
  test('enlarges image when target width is greater than original', async () => {
    const originalMetadata = await sharp(IMAGE_PATH).metadata()
    const targetWidth = (originalMetadata.width || 0) + 100

    execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR} --width ${targetWidth}`, {
      encoding: 'utf-8',
    })
    const outputFile = path.join(OUTPUT_DIR, 'test.png')
    const outputMetadata = await sharp(outputFile).metadata()
    
    expect(outputMetadata.width).toBe(targetWidth)
  })

  // Test: Resize without enlargement
  test('does not enlarge image when --no-enlargement is set', async () => {
    const originalMetadata = await sharp(IMAGE_PATH).metadata()
    const targetWidth = (originalMetadata.width || 0) + 100

    execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR} --width ${targetWidth} --no-enlargement`, {
      encoding: 'utf-8',
    })
    const outputFile = path.join(OUTPUT_DIR, 'test.png')
    const outputMetadata = await sharp(outputFile).metadata()
    
    expect(outputMetadata.width).toBe(originalMetadata.width)
  })
})

test.describe('Rotation', () => {
  // Test: Auto-rotate image based on EXIF data
  test('auto-rotates image based on EXIF orientation', async () => {
    const inputPath = path.join(OUTPUT_DIR, 'input-rotated.jpg')
    
    // Create a 100x50 image with Orientation 6 (Rotated 90 CW)
    // Visually, it should be 50x100.
    await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .withMetadata({ orientation: 6 })
    .toFile(inputPath)

    execSync(`npx tsx ${CLI_PATH} ${inputPath} --formats png --out ${OUTPUT_DIR}`, {
      encoding: 'utf-8',
    })
    
    const outputFile = path.join(OUTPUT_DIR, 'input-rotated.png')
    const metadata = await sharp(outputFile).metadata()
    
    // Expect dimensions to be swapped because of rotation (100x50 -> 50x100)
    expect(metadata.width).toBe(50)
    expect(metadata.height).toBe(100)
  })

  // Test: Manual rotation
  test('manually rotates image by specified angle', async () => {
    const inputPath = path.join(OUTPUT_DIR, 'input-manual-rotate.jpg')
    
    // Create a 100x50 image (landscape)
    await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    })
    .toFile(inputPath)

    // Rotate by 90 degrees
    execSync(`npx tsx ${CLI_PATH} ${inputPath} --formats png --out ${OUTPUT_DIR} --rotate 90`, {
      encoding: 'utf-8',
    })
    
    const outputFile = path.join(OUTPUT_DIR, 'input-manual-rotate.png')
    const metadata = await sharp(outputFile).metadata()
    
    // Expect dimensions to be swapped (100x50 -> 50x100)
    expect(metadata.width).toBe(50)
    expect(metadata.height).toBe(100)
  })
})

test.describe('Color Operations', () => {
  test('converts image to grayscale', async () => {
    execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR} --grayscale`, {
      encoding: 'utf-8',
    })
    const outputFile = path.join(OUTPUT_DIR, 'test.png')
    const metadata = await sharp(outputFile).metadata()
    // Sharp might keep 3 channels but set space to b-w or similar, or reduce channels.
    // Checking color space is more reliable for grayscale conversion intent.
    // However, sharp.grayscale() usually results in 1 or 2 channels.
    // If the input image has an alpha channel, it might be 2. If RGB, it becomes 1.
    // Let's check if it's NOT srgb/rgb or if channels are reduced.
    // Actually, let's just check if the output is indeed grayscale by checking the space or channels.
    // If channels is 3, it might still be grayscale but represented in RGB.
    // Let's check if the space is 'b-w' or 'gray' OR channels < 3.
    // Note: 'gray' is not in the strict type definition but can be returned by libvips
    // When converting to PNG with sharp.grayscale(), it might still be srgb with 3 channels but visually grayscale.
    // However, usually sharp reduces channels.
    // If it fails, let's check if we can verify pixel data or just trust the command ran without error?
    // Actually, for PNG, sharp might output 3 channels even if grayscale if not explicitly forced to 1 channel.
    // But .grayscale() should produce a grayscale image.
    // Let's check if the output file exists and the command succeeded (which we did).
    // To be more robust, we can check if the image is visually grayscale, but that's hard.
    // Let's relax the check or check for 'srgb' space which is what we saw in debug output.
    // Wait, the debug output showed space: 'srgb', channels: 3. This means .grayscale() didn't force single channel output for PNG.
    // This is expected behavior for some formats/settings.
    // Let's check if we can force it or if we should just accept it.
    // For the purpose of this test, let's verify the command runs.
    // We can also check if the file size is significantly smaller? Not necessarily.
    // Let's check if we can use .toColourspace('b-w') instead of .grayscale() in the implementation?
    // No, .grayscale() is the correct API.
    // Let's update the test to just verify the file is created and maybe check if it looks like grayscale?
    // Actually, let's check if we can use `sharp(outputFile).stats()` to see if all channels have same stats (R=G=B).
    const stats = await sharp(outputFile).stats();
    // In a grayscale image represented as RGB, the mean of all channels should be roughly equal.
    const [r, g, b] = stats.channels;
    const isGrayscale = Math.abs(r.mean - g.mean) < 1 && Math.abs(g.mean - b.mean) < 1;
    expect(isGrayscale).toBeTruthy();
  })

  test('converts image to sRGB', async () => {
    execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR} --to-srgb`, {
      encoding: 'utf-8',
    })
    const outputFile = path.join(OUTPUT_DIR, 'test.png')
    const metadata = await sharp(outputFile).metadata()
    expect(metadata.space).toBe('srgb')
  })
})
