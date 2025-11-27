#!/usr/bin/env python3
"""
Convert Markdown with Mermaid diagrams to PDF
- Extracts Mermaid diagrams and generates PNG images
- Creates temporary MD with image references
- Generates PDF using mdpdf
- Cleans up temporary files
"""

import re
import subprocess
import sys
import os
import tempfile
import shutil
from pathlib import Path

def check_dependencies():
    """Check if required external tools are installed"""
    missing = []
    
    # Get tool paths from environment or use defaults
    mmdc_cmd = os.environ.get('MMDC_PATH', 'mmdc')
    mdpdf_cmd = os.environ.get('MDPDF_PATH', 'mdpdf')
    
    # Check for mmdc (Mermaid CLI)
    try:
        result = subprocess.run([mmdc_cmd, '--version'], capture_output=True, text=True, timeout=10)
        # mmdc returns 0 on success, just check if command exists
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception) as e:
        missing.append('mmdc')
    
    # Check for mdpdf
    try:
        result = subprocess.run([mdpdf_cmd, '--version'], capture_output=True, text=True, timeout=10)
        # mdpdf returns 0 on success, just check if command exists
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception) as e:
        missing.append('mdpdf')
    
    if missing:
        print("❌ Missing required dependencies:")
        for tool in missing:
            print(f"   • {tool}")
        
        # Detect platform and show appropriate installation commands
        is_windows = sys.platform == "win32"
        is_macos = sys.platform == "darwin"
        
        print("\n📦 Install missing dependencies:")
        print()
        
        if is_windows:
            print("Windows - Run these commands in PowerShell:")
            print("-" * 50)
            if 'mmdc' in missing:
                print("npm install -g @mermaid-js/mermaid-cli")
            if 'mdpdf' in missing:
                print("npm install -g mdpdf")
            print()
            print("If npm is not installed:")
            print("choco install nodejs -y")
            print("(Requires Chocolatey: https://chocolatey.org/install)")
        
        elif is_macos:
            print("macOS - Run these commands in Terminal:")
            print("-" * 50)
            if 'mmdc' in missing:
                print("npm install -g @mermaid-js/mermaid-cli")
            if 'mdpdf' in missing:
                print("npm install -g mdpdf")
            print()
            print("If npm is not installed:")
            print("brew install node")
            print("(Requires Homebrew: https://brew.sh)")
        
        else:  # Linux
            print("Linux - Run these commands:")
            print("-" * 50)
            if 'mmdc' in missing:
                print("sudo npm install -g @mermaid-js/mermaid-cli")
            if 'mdpdf' in missing:
                print("sudo npm install -g mdpdf")
            print()
            print("If npm is not installed:")
            print("sudo apt install nodejs npm    # Ubuntu/Debian")
            print("sudo yum install nodejs npm    # CentOS/RHEL")
        
        print()
        sys.exit(1)
    
    return True

def extract_mermaid_diagrams(markdown_content):
    """Extract all mermaid code blocks from markdown"""
    pattern = r'```mermaid\n(.*?)\n```'
    diagrams = re.findall(pattern, markdown_content, re.DOTALL)
    return diagrams

def generate_mermaid_image(mermaid_code, output_path):
    """Generate PNG from mermaid code using mmdc with high quality settings"""
    temp_mmd = tempfile.NamedTemporaryFile(mode='w', suffix='.mmd', delete=False)
    try:
        temp_mmd.write(mermaid_code)
        temp_mmd.close()
        
        # Get mmdc path from environment or use default
        mmdc_cmd = os.environ.get('MMDC_PATH', 'mmdc')
        
        # Run mmdc to generate PNG with high quality settings
        # -s 3: 3x scale factor for high resolution (retina quality)
        # -w 2400: Large width to accommodate horizontal diagrams
        # -H 1600: Large height for flexibility
        # -b transparent: Transparent background
        result = subprocess.run(
            [mmdc_cmd, '-i', temp_mmd.name, '-o', output_path, 
             '-b', 'transparent', '-s', '3', '-w', '2400', '-H', '1600'],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"⚠️  Warning: Failed to generate diagram: {result.stderr}")
            return False
        
        return True
    finally:
        os.unlink(temp_mmd.name)

