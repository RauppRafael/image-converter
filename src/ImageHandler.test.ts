import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageHandler } from './ImageHandler'

// Sharp caches decoded files, which on Windows prevents temp dir cleanup
// between tests because the file handles remain open briefly.
beforeAll(() => {
    sharp.cache(false)
})

/**
 * Formats we can actually generate fixtures for using this sharp build.
 * HEIC (HEVC-compressed HEIF) is not included because sharp's prebuilt
 * libheif does not ship with an HEVC encoder.
 */
type WritableInput = 'jpeg' | 'jpg' | 'png' | 'webp' | 'tiff' | 'avif' | 'gif' | 'heif'

async function writeFixture(filePath: string, format: WritableInput, width = 64, height = 64) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    const pipeline = sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 200, g: 100, b: 50 },
        },
    })

    switch (format) {
        case 'jpeg':
        case 'jpg':
            await pipeline.jpeg().toFile(filePath); break
        case 'png':
            await pipeline.png().toFile(filePath); break
        case 'webp':
            await pipeline.webp().toFile(filePath); break
        case 'tiff':
            await pipeline.tiff().toFile(filePath); break
        case 'avif':
            await pipeline.avif().toFile(filePath); break
        case 'gif':
            await pipeline.gif().toFile(filePath); break
        case 'heif':
            await pipeline.heif({ compression: 'av1' }).toFile(filePath); break
    }
}

/**
 * Writes a JPEG with EXIF orientation=6 ("rotate 90° CW to display correctly").
 * The raw pixel buffer is stored as `rawWidth x rawHeight`; a correct viewer
 * should render it at `rawHeight x rawWidth`.
 */
async function writeRotatedJpeg(filePath: string, rawWidth: number, rawHeight: number) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    await sharp({
        create: {
            width: rawWidth,
            height: rawHeight,
            channels: 3,
            background: { r: 10, g: 200, b: 50 },
        },
    })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toFile(filePath)
}

