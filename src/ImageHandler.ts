import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const supportedImageExtension = ['jpeg', 'png', 'webp', 'tiff', 'avif', 'gif'] as const

// adds jpg as alias for jpeg
const imageRegex = new RegExp(`\\.(${ [...supportedImageExtension, 'jpg'].join('|') })$`, 'i')

type SupportedImageExtension = typeof supportedImageExtension[number]
type ProcessingFunction = (srcPath: string, outputFile: string) => Promise<void>

const sizes: number[] = []

export class ImageHandler {
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

                const originalImage = sharp(srcPath)
                const processedImage = await originalImage
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

                sizes.push(processedSizeMB)

                console.log(`Converted: ${ originalSizeMB }MB → ${ processedSizeMB.toFixed(2) }MB | ${ srcPath } → ${ outputFile }`)
            },
        )
    }

    public compress() {
        return this.process(
            async (srcPath, destPath) => {
                let extension = path.extname(srcPath).toLowerCase().replace('.', '')

                if (extension === 'jpg')
                    extension = 'jpeg'

                if (!supportedImageExtension.includes(extension as SupportedImageExtension))
                    throw new Error(`Unsupported image format: ${ extension }`)

                await sharp(srcPath)[extension as SupportedImageExtension]({ quality: 90 })
                    .toFile(destPath)
            },
        )
    }

    private async process(processingFunction: ProcessingFunction) {
        await this.processDirectory(
            this.inputDirectory,
            this.outputDirectory,
            processingFunction,
        )

        console.log('avg size:', (sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(2), 'MB')
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