def replace_mermaid_with_images(markdown_content, temp_dir):
    """Replace mermaid blocks with image references"""
    diagrams = extract_mermaid_diagrams(markdown_content)
    
    if not diagrams:
        print("ℹ️  No Mermaid diagrams found")
        return markdown_content
    
    print(f"📊 Found {len(diagrams)} Mermaid diagrams")
    
    # Create images directory
    images_dir = Path(temp_dir) / 'diagrams'
    images_dir.mkdir(exist_ok=True)
    
    modified_content = markdown_content
    
    for i, diagram in enumerate(diagrams, 1):
        # Generate image filename
        image_filename = f'diagram-{i}.png'
        image_path = images_dir / image_filename
        
        print(f"  🎨 Generating diagram {i}/{len(diagrams)}...", end=' ')
        
        # Generate PNG
        if generate_mermaid_image(diagram, str(image_path)):
            print("✅")
            # Replace mermaid block with image reference
            mermaid_block = f'```mermaid\n{diagram}\n```'
            image_reference = f'\n![Diagram {i}](diagrams/{image_filename})\n'
            modified_content = modified_content.replace(mermaid_block, image_reference, 1)
        else:
            print("❌")
    
    return modified_content

def generate_pdf(markdown_file, output_pdf, css_file=None):
    """Generate PDF from markdown using mdpdf with optional CSS styling"""
    print(f"📄 Generating PDF: {output_pdf}")
    
    # Get mdpdf path from environment or use default
    mdpdf_cmd = os.environ.get('MDPDF_PATH', 'mdpdf')
    
    # mdpdf creates PDF with same name as input by default
    # So we need to run it in the temp dir, then move the file
    markdown_path = Path(markdown_file)
    temp_pdf = markdown_path.with_suffix('.pdf')
    
    # Build command with optional CSS to prevent page breaks in diagrams
    cmd = [mdpdf_cmd, str(markdown_path), '--format=A4']
    if css_file and Path(css_file).exists():
        cmd.extend(['--style', str(css_file)])
        print(f"🎨 Using custom CSS to prevent diagram splitting: {Path(css_file).name}")
    
    # Add gh-style to reduce whitespace
    cmd.append('--gh-style')
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ Error generating PDF: {result.stderr}")
        return False
    
    # Move the generated PDF to the desired location
    if temp_pdf.exists():
        shutil.move(str(temp_pdf), str(output_pdf))
        print("✅ PDF generated successfully!")
        return True
    else:
        print(f"❌ Error: PDF was not created at {temp_pdf}")
        return False

def main():
    if len(sys.argv) != 2:
        # Detect platform for correct command example
        python_cmd = "python" if sys.platform == "win32" else "python3"
        print(f"Usage: {python_cmd} convert-md-to-pdf.py <input.md>")
        print(f"Example: {python_cmd} convert-md-to-pdf.py PSA-EngineerApp.md")
        sys.exit(1)
    
    # Check dependencies before processing
    check_dependencies()
    
    input_file = Path(sys.argv[1])
    
    if not input_file.exists():
        print(f"❌ Error: File not found: {input_file}")
        sys.exit(1)
    
    print(f"\n🚀 Converting {input_file.name} to PDF with rendered Mermaid diagrams\n")
    
    # Create temporary directory
    temp_dir = tempfile.mkdtemp(prefix='md2pdf_')
    temp_md_path = Path(temp_dir) / 'temp_with_images.md'
    
    try:
        # Read input markdown
        print(f"📖 Reading {input_file.name}")
        with open(input_file, 'r', encoding='utf-8') as f:
            markdown_content = f.read()
        
        # Replace mermaid blocks with images
        modified_content = replace_mermaid_with_images(markdown_content, temp_dir)
        
        # Write temporary markdown
        with open(temp_md_path, 'w', encoding='utf-8') as f:
            f.write(modified_content)
        
        # Generate PDF (same name as input, but .pdf extension)
        output_pdf = input_file.with_suffix('.pdf')
        
        # Look for custom CSS file in same directory as input
        css_file = input_file.parent / 'pdf-style.css'
        
        # Generate PDF from temporary markdown with CSS to prevent page breaks
        if generate_pdf(str(temp_md_path), str(output_pdf), str(css_file) if css_file.exists() else None):
            print(f"\n✨ Success! PDF created: {output_pdf.name}")
            print(f"📁 Location: {output_pdf.absolute()}")
        else:
            sys.exit(1)
        
    finally:
        # Clean up temporary directory
        print(f"\n🧹 Cleaning up temporary files...")
        shutil.rmtree(temp_dir)
        print("✅ Cleanup complete")
    
    print("\n🎉 Done!")

if __name__ == '__main__':
    main()
