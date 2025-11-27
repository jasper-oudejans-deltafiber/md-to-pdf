import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    console.log('Markdown to PDF Converter extension activated');

    const disposable = vscode.commands.registerCommand(
        'md-to-pdf-converter.convertToPdf',
        async (uri: vscode.Uri) => {
            // Check and install dependencies if needed
            const depsReady = await ensureDependencies(context);
            if (!depsReady) {
                return;
            }
            await convertMarkdownToPdf(uri, context);
        }
    );

    context.subscriptions.push(disposable);
}

async function checkToolAvailable(command: string): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn(command, ['--version']);
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
    });
}

async function ensureDependencies(context: vscode.ExtensionContext): Promise<boolean> {
    const globalMmdcAvailable = await checkToolAvailable('mmdc');
    const globalMdpdfAvailable = await checkToolAvailable('mdpdf');
    
    // Check if tools are available globally
    if (globalMmdcAvailable && globalMdpdfAvailable) {
        return true;
    }
    
    // Check if already installed locally in extension
    const extensionPath = context.extensionPath;
    const isWindows = process.platform === 'win32';
    
    // Windows uses .cmd files in .bin folder
    const mmdcBin = isWindows ? 'mmdc.cmd' : 'mmdc';
    const mdpdfBin = isWindows ? 'mdpdf.cmd' : 'mdpdf';
    
    const localMmdcPath = path.join(extensionPath, 'node_modules', '.bin', mmdcBin);
    const localMdpdfPath = path.join(extensionPath, 'node_modules', '.bin', mdpdfBin);
    
    if (fs.existsSync(localMmdcPath) && fs.existsSync(localMdpdfPath)) {
        return true;
    }
    
    // Tools not found - offer to install
    const missing: string[] = [];
    if (!globalMmdcAvailable) { missing.push('mermaid-cli'); }
    if (!globalMdpdfAvailable) { missing.push('mdpdf'); }
    
    const choice = await vscode.window.showWarningMessage(
        `Required tools not found: ${missing.join(', ')}. Install them locally?`,
        'Install Now',
        'Install Globally (Manual)',
        'Cancel'
    );
    
    if (choice === 'Install Now') {
        return await installDependenciesLocally(context);
    } else if (choice === 'Install Globally (Manual)') {
        const terminal = vscode.window.createTerminal('Install MD to PDF Tools');
        terminal.show();
        terminal.sendText('npm install -g @mermaid-js/mermaid-cli mdpdf');
        vscode.window.showInformationMessage('Please run the command in the terminal, then try again.');
        return false;
    }
    
    return false;
}

async function installDependenciesLocally(context: vscode.ExtensionContext): Promise<boolean> {
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Installing PDF conversion tools...',
            cancellable: false
        },
        async (progress) => {
            progress.report({ message: 'Installing @mermaid-js/mermaid-cli and mdpdf...' });
            
            return new Promise<boolean>((resolve) => {
                const extensionPath = context.extensionPath;
                const npmProcess = spawn('npm', ['install', '@mermaid-js/mermaid-cli@^11.4.0', 'mdpdf@^3.1.0', '--no-save'], {
                    cwd: extensionPath,
                    shell: true
                });
                
                let output = '';
                npmProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });
                
                npmProcess.stderr.on('data', (data) => {
                    output += data.toString();
                });
                
                npmProcess.on('close', (code) => {
                    if (code === 0) {
                        vscode.window.showInformationMessage('✅ PDF tools installed successfully!');
                        resolve(true);
                    } else {
                        vscode.window.showErrorMessage(`❌ Failed to install tools. Try installing globally: npm install -g @mermaid-js/mermaid-cli mdpdf`);
                        console.error(output);
                        resolve(false);
                    }
                });
                
                npmProcess.on('error', (err) => {
                    vscode.window.showErrorMessage(`❌ Installation failed: ${err.message}`);
                    resolve(false);
                });
            });
        }
    );
}

