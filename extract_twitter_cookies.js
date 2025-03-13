// 将此脚本粘贴到浏览器控制台中执行
// 确保您已经登录 Twitter

(function() {
  // 获取所有 Cookie
  const cookies = document.cookie.split(';').map(cookie => {
    const [name, value] = cookie.trim().split('=');
    return { name, value, domain: '.twitter.com', path: '/' };
  });
  
  // 打印 Cookie 到控制台
  console.log('Twitter Cookie:');
  console.log(JSON.stringify(cookies, null, 2));
  
  // 创建一个可下载的文件
  const blob = new Blob([JSON.stringify(cookies, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'twitter_cookies.json';
  a.click();
  URL.revokeObjectURL(url);
  
  console.log('Cookie 已导出到文件，请保存此文件并上传到服务器');
})(); 