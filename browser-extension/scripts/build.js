const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

const vendor = process.argv[2];

if (!vendor || !['chrome', 'firefox'].includes(vendor)) {
  console.error('Usage: node build.js <chrome|firefox>');
  process.exit(1);
}

const srcDir = path.join(__dirname, '..');
const distDir = path.join(__dirname, '..', 'dist', vendor);
const packagesDir = path.join(__dirname, '..', 'packages');

// 确保目录存在
fs.ensureDirSync(distDir);
fs.ensureDirSync(packagesDir);

// 读取基础 manifest
const manifestPath = path.join(srcDir, 'manifest.json');
const manifest = fs.readJsonSync(manifestPath);

// 根据浏览器类型修改 manifest
if (vendor === 'chrome') {
  manifest.background = {
    service_worker: 'background.js',
    type: 'module'
  };
  // Chrome 不需要 browser_specific_settings
  delete manifest.browser_specific_settings;
} else if (vendor === 'firefox') {
  manifest.background = {
    scripts: ['browser-polyfill.js', 'background.js'],
    type: 'module'
  };
  manifest.browser_specific_settings = {
    gecko: {
      id: 'bookmark-sync@example.com',
      strict_min_version: '109.0'
    }
  };
  // Firefox 不支持 "commands" 权限和快捷键配置，需要移除
  manifest.permissions = manifest.permissions.filter(p => p !== 'commands');
  delete manifest.commands;
}

// 写入修改后的 manifest
fs.writeJsonSync(path.join(distDir, 'manifest.json'), manifest, { spaces: 2 });

// 复制其他文件
const filesToCopy = [
  'background.js',
  'background-core.js',
  'websocket-manager.js',
  'popup.js',
  'popup.html',
  'options.js',
  'options.html',
  'content.js',
  'content-script.js',
  'browser-polyfill.js',
  '_locales',
  'icons'
];

filesToCopy.forEach(file => {
  const src = path.join(srcDir, file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    fs.copySync(src, dest);
  }
});

// 创建 zip 包
const zipName = `bookmark-password-sync-extension.v2.0.0.${vendor}.zip`;
const zipPath = path.join(packagesDir, zipName);

const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`✅ ${vendor} 构建完成!`);
  console.log(`   输出目录: ${distDir}`);
  console.log(`   打包文件: ${zipPath}`);
  console.log(`   总大小: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(distDir, false);
archive.finalize();
