using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;

namespace VoxFlow.Native
{
    public struct ParsedHotkey
    {
        public bool Ctrl;
        public bool Shift;
        public bool Alt;
        public bool Win;
        public int VirtualKey;
        public string DisplayText;

        public int ModifierCount => (Ctrl ? 1 : 0) + (Shift ? 1 : 0) + (Alt ? 1 : 0) + (Win ? 1 : 0);
        public bool IsModifierOnly => VirtualKey == 0 && ModifierCount >= 2;
        public bool IsValid => VirtualKey > 0 || IsModifierOnly;
    }

    public static class Win32Helper
    {
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;

        private const uint INPUT_KEYBOARD = 1;
        private const uint KEYEVENTF_KEYUP = 0x0002;

        public const ushort VK_SHIFT = 0x10;
        public const ushort VK_CONTROL = 0x11;
        public const ushort VK_MENU = 0x12; // Alt
        public const ushort VK_LSHIFT = 0xA0;
        public const ushort VK_RSHIFT = 0xA1;
        public const ushort VK_LCONTROL = 0xA2;
        public const ushort VK_RCONTROL = 0xA3;
        public const ushort VK_LMENU = 0xA4;
        public const ushort VK_RMENU = 0xA5;
        public const ushort VK_LWIN = 0x5B;
        public const ushort VK_RWIN = 0x5C;
        public const ushort VK_V = 0x56;

