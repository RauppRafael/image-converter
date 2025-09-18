import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const supportedImageExtension = ['jpeg', 'png', 'webp', 'tiff', 'avif', 'gif'] as const

// adds jpg as alias for jpeg
const imageRegex = new RegExp(`\\.(${ [...supportedImageExtension, 'jpg'].join('|') })$`, 'i')

type SupportedImageExtension = typeof supportedImageExtension[number]

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
                const outputFile = path.join(
                    path.dirname(destPath),
                    path.basename(destPath, path.extname(destPath)) + '.webp',
                )

                await sharp(srcPath)
                    .webp({ quality: 90 })
                    .toFile(outputFile)

                return outputFile
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

                if (!supportedImageExtension.includes(extension as SupportedImageExtension))
                    throw new Error(`Unsupported image format: ${ extension }`)

                await sharp(srcPath)[extension as SupportedImageExtension]({ quality: 90 })
                    .toFile(destPath)

                return destPath
            },
        )
    }

    private async processDirectory(
        srcDir: string,
        destDir: string,
        callback: (srcPath: string, outputFile: string) => Promise<string>,
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
                    const outputFile = await callback(srcPath, destPath)

                    console.log(`Converted: ${ srcPath } → ${ outputFile }`)
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
        }
    }
}