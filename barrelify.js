#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const args = process.argv.slice(2);
const useWildcard = args.includes('--wildcard');
const noSubdirs = args.includes('--no-subdirs');
const recursive = args.includes('--recursive') || args.includes('-r');
const nonFlagArgs = args.filter(arg => !arg.startsWith('-'));
const targetDir = nonFlagArgs[0] || '.';
const outputFile = nonFlagArgs[1] || 'index.ts';

function isJavaScriptFile(file) {
  return /\.(js|jsx|ts|tsx)$/.test(file) && file !== outputFile;
}

function loadConfig(dir) {
  const configPath = path.join(dir, '.barrelify.json');
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Warning: Could not parse .barrelify.json in ${dir}`);
      return {};
    }
  }
  return {};
}

function matchesPattern(filename, patterns) {
  if (!patterns || patterns.length === 0) return false;

  return patterns.some(pattern => {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
  });
}

function parseExports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const isTsFile = /\.(ts|tsx)$/.test(filePath);

  try {
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'exportDefaultFrom',
        'exportNamespaceFrom'
      ]
    });

    const exports = {
      named: [],
      types: [],
      hasDefault: false
    };

    ast.program.body.forEach(node => {
      if (node.type === 'ExportNamedDeclaration') {
        if (node.exportKind === 'type') {
          // export type { ... }
          if (node.declaration) {
            if (node.declaration.type === 'TSTypeAliasDeclaration' ||
                node.declaration.type === 'TSInterfaceDeclaration') {
              exports.types.push(node.declaration.id.name);
            }
          }
        } else if (node.declaration) {
          // export const/function/class
          if (node.declaration.type === 'VariableDeclaration') {
            node.declaration.declarations.forEach(decl => {
              exports.named.push(decl.id.name);
            });
          } else if (node.declaration.id) {
            if (node.declaration.type === 'TSInterfaceDeclaration' ||
                node.declaration.type === 'TSTypeAliasDeclaration') {
              exports.types.push(node.declaration.id.name);
            } else {
              exports.named.push(node.declaration.id.name);
            }
          }
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        exports.hasDefault = true;
      }
    });

    return exports;
  } catch (error) {
    console.warn(`Warning: Could not parse ${filePath}, using fallback`);
    return null;
  }
}

function generateBarrelFile(dir) {
  const fullPath = path.resolve(dir);

  if (!fs.existsSync(fullPath)) {
    console.error(`Error: Directory "${dir}" does not exist`);
    process.exit(1);
  }

  if (!fs.statSync(fullPath).isDirectory()) {
    console.error(`Error: "${dir}" is not a directory`);
    process.exit(1);
  }

  const config = loadConfig(fullPath);
  const excludePatterns = config.exclude || [];

  const files = fs.readdirSync(fullPath);
  const jsFiles = files.filter(file => {
    if (!isJavaScriptFile(file)) return false;
    if (matchesPattern(file, excludePatterns)) return false;
    return true;
  });
  const subdirs = !noSubdirs ? files.filter(file => {
    const filePath = path.join(fullPath, file);
    if (!fs.statSync(filePath).isDirectory()) return false;
    if (matchesPattern(file, excludePatterns)) return false;
    return true;
  }) : [];

  if (jsFiles.length === 0 && subdirs.length === 0) {
    console.warn(`No JavaScript files or subdirectories found in "${dir}"`);
    return;
  }

  const isTypeScriptOutput = /\.(ts|tsx)$/.test(outputFile);
  const exportLines = [];

  // Export from subdirectories first
  subdirs.forEach(subdir => {
    const barrelPath = path.join(fullPath, subdir, outputFile);
    if (fs.existsSync(barrelPath)) {
      exportLines.push(`export * from './${subdir}';`);
    }
  });

  jsFiles.forEach(file => {
    const baseName = path.basename(file, path.extname(file));
    const filePath = path.join(fullPath, file);
    const parsedExports = parseExports(filePath);

    if (!parsedExports) {
      // Fallback to wildcard export if parsing fails
      exportLines.push(`export * from './${baseName}';`);
      return;
    }

    if (useWildcard) {
      // Wildcard mode
      if (parsedExports.named.length > 0 || parsedExports.hasDefault) {
        exportLines.push(`export * from './${baseName}';`);
      }
      if (parsedExports.types.length > 0) {
        if (isTypeScriptOutput) {
          exportLines.push(`export type * from './${baseName}';`);
        } else {
          // For JavaScript output, types are included in regular export
          if (parsedExports.named.length === 0 && !parsedExports.hasDefault) {
            exportLines.push(`export * from './${baseName}';`);
          }
        }
      }
    } else {
      // Named mode
      if (parsedExports.named.length > 0) {
        exportLines.push(`export { ${parsedExports.named.join(', ')} } from './${baseName}';`);
      }
      if (parsedExports.types.length > 0) {
        if (isTypeScriptOutput) {
          exportLines.push(`export type { ${parsedExports.types.join(', ')} } from './${baseName}';`);
        } else {
          // For JavaScript output, merge types with named exports
          exportLines.push(`export { ${parsedExports.types.join(', ')} } from './${baseName}';`);
        }
      }
      if (parsedExports.hasDefault) {
        exportLines.push(`export { default as ${baseName} } from './${baseName}';`);
      }
    }
  });

  const exports = exportLines.join('\n');

  const outputPath = path.join(fullPath, outputFile);
  fs.writeFileSync(outputPath, exports + '\n');

  const totalExports = jsFiles.length + subdirs.filter(subdir => {
    const barrelPath = path.join(fullPath, subdir, outputFile);
    return fs.existsSync(barrelPath);
  }).length;

  console.log(`✓ Created ${outputFile} with ${totalExports} exports in ${dir}`);
}

function generateBarrelFilesRecursive(dir) {
  const fullPath = path.resolve(dir);

  if (!fs.existsSync(fullPath)) {
    console.error(`Error: Directory "${dir}" does not exist`);
    process.exit(1);
  }

  if (!fs.statSync(fullPath).isDirectory()) {
    console.error(`Error: "${dir}" is not a directory`);
    process.exit(1);
  }

  const files = fs.readdirSync(fullPath);
  const subdirs = files.filter(file => {
    const filePath = path.join(fullPath, file);
    return fs.statSync(filePath).isDirectory();
  });

  // First, recursively process subdirectories (leaf-first)
  subdirs.forEach(subdir => {
    generateBarrelFilesRecursive(path.join(fullPath, subdir));
  });

  // Then generate barrel file for current directory
  generateBarrelFile(dir);
}

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
barrelify - Generate JavaScript barrel files

Usage:
  barrelify [options] [directory] [output-file]

Options:
  -r, --recursive  Generate barrel files recursively in all subdirectories (leaf-first)
  --wildcard       Use wildcard exports (export *) instead of named exports (default: named)
  --no-subdirs     Don't include barrel files from subdirectories (default: include)
  -h, --help       Show this help message

Arguments:
  directory    Target directory (default: current directory)
  output-file  Output filename (default: index.ts)

Configuration:
  Place a .barrelify.json file in any directory to configure options for that directory.

  Example .barrelify.json:
  {
    "exclude": ["*.test.ts", "*.spec.ts", "__tests__"]
  }

Examples:
  barrelify                    # Create index.ts with named exports, including subdirs
  barrelify -r src             # Recursively create barrel files in src and all subdirs
  barrelify src/components     # Create index.ts with named exports in src/components
  barrelify --wildcard src     # Create index.ts with wildcard exports in src
  barrelify --no-subdirs src   # Create index.ts without subdirectory barrel files
  barrelify src index.js       # Create index.js with named exports in src
`);
  process.exit(0);
}

if (recursive) {
  generateBarrelFilesRecursive(targetDir);
} else {
  generateBarrelFile(targetDir);
}
