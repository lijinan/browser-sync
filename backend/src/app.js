const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const bookmarkRoutes = require('./routes/bookmarks');
const passwordRoutes = require('./routes/passwords');
const importExportRoutes = require('./routes/import-export');
const { errorHandler } = require('./middleware/errorHandler');
const webSocketService = require('./services/websocket');

const app = express();
const server = http.createServer(app);

// 安全中间件
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3001', 
    'http://localhost:3002',
    'http://localhost:8080',  // 测试服务器
    'chrome-extension://*',
    'moz-extension://*'
  ],
  credentials: true
}));

// 限流 - 开发环境大幅放宽限制
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟窗口
  max: process.env.NODE_ENV === 'production' ? 100 : 10000, // 生产环境100个请求，开发环境10000个请求
  message: {
    error: '请求过于频繁，请稍后再试',
    retryAfter: '1分钟'
  },
  standardHeaders: true, // 返回速率限制信息在 `RateLimit-*` headers
  legacyHeaders: false, // 禁用 `X-RateLimit-*` headers
  skip: (req) => {
    // 开发环境跳过本地请求的限流
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '127.0.0.1' || ip === '::1' || ip.includes('localhost');
    }
    return false;
  }
});
app.use(limiter);

// 解析JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket状态检查
app.get('/ws/status', (req, res) => {
  const stats = webSocketService.getStats();
  res.json({
    status: 'ok',
    websocket: stats,
    timestamp: new Date().toISOString()
  });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/passwords', passwordRoutes);
app.use('/api/import-export', importExportRoutes);

// 为浏览器扩展提供不带前缀的路由
app.use('/auth', authRoutes);
app.use('/bookmarks', bookmarkRoutes);
app.use('/passwords', passwordRoutes);
app.use('/import-export', importExportRoutes);

// 错误处理
app.use(errorHandler);

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

const PORT = process.env.PORT || 3001;

// 初始化WebSocket服务
webSocketService.initialize(server);

server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`WebSocket服务地址: ws://localhost:${PORT}/ws`);
});

module.exports = app;