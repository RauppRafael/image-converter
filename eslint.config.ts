import globals from 'globals'
import rules from '@defihub/eslint-config/eslint.config'

export default [
    ...rules,
    {
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
]