        private const int GWL_EXSTYLE = -20;
        private const int WS_EX_NOACTIVATE = 0x08000000;
        private const int WS_EX_TOOLWINDOW = 0x00000080;

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT
        {
            public uint type;
            public InputUnion U;
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct InputUnion
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;
            [FieldOffset(0)]
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT
        {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string? lpModuleName);

        [DllImport("user32.dll")]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        // Foreground Window Tracking State
        private static IntPtr _lastExternalHwnd = IntPtr.Zero;
        private static string _lastExternalTitle = "";
        private static readonly uint CurrentPid = (uint)Environment.ProcessId;

        // Global Keyboard Hook State
        private static IntPtr _hookId = IntPtr.Zero;
        private static LowLevelKeyboardProc? _hookProc;
        private static ParsedHotkey _toggleOverlayHotkey;
        private static ParsedHotkey _recordHotkey;
        private static bool _isRecordHotkeyDown;
        public static bool IsCapturingCustomHotkey { get; set; }

        public static event Action? OnToggleOverlayHotkeyPressed;
        public static event Action? OnRecordHotkeyDown;
        public static event Action? OnRecordHotkeyUp;

        public static string LastExternalWindowTitle => _lastExternalTitle;
        public static IntPtr LastExternalWindowHandle => _lastExternalHwnd;

        public static void SetToolWindowStyle(IntPtr hwnd, bool noActivate = false)
        {
            if (hwnd == IntPtr.Zero) return;
            int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
            exStyle |= WS_EX_TOOLWINDOW;
            if (noActivate)
                exStyle |= WS_EX_NOACTIVATE;
            SetWindowLong(hwnd, GWL_EXSTYLE, exStyle);
        }

        public static void PollForegroundWindow()
        {
            try
            {
                IntPtr fg = GetForegroundWindow();
                if (fg == IntPtr.Zero || !IsWindow(fg)) return;

                GetWindowThreadProcessId(fg, out uint pid);
                if (pid == CurrentPid || pid == 0) return;

                var sb = new StringBuilder(256);
                int len = GetWindowText(fg, sb, sb.Capacity);
                string title = len > 0 ? sb.ToString().Trim() : "";

                // Ignore Windows desktop/shell task switcher empty windows
                if (title.Equals("Program Manager", StringComparison.OrdinalIgnoreCase) ||
                    title.Equals("Windows Shell Experience Host", StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                _lastExternalHwnd = fg;
                if (!string.IsNullOrEmpty(title))
                {
                    _lastExternalTitle = title;
                }
            }
            catch
            {
                // Ignore transient Win32 errors
            }
        }

        public static bool RestoreExternalWindowFocus()
        {
            IntPtr target = _lastExternalHwnd;
            if (target == IntPtr.Zero || !IsWindow(target)) return false;

            try
            {
                IntPtr currentFg = GetForegroundWindow();
                if (currentFg == target) return true;

                if (IsIconic(target))
                {
                    ShowWindow(target, 9); // SW_RESTORE
                }

                uint targetThread = GetWindowThreadProcessId(target, out _);
                uint currentThread = GetCurrentThreadId();
                bool attached = false;

                if (targetThread != 0 && targetThread != currentThread)
                {
                    attached = AttachThreadInput(currentThread, targetThread, true);
                }

                SetForegroundWindow(target);
                BringWindowToTop(target);

                if (attached)
                {
                    AttachThreadInput(currentThread, targetThread, false);
                }

                return GetForegroundWindow() == target;
            }
            catch
            {
                return false;
            }
        }

        public static async Task<bool> PasteToExternalWindowAsync(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return false;

            try
            {
                // 1. Copy text to Clipboard on STA thread with retry
                bool clipboardSet = false;
                if (Application.Current?.Dispatcher != null)
                {
                    await Application.Current.Dispatcher.InvokeAsync(() =>
                    {
                        for (int attempt = 0; attempt < 4; attempt++)
                        {
                            try
                            {
                                Clipboard.SetDataObject(text, true);
                                clipboardSet = true;
                                break;
                            }
                            catch
                            {
                                System.Threading.Thread.Sleep(20);
                            }
                        }
                    });
                }

                if (!clipboardSet) return false;

                // 2. Check if focus is currently on our own VoxFlow window; if so, switch back to the target app (e.g. Discord)
                IntPtr fg = GetForegroundWindow();
                GetWindowThreadProcessId(fg, out uint fgPid);
                if (fgPid == CurrentPid && _lastExternalHwnd != IntPtr.Zero && IsWindow(_lastExternalHwnd))
                {
                    RestoreExternalWindowFocus();
                    await Task.Delay(95);
                }
                else
                {
                    // Even if already in the target window, wait a brief moment for hotkey release
                    await Task.Delay(45);
                }

                // 3. Release any physically held modifier keys (Shift, Alt, Ctrl, Win) so Ctrl+V is never corrupted into Ctrl+Shift+V
                SendReleaseModifiersAndCtrlV();
                return true;
            }
            catch
            {
                return false;
            }
        }

        public static uint SendReleaseModifiersAndCtrlV()
        {
            var inputs = new List<INPUT>
            {
                // Explicitly release Shift, Alt, Win, and Ctrl first
                CreateKeyInput(VK_SHIFT, true),
                CreateKeyInput(VK_LSHIFT, true),
                CreateKeyInput(VK_RSHIFT, true),
                CreateKeyInput(VK_MENU, true),
                CreateKeyInput(VK_LMENU, true),
                CreateKeyInput(VK_RMENU, true),
                CreateKeyInput(VK_LWIN, true),
                CreateKeyInput(VK_RWIN, true),
                CreateKeyInput(VK_CONTROL, true),
                CreateKeyInput(VK_LCONTROL, true),
                CreateKeyInput(VK_RCONTROL, true),

                // Clean atomic Ctrl + V
                CreateKeyInput(VK_LCONTROL, false),
                CreateKeyInput(VK_V, false),
                CreateKeyInput(VK_V, true),
                CreateKeyInput(VK_LCONTROL, true)
            };

            INPUT[] arr = inputs.ToArray();
            return SendInput((uint)arr.Length, arr, Marshal.SizeOf<INPUT>());
        }

        private static INPUT CreateKeyInput(ushort vk, bool keyUp)
        {
            return new INPUT
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = vk,
                        wScan = 0,
                        dwFlags = keyUp ? KEYEVENTF_KEYUP : 0,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            };
        }

        // ====================================================================
        // Layout-Independent Hotkey Parsing & Low-Level Keyboard Hook
        // ====================================================================

        public static void InstallGlobalKeyboardHook()
        {
            if (_hookId != IntPtr.Zero) return;
            _hookProc = HookCallback;
            using Process curProcess = Process.GetCurrentProcess();
            using ProcessModule? curModule = curProcess.MainModule;
            IntPtr hMod = GetModuleHandle(curModule?.ModuleName);
            _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _hookProc, hMod, 0);
        }

        public static void UninstallGlobalKeyboardHook()
        {
            if (_hookId != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_hookId);
                _hookId = IntPtr.Zero;
            }
        }

        public static void ConfigureHotkeys(string toggleOverlayHotkeyStr, string recordHotkeyStr)
        {
            _toggleOverlayHotkey = ParseHotkey(toggleOverlayHotkeyStr);
            _recordHotkey = ParseHotkey(recordHotkeyStr);
            _isRecordHotkeyDown = false;
        }

