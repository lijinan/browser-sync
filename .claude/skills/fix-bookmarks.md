# 修复书签管理模块 Bug

> 专门用于诊断和修复书签管理相关的 bug

---

## 使用场景

当遇到以下问题时使用此 skill：
- 书签无法创建、更新、删除
- 书签列表加载失败
- 书签加密/解密错误
- 书签同步问题
- 书签排序/分类错误

---

## 相关文件

| 类型 | 文件路径 | 说明 |
|------|----------|------|
| 后端路由 | [backend/src/routes/bookmarks.js](../../../backend/src/routes/bookmarks.js) | 书签 API 路由 |
| 前端页面 | [web-client/src/pages/Bookmarks.jsx](../../../web-client/src/pages/Bookmarks.jsx) | 书签管理页面 |
| 数据库迁移 | [backend/migrations/002_create_bookmarks_table.js](../../../backend/migrations/002_create_bookmarks_table.js) | 书签表结构 |

---

## 常见 Bug 与修复

### 1. 书签加密/解密失败

**症状：**
```
错误: Malformed UTF-8 data
错误: Invalid ciphertext
```

**可能原因：**
- `ENCRYPTION_KEY` 配置不一致
- 数据格式错误
- crypto-js 版本问题

**修复步骤：**
1. 确认后端 `.env` 中的 `ENCRYPTION_KEY` 配置正确（32 字节）
2. 检查加密数据格式是否为 JSON 字符串
3. 检查前端是否正确解密

**相关代码：**
```javascript
// backend/src/routes/bookmarks.js
const encryptData = (data) => {
  return CryptoJS.AES.encrypt(
    JSON.stringify(data),
    process.env.ENCRYPTION_KEY
  ).toString();
};

const decryptData = (encryptedData) => {
  const bytes = CryptoJS.AES.decrypt(
    encryptedData,
    process.env.ENCRYPTION_KEY
  );
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};
```

---

### 2. 书签创建返回 400 错误

**症状：**
```
错误: 参数验证失败
```

**验证规则：**
```javascript
const bookmarkSchema = Joi.object({
  title: Joi.string().required(),
  url: Joi.string().min(1).required(),
  folder: Joi.string().allow('').optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  description: Joi.string().allow('').optional(),
  position: Joi.number().integer().default(0)
});
```

**修复步骤：**
1. 确保 title 不为空
2. 确保 url 不为空且长度 ≥ 1
3. 确保 tags 是字符串数组

---

### 3. 书签列表为空或显示异常

**症状：**
- 后端返回数据但前端显示为空
- 解密后的数据格式不正确

**修复步骤：**
1. 检查后端是否正确返回 `bookmarks` 数组
2. 检查前端是否正确解密数据
3. 检查 `user_id` 是否正确传递

**相关代码：**
```javascript
// 后端获取书签
const bookmarks = await db('bookmarks')
  .where({ user_id: req.user.id })
  .orderBy('position', 'asc')
  .orderBy('created_at', 'desc');

// 返回格式
res.json({
  bookmarks: bookmarks.map(b => ({
    ...b,
    data: decryptData(b.encrypted_data)
  }))
});
```

---

### 4. 书签更新失败 (404)

**症状：**
```
错误: 书签不存在
状态码: 404
```

**可能原因：**
- 书签 ID 不正确
- user_id 不匹配（试图操作其他用户的书签）

**修复代码：**
```javascript
// 确保查询包含 user_id 验证
const bookmark = await db('bookmarks')
  .where({ id: req.params.id, user_id: req.user.id })
  .first();

if (!bookmark) {
  return res.status(404).json({ error: '书签不存在' });
}
```

---

### 5. position 排序不生效

**症状：**
- 书签顺序混乱
- position 字段未被正确更新

**修复步骤：**
1. 检查创建书签时 position 默认值是否为 0
2. 检查更新书签时是否正确更新 position
3. 确认查询时包含 `orderBy('position', 'asc')`

**数据库迁移：**
```javascript
// migrations/004_add_position_to_bookmarks.js
exports.up = function(knex) {
  return knex.schema.table('bookmarks', function(table) {
    table.integer('position').defaultTo(0);
  });
};
```

---

### 6. WebSocket 同步通知未发送

**症状：**
- 创建/更新/删除书签后其他设备未收到通知

**修复步骤：**
1. 检查 WebSocket 服务是否正确初始化
2. 检查广播方法是否被调用
3. 确认用户 ID 正确传递

**相关代码：**
```javascript
// backend/src/routes/bookmarks.js
const webSocketService = require('../services/websocket');

// 创建书签后
webSocketService.broadcastToUser(req.user.id, 'bookmark_change', {
  action: 'create',
  bookmark: bookmarkData
});
```

---

### 7. 前端书签删除确认问题

**症状：**
- 点击删除后书签未被删除
- 删除确认弹窗异常

**修复代码：**
```javascript
// web-client/src/pages/Bookmarks.jsx
const handleDelete = async (id) => {
  try {
    await api.delete(`/bookmarks/${id}`);
    message.success('书签删除成功');
    loadBookmarks();
  } catch (error) {
    message.error('删除失败');
  }
};
```

---

### 8. 搜索过滤功能异常

**症状：**
- 搜索框输入后无结果
- 分类过滤不正确

**修复步骤：**
1. 检查前端搜索逻辑是否正确
2. 确保过滤条件正确应用

**相关代码：**
```javascript
// 前端过滤逻辑
const filteredBookmarks = bookmarks.filter(b => {
  const matchSearch = b.title.toLowerCase().includes(searchText.toLowerCase()) ||
                      b.url.toLowerCase().includes(searchText.toLowerCase());
  const matchFolder = !selectedFolder || b.folder === selectedFolder;
  return matchSearch && matchFolder;
});
```

---

## 数据库检查

```sql
-- 检查书签表结构
\d bookmarks

-- 检查书签数据
SELECT id, user_id, substring(encrypted_data, 1, 50) as data_preview,
       position, created_at FROM bookmarks LIMIT 5;

-- 检查 position 字段
SELECT id, position FROM bookmarks ORDER BY position ASC LIMIT 10;

-- 检查用户书签数量
SELECT user_id, COUNT(*) as count FROM bookmarks GROUP BY user_id;
```

---

## 加密测试

```javascript
// 测试加密解密
const CryptoJS = require('crypto-js');

const data = { title: 'Test', url: 'https://example.com' };
const key = 'your_32_byte_encryption_key_here';

const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
console.log('Encrypted:', encrypted);

const bytes = CryptoJS.AES.decrypt(encrypted, key);
const decrypted = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
console.log('Decrypted:', decrypted);
```

---

## API 端点测试

```bash
# 获取书签列表
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/bookmarks

# 创建书签
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","url":"https://example.com"}' \
  http://localhost:3001/api/bookmarks

# 更新书签
curl -X PUT -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated"}' \
  http://localhost:3001/api/bookmarks/1

# 删除书签
curl -X DELETE -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/bookmarks/1
```
