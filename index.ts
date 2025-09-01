import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const inputDir = './inputs'
const outputDir = './outputs'

async function convertFolder(srcDir: string, destDir: string): Promise<void> {
    // Ensure destination folder exists
    if (!fs.existsSync(destDir)) 
        fs.mkdirSync(destDir, { recursive: true })

    const entries = fs.readdirSync(srcDir, { withFileTypes: true })

    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name)
        const destPath = path.join(destDir, entry.name)

        if (entry.isDirectory()) {
            // Recursively handle subfolder
            await convertFolder(srcPath, destPath)
        }
        else if (entry.isFile() && /\.(jpe?g)$/i.test(entry.name)) {
            const outFile = destPath.replace(/\.(jpe?g)$/i, '.webp')

            try {
                await sharp(srcPath)
                    .webp({ quality: 90 }) // or { quality: 100 } if you want near-lossless smaller files
                    .toFile(outFile)

                console.log(`Converted: ${ srcPath } → ${ outFile }`)
            }
            catch (err) {
                console.error(`Error converting ${ srcPath }:`, err)
            }
        }
    }
}

convertFolder(inputDir, outputDir)
    .catch(err => console.error('Unexpected error:', err))
