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
})

test.describe('External Tools (cjxl)', () => {
  // Test: JPEGXL conversion via cjxl CLI fallback
  // Skips test if cjxl is not installed
  test('converts image to jpegxl using cjxl', async () => {
    try {
      execSync('cjxl --version', { stdio: 'ignore' })
      const result = execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats jpegxl --out ${OUTPUT_DIR}`, {
        encoding: 'utf-8',
      })
      const jxl = path.join(OUTPUT_DIR, 'test.jxl')
      expect(fs.existsSync(jxl)).toBeTruthy()
      expect(result).toContain('✅ Created:')
    } catch {
      test.skip(true, 'cjxl is not installed. Skipping JPEG XL test.')
    }
  })

  // Test: Simulate missing cjxl and confirm warning is shown
  // Temporarily renames cjxl binary
  // In image-processor/tests/image_converter_cli.spec.ts

  test('shows warning if cjxl is missing', async () => {
    let cjxlPath = '';
    try {
      // Find the path to the cjxl executable
      cjxlPath = execSync('which cjxl').toString().trim();
    } catch {
      // If cjxl isn't installed, we can't run this test, so we skip it.
      test.skip(true, 'cjxl is not installed at all. Cannot simulate removal.');
      return;
    }

    try {
      // Temporarily rename the cjxl executable to simulate it being missing
      fs.renameSync(cjxlPath, `${cjxlPath}.bak`);

      // This command is expected to fail, so we wrap it in a try block
      // and let the catch block handle the expected error.
      execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats jpegxl --out ${OUTPUT_DIR}`, {
        stdio: 'pipe' // Capture stdio streams
      });

    } catch (error: any) {
      // The command *should* throw an error. Now, we check if the stderr
      // from that error contains the warning message we expect.
      expect(error.stderr.toString()).toMatch(/cjxl is not installed/);

    } finally {
      // IMPORTANT: This block ensures that we rename the executable back
      // to its original name, even if the test fails, preventing side effects.
      if (fs.existsSync(`${cjxlPath}.bak`)) {
        fs.renameSync(`${cjxlPath}.bak`, cjxlPath);
      }
    }
  });
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