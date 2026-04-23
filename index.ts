import { ImageHandler } from './src/ImageHandler'
import { AudioHandler } from './src/AudioHandler'
import path from 'path'
import inquirer from 'inquirer'

function parseOptionalPositiveInt(raw: string | undefined): number | undefined {
    if (!raw?.trim()) return undefined

    const parsed = parseInt(raw, 10)

    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseOptionalPositiveNumber(raw: string | undefined): number | undefined {
    if (!raw?.trim()) return undefined

    const parsed = parseFloat(raw)

    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseQuality(raw: string, fallback: number): number {
    const parsed = parseInt(raw, 10)

    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : fallback
}

async function promptBase() {
    const operation = await inquirer.prompt({
        type: 'list',
        name: 'operation',
        message: 'Which operation do you want to run?',
        choices: [
            { name: 'Convert Images to WebP', value: 'toWebp' },
            { name: 'Convert Images to JPG (including HEIC)', value: 'toJpg' },
            { name: 'Compress Images', value: 'compress' },
            { name: 'Transcribe Audio to Text (Portuguese BR)', value: 'transcribe' },
        ],
    })

    const inputDir = await inquirer.prompt({
        type: 'input',
        name: 'inputDir',
        message: 'Enter the input directory path:',
        default: './inputs',
    })

    const outputDir = await inquirer.prompt({
        type: 'input',
        name: 'outputDir',
        message: 'Enter the output directory path:',
        default: './outputs',
    })

    return {
        operation: operation.operation,
        inputDir: inputDir.inputDir,
        outputDir: outputDir.outputDir,
    }
}

async function promptCompressOptions() {
    const maxMegapixels = await inquirer.prompt({
        type: 'input',
        name: 'maxMegapixels',
        message: 'Max megapixels (blank for no limit, e.g. 25 for Shopify):',
        default: '25',
    })

    const maxWidth = await inquirer.prompt({
        type: 'input',
        name: 'maxWidth',
        message: 'Max width in pixels (blank for no limit):',
        default: '',
    })

    const maxHeight = await inquirer.prompt({
        type: 'input',
        name: 'maxHeight',
        message: 'Max height in pixels (blank for no limit):',
        default: '',
    })

    const quality = await inquirer.prompt({
        type: 'input',
        name: 'quality',
        message: 'Quality (1-100):',
        default: '95',
    })

    return {
        maxMegapixels: parseOptionalPositiveNumber(maxMegapixels.maxMegapixels),
        maxWidth: parseOptionalPositiveInt(maxWidth.maxWidth),
        maxHeight: parseOptionalPositiveInt(maxHeight.maxHeight),
        quality: parseQuality(quality.quality, 95),
    }
}

async function main() {
    const { operation, inputDir, outputDir } = await promptBase()

    if (operation === 'transcribe') {
        const audioHandler = new AudioHandler(
            path.resolve(inputDir),
            path.resolve(outputDir),
        )

        await audioHandler.transcribe()
    }
    else {
        const handler = new ImageHandler(
            path.resolve(inputDir),
            path.resolve(outputDir),
        )

        switch (operation) {
            case 'toWebp':
                await handler.toWebp()
                break
            case 'toJpg':
                await handler.toJpg()
                break
            case 'compress':
                await handler.compress(await promptCompressOptions())
                break
        }
    }

    console.log('✅ Done!')
}

main()
