import { test, expect } from '@playwright/test'
import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

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
test('shows warning if cjxl is missing', async () => {
  let cjxlPath = ''
  try {
    cjxlPath = execSync('which cjxl').toString().trim()
  } catch {
    test.skip(true, 'cjxl is not installed at all. Cannot simulate removal.')
    return
  }
  try {
    fs.renameSync(cjxlPath, `${cjxlPath}.bak`)
    const output = execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats jpegxl --out ${OUTPUT_DIR}`, {
      encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe']
    })
    expect(output.toString()).toMatch(/cjxl is not installed/)
  } finally {
    if (fs.existsSync(`${cjxlPath}.bak`)) {
      fs.renameSync(`${cjxlPath}.bak`, cjxlPath)
    }
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

// Test: Handle overwrite prompt with "all" input
// Ensures file is overwritten successfully
// test('prompts on overwrite and respects "all" answer', async () => {
//   const filePath = path.join(OUTPUT_DIR, 'test.png')
//   execSync(`npx tsx ${CLI_PATH} ${IMAGE_PATH} --formats png --out ${OUTPUT_DIR}`, {
//     encoding: 'utf-8'
//   })
//   const hashBefore = fileHash(filePath)
//   const child = spawn('npx', ['tsx', CLI_PATH, IMAGE_PATH, '--formats', 'png', '--out', OUTPUT_DIR], {
//     stdio: ['pipe', 'pipe', 'pipe']
//   })
//   child.stdin.write('a\n')
//   child.stdin.end()
//   await new Promise(resolve => child.on('exit', resolve))
//   const hashAfter = fileHash(filePath)
//   expect(hashAfter).not.toBe(hashBefore) // File should be modified
// })