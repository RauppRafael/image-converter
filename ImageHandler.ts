import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const supportedFormats = ['jpeg', 'png', 'webp', 'tiff', 'avif', 'gif'] as const
const imageRegex = new RegExp(`\\.(${ supportedFormats.join('|') })$`, 'i')

type ImageFormat = typeof supportedFormats[number]

export class ImageHandler {
    public constructor(
        public readonly inputDirectory: string,
        public readonly outputDirectory: string,
    ) {
    }

    public toWebp() {
        return this.processDirectory(
            this.inputDirectory,
            this.outputDirectory,
            async (srcPath, destPath) => {
                const outputFile = destPath.replace(/\.(jpe?g)$/i, '.webp')

                await sharp(srcPath)
                    .webp({ quality: 90 })
                    .toFile(outputFile)
            },
        )
    }

    public async compress() {
        return this.processDirectory(
            this.inputDirectory,
            this.outputDirectory,
            async (srcPath, destPath) => {
                let extension = path.extname(srcPath).toLowerCase().replace('.', '')

                if (extension === 'jpg')
                    extension = 'jpeg'

                if (!supportedFormats.includes(extension as ImageFormat))
                    throw new Error(`Unsupported image format: ${ extension }`)

                await sharp(srcPath)[extension as ImageFormat]({ quality: 90 })
                    .toFile(destPath)
            },
        )
    }

    private async processDirectory(
        srcDir: string,
        destDir: string,
        callback: (srcPath: string, outputFile: string) => Promise<void>,
    ) {
        // Ensure destination folder exists
        if (!fs.existsSync(destDir))
            fs.mkdirSync(destDir, { recursive: true })

        const entries = fs.readdirSync(srcDir, { withFileTypes: true })

        for (const entry of entries) {
            const srcPath = path.join(srcDir, entry.name)
            const destPath = path.join(destDir, entry.name)

            if (entry.isDirectory()) {
                // Recursively handle subfolder
                await this.processDirectory(srcPath, destPath, callback)
            }
            else if (entry.isFile() && imageRegex.test(entry.name)) {
                try {
                    await callback(srcPath, destPath)

                    console.log(`Converted: ${ srcPath } → ${ destPath }`)
                }
                catch (err) {
                    console.error(`Error converting ${ srcPath }:`, err)
                }
            }
        }
    }
}