        public static ParsedHotkey ParseHotkey(string? hotkeyStr)
        {
            var result = new ParsedHotkey { DisplayText = "" };
            if (string.IsNullOrWhiteSpace(hotkeyStr)) return result;

            string normalized = VoxFlow.Core.ConfigManager.NormalizeHotkeyString(hotkeyStr);
            string[] parts = normalized.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            var displayParts = new List<string>();

            foreach (string rawPart in parts)
            {
                string p = rawPart.Trim();
                if (p.Equals("Ctrl", StringComparison.OrdinalIgnoreCase) ||
                    p.Equals("Control", StringComparison.OrdinalIgnoreCase) ||
                    p.Equals("CommandOrControl", StringComparison.OrdinalIgnoreCase))
                {
                    result.Ctrl = true;
                }
                else if (p.Equals("Shift", StringComparison.OrdinalIgnoreCase))
                {
                    result.Shift = true;
                }
                else if (p.Equals("Alt", StringComparison.OrdinalIgnoreCase))
                {
                    result.Alt = true;
                }
                else if (p.Equals("Win", StringComparison.OrdinalIgnoreCase) ||
                         p.Equals("Super", StringComparison.OrdinalIgnoreCase) ||
                         p.Equals("Meta", StringComparison.OrdinalIgnoreCase))
                {
                    result.Win = true;
                }
                else
                {
                    int vk = KeyNameToVirtualKey(p);
                    if (vk > 0)
                    {
                        result.VirtualKey = vk;
                    }
                }
            }

            if (result.Ctrl) displayParts.Add("Ctrl");
            if (result.Alt) displayParts.Add("Alt");
            if (result.Shift) displayParts.Add("Shift");
            if (result.Win) displayParts.Add("Win");
            if (result.VirtualKey > 0) displayParts.Add(VirtualKeyToDisplayName(result.VirtualKey));

            result.DisplayText = result.IsValid ? string.Join("+", displayParts) : "";
            return result;
        }

        public static string GetActiveModifierChordPreview()
        {
            ModifierKeys mods = Keyboard.Modifiers;
            var parts = new List<string>();
            if ((mods & ModifierKeys.Control) != 0) parts.Add("Ctrl");
            if ((mods & ModifierKeys.Alt) != 0) parts.Add("Alt");
            if ((mods & ModifierKeys.Shift) != 0) parts.Add("Shift");
            if ((mods & ModifierKeys.Windows) != 0) parts.Add("Win");

            if (parts.Count >= 2)
                return string.Join("+", parts);

            if (Keyboard.IsKeyDown(Key.RightAlt))
                return "RightAlt";
            if (Keyboard.IsKeyDown(Key.RightCtrl))
                return "RightCtrl";

            return "";
        }

        public static string BuildHotkeyFromWpfKeyEvent(System.Windows.Input.KeyEventArgs e)
        {
            Key key = e.Key == Key.System ? e.SystemKey : e.Key;

            // Ignore standalone modifier presses on KeyDown (handled on KeyUp if chord)
            if (key == Key.LeftCtrl || key == Key.RightCtrl ||
                key == Key.LeftShift || key == Key.RightShift ||
                key == Key.LeftAlt || key == Key.RightAlt ||
                key == Key.LWin || key == Key.RWin)
            {
                return "";
            }

            int vk = KeyInterop.VirtualKeyFromKey(key);
            if (vk <= 0) return "";

            var parts = new List<string>();
            ModifierKeys mods = Keyboard.Modifiers;
            if ((mods & ModifierKeys.Control) != 0) parts.Add("Ctrl");
            if ((mods & ModifierKeys.Alt) != 0) parts.Add("Alt");
            if ((mods & ModifierKeys.Shift) != 0) parts.Add("Shift");
            if ((mods & ModifierKeys.Windows) != 0) parts.Add("Win");

            string keyName = VirtualKeyToDisplayName(vk);
            if (string.IsNullOrEmpty(keyName)) return "";

            parts.Add(keyName);
            return string.Join("+", parts);
        }

