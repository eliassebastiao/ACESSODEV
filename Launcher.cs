using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace AcessoDeskLauncher {
    static class Program {
        [STAThread]
        static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string dir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = Path.Combine(dir, "server.js");

            // Iniciar Node Server em segundo plano
            ProcessStartInfo srvInfo = new ProcessStartInfo();
            srvInfo.FileName = "node.exe";
            srvInfo.Arguments = "\"" + serverScript + "\"";
            srvInfo.WorkingDirectory = dir;
            srvInfo.CreateNoWindow = true;
            srvInfo.UseShellExecute = false;

            Process srvProcess = null;
            try {
                srvProcess = Process.Start(srvInfo);
            } catch (Exception ex) {
                MessageBox.Show("Erro ao iniciar serviço: " + ex.Message, "AcessoDesk", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // Aguardar 1.2 segundos para inicializar
            System.Threading.Thread.Sleep(1200);

            // Criar janela WebBrowser moderna / Chromium WebView ou Browser Window
            Form form = new Form();
            form.Text = "AcessoDesk Ultra - Controle Remoto";
            form.Width = 1000;
            form.Height = 700;
            form.StartPosition = FormStartPosition.CenterScreen;

            WebBrowser wb = new WebBrowser();
            wb.Dock = DockStyle.Fill;
            wb.ScriptErrorsSuppressed = true;

            // Abrir no navegador padrão ou embutido
            form.Shown += (s, e) => {
                Process.Start("http://localhost:8080");
            };

            Label lbl = new Label();
            lbl.Text = "AcessoDesk Ultra está ativo e rodando no seu navegador!\n\nID e Controles disponíveis em http://localhost:8080\nVocê pode fechar esta janela para finalizar a sessão.";
            lbl.Dock = DockStyle.Fill;
            lbl.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            lbl.Font = new System.Drawing.Font("Segoe UI", 12F, System.Drawing.FontStyle.Regular);
            form.Controls.Add(lbl);

            form.FormClosing += (s, e) => {
                try {
                    if (srvProcess != null && !srvProcess.HasExited) {
                        srvProcess.Kill();
                    }
                    foreach (Process p in Process.GetProcessesByName("ScreenHostEngine")) {
                        p.Kill();
                    }
                } catch { }
            };

            Application.Run(form);
        }
    }
}
