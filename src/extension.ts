import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    console.log('Markdown to PDF Converter extension activated');

    const disposable = vscode.commands.registerCommand(
        'md-to-pdf-converter.convertToPdf',
        async (uri: vscode.Uri) => {
            await convertMarkdownToPdf(uri, context);
        }
    );

    context.subscriptions.push(disposable);
}

async function convertMarkdownToPdf(uri: vscode.Uri, context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('mdToPdfConverter');
    const format = config.get<string>('format') || 'A4';
    const scale = config.get<number>('scale') || 1;
    const diagramMaxHeight = config.get<number>('diagramMaxHeight') || 400;

    const markdownPath = uri.fsPath;
    const outputPdf = markdownPath.replace(/\.md$/i, '.pdf');

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Converting Markdown to PDF',
            cancellable: false
        },
        async (progress) => {
            try {
                progress.report({ message: 'Reading markdown file...' });
                const markdownContent = fs.readFileSync(markdownPath, 'utf-8');
                
                progress.report({ message: 'Processing Mermaid diagrams...' });
                const { html, tempDir } = await processMarkdownWithMermaid(markdownContent, context, diagramMaxHeight);
                
                progress.report({ message: 'Generating PDF...' });
                await generatePdf(html, outputPdf, format, scale);
                
                if (tempDir) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }

                vscode.window.showInformationMessage(
                    `✅ PDF created: ${path.basename(outputPdf)}`,
                    'Open PDF'
                ).then(selection => {
                    if (selection === 'Open PDF') {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPdf));
                    }
                });

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`❌ Conversion failed: ${errorMsg}`);
            }
        }
    );
}

