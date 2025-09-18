import { ImageHandler } from './src/ImageHandler'
import path from 'path'
import inquirer from 'inquirer'

async function main() {
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'operation',
            message: 'Which operation do you want to run?',
            choices: [
                { name: 'Convert Images to WebP', value: 'toWebp' },
                { name: 'Compress Images', value: 'compress' },
            ],
        },
        {
            type: 'input',
            name: 'inputDir',
            message: 'Enter the input directory path:',
            default: './inputs',
        },
        {
            type: 'input',
            name: 'outputDir',
            message: 'Enter the output directory path:',
            default: './outputs',
        },
    ])

    const handler = new ImageHandler(
        path.resolve(answers.inputDir),
        path.resolve(answers.outputDir),
    )

    switch (answers.operation) {
        case 'toWebp':
            await handler.toWebp()
            break
        case 'compress':
            await handler.compress()
            break
    }

    console.log('✅ Done!')
}

main()