describe('ImageHandler', () => {
    let tmpRoot: string
    let inputDir: string
    let outputDir: string

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'image-handler-'))
        inputDir = path.join(tmpRoot, 'in')
        outputDir = path.join(tmpRoot, 'out')
        fs.mkdirSync(inputDir, { recursive: true })

        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    })

    // avif + heif files are both decoded by libheif and report format "heif"
    const readFormatFor = (ext: string) => ({
        jpeg: 'jpeg',
        jpg: 'jpeg',
        png: 'png',
        webp: 'webp',
        tiff: 'tiff',
        avif: 'heif',
        gif: 'gif',
        heif: 'heif',
    }[ext])

    describe('toWebp across all supported input formats', () => {
        const formats: Array<[WritableInput, string]> = [
            ['jpeg', '.jpg'],
            ['jpg', '.jpg'],
            ['png', '.png'],
            ['webp', '.webp'],
            ['tiff', '.tiff'],
            ['avif', '.avif'],
            ['gif', '.gif'],
            ['heif', '.heif'],
        ]

        it.each(formats)('converts %s (%s) input to WebP', async (fmt, ext) => {
            const inputName = `photo${ ext }`

            await writeFixture(path.join(inputDir, inputName), fmt)

            await new ImageHandler(inputDir, outputDir).toWebp()

            const result = path.join(outputDir, 'photo.webp')

            expect(fs.existsSync(result)).toBe(true)
            expect((await sharp(result).metadata()).format).toBe('webp')
        })
    })

    describe('toJpg across all supported input formats', () => {
        const formats: Array<[WritableInput, string]> = [
            ['jpeg', '.jpg'],
            ['png', '.png'],
            ['webp', '.webp'],
            ['tiff', '.tiff'],
            ['avif', '.avif'],
            ['gif', '.gif'],
            ['heif', '.heif'],
        ]

        it.each(formats)('converts %s (%s) input to JPEG', async (fmt, ext) => {
            await writeFixture(path.join(inputDir, `photo${ ext }`), fmt)

            await new ImageHandler(inputDir, outputDir).toJpg()

            const result = path.join(outputDir, 'photo.jpg')

            expect(fs.existsSync(result)).toBe(true)
            expect((await sharp(result).metadata()).format).toBe('jpeg')
        })
    })

    describe('compress preserves native format', () => {
        const formats: Array<[WritableInput, string]> = [
            ['jpeg', '.jpg'],
            ['png', '.png'],
            ['webp', '.webp'],
            ['tiff', '.tiff'],
            ['avif', '.avif'],
            ['gif', '.gif'],
        ]

        it.each(formats)('compresses %s (%s) in place', async (fmt, ext) => {
            await writeFixture(path.join(inputDir, `photo${ ext }`), fmt)

            await new ImageHandler(inputDir, outputDir).compress()

            const result = path.join(outputDir, `photo${ ext }`)

            expect(fs.existsSync(result)).toBe(true)
            expect((await sharp(result).metadata()).format).toBe(readFormatFor(fmt))
        })

        it('converts .heif input to .jpg (HEIF re-encoding is not guaranteed)', async () => {
            await writeFixture(path.join(inputDir, 'photo.heif'), 'heif')

            await new ImageHandler(inputDir, outputDir).compress()

            expect(fs.existsSync(path.join(outputDir, 'photo.jpg'))).toBe(true)
            expect(fs.existsSync(path.join(outputDir, 'photo.heif'))).toBe(false)
        })

        it('resizes down to maxWidth/maxHeight while preserving aspect ratio', async () => {
            await writeFixture(path.join(inputDir, 'big.png'), 'png', 4000, 2000)

            await new ImageHandler(inputDir, outputDir).compress({ maxWidth: 1000, maxHeight: 1000 })

            const meta = await sharp(path.join(outputDir, 'big.png')).metadata()

            expect(meta.width).toBe(1000)
            expect(meta.height).toBe(500)
        })

        it('does not upscale images already smaller than the limit', async () => {
            await writeFixture(path.join(inputDir, 'small.png'), 'png', 300, 200)

            await new ImageHandler(inputDir, outputDir).compress({ maxWidth: 2400, maxHeight: 2400 })

            const meta = await sharp(path.join(outputDir, 'small.png')).metadata()

            expect(meta.width).toBe(300)
            expect(meta.height).toBe(200)
        })

        it('does not resize when no dimension limits are provided', async () => {
            await writeFixture(path.join(inputDir, 'photo.png'), 'png', 800, 600)

            await new ImageHandler(inputDir, outputDir).compress()

            const meta = await sharp(path.join(outputDir, 'photo.png')).metadata()

            expect(meta.width).toBe(800)
            expect(meta.height).toBe(600)
        })

        it('caps total pixel area to maxMegapixels', async () => {
            // 6000x4000 = 24 MP. Capping at 6 MP should scale by sqrt(6/24) = 0.5
            // → 3000x2000 = 6 MP exactly.
            await writeFixture(path.join(inputDir, 'big.png'), 'png', 6000, 4000)

            await new ImageHandler(inputDir, outputDir).compress({ maxMegapixels: 6 })

            const meta = await sharp(path.join(outputDir, 'big.png')).metadata()

            expect(meta.width).toBe(3000)
            expect(meta.height).toBe(2000)
        })

        it('maxMegapixels handles landscape and portrait aspect ratios equivalently', async () => {
            // Same pixel count, different ratios. Both should cap to 4MP.
            await writeFixture(path.join(inputDir, 'wide.png'), 'png', 4000, 2000)
            await writeFixture(path.join(inputDir, 'tall.png'), 'png', 2000, 4000)

            await new ImageHandler(inputDir, outputDir).compress({ maxMegapixels: 4 })

            const wide = await sharp(path.join(outputDir, 'wide.png')).metadata()
            const tall = await sharp(path.join(outputDir, 'tall.png')).metadata()

            // sqrt(4 / (4000*2000 / 1_000_000)) = sqrt(4/8) ≈ 0.707 → ~2828x1414 and ~1414x2828
            expect(wide.width! * wide.height!).toBeLessThanOrEqual(4_000_000)
            expect(tall.width! * tall.height!).toBeLessThanOrEqual(4_000_000)
            expect(wide.width).toBe(tall.height)
            expect(wide.height).toBe(tall.width)
        })

        it('does not resize when already under the MP cap', async () => {
            await writeFixture(path.join(inputDir, 'small.png'), 'png', 1000, 1000)

            await new ImageHandler(inputDir, outputDir).compress({ maxMegapixels: 25 })

            const meta = await sharp(path.join(outputDir, 'small.png')).metadata()

            expect(meta.width).toBe(1000)
            expect(meta.height).toBe(1000)
        })

        it('applies the tightest constraint when maxMegapixels and maxWidth are both set', async () => {
            // 6000x4000. 6MP cap → 3000x2000. maxWidth=1000 → 1000x667 (tighter).
            await writeFixture(path.join(inputDir, 'big.png'), 'png', 6000, 4000)

            await new ImageHandler(inputDir, outputDir).compress({
                maxMegapixels: 6,
                maxWidth: 1000,
            })

            const meta = await sharp(path.join(outputDir, 'big.png')).metadata()

            expect(meta.width).toBe(1000)
            // Height scales proportionally: 4000 * (1000/6000) ≈ 666.67 → rounds to 667
            expect(meta.height).toBe(667)
        })

        it('honors EXIF orientation when computing MP cap', async () => {
            // Raw 4000x2000 with orientation=6 → displays as 2000x4000 = 8 MP.
            // Cap at 2 MP should scale by sqrt(2/8) = 0.5 → 1000x2000.
            await writeRotatedJpeg(path.join(inputDir, 'rotated.jpg'), 4000, 2000)

            await new ImageHandler(inputDir, outputDir).compress({ maxMegapixels: 2 })

            const meta = await sharp(path.join(outputDir, 'rotated.jpg')).metadata()

            expect(meta.width).toBe(1000)
            expect(meta.height).toBe(2000)
        })

        it('produces smaller files at lower quality', async () => {
            // Noise compresses very differently across JPEG quality levels.
            const pixels = Buffer.alloc(800 * 600 * 3)

            for (let i = 0; i < pixels.length; i++)
                pixels[i] = Math.floor(Math.random() * 256)

            const buffer = await sharp(pixels, { raw: { width: 800, height: 600, channels: 3 } })
                .jpeg()
                .toBuffer()

            fs.writeFileSync(path.join(inputDir, 'photo.jpg'), buffer)

            const highOut = path.join(tmpRoot, 'high')
            const lowOut = path.join(tmpRoot, 'low')

            await new ImageHandler(inputDir, highOut).compress({ quality: 95 })
            await new ImageHandler(inputDir, lowOut).compress({ quality: 20 })

            const highSize = fs.statSync(path.join(highOut, 'photo.jpg')).size
            const lowSize = fs.statSync(path.join(lowOut, 'photo.jpg')).size

            expect(lowSize).toBeLessThan(highSize)
        })

        it('does not treat .heic files as images (HEIC support was removed)', async () => {
            fs.writeFileSync(path.join(inputDir, 'iphone.heic'), Buffer.from([0, 0, 0, 0]))

            const errorSpy = vi.spyOn(console, 'error')

            await new ImageHandler(inputDir, outputDir).compress()

            // Falls through the supported-image branch and hits the "unsupported file" log.
            const logged = errorSpy.mock.calls.some(
                args => args[0]?.toString().includes('iphone.heic'),
            )

            expect(logged).toBe(true)
            expect(fs.existsSync(path.join(outputDir, 'iphone.jpg'))).toBe(false)
            expect(fs.existsSync(path.join(outputDir, 'iphone.heic'))).toBe(false)
        })
    })

    describe('toWebp sizing behavior', () => {
        it('resizes images larger than 2400px down while keeping aspect ratio', async () => {
            await writeFixture(path.join(inputDir, 'big.png'), 'png', 4000, 2000)

            await new ImageHandler(inputDir, outputDir).toWebp()

            const meta = await sharp(path.join(outputDir, 'big.webp')).metadata()

            expect(meta.width).toBe(2400)
            expect(meta.height).toBe(1200)
        })

        it('does not upscale images smaller than 2400px', async () => {
            await writeFixture(path.join(inputDir, 'small.png'), 'png', 300, 200)

            await new ImageHandler(inputDir, outputDir).toWebp()

            const meta = await sharp(path.join(outputDir, 'small.webp')).metadata()

            expect(meta.width).toBe(300)
            expect(meta.height).toBe(200)
        })
    })

    describe('EXIF orientation', () => {
        // Fixture is stored as 200x100 with orientation=6 (rotate 90° CW on display),
        // so a correctly-oriented output must measure 100x200.
        const rawWidth = 200
        const rawHeight = 100
        const expectedWidth = rawHeight
        const expectedHeight = rawWidth

        it('toWebp bakes EXIF orientation into pixels', async () => {
            await writeRotatedJpeg(path.join(inputDir, 'rotated.jpg'), rawWidth, rawHeight)

            await new ImageHandler(inputDir, outputDir).toWebp()

            const meta = await sharp(path.join(outputDir, 'rotated.webp')).metadata()

            expect(meta.width).toBe(expectedWidth)
            expect(meta.height).toBe(expectedHeight)
            expect(meta.orientation ?? 1).toBe(1)
        })

        it('toJpg bakes EXIF orientation into pixels', async () => {
            await writeRotatedJpeg(path.join(inputDir, 'rotated.jpg'), rawWidth, rawHeight)

            await new ImageHandler(inputDir, outputDir).toJpg()

            const meta = await sharp(path.join(outputDir, 'rotated.jpg')).metadata()

            expect(meta.width).toBe(expectedWidth)
            expect(meta.height).toBe(expectedHeight)
            expect(meta.orientation ?? 1).toBe(1)
        })

        it('compress bakes EXIF orientation into pixels', async () => {
            await writeRotatedJpeg(path.join(inputDir, 'rotated.jpg'), rawWidth, rawHeight)

            await new ImageHandler(inputDir, outputDir).compress()

            const meta = await sharp(path.join(outputDir, 'rotated.jpg')).metadata()

            expect(meta.width).toBe(expectedWidth)
            expect(meta.height).toBe(expectedHeight)
            expect(meta.orientation ?? 1).toBe(1)
        })
    })

    describe('directory handling', () => {
        it('preserves nested subdirectory structure', async () => {
            await writeFixture(path.join(inputDir, 'a', 'b', 'c.png'), 'png')

            await new ImageHandler(inputDir, outputDir).toWebp()

            expect(fs.existsSync(path.join(outputDir, 'a', 'b', 'c.webp'))).toBe(true)
        })
    })

    describe('file filtering', () => {
        it('skips .gitkeep files silently', async () => {
            fs.writeFileSync(path.join(inputDir, '.gitkeep'), '')
            await writeFixture(path.join(inputDir, 'photo.png'), 'png')

            const errorSpy = vi.spyOn(console, 'error')

            await new ImageHandler(inputDir, outputDir).toWebp()

            const loggedUnsupported = errorSpy.mock.calls.some(
                args => args[0]?.toString().includes('.gitkeep'),
            )

            expect(loggedUnsupported).toBe(false)
            expect(fs.existsSync(path.join(outputDir, 'photo.webp'))).toBe(true)
        })

        it('logs but does not throw on non-image files', async () => {
            fs.writeFileSync(path.join(inputDir, 'readme.txt'), 'hello')
            await writeFixture(path.join(inputDir, 'photo.png'), 'png')

            const errorSpy = vi.spyOn(console, 'error')

            await expect(new ImageHandler(inputDir, outputDir).toWebp()).resolves.not.toThrow()

            const loggedUnsupported = errorSpy.mock.calls.some(
                args => args[0]?.toString().includes('readme.txt'),
            )

            expect(loggedUnsupported).toBe(true)
        })
    })
})