async function processMarkdownWithMermaid(markdown: string, context: vscode.ExtensionContext, diagramMaxHeight: number = 400): Promise<{ html: string; tempDir: string | null }> {
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
    const matches = [...markdown.matchAll(mermaidRegex)];
    
    let tempDir: string | null = null;
    let processedMarkdown = markdown;
    
    if (matches.length > 0) {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2pdf-'));
        
        // Use the actual CLI script path instead of symlinks (symlinks not packaged by vsce)
        const mmdcScript = path.join(context.extensionPath, 'node_modules', '@mermaid-js', 'mermaid-cli', 'src', 'cli.js');
        
        const failedDiagrams: string[] = [];

        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const mermaidCode = match[1];
            const imagePath = path.join(tempDir, `diagram-${i + 1}.png`);
            const mmdFile = path.join(tempDir, `diagram-${i + 1}.mmd`);
            
            fs.writeFileSync(mmdFile, mermaidCode);
            
            let renderSuccess = false;
            let renderError = '';
            
            try {
                await new Promise<void>((resolve, reject) => {
                    // Run via node instead of the symlink
                    const proc = spawn('node', [
                        mmdcScript,
                        '-i', mmdFile,
                        '-o', imagePath,
                        '-b', 'white',
                        '-s', '2',
                        '-w', '1200',
                        '-H', '800'
                    ], { shell: process.platform === 'win32' });
                    
                    let stderr = '';
                    let stdout = '';
                    proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
                    proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
                    
                    proc.on('close', (code: number) => {
                        if (code === 0) {
                            resolve();
                        } else {
                            const details = (stderr + '\n' + stdout).trim() || 'No output captured';
                            reject(new Error(details));
                        }
                    });
                    proc.on('error', (err: Error) => {
                        reject(new Error(`Failed to launch mmdc: ${err.message}`));
                    });
                });
                renderSuccess = true;
            } catch (err) {
                renderError = err instanceof Error ? err.message : String(err);
                // Extract the most useful part of the error (the Parse error line)
                const parseErrorMatch = renderError.match(/(?:Error: )?(Parse error on line \d+:[\s\S]*?)(?:\n\s*at\s|Parser3)/);
                const shortError = parseErrorMatch ? parseErrorMatch[1].trim() : renderError.split('\n').slice(0, 3).join('\n');
                failedDiagrams.push(`Diagram ${i + 1}: ${shortError}`);
                console.error(`mmdc failed for diagram ${i + 1}:`, renderError);
            }
            
            if (renderSuccess && fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                const base64Image = imageBuffer.toString('base64');
                const imgTag = `<img src="data:image/png;base64,${base64Image}" alt="Diagram ${i + 1}" style="max-width: 100%; display: block; margin: 20px auto;">`;
                processedMarkdown = processedMarkdown.replace(match[0], imgTag);
            } else {
                // Replace with a styled error placeholder so the PDF still generates
                const escapedCode = mermaidCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const errorPlaceholder = `<div style="border: 2px solid #e74c3c; border-radius: 8px; padding: 16px; margin: 20px 0; background: #fdf0ef;">
<p style="color: #e74c3c; font-weight: bold; margin: 0 0 8px 0;">⚠️ Mermaid diagram ${i + 1} failed to render</p>
<pre style="background: #f6f8fa; padding: 12px; border-radius: 4px; overflow: auto; font-size: 12px;"><code>${escapedCode}</code></pre>
</div>`;
                processedMarkdown = processedMarkdown.replace(match[0], errorPlaceholder);
            }
        }
        
        if (failedDiagrams.length > 0) {
            const msg = failedDiagrams.length === matches.length
                ? `⚠️ All ${failedDiagrams.length} Mermaid diagram(s) failed to render. PDF was generated without diagrams.`
                : `⚠️ ${failedDiagrams.length} of ${matches.length} Mermaid diagram(s) failed to render.`;
            vscode.window.showWarningMessage(
                `${msg}\n\nTip: Special characters like ( ) -> in node labels need quotes, e.g. G["text (with parens) -> arrow"]`,
                'Show Details'
            ).then(selection => {
                if (selection === 'Show Details') {
                    const channel = vscode.window.createOutputChannel('MD to PDF Converter');
                    channel.appendLine('Mermaid diagram rendering errors:');
                    channel.appendLine('='.repeat(50));
                    failedDiagrams.forEach(d => channel.appendLine(d));
                    channel.appendLine('');
                    channel.appendLine('Tip: Wrap node labels containing special characters in double quotes:');
                    channel.appendLine('  ✗  F --> G[Use ROP (temporary) -> Plan Migration]');
                    channel.appendLine('  ✓  F --> G["Use ROP (temporary) -> Plan Migration"]');
                    channel.show();
                }
            });
        }
    }
    
    const MarkdownIt = require('markdown-it');
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    const htmlBody = md.render(processedMarkdown);
    
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: #24292f;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }
        h1, h2 { border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.25em; }
        code {
            background-color: #f6f8fa;
            padding: 0.2em 0.4em;
            border-radius: 6px;
            font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
            font-size: 85%;
        }
        pre {
            background-color: #f6f8fa;
            padding: 16px;
            border-radius: 6px;
            overflow: auto;
        }
        pre code { background: none; padding: 0; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        th, td { border: 1px solid #d0d7de; padding: 8px 16px; text-align: left; }
        th { background-color: #f6f8fa; font-weight: 600; }
        blockquote { margin: 0; padding: 0 16px; color: #57606a; border-left: 4px solid #d0d7de; }
        img { max-width: 100%; page-break-inside: avoid; }
        /* Mermaid diagram sizing - limit height to avoid full-page diagrams */
        img[alt^="Diagram"] {
            max-height: ${diagramMaxHeight}px;
            width: auto;
            object-fit: contain;
        }
        a { color: #0969da; text-decoration: none; }
        ul, ol { padding-left: 2em; }
        hr { border: 0; border-top: 1px solid #d0d7de; margin: 24px 0; }
        @media print {
            body { padding: 0; }
            img { page-break-inside: avoid; break-inside: avoid; }
            h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
        }
    </style>
</head>
<body>
${htmlBody}
</body>
</html>`;
    
    return { html, tempDir };
}

async function generatePdf(html: string, outputPath: string, format: string, scale: number): Promise<void> {
    const puppeteer = require('puppeteer');
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        await page.pdf({
            path: outputPath,
            format: format,
            scale: scale,
            printBackground: true,
            margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
        });
    } finally {
        await browser.close();
    }
}

export function deactivate() {}
