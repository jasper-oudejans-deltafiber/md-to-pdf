# Markdown to PDF Converter

Convert Markdown files with Mermaid diagrams to PDF - works out of the box, no setup required.

## Features

- Right-click context menu on `.md` files in Explorer
- Renders Mermaid diagrams as high-quality images
- GitHub-flavored Markdown styling
- Configurable PDF format (A4, Letter, Legal)
- Works on Windows, macOS, and Linux

## Usage

1. Right-click on any `.md` file in VS Code Explorer
2. Select **"Convert to PDF (with Mermaid)"**
3. Wait for the conversion to complete
4. Click "Open PDF" to view the result

## Extension Settings

* `mdToPdfConverter.format`: PDF page format - `A4` (default), `Letter`, or `Legal`
* `mdToPdfConverter.scale`: Scale of the PDF (0.1 - 2.0, default: 1)

## Installation

### From VSIX

1. Download `md-to-pdf-converter-2.0.0.vsix`
2. In VS Code: Extensions → `...` menu → "Install from VSIX..."

### From Source

```bash
git clone https://github.com/jasper-oudejans-deltafiber/md-to-pdf.git
cd md-to-pdf
npm install
npx @vscode/vsce package
code --install-extension md-to-pdf-converter-2.0.0.vsix
```

## Release Notes

### 2.0.0

- Complete rewrite in TypeScript
- No external dependencies required (Python, mmdc, mdpdf)
- Everything bundled - works out of the box
- Cross-platform support (Windows, macOS, Linux)

### 1.0.0

Initial release (required Python and external tools)
