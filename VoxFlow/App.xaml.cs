using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using VoxFlow.Core;
using VoxFlow.UI;

namespace VoxFlow
{
    public partial class App : System.Windows.Application
    {
        private static Mutex? _singleInstanceMutex;

        [DllImport("kernel32.dll")]
        private static extern bool AttachConsole(int dwProcessId);

        private void Application_Startup(object sender, StartupEventArgs e)
        {
            if (e.Args.Any(a => a.Equals("--self-test", StringComparison.OrdinalIgnoreCase)))
            {
                AttachConsole(-1);
                int code = SelfTestRunner.RunAllTests();
                Environment.Exit(code);
                return;
            }

            _singleInstanceMutex = new Mutex(true, "VoxFlow_Desktop_Overlay_SingleInstance_Mutex_v2", out bool isNewInstance);
            if (!isNewInstance)
            {
                Shutdown();
                return;
            }

            var mainWindow = new MainWindow();
            MainWindow = mainWindow;
            mainWindow.Show();
        }
    }
}
