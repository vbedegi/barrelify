# barrelify

A CLI tool to automatically generate barrel files (index files) for JavaScript and TypeScript projects.

## Installation

```bash
npm install -g barrelify
```

## Usage

```bash
barrelify [options] [directory] [output-file]
```

### Options

- `-r, --recursive` - Generate barrel files recursively in all subdirectories (leaf-first)
- `--wildcard` - Use wildcard exports (`export *`) instead of named exports (default: named)
- `--no-subdirs` - Don't include barrel files from subdirectories (default: include)
- `-h, --help` - Show help message

### Arguments

- `directory` - Target directory (default: current directory)
- `output-file` - Output filename (default: index.ts)

## Examples

```bash
# Create index.ts with named exports in current directory
barrelify

# Recursively create barrel files in src and all subdirectories
barrelify -r src

# Create index.ts with named exports in src/components
barrelify src/components

# Create index.ts with wildcard exports
barrelify --wildcard src

# Create index.ts without subdirectory barrel files
barrelify --no-subdirs src

# Create index.js instead of index.ts
barrelify src index.js
```

## Configuration

Place a `.barrelify.json` file in any directory to configure options for that directory.

### Example .barrelify.json

```json
{
  "exclude": ["*.test.ts", "*.spec.ts", "__tests__"]
}
```

### Configuration Options

- `exclude` - Array of glob patterns to exclude from barrel files

## Features

- **Named Exports** - By default, generates explicit named exports for better tree-shaking
- **TypeScript Support** - Properly handles `export type` syntax for TypeScript files
- **Recursive Generation** - Can process entire directory trees at once
- **Smart Detection** - Parses files using Babel to detect actual exports
- **Subdirectory Barrel Files** - Automatically re-exports from subdirectory barrel files
- **Configurable Exclusions** - Per-directory configuration via `.barrelify.json`

## How It Works

barrelify analyzes your JavaScript/TypeScript files and creates barrel files that re-export all named exports, types, and default exports:

```typescript
// Input files
// Button.tsx
export const Button = () => { ... }

// Modal.tsx
export type ModalProps = { ... }
export const Modal = () => { ... }

// Generated index.ts
export { Button } from './Button';
export { Modal } from './Modal';
export type { ModalProps } from './Modal';
```

## License

MIT
