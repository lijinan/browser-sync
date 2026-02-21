# 后端中间件

> Level 3 文档 - 中间件详细说明

---

## 中间件列表

| 中间件 | 文件 | 说明 |
|--------|------|------|
| 认证中间件 | [middleware/auth.js](../../backend/src/middleware/auth.js) | JWT Token 验证 |
| 错误处理 | [middleware/errorHandler.js](../../backend/src/middleware/errorHandler.js) | 统一错误处理 |

---

## 认证中间件 (auth.js)

### 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [backend/src/middleware/auth.js](../../backend/src/middleware/auth.js) |
| **导出** | `authenticateToken` |

### 功能说明

验证请求头中的 JWT Token，解析用户信息并注入到 `req.user`。

### 实现代码

```javascript
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = async (req, res, next) => {
  // 1. 从请求头获取 Token
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '访问令牌缺失' });
  }

  try {
    // 2. 验证 JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. 兼容新旧 JWT 格式
    const userId = decoded.id || decoded.userId;
    
    // 4. 如果 JWT 包含用户信息，直接使用
    if (decoded.name && decoded.email) {
      req.user = { 
        id: userId, 
        name: decoded.name, 
        email: decoded.email 
      };
      next();
      return;
    }
    
    // 5. 否则从数据库获取用户信息
    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    req.user = { id: user.id, name: user.name, email: user.email };
    next();
  } catch (error) {
    return res.status(403).json({ error: '无效的访问令牌' });
  }
};

module.exports = { authenticateToken };
```

### 使用方式

```javascript
const { authenticateToken } = require('../middleware/auth');

// 应用到单个路由
router.get('/protected', authenticateToken, handler);

// 应用到整个路由器
router.use(authenticateToken);
```

### 请求头格式

```
Authorization: Bearer <jwt_token>
```

### 响应状态码

| 状态码 | 说明 |
|--------|------|
| 401 | Token 缺失 |
| 403 | Token 无效或过期 |

### 注入的 req.user 结构

```javascript
req.user = {
  id: number,      // 用户 ID
  name: string,    // 用户名
  email: string    // 邮箱
};
```

---

## 错误处理中间件 (errorHandler.js)

### 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [backend/src/middleware/errorHandler.js](../../backend/src/middleware/errorHandler.js) |
| **导出** | `errorHandler` |

### 功能说明

统一捕获和处理应用中的错误，返回标准化的错误响应。

### 实现代码

```javascript
const errorHandler = (err, req, res, next) => {
  console.error('错误:', err);

  // Joi 验证错误
  if (err.isJoi) {
    return res.status(400).json({
      error: '参数验证失败',
      details: err.details.map(d => d.message)
    });
  }

  // 数据库错误
  if (err.code === '23505') {
    return res.status(409).json({
      error: '数据已存在'
    });
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    return res.status(403).json({
      error: '无效的令牌'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: '令牌已过期'
    });
  }

  // 默认服务器错误
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误'
  });
};

module.exports = { errorHandler };
```

### 使用方式

```javascript
const { errorHandler } = require('./middleware/errorHandler');

// 必须放在所有路由之后
app.use(errorHandler);
```

### 错误类型处理

| 错误类型 | 状态码 | 说明 |
|----------|--------|------|
| Joi 验证错误 | 400 | 参数验证失败 |
| 唯一约束冲突 | 409 | 数据已存在 |
| JWT 无效 | 403 | 令牌无效 |
| JWT 过期 | 401 | 令牌已过期 |
| 其他错误 | 500 | 服务器内部错误 |

---

## 中间件执行顺序

```
请求
  │
  ▼
┌─────────────┐
│   helmet    │ ─── HTTP 安全头
└─────────────┘
  │
  ▼
┌─────────────┐
│    cors     │ ─── 跨域处理
└─────────────┘
  │
  ▼
┌─────────────┐
│ rate-limit  │ ─── 请求限流
└─────────────┘
  │
  ▼
┌─────────────┐
│ body-parser │ ─── 解析请求体
└─────────────┘
  │
  ▼
┌─────────────┐
│   router    │ ─── 路由匹配
└─────────────┘
  │
  ▼
┌─────────────┐
│    auth     │ ─── JWT 验证 (需要认证的路由)
└─────────────┘
  │
  ▼
┌─────────────┐
│  handler    │ ─── 业务处理
└─────────────┘
  │
  ▼ (如有错误)
┌─────────────┐
│ errorHandler│ ─── 错误处理
└─────────────┘
  │
  ▼
响应
```

---

## 自定义错误使用

```javascript
// 在路由中抛出错误
router.get('/example', authenticateToken, async (req, res, next) => {
  try {
    // 业务逻辑
    if (!data) {
      const error = new Error('资源不存在');
      error.status = 404;
      throw error;
    }
    res.json(data);
  } catch (error) {
    next(error);  // 传递给错误处理中间件
  }
});
```
