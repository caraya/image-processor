// Import node native modules
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';

// Import image codecs from @jsquash
import * as avif from '@jsquash/avif';
import * as jpeg from '@jsquash/jpeg';
import * as jxl from '@jsquash/jxl';
import * as png from '@jsquash/png';
import * as webp from '@jsquash/webp';

// Resolve file path and directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of supported image formats
const SUPPORTED_FORMATS = [
  'avif',
  'jpeg',
  'jxl',
  'png',
  'webp'
];

/**
 * Decodes an image buffer based on its format.
 * @param {string} sourceType - The format of the source image.
 * @param {Buffer} fileBuffer - The image buffer to decode.
 * @returns {Promise<any>} - The decoded image data.
 */
async function decode(sourceType, fileBuffer) {
  console.log(`Decoding image of type: ${sourceType}`);
  switch (sourceType) {
    case 'avif': return await avif.decode(fileBuffer);
    case 'jpeg': return await jpeg.decode(fileBuffer);
    case 'jxl': return await jxl.decode(fileBuffer);
    case 'png': return await png.decode(fileBuffer);
    case 'webp': return await webp.decode(fileBuffer);
    default: throw new Error(`Unknown source type: ${sourceType}`);
  }
}

/**
 * Encodes image data into the desired format.
 * @param {string} outputType - The desired output format.
 * @param {any} imageData - The image data to encode.
 * @returns {Promise<Buffer>} - The encoded image buffer.
 */
async function encode(outputType, imageData) {
  console.log(`Encoding image to format: ${outputType}`);
  switch (outputType) {
    case 'avif': return await avif.encode(imageData);
    case 'jpeg': return await jpeg.encode(imageData);
    case 'jxl': return await jxl.encode(imageData);
    case 'png': return await png.encode(imageData);
    case 'webp': return await webp.encode(imageData);
    default: throw new Error(`Unknown output type: ${outputType}`);
  }
}

/**
 * Converts a single image file to the specified target formats.
 * @param {string} sourceFile - The source image file path.
 * @param {string[]} targetFormats - List of target formats.
 */
async function convert(sourceFile, targetFormats) {
  console.log(`Processing file: ${sourceFile}`);
  const ext = path.extname(sourceFile).slice(1);
  const sourceType = ext === 'jxl' ? 'jxl' : ext;
  
  if (!SUPPORTED_FORMATS.includes(sourceType)) {
    console.error(`Unsupported source format: ${sourceType}`);
    return;
  }
  
  try {
    const fileBuffer = await fs.readFile(sourceFile);
    const imageData = await decode(sourceType, fileBuffer);
    
    for (const format of targetFormats) {
      console.log(`Converting ${sourceFile} to ${format} format`);
      const outputBuffer = await encode(format, imageData);
      const outputPath = `${sourceFile}.${format}`;
      await fs.writeFile(outputPath, Buffer.from(outputBuffer));
      console.log(`Successfully converted: ${sourceFile} -> ${outputPath}`);
    }
  } catch (error) {
    console.error(`Error processing ${sourceFile}:`, error);
  }
}

/**
 * Processes all files in a directory and converts them to the target formats.
 * @param {string} directory - The directory containing images.
 * @param {string[]} targetFormats - List of target formats.
 */
async function processDirectory(directory, targetFormats) {
  console.log(`Processing directory: ${directory}`);
  try {
    const files = await fs.readdir(directory);
    for (const file of files) {
      const filePath = path.join(directory, file);
      await convert(filePath, targetFormats);
    }
  } catch (error) {
    console.error(`Error reading directory ${directory}:`, error);
  }
}

/**
 * Parses command-line arguments.
 * @returns {{inputPath: string, targetFormats: string[]}} - Parsed input path and target formats.
 */
function parseArguments() {
  if (argv.length < 4) {
    console.log(`Usage:
    node index.mjs <file|directory> <format|all>
    `);
    process.exit(1);
  }
  
  const inputPath = argv[2];
  const format = argv[3];
  const targetFormats = format === 'all' ? SUPPORTED_FORMATS : [format];
  
  console.log(`Parsed arguments - Input: ${inputPath}, Target Formats: ${targetFormats.join(', ')}`);
  return { inputPath, targetFormats };
}

/**
 * Main execution function.
 */
async function main() {
  console.log("Starting image conversion...");
  const { inputPath, targetFormats } = parseArguments();
  
  try {
    const stats = await fs.stat(inputPath);
    if (stats.isFile()) {
        console.log(`Detected single file: ${inputPath}`);
        await convert(inputPath, targetFormats);
    } else if (stats.isDirectory()) {
        console.log(`Detected directory: ${inputPath}`);
        await processDirectory(inputPath, targetFormats);
    } else {
        console.error('Invalid input path');
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing path ${inputPath}:`, error);
  }
}

main();
