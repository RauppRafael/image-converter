import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

// NOTE: HEIC (HEVC-compressed HEIF) support was removed. The prebuilt sharp
// binaries ship a libheif without an HEVC encoder, so `.heic` files cannot be
// re-encoded reliably across platforms. HEIF (AV1) is still supported.
const supportedInputFormats = ['jpeg', 'png', 'webp', 'tiff', 'avif', 'gif', 'heif', 'jpg'] as const

const supportedOutputFormats = ['jpeg', 'png', 'webp', 'tiff', 'avif', 'gif'] as const

const imageRegex = new RegExp(`\\.(${ supportedInputFormats.join('|') })$`, 'i')

type SupportedOutputFormat = typeof supportedOutputFormats[number]
type ProcessingFunction = (srcPath: string, outputFile: string) => Promise<void>

export interface CompressOptions {
    maxWidth?: number
    maxHeight?: number
    /** Total pixel-area cap in megapixels (e.g. 25 for Shopify). Applied alongside any dim caps; tightest wins. */
    maxMegapixels?: number
    quality?: number
}

export class ImageHandler {
    private sizes: number[] = []

    public constructor(
        public readonly inputDirectory: string,
        public readonly outputDirectory: string,
    ) {
    }

    public toWebp() {
        return this.process(
            async (srcPath, destPath) => {
                const outputFile = path.join(
                    path.dirname(destPath),
                    path.basename(destPath, path.extname(destPath)) + '.webp',
                )

                // .rotate() with no args bakes EXIF orientation into the pixels
                // and clears the tag, preventing phone photos from appearing rotated
                // after re-encoding.
                const processedImage = await sharp(srcPath)
                    .rotate()
                    .resize({
                        width: 2400,
                        height: 2400,
                        fit: 'inside',
                        withoutEnlargement: true,
                    })
                    .webp({
                        quality: 90,
                        effort: 6,
                    })
                    .toFile(outputFile)

                const originalStats = fs.statSync(srcPath)
                const originalSizeMB = (originalStats.size / (1024 * 1024)).toFixed(2)
                const processedSizeMB = processedImage.size / (1024 * 1024)

                this.sizes.push(processedSizeMB)

                console.log(`Converted: ${ originalSizeMB }MB → ${ processedSizeMB.toFixed(2) }MB | ${ srcPath } → ${ outputFile }`)
            },
        )
    }

    public toJpg() {
        return this.process(
            async (srcPath, destPath) => {
                const outputFile = path.join(
                    path.dirname(destPath),
                    path.basename(destPath, path.extname(destPath)) + '.jpg',
                )

                const processedImage = await sharp(srcPath)
                    .rotate()
                    .jpeg({
                        quality: 85,
                    })
                    .toFile(outputFile)

                const originalStats = fs.statSync(srcPath)
                const originalSizeMB = (originalStats.size / (1024 * 1024)).toFixed(2)
                const processedSizeMB = processedImage.size / (1024 * 1024)

                this.sizes.push(processedSizeMB)

                console.log(`Converted: ${ originalSizeMB }MB → ${ processedSizeMB.toFixed(2) }MB | ${ srcPath } → ${ outputFile }`)
            },
        )
    }

    public compress(options: CompressOptions = {}) {
        const { maxWidth, maxHeight, maxMegapixels, quality = 95 } = options

        return this.process(
            async (srcPath, destPath) => {
                let extension = path.extname(srcPath).toLowerCase().replace('.', '')

                if (extension === 'jpg')
                    extension = 'jpeg'

                let pipeline = sharp(srcPath).rotate()

                const target = await computeTargetSize(srcPath, { maxWidth, maxHeight, maxMegapixels })

                if (target) {
                    pipeline = pipeline.resize({
                        width: target.width,
                        height: target.height,
                        fit: 'inside',
                        withoutEnlargement: true,
                    })
                }

                // HEIF is re-encoded to JPEG because re-encoding to HEIF
                // requires an AV1/HEVC encoder that isn't consistently
                // available across sharp's prebuilt binaries.
                if (extension === 'heif') {
                    const outputPath = destPath.replace(/\.heif$/i, '.jpg')

                    await pipeline.jpeg({ quality }).toFile(outputPath)
                }
                else if (supportedOutputFormats.includes(extension as SupportedOutputFormat)) {
                    await pipeline[extension as SupportedOutputFormat]({ quality }).toFile(destPath)
                }
                else {
                    throw new Error(`Unsupported image format: ${ extension }`)
                }
            },
        )
    }

    private async process(processingFunction: ProcessingFunction) {
        await this.processDirectory(
            this.inputDirectory,
            this.outputDirectory,
            processingFunction,
        )

        if (this.sizes.length > 0) {
            const avg = this.sizes.reduce((a, b) => a + b, 0) / this.sizes.length

            console.log('avg size:', avg.toFixed(2), 'MB')
        }
    }

    private async processDirectory(
        srcDir: string,
        destDir: string,
        processingFunction: ProcessingFunction,
    ) {
        // Ensure destination folder exists
        if (!fs.existsSync(destDir))
            fs.mkdirSync(destDir, { recursive: true })

        const entries = fs.readdirSync(srcDir, { withFileTypes: true })

        await Promise.all(entries.map(async entry => {
            const srcPath = path.join(srcDir, entry.name)
            const destPath = path.join(destDir, entry.name)

            if (entry.isDirectory()) {
                // Recursively handle subfolder
                await this.processDirectory(srcPath, destPath, processingFunction)
            }
            else if (entry.isFile() && imageRegex.test(entry.name)) {
                try {
                    await processingFunction(srcPath, destPath)
                }
                catch (err) {
                    console.error(`Error converting ${ srcPath }:`, err)
                }
            }
            else if (entry.name === '.gitkeep') {
                // ignore .gitkeep files
            }
            else {
                console.error(`Unable to process unsupported file: ${ entry.name }: ${ entry.name }`)
            }
        }))
    }
}

/**
 * Returns the target dimensions if the source exceeds any of the configured caps,
 * or `null` if no resize is needed. Accounts for EXIF orientation swapping W/H.
 */
async function computeTargetSize(
    srcPath: string,
    caps: { maxWidth?: number, maxHeight?: number, maxMegapixels?: number },
): Promise<{ width: number, height: number } | null> {
    const { maxWidth, maxHeight, maxMegapixels } = caps

    if (!maxWidth && !maxHeight && !maxMegapixels)
        return null

    const meta = await sharp(srcPath).metadata()

    if (!meta.width || !meta.height)
        return null

    // EXIF orientations 5-8 swap width/height when rendered.
    const orientationSwaps = meta.orientation !== undefined && meta.orientation >= 5 && meta.orientation <= 8
    const srcW = orientationSwaps ? meta.height : meta.width
    const srcH = orientationSwaps ? meta.width : meta.height

    const scales = [1]

    if (maxWidth)
        scales.push(maxWidth / srcW)

    if (maxHeight)
        scales.push(maxHeight / srcH)

    if (maxMegapixels)
        scales.push(Math.sqrt((maxMegapixels * 1_000_000) / (srcW * srcH)))

    const scale = Math.min(...scales)

    if (scale >= 1)
        return null

    return {
        width: Math.max(1, Math.round(srcW * scale)),
        height: Math.max(1, Math.round(srcH * scale)),
    }
}