        public static int KeyNameToVirtualKey(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return 0;
            string upper = name.Trim().ToUpperInvariant();

            if (upper.Length == 1)
            {
                char c = upper[0];
                if (c >= 'A' && c <= 'Z') return c;
                if (c >= '0' && c <= '9') return c;
            }

            return upper switch
            {
                "RIGHTALT" or "RALT" => VK_RMENU,
                "RIGHTCTRL" or "RCTRL" => VK_RCONTROL,
                "SPACE" or "SPACEBAR" => 0x20,
                "TAB" => 0x09,
                "ENTER" or "RETURN" => 0x0D,
                "ESC" or "ESCAPE" => 0x1B,
                "BACKSPACE" or "BACK" => 0x08,
                "INSERT" or "INS" => 0x2D,
                "DELETE" or "DEL" => 0x2E,
                "HOME" => 0x24,
                "END" => 0x23,
                "PAGEUP" or "PGUP" => 0x21,
                "PAGEDOWN" or "PGDN" => 0x22,
                "PAUSE" => 0x13,
                "CAPSLOCK" => 0x14,
                "SCROLLLOCK" => 0x91,
                "F1" => 0x70,
                "F2" => 0x71,
                "F3" => 0x72,
                "F4" => 0x73,
                "F5" => 0x74,
                "F6" => 0x75,
                "F7" => 0x76,
                "F8" => 0x77,
                "F9" => 0x78,
                "F10" => 0x79,
                "F11" => 0x7A,
                "F12" => 0x7B,
                "`" or "TILDE" or "OEM3" or "OEMTILDE" => 0xC0,
                "-" or "MINUS" or "OEMMINUS" => 0xBD,
                "=" or "PLUS" or "OEMPLUS" => 0xBB,
                "[" or "OEMOPENBRACKETS" => 0xDB,
                "]" or "OEMCLOSEBRACKETS" => 0xDD,
                ";" or "OEMSEMICOLON" or "OEM1" => 0xBA,
                "'" or "OEMQUOTES" or "OEM7" => 0xDE,
                "," or "OEMCOMMA" => 0xBC,
                "." or "OEMPERIOD" => 0xBE,
                "/" or "OEMQUESTION" or "OEM2" => 0xBF,
                "\\" or "OEMPIPE" or "OEM5" => 0xDC,
                _ => TryParseEnumKey(upper)
            };
        }

        private static int TryParseEnumKey(string keyName)
        {
            if (Enum.TryParse<Key>(keyName, true, out Key k))
            {
                return KeyInterop.VirtualKeyFromKey(k);
            }
            return 0;
        }

        public static string VirtualKeyToDisplayName(int vk)
        {
            if (vk >= 'A' && vk <= 'Z') return ((char)vk).ToString();
            if (vk >= '0' && vk <= '9') return ((char)vk).ToString();
            if (vk >= 0x70 && vk <= 0x7B) return $"F{vk - 0x70 + 1}";

            return vk switch
            {
                VK_RMENU => "RightAlt",
                VK_RCONTROL => "RightCtrl",
                0x20 => "Space",
                0x09 => "Tab",
                0x0D => "Enter",
                0x1B => "Esc",
                0x08 => "Backspace",
                0x2D => "Insert",
                0x2E => "Delete",
                0x24 => "Home",
                0x23 => "End",
                0x21 => "PageUp",
                0x22 => "PageDown",
                0x13 => "Pause",
                0x14 => "CapsLock",
                0x91 => "ScrollLock",
                0xC0 => "`",
                0xBD => "-",
                0xBB => "=",
                0xDB => "[",
                0xDD => "]",
                0xBA => ";",
                0xDE => "'",
                0xBC => ",",
                0xBE => ".",
                0xBF => "/",
                0xDC => "\\",
                _ => KeyInterop.KeyFromVirtualKey(vk).ToString()
            };
        }

        private static bool IsKeyDown(int vk) => (GetAsyncKeyState(vk) & 0x8000) != 0;

        private static void GetEffectiveModifiers(int currentVk, bool isCurrentDown, out bool ctrl, out bool shift, out bool alt, out bool win)
        {
            bool isCtrlVk = currentVk == VK_CONTROL || currentVk == VK_LCONTROL || currentVk == VK_RCONTROL;
            bool isShiftVk = currentVk == VK_SHIFT || currentVk == VK_LSHIFT || currentVk == VK_RSHIFT;
            bool isAltVk = currentVk == VK_MENU || currentVk == VK_LMENU || currentVk == VK_RMENU;
            bool isWinVk = currentVk == VK_LWIN || currentVk == VK_RWIN;

            ctrl = isCtrlVk ? isCurrentDown : (IsKeyDown(VK_CONTROL) || IsKeyDown(VK_LCONTROL) || IsKeyDown(VK_RCONTROL));
            shift = isShiftVk ? isCurrentDown : (IsKeyDown(VK_SHIFT) || IsKeyDown(VK_LSHIFT) || IsKeyDown(VK_RSHIFT));
            alt = isAltVk ? isCurrentDown : (IsKeyDown(VK_MENU) || IsKeyDown(VK_LMENU) || IsKeyDown(VK_RMENU));
            win = isWinVk ? isCurrentDown : (IsKeyDown(VK_LWIN) || IsKeyDown(VK_RWIN));
        }