async function convertMarkdownToPdf(uri: vscode.Uri, context?: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('mdToPdfConverter');
    // Default to 'python' on Windows, 'python3' on Unix-like systems
    const defaultPython = process.platform === 'win32' ? 'python' : 'python3';
    const pythonPath = config.get<string>('pythonPath') || defaultPython;
    let scriptPath = config.get<string>('scriptPath') || '';

    // If no script path configured, try multiple locations
    if (!scriptPath) {
        const mdDir = path.dirname(uri.fsPath);
        const localScriptPath = path.join(mdDir, 'convert-md-to-pdf.py');
        
        // First try: same directory as markdown file
        if (fs.existsSync(localScriptPath)) {
            scriptPath = localScriptPath;
        } 
        // Second try: bundled script in extension
        else if (context) {
            const bundledScriptPath = path.join(context.extensionPath, 'scripts', 'convert-md-to-pdf.py');
            if (fs.existsSync(bundledScriptPath)) {
                scriptPath = bundledScriptPath;
            }
        }
        
        // If still not found, prompt user
        if (!scriptPath) {
            // Prompt user to locate the script
            const result = await vscode.window.showErrorMessage(
                'convert-md-to-pdf.py not found. Please configure the script path.',
                'Browse for Script',
                'Cancel'
            );
            
            if (result === 'Browse for Script') {
                const fileUri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        'Python Scripts': ['py']
                    },
                    title: 'Select convert-md-to-pdf.py script'
                });
                
                if (fileUri && fileUri[0]) {
                    scriptPath = fileUri[0].fsPath;
                    // Save to settings
                    await config.update('scriptPath', scriptPath, vscode.ConfigurationTarget.Global);
                } else {
                    return;
                }
            } else {
                return;
            }
        }
    }

    // Verify script exists
    if (!fs.existsSync(scriptPath)) {
        vscode.window.showErrorMessage(`Script not found: ${scriptPath}`);
        return;
    }

    const markdownPath = uri.fsPath;
    const outputPdf = markdownPath.replace(/\.md$/i, '.pdf');

    // Show progress notification
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Converting Markdown to PDF',
            cancellable: false
        },
        async (progress) => {
            progress.report({ message: 'Running conversion script...' });

            return new Promise<void>((resolve, reject) => {
                // Set up environment with bundled npm tools
                const env: NodeJS.ProcessEnv = { ...process.env };
                
                if (context) {
                    const extensionPath = context.extensionPath;
                    const isWindows = process.platform === 'win32';
                    
                    // Windows uses .cmd files in .bin folder
                    const mmdcBin = isWindows ? 'mmdc.cmd' : 'mmdc';
                    const mdpdfBin = isWindows ? 'mdpdf.cmd' : 'mdpdf';
                    
                    const mmdcPath = path.join(extensionPath, 'node_modules', '.bin', mmdcBin);
                    const mdpdfPath = path.join(extensionPath, 'node_modules', '.bin', mdpdfBin);
                    
                    // Check if bundled tools exist
                    if (fs.existsSync(mmdcPath)) {
                        env.MMDC_PATH = mmdcPath;
                    }
                    if (fs.existsSync(mdpdfPath)) {
                        env.MDPDF_PATH = mdpdfPath;
                    }
                }
                
                const childProcess = spawn(pythonPath, [scriptPath, markdownPath], {
                    cwd: path.dirname(markdownPath),
                    env: env
                });

                let stdout = '';
                let stderr = '';

                childProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    stdout += output;
                    console.log(output);
                });

                childProcess.stderr.on('data', (data) => {
                    const output = data.toString();
                    stderr += output;
                    console.error(output);
                });

                childProcess.on('close', (code) => {
                    if (code === 0) {
                        vscode.window.showInformationMessage(
                            `✅ PDF created: ${path.basename(outputPdf)}`,
                            'Open PDF'
                        ).then(selection => {
                            if (selection === 'Open PDF') {
                                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPdf));
                            }
                        });
                        resolve();
                    } else {
                        const errorMsg = stderr || stdout || `Process exited with code ${code}`;
                        vscode.window.showErrorMessage(`❌ Conversion failed: ${errorMsg}`);
                        reject(new Error(errorMsg));
                    }
                });

                childProcess.on('error', (err) => {
                    vscode.window.showErrorMessage(`❌ Failed to run Python script: ${err.message}`);
                    reject(err);
                });
            });
        }
    );
}

export function deactivate() {}
