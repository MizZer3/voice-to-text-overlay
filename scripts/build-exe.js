const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const packager = require('electron-packager');

async function build() {
  console.log('=== Building Gemini Live Windows Executable ===');

  const rootDir = path.resolve(__dirname, '..');
  const assetsDir = path.join(rootDir, 'assets');
  const iconIco = path.join(assetsDir, 'icon.ico');

  // 1. Ensure icons exist
  if (!fs.existsSync(iconIco)) {
    console.log('Generating application icons...');
    require('./generate-icons.js');
  }

  // 1.1 Ensure native paste utility exists
  const pasteExe = path.join(assetsDir, 'send-paste.exe');
  const pasteCs = path.join(rootDir, 'tools', 'send-paste.cs');
  if (!fs.existsSync(pasteExe) && fs.existsSync(pasteCs)) {
    const cscCandidates = [
      'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
      'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
    ];
    const cscPath = cscCandidates.find(p => fs.existsSync(p));
    if (cscPath) {
      console.log('Compiling assets/send-paste.exe...');
      execSync(`"${cscPath}" /target:winexe /out:"${pasteExe}" "${pasteCs}"`);
    }
  }

  // 2. Run electron-packager
  console.log('Packaging application with electron-packager...');
  const options = {
    dir: rootDir,
    name: 'Gemini Live',
    platform: 'win32',
    arch: 'x64',
    out: path.join(rootDir, 'dist'),
    overwrite: true,
    prune: true,
    icon: fs.existsSync(iconIco) ? iconIco : undefined,
    ignore: [
      /^\/dist($|\/)/,
      /^\/\.git($|\/)/,
      /^\/\.gemini($|\/)/,
      /^\/test($|\/)/,
      /^\/scripts($|\/)/,
      /^\/Gemini Live\.exe$/,
      /^\/Gemini Live\.lnk$/,
      /\.log$/,
      /\.tmp$/
    ],
    appCopyright: 'Copyright 2026 Gemini Live Overlay',
    win32metadata: {
      CompanyName: 'Gemini Live',
      FileDescription: 'Gemini Live Overlay Desktop Application',
      OriginalFilename: 'Gemini Live.exe',
      ProductName: 'Gemini Live Overlay',
      InternalName: 'Gemini Live'
    }
  };

  const appPaths = await packager(options);
  console.log(`Package created at: ${appPaths.join(', ')}`);

  const outputExePath = path.join(rootDir, 'dist', 'Gemini Live-win32-x64', 'Gemini Live.exe');

  if (!fs.existsSync(outputExePath)) {
    throw new Error(`Executable was not found at expected path: ${outputExePath}`);
  }
  console.log(`SUCCESS: Packaged standalone binary at: ${outputExePath}`);

  // 3. Compile native Windows GUI launcher in project root and dist/
  const rootExe = path.join(rootDir, 'Gemini Live.exe');
  const distExe = path.join(rootDir, 'dist', 'Gemini Live.exe');

  const cscCandidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
  ];
  const cscPath = cscCandidates.find(p => fs.existsSync(p));

  if (cscPath) {
    console.log(`Compiling native Windows launcher via csc.exe (${cscPath})...`);
    const csSourcePath = path.join(__dirname, 'Launcher.cs');
    const csCode = `using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace GeminiLive
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string[] candidates = new string[]
                {
                    Path.Combine(baseDir, "dist", "Gemini Live-win32-x64", "Gemini Live.exe"),
                    Path.Combine(baseDir, "Gemini Live-win32-x64", "Gemini Live.exe"),
                    Path.Combine(baseDir, "..", "dist", "Gemini Live-win32-x64", "Gemini Live.exe"),
                    Path.Combine(baseDir, "..", "Gemini Live-win32-x64", "Gemini Live.exe")
                };

                string targetExe = null;
                foreach (string candidate in candidates)
                {
                    if (File.Exists(candidate))
                    {
                        targetExe = Path.GetFullPath(candidate);
                        break;
                    }
                }

                if (targetExe != null)
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = targetExe;
                    psi.WorkingDirectory = Path.GetDirectoryName(targetExe);
                    if (args != null && args.Length > 0)
                    {
                        psi.Arguments = string.Join(" ", args);
                    }
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                    return;
                }

                // Fallback: check start.bat
                string startBat = Path.Combine(baseDir, "start.bat");
                if (File.Exists(startBat))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = "cmd.exe";
                    psi.Arguments = "/c \\"" + startBat + "\\"";
                    psi.WorkingDirectory = baseDir;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                    psi.CreateNoWindow = true;
                    Process.Start(psi);
                    return;
                }

                MessageBox.Show("Gemini Live executable could not be found.\\nPlease run 'npm run build:exe' in the project directory.", "Gemini Live", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error starting Gemini Live:\\n" + ex.Message, "Gemini Live", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
`;
    fs.writeFileSync(csSourcePath, csCode, 'utf-8');

    try {
      const iconParam = fs.existsSync(iconIco) ? ` /win32icon:"${iconIco}"` : '';
      execSync(`"${cscPath}" /nologo /target:winexe /r:System.Windows.Forms.dll${iconParam} /out:"${rootExe}" "${csSourcePath}"`, {
        stdio: 'inherit'
      });
      fs.copyFileSync(rootExe, distExe);
      console.log(`SUCCESS: Root executable created at ${rootExe}`);
      console.log(`SUCCESS: Dist executable created at ${distExe}`);
    } catch (e) {
      console.warn('Could not compile native C# launcher:', e.message);
    } finally {
      if (fs.existsSync(csSourcePath)) {
        fs.unlinkSync(csSourcePath);
      }
    }
  }

  // 4. Create a convenient Windows shortcut in project root for 1-click launch
  try {
    const shortcutPath = path.join(rootDir, 'Gemini Live.lnk');
    const targetPath = fs.existsSync(rootExe) ? rootExe : outputExePath;
    const workingDir = path.dirname(targetPath);
    const iconPath = fs.existsSync(iconIco) ? `${iconIco},0` : `${outputExePath},0`;

    const psScriptPath = path.join(__dirname, 'create-shortcut.ps1');
    const psScriptContent = `$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($args[0])
$Shortcut.TargetPath = $args[1]
$Shortcut.WorkingDirectory = $args[2]
$Shortcut.IconLocation = $args[3]
$Shortcut.Description = 'Gemini Live Overlay Application'
$Shortcut.Save()
`;
    fs.writeFileSync(psScriptPath, psScriptContent, 'utf-8');

    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptPath}" "${shortcutPath}" "${targetPath}" "${workingDir}" "${iconPath}"`, {
      stdio: 'inherit'
    });

    if (fs.existsSync(psScriptPath)) {
      fs.unlinkSync(psScriptPath);
    }
    console.log(`SUCCESS: Desktop shortcut created at ${shortcutPath}`);
  } catch (e) {
    console.warn('Could not create root shortcut:', e.message);
  }

  console.log('=== Build finished successfully! ===');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
