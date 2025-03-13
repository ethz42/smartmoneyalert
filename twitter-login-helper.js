// Twitter 登录助手 - 简化版
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config();

// Cookie 文件路径
const COOKIE_FILE_PATH = path.join(__dirname, 'twitter_cookies.json');

// 创建 Express 应用
const app = express();
const PORT = 3000;

// 设置 JSON 解析中间件
app.use(express.json());

// 主页 - 显示说明
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Twitter 登录助手</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        h1 { color: #1DA1F2; }
        pre { background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }
        .step { margin-bottom: 20px; }
        .code { font-family: monospace; background-color: #f5f5f5; padding: 2px 5px; border-radius: 3px; }
        textarea { width: 100%; height: 200px; margin: 10px 0; }
        button { background-color: #1DA1F2; color: white; border: none; padding: 10px 20px; cursor: pointer; }
        button:hover { background-color: #0c85d0; }
      </style>
    </head>
    <body>
      <h1>Twitter 登录助手</h1>
      
      <div class="step">
        <h2>步骤 1: 设置 SSH 隧道</h2>
        <p>在本地计算机上运行以下命令创建 SSH 隧道：</p>
        <pre>ssh -D 8080 root@23.106.141.146</pre>
      </div>
      
      <div class="step">
        <h2>步骤 2: 配置浏览器代理</h2>
        <p>在 Firefox 中设置 SOCKS 代理：</p>
        <ol>
          <li>打开 Firefox 浏览器</li>
          <li>点击右上角菜单 ≡ > 设置</li>
          <li>滚动到底部，点击 "网络设置"</li>
          <li>选择 "手动代理配置"</li>
          <li>SOCKS 主机：<span class="code">127.0.0.1</span>，端口：<span class="code">8080</span></li>
          <li>选择 "SOCKS v5"</li>
          <li>勾选 "为所有协议使用此代理服务器"</li>
          <li>点击 "确定" 保存设置</li>
        </ol>
      </div>
      
      <div class="step">
        <h2>步骤 3: 登录 Twitter</h2>
        <p>使用配置了代理的浏览器访问 <a href="https://twitter.com" target="_blank">Twitter</a> 并登录您的账号。</p>
        <p>完成所有验证步骤，确保成功登录。</p>
      </div>
      
      <div class="step">
        <h2>步骤 4: 获取 Cookie</h2>
        <p>在浏览器中按 F12 打开开发者工具，切换到 Console 标签，粘贴并运行以下代码：</p>
        <pre>
(function() {
  // 获取所有 Cookie
  const cookies = document.cookie.split(';').map(cookie => {
    const [name, value] = cookie.trim().split('=');
    return { name, value, domain: '.twitter.com', path: '/' };
  });
  
  // 打印 Cookie 到控制台
  console.log(JSON.stringify(cookies, null, 2));
  
  // 复制到剪贴板
  navigator.clipboard.writeText(JSON.stringify(cookies, null, 2))
    .then(() => console.log('Cookie 已复制到剪贴板'))
    .catch(err => console.error('无法复制到剪贴板:', err));
})();
        </pre>
      </div>
      
      <div class="step">
        <h2>步骤 5: 提交 Cookie</h2>
        <p>将从控制台获取的 Cookie JSON 粘贴到下面的文本框中：</p>
        <textarea id="cookieJson" placeholder="粘贴 Cookie JSON 数据..."></textarea>
        <button onclick="submitCookies()">保存 Cookie</button>
        <div id="result"></div>
      </div>
      
      <script>
        function submitCookies() {
          const cookieJson = document.getElementById('cookieJson').value;
          if (!cookieJson) {
            document.getElementById('result').innerText = '请先粘贴 Cookie 数据';
            return;
          }
          
          try {
            // 验证 JSON 格式
            JSON.parse(cookieJson);
            
            // 发送到服务器
            fetch('/save-cookies', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ cookies: cookieJson })
            })
            .then(response => response.json())
            .then(data => {
              document.getElementById('result').innerText = data.message;
            })
            .catch(error => {
              document.getElementById('result').innerText = '保存失败: ' + error.message;
            });
          } catch (error) {
            document.getElementById('result').innerText = 'JSON 格式无效: ' + error.message;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// 保存 Cookie 的端点
app.post('/save-cookies', (req, res) => {
  try {
    const { cookies } = req.body;
    
    // 验证 JSON 格式
    JSON.parse(cookies);
    
    // 保存到文件
    fs.writeFileSync(COOKIE_FILE_PATH, cookies);
    
    res.json({ success: true, message: 'Cookie 已成功保存！您现在可以运行 smartmoneyalert.ts 脚本了。' });
  } catch (error) {
    res.status(400).json({ success: false, message: `保存 Cookie 失败: ${error.message}` });
  }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Twitter 登录助手已启动，请访问 http://YOUR_VPS_IP:${PORT}`);
  console.log('按照网页上的说明获取并提交 Twitter Cookie');
}); 