# Markdown to PDF Converter

Convert Markdown files with Mermaid diagrams to PDF using the `convert-md-to-pdf.py` script.

## Features

- Right-click context menu on `.md` files in Explorer
- Automatically finds `convert-md-to-pdf.py` script in the same directory as your markdown file
- Shows progress notification during conversion
- Opens the generated PDF with one click

## Usage

1. Right-click on any `.md` file in VS Code Explorer
2. Select **"Convert to PDF (with Mermaid)"**
3. Wait for the conversion to complete
4. Click "Open PDF" to view the result

## Requirements

- Python 3 installed and accessible
- `convert-md-to-pdf.py` script available
- Python dependencies: `mmdc` (Mermaid CLI) and `mdpdf`

## Extension Settings

This extension contributes the following settings:

* `mdToPdfConverter.pythonPath`: Path to Python executable (default: `python3`)
* `mdToPdfConverter.scriptPath`: Path to `convert-md-to-pdf.py` script (leave empty to auto-detect in markdown file directory)

## Installation

### From VSIX (Recommended)

1. Package the extension: `npm run package && vsce package`
2. Install in VS Code: Extensions → ... menu → Install from VSIX

### Development Mode

1. Open this folder in VS Code
2. Press F5 to launch Extension Development Host
3. Test the extension in the new window

## Release Notes

### 1.0.0

Initial release:
- Context menu integration for .md files
- Auto-detection of conversion script
- Progress notifications
- PDF preview integration