        private static bool MatchesModifiers(ParsedHotkey hk, int currentVk, bool isCurrentDown)
        {
            // Special case for standalone RightAlt or RightCtrl
            if ((hk.VirtualKey == VK_RMENU || hk.VirtualKey == VK_RCONTROL) && hk.ModifierCount == 0)
            {
                return true;
            }

            GetEffectiveModifiers(currentVk, isCurrentDown, out bool ctrlDown, out bool shiftDown, out bool altDown, out bool winDown);
            return ctrlDown == hk.Ctrl &&
                   shiftDown == hk.Shift &&
                   altDown == hk.Alt &&
                   winDown == hk.Win;
        }

        private static bool IsModifierVk(int vk)
        {
            return vk == VK_CONTROL || vk == VK_LCONTROL || vk == VK_RCONTROL ||
                   vk == VK_SHIFT || vk == VK_LSHIFT || vk == VK_RSHIFT ||
                   vk == VK_MENU || vk == VK_LMENU || vk == VK_RMENU ||
                   vk == VK_LWIN || vk == VK_RWIN;
        }

        private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && !IsCapturingCustomHotkey)
            {
                int msg = wParam.ToInt32();
                var kb = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
                int vk = (int)kb.vkCode;

                bool isDown = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
                bool isUp = msg == WM_KEYUP || msg == WM_SYSKEYUP;

                if (isDown)
                {
                    // 1. Toggle Overlay Hotkey
                    if (_toggleOverlayHotkey.IsValid)
                    {
                        if (_toggleOverlayHotkey.IsModifierOnly)
                        {
                            if (IsModifierVk(vk) && MatchesModifiers(_toggleOverlayHotkey, vk, true))
                            {
                                Application.Current?.Dispatcher?.BeginInvoke(() => OnToggleOverlayHotkeyPressed?.Invoke());
                            }
                        }
                        else if (vk == _toggleOverlayHotkey.VirtualKey && MatchesModifiers(_toggleOverlayHotkey, vk, true))
                        {
                            Application.Current?.Dispatcher?.BeginInvoke(() => OnToggleOverlayHotkeyPressed?.Invoke());
                            return (IntPtr)1;
                        }
                    }

                    // 2. Record Hotkey
                    if (_recordHotkey.IsValid)
                    {
                        if (_recordHotkey.IsModifierOnly)
                        {
                            if (IsModifierVk(vk) && MatchesModifiers(_recordHotkey, vk, true))
                            {
                                if (!_isRecordHotkeyDown)
                                {
                                    _isRecordHotkeyDown = true;
                                    Application.Current?.Dispatcher?.BeginInvoke(() => OnRecordHotkeyDown?.Invoke());
                                }
                            }
                        }
                        else if (vk == _recordHotkey.VirtualKey && MatchesModifiers(_recordHotkey, vk, true))
                        {
                            if (!_isRecordHotkeyDown)
                            {
                                _isRecordHotkeyDown = true;
                                Application.Current?.Dispatcher?.BeginInvoke(() => OnRecordHotkeyDown?.Invoke());
                            }
                            return (IntPtr)1;
                        }
                    }
                }
                else if (isUp)
                {
                    if (_isRecordHotkeyDown && _recordHotkey.IsValid)
                    {
                        if (_recordHotkey.IsModifierOnly)
                        {
                            if (IsModifierVk(vk) && !MatchesModifiers(_recordHotkey, vk, false))
                            {
                                _isRecordHotkeyDown = false;
                                Application.Current?.Dispatcher?.BeginInvoke(() => OnRecordHotkeyUp?.Invoke());
                            }
                        }
                        else if (vk == _recordHotkey.VirtualKey)
                        {
                            _isRecordHotkeyDown = false;
                            Application.Current?.Dispatcher?.BeginInvoke(() => OnRecordHotkeyUp?.Invoke());
                        }
                    }
                }
            }

            return CallNextHookEx(_hookId, nCode, wParam, lParam);
        }
    }
}
