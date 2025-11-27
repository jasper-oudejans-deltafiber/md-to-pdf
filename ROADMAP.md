# MD to PDF Converter - Rewrite Roadmap

## Goal
Rewrite the extension in pure TypeScript so it works **out of the box** without requiring users to install Python, mmdc, or mdpdf.

## Current State
- ✅ Extension rewritten in pure TypeScript
- ✅ No Python required
- ✅ Version 2.0.0 packaged (~45 MB)
- ✅ Code pushed to GitHub: https://github.com/jasper-oudejans-deltafiber/md-to-pdf

## Completed

### Step 1: Update dependencies
Replace Python-based tools with Node.js libraries:
```json
{
  "dependencies": {
    "@mermaid-js/mermaid-cli": "^11.4.0",  // For Mermaid diagrams
    "puppeteer": "^23.0.0",                 // For PDF generation
    "marked": "^12.0.0"                     // For Markdown parsing
  }
}
```

### Step 2: Rewrite extension.ts
Replace the Python script call with pure TypeScript:
1. Parse Markdown file
2. Find Mermaid code blocks
3. Render Mermaid diagrams to SVG/PNG using mermaid-cli
4. Convert Markdown + diagrams to HTML
5. Use Puppeteer to generate PDF from HTML

### Step 3: Configure esbuild
- Bundle all dependencies into single file
- Mark `puppeteer` as external (it downloads its own Chromium)
- Handle platform-specific binaries

### Step 4: Test & Package
```bash
npm install
npm run package
npx @vscode/vsce package
```

### Step 5: Clean up
- Remove `scripts/convert-md-to-pdf.py`
- Update README.md
- Bump version to 2.0.0

## Expected Result
- Extension size: ~50-100 MB (includes Chromium)
- Zero user setup required
- Works on Windows, macOS, Linux

## Commands to continue
```bash
cd /Users/jasperoudejans/md-to-pdf-converter
npm install
npm run compile
# Test with F5 in VS Code
```
