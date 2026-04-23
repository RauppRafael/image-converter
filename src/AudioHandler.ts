import { spawn } from 'child_process'
import path from 'path'

export class AudioHandler {
    public constructor(
        public readonly inputDirectory: string,
        public readonly outputDirectory: string,
    ) {
    }

    public transcribe(): Promise<void> {
        return new Promise((resolve, reject) => {
            const scriptPath = path.resolve(__dirname, '..', 'scripts', 'transcribe.py')

            const process = spawn('python', [
                scriptPath,
                this.inputDirectory,
                this.outputDirectory,
                '--model',
                'large-v3-turbo',
            ], {
                stdio: 'inherit',
                shell: true,
            })

            process.on('error', err => {
                reject(new Error(`Failed to start Python process: ${ err.message }`))
            })

            process.on('close', code => {
                if (code === 0)
                    resolve()
                else
                    reject(new Error(`Python script exited with code ${ code }`))
            })
        })
    }
}
