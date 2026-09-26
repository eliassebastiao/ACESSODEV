using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Threading;

namespace ScreenHostEngine {
    class Program {
        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);
        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
        [DllImport("user32.dll")]
        static extern bool GetCursorInfo(out CURSORINFO pci);
        [DllImport("user32.dll")]
        static extern bool DrawIcon(IntPtr hDC, int X, int Y, IntPtr hIcon);

        [StructLayout(LayoutKind.Sequential)]
        struct POINT { public int x; public int y; }

        [StructLayout(LayoutKind.Sequential)]
        struct CURSORINFO {
            public Int32 cbSize;
            public Int32 flags;
            public IntPtr hCursor;
            public POINT ptScreenPos;
        }

        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const int CURSOR_SHOWING = 0x00000001;

        static ImageCodecInfo jpgEncoder;
        static EncoderParameters encParams;
        static int screenWidth = 0;
        static int screenHeight = 0;
        static volatile bool running = true;
        static long targetFps = 30;
        static long quality = 65;
        static TcpClient streamClient = null;
        static NetworkStream streamWriter = null;
        static object streamLock = new object();
        [DllImport("user32.dll")]
        static extern IntPtr GetDesktopWindow();
        [DllImport("user32.dll")]
        static extern IntPtr GetDC(IntPtr hWnd);
        [DllImport("user32.dll")]
        static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);
        [DllImport("user32.dll")]
        static extern bool CloseDesktop(IntPtr hDesktop);

        const uint DESKTOP_READOBJECTS = 0x0001;
        const uint DESKTOP_SWITCHDESKTOP = 0x0100;

        // Verifica se o processo tem acesso a uma sessao grafica interactiva.
        // Sem isso, CopyFromScreen devolve sempre uma imagem preta.
        static bool HasInteractiveDesktop() {
            try {
                IntPtr desktop = OpenInputDesktop(0, false, DESKTOP_READOBJECTS | DESKTOP_SWITCHDESKTOP);
                if (desktop == IntPtr.Zero) return false;
                CloseDesktop(desktop);
                return true;
            } catch {
                return false;
            }
        }

        static void Main(string[] args) {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            Rectangle bounds = Screen.PrimaryScreen.Bounds;
            screenWidth = bounds.Width;
            screenHeight = bounds.Height;
            InitEncoder();

            if (!HasInteractiveDesktop()) {
                Console.WriteLine("ENGINE_WARNING:NO_DESKTOP");
                Console.Error.WriteLine("AVISO: Sem sessao grafica interactiva. A captura de tela retornara imagem PRETA.");
                Console.Error.WriteLine("Solucao: inicie o aplicativo na sua sessao Windows (veja INSTALAR.bat).");
            }

            int streamPort = 48002;
            if (args.Length >= 1) int.TryParse(args[0], out streamPort);

            Thread captureThread = new Thread(() => StreamLoop(streamPort));
            captureThread.IsBackground = true;
            captureThread.Start();

            Console.WriteLine("ENGINE_READY:" + screenWidth + "x" + screenHeight);
            if (!HasInteractiveDesktop()) {
                Console.WriteLine("ENGINE_DESKTOP:ABSENT");
            } else {
                Console.WriteLine("ENGINE_DESKTOP:OK");
            }

            string line;
            while (running && (line = Console.ReadLine()) != null) {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (line == "INFO") {
                    Console.WriteLine("SCREEN:" + screenWidth + ":" + screenHeight);
                    continue;
                }
                if (line == "PING") {
                    Console.WriteLine("PONG");
                    continue;
                }
                if (line == "EXIT") {
                    running = false;
                    break;
                }

                string[] p = line.Split(' ');
                string cmd = p[0];
                try {
                    if (cmd == "MOVE" && p.Length >= 3) {
                        int x = int.Parse(p[1]);
                        int y = int.Parse(p[2]);
                        SetCursorPos(x, y);
                    } else if (cmd == "DOWN" && p.Length >= 2) {
                        int b = int.Parse(p[1]);
                        uint flag = b == 0 ? MOUSEEVENTF_LEFTDOWN : (b == 2 ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_MIDDLEDOWN);
                        mouse_event(flag, 0, 0, 0, UIntPtr.Zero);
                    } else if (cmd == "UP" && p.Length >= 2) {
                        int b = int.Parse(p[1]);
                        uint flag = b == 0 ? MOUSEEVENTF_LEFTUP : (b == 2 ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_MIDDLEUP);
                        mouse_event(flag, 0, 0, 0, UIntPtr.Zero);
                    } else if (cmd == "WHEEL" && p.Length >= 2) {
                        int delta = int.Parse(p[1]);
                        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
                    } else if (cmd == "KEYDOWN" && p.Length >= 2) {
                        byte vk = byte.Parse(p[1]);
                        keybd_event(vk, 0, 0, UIntPtr.Zero);
                    } else if (cmd == "KEYUP" && p.Length >= 2) {
                        byte vk = byte.Parse(p[1]);
                        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    } else if (cmd == "QUALITY" && p.Length >= 2) {
                        quality = Math.Max(20, Math.Min(95, long.Parse(p[1])));
                        SetQuality(quality);
                    } else if (cmd == "FPS" && p.Length >= 2) {
                        targetFps = Math.Max(5, Math.Min(60, long.Parse(p[1])));
                    }
                } catch { }
            }
        }
        static void InitEncoder() {
            foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders()) {
                if (codec.FormatID == ImageFormat.Jpeg.Guid) {
                    jpgEncoder = codec;
                    break;
                }
            }
            SetQuality(quality);
        }

        static void SetQuality(long q) {
            encParams = new EncoderParameters(1);
            encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, q);
        }

        static void StreamLoop(int port) {
            TcpListener listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();

            new Thread(() => {
                while (running) {
                    try {
                        TcpClient client = listener.AcceptTcpClient();
                        lock (streamLock) {
                            if (streamClient != null) {
                                try { streamClient.Close(); } catch { }
                            }
                            streamClient = client;
                            streamWriter = client.GetStream();
                        }
                    } catch {
                        if (!running) break;
                    }
                }
            }) { IsBackground = true }.Start();

            using (Bitmap bmp = new Bitmap(screenWidth, screenHeight, PixelFormat.Format24bppRgb))
            using (Graphics g = Graphics.FromImage(bmp))
            using (MemoryStream ms = new MemoryStream(256 * 1024)) {
                CURSORINFO ci = new CURSORINFO();
                ci.cbSize = Marshal.SizeOf(typeof(CURSORINFO));

                while (running) {
                    int frameInterval = (int)(1000 / Math.Max(1, targetFps));
                    DateTime start = DateTime.UtcNow;

                    if (streamWriter != null && streamClient != null && streamClient.Connected) {
                        try {
                            g.CopyFromScreen(0, 0, 0, 0, new Size(screenWidth, screenHeight), CopyPixelOperation.SourceCopy);
                            if (GetCursorInfo(out ci) && ci.flags == CURSOR_SHOWING) {
                                DrawIcon(g.GetHdc(), ci.ptScreenPos.x, ci.ptScreenPos.y, ci.hCursor);
                                g.ReleaseHdc();
                            }

                            ms.Position = 0;
                            ms.SetLength(0);
                            bmp.Save(ms, jpgEncoder, encParams);
                            byte[] frameBytes = ms.GetBuffer();
                            int frameLen = (int)ms.Length;

                            byte[] header = new byte[4];
                            header[0] = (byte)((frameLen >> 24) & 0xFF);
                            header[1] = (byte)((frameLen >> 16) & 0xFF);
                            header[2] = (byte)((frameLen >> 8) & 0xFF);
                            header[3] = (byte)(frameLen & 0xFF);

                            lock (streamLock) {
                                if (streamWriter != null) {
                                    streamWriter.Write(header, 0, 4);
                                    streamWriter.Write(frameBytes, 0, frameLen);
                                    streamWriter.Flush();
                                }
                            }
                        } catch {
                            lock (streamLock) {
                                streamWriter = null;
                                if (streamClient != null) {
                                    try { streamClient.Close(); } catch { }
                                    streamClient = null;
                                }
                            }
                        }
                    }

                    int elapsed = (int)(DateTime.UtcNow - start).TotalMilliseconds;
                    int sleepTime = frameInterval - elapsed;
                    if (sleepTime > 1) {
                        Thread.Sleep(sleepTime);
                    }
                }
            }
        }
    }
}
