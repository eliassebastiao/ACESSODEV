using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Threading;

namespace RemoteHostHelper {
    public class Program {
        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;

        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP = 0x0002;

        public static void Main(string[] args) {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            Console.WriteLine("READY");

            string line;
            while ((line = Console.ReadLine()) != null) {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;

                if (line == "PING") {
                    Console.WriteLine("PONG");
                    continue;
                }

                if (line == "INFO") {
                    Rectangle bounds = Screen.PrimaryScreen.Bounds;
                    Console.WriteLine(string.Format("SCREEN:{0}:{1}", bounds.Width, bounds.Height));
                    continue;
                }

                string[] parts = line.Split(' ');
                string cmd = parts[0];

                try {
                    if (cmd == "MOUSE_MOVE" && parts.Length >= 3) {
                        int x = int.Parse(parts[1]);
                        int y = int.Parse(parts[2]);
                        SetCursorPos(x, y);
                    }
                    else if (cmd == "MOUSE_DOWN" && parts.Length >= 2) {
                        int button = int.Parse(parts[1]); // 0=left, 1=middle, 2=right
                        uint flag = button == 0 ? MOUSEEVENTF_LEFTDOWN : (button == 2 ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_MIDDLEDOWN);
                        mouse_event(flag, 0, 0, 0, UIntPtr.Zero);
                    }
                    else if (cmd == "MOUSE_UP" && parts.Length >= 2) {
                        int button = int.Parse(parts[1]);
                        uint flag = button == 0 ? MOUSEEVENTF_LEFTUP : (button == 2 ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_MIDDLEUP);
                        mouse_event(flag, 0, 0, 0, UIntPtr.Zero);
                    }
                    else if (cmd == "MOUSE_WHEEL" && parts.Length >= 2) {
                        int delta = int.Parse(parts[1]);
                        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
                    }
                    else if (cmd == "KEY_DOWN" && parts.Length >= 2) {
                        byte vk = byte.Parse(parts[1]);
                        keybd_event(vk, 0, 0, UIntPtr.Zero);
                    }
                    else if (cmd == "KEY_UP" && parts.Length >= 2) {
                        byte vk = byte.Parse(parts[1]);
                        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    }
                    else if (cmd == "EXIT") {
                        break;
                    }
                }
                catch (Exception ex) {
                    Console.Error.WriteLine("ERR:" + ex.Message);
                }
            }
        }
    }
}
