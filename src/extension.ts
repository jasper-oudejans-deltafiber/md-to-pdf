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
                const { html, tempDir } = await processMarkdownWithMermaid(markdownContent, context);
                
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

async function processMarkdownWithMermaid(markdown: string, context: vscode.ExtensionContext): Promise<{ html: string; tempDir: string | null }> {
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
    const matches = [...markdown.matchAll(mermaidRegex)];
    
    let tempDir: string | null = null;
    let processedMarkdown = markdown;
    
    if (matches.length > 0) {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2pdf-'));
        
        const isWindows = process.platform === 'win32';
        const mmdcBin = isWindows ? 'mmdc.cmd' : 'mmdc';
        const mmdcPath = path.join(context.extensionPath, 'node_modules', '.bin', mmdcBin);
        
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const mermaidCode = match[1];
            const imagePath = path.join(tempDir, `diagram-${i + 1}.png`);
            const mmdFile = path.join(tempDir, `diagram-${i + 1}.mmd`);
            
            fs.writeFileSync(mmdFile, mermaidCode);
            
            await new Promise<void>((resolve, reject) => {
                const proc = spawn(mmdcPath, [
                    '-i', mmdFile,
                    '-o', imagePath,
                    '-b', 'white',
                    '-s', '3',
                    '-w', '2400',
                    '-H', '1600'
                ], { shell: isWindows });
                
                proc.on('close', (code: number) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`mmdc failed with code ${code}`));
                    }
                });
                proc.on('error', reject);
            });
            
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Image = imageBuffer.toString('base64');
            const imgTag = `<img src="data:image/png;base64,${base64Image}" alt="Diagram ${i + 1}" style="max-width: 100%; display: block; margin: 20px auto;">`;
            
            processedMarkdown = processedMarkdown.replace(match[0], imgTag);
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
