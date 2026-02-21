# 后端路由模块

> Level 3 文档 - API 路由详细说明

---

## 路由总览

| 路由模块 | 前缀 | 文件 | 说明 |
|----------|------|------|------|
| 认证路由 | `/api/auth` | [routes/auth.js](../../backend/src/routes/auth.js) | 用户认证 |
| 书签路由 | `/api/bookmarks` | [routes/bookmarks.js](../../backend/src/routes/bookmarks.js) | 书签管理 |
| 密码路由 | `/api/passwords` | [routes/passwords.js](../../backend/src/routes/passwords.js) | 密码管理 |
| 导入导出 | `/api/import-export` | [routes/import-export.js](../../backend/src/routes/import-export.js) | 数据导入导出 |

---

## 认证路由 (auth.js)

### 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [backend/src/routes/auth.js](../../backend/src/routes/auth.js) |
| **前缀** | `/api/auth` |
| **认证** | 部分需要 |

### 端点列表

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/register` | 否 | 用户注册 |
| POST | `/login` | 否 | 用户登录 |
| GET | `/me` | 是 | 获取当前用户 |
| POST | `/verify-password` | 是 | 二次密码验证 |

### 核心逻辑

#### 用户注册

```javascript
// 验证 schema
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(50).required()
});

// 处理流程
1. 验证请求参数
2. 检查用户是否已存在
3. 使用 bcrypt 哈希密码 (12轮)
4. 创建用户记录
5. 生成 JWT Token
6. 返回用户信息和 Token
```

#### 用户登录

```javascript
// 验证 schema
const loginSchema = Joi.object({
  email: Joi.string().optional(),
  username: Joi.string().optional(),
  password: Joi.string().required()
}).or('email', 'username');

// 处理流程
1. 验证请求参数
2. 查找用户 (支持邮箱或用户名)
3. 验证密码 (bcrypt.compare)
4. 生成 JWT Token
5. 返回用户信息和 Token
```

---

## 书签路由 (bookmarks.js)

### 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [backend/src/routes/bookmarks.js](../../backend/src/routes/bookmarks.js) |
| **前缀** | `/api/bookmarks` |
| **认证** | 全部需要 |

### 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取所有书签 |
| POST | `/` | 创建书签 |
| PUT | `/:id` | 更新书签 |
| DELETE | `/:id` | 删除书签 |

### 数据加密

```javascript
// 加密函数
const encryptData = (data) => {
  return CryptoJS.AES.encrypt(
    JSON.stringify(data), 
    process.env.ENCRYPTION_KEY
  ).toString();
};

// 解密函数
const decryptData = (encryptedData) => {
  const bytes = CryptoJS.AES.decrypt(
    encryptedData, 
    process.env.ENCRYPTION_KEY
  );
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};
```

### 书签数据结构

```javascript
// 验证 schema
const bookmarkSchema = Joi.object({
  title: Joi.string().required(),
  url: Joi.string().min(1).required(),
  folder: Joi.string().allow('').optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  description: Joi.string().allow('').optional(),
  position: Joi.number().integer().default(0)
});
```

### WebSocket 同步

```javascript
// 创建/更新/删除书签后广播通知
webSocketService.broadcastToUser(req.user.id, 'bookmark_change', {
  action: 'create' | 'update' | 'delete',
  bookmark: bookmarkData
});
```

---

## 密码路由 (passwords.js)

### 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [backend/src/routes/passwords.js](../../backend/src/routes/passwords.js) |
| **前缀** | `/api/passwords` |
| **认证** | 全部需要 |

### 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取密码列表 (不含实际密码) |
| GET | `/:id` | 获取密码详情 (含实际密码) |
| POST | `/` | 创建密码记录 |
| PUT | `/:id` | 更新密码记录 |
| DELETE | `/:id` | 删除密码记录 |

### 密码数据结构

```javascript
// 验证 schema
const passwordSchema = Joi.object({
  site_name: Joi.string().required(),
  site_url: Joi.string().uri().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  notes: Joi.string().allow('').optional(),
  category: Joi.string().allow('').optional()
});
```

### 安全特性

- 列表接口不返回实际密码
- 详情接口需要单独请求
- 所有数据 AES 加密存储

---

## 导入导出路由 (import-export.js)

### 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [backend/src/routes/import-export.js](../../backend/src/routes/import-export.js) |
| **前缀** | `/api/import-export` |
| **认证** | 全部需要 |

### 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/bookmarks/export` | 导出书签为 JSON |
| GET | `/bookmarks/export/html` | 导出书签为 HTML |
| POST | `/bookmarks/import` | 导入书签 |

### 文件上传配置

```javascript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024  // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/json', 'text/html', 'text/csv', 'text/plain'];
    // 允许的文件类型验证
  }
});
```

### 导出格式

#### JSON 格式

```json
{
  "version": "1.0",
  "export_date": "2024-01-01T00:00:00.000Z",
  "user_email": "user@example.com",
  "bookmarks": [...],
  "total_count": 100
}
```

#### HTML 格式 (Netscape Bookmark File)

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- 浏览器标准书签格式 -->
<DL><p>
  <DT><H3>文件夹名</H3>
  <DL><p>
    <DT><A HREF="url">标题</A>
  </DL><p>
</DL><p>
```

---

## 路由注册

```javascript
// src/app.js
app.use('/api/auth', authRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/passwords', passwordRoutes);
app.use('/api/import-export', importExportRoutes);

// 为浏览器扩展提供不带前缀的路由
app.use('/auth', authRoutes);
app.use('/bookmarks', bookmarkRoutes);
app.use('/passwords', passwordRoutes);
app.use('/import-export', importExportRoutes);
```
