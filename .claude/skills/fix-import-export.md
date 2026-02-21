# 修复导入导出模块 Bug

> 专门用于诊断和修复数据导入导出相关的 bug

---

## 使用场景

当遇到以下问题时使用此 skill：
- 导出文件无法下载
- 导入文件解析失败
- 文件格式不支持
- 导入数据重复或丢失
- 导出数据不完整

---

## 相关文件

| 类型 | 文件路径 | 说明 |
|------|----------|------|
| 后端路由 | [backend/src/routes/import-export.js](../../../backend/src/routes/import-export.js) | 导入导出 API |
| 前端页面 | [web-client/src/pages/ImportExport.jsx](../../../web-client/src/pages/ImportExport.jsx) | 导入导出页面 |

---

## 常见 Bug 与修复

### 1. 导出文件无法下载

**症状：**
- 点击导出后无响应
- 下载的文件内容为空或乱码

**修复步骤：**
1. 检查响应类型是否正确设置为 `blob`
2. 检查文件下载函数是否正确执行

**前端代码：**
```javascript
// web-client/src/pages/ImportExport.jsx
const exportBookmarks = async () => {
  try {
    const response = await api.get('/import-export/bookmarks/export', {
      responseType: 'blob'  // 必须设置
    });

    // 下载文件
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bookmarks_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    message.success('导出成功');
  } catch (error) {
    message.error('导出失败');
  }
};
```

---

### 2. 导入文件解析失败

**症状：**
```
错误: 不支持的文件格式
错误: 文件解析失败
```

**支持的格式：**
- JSON: application/json
- HTML: text/html, text/plain
- CSV: text/csv

**修复代码：**
```javascript
// backend/src/routes/import-export.js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024  // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/json', 'text/html', 'text/csv', 'text/plain'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  }
});
```

---

### 3. HTML 书签格式解析错误

**症状：**
- 导入浏览器导出的 HTML 书签文件失败

**Netscape 书签格式：**
```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>文件夹名</H3>
  <DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1234567890">标题</A>
  </DL><p>
</DL><p>
```

**解析代码：**
```javascript
// 后端解析 HTML 书签
const parseHtmlBookmarks = (html) => {
  const bookmarks = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const links = doc.querySelectorAll('a');

  links.forEach(link => {
    bookmarks.push({
      title: link.textContent,
      url: link.href,
      folder: link.closest('dl')?.parentElement?.querySelector('h3')?.textContent || '',
      add_date: link.getAttribute('add_date')
    });
  });

  return bookmarks;
};
```

---

### 4. 导入数据去重问题

**症状：**
- 重复导入导致数据重复
- 已存在的书签未跳过

**修复代码：**
```javascript
// backend/src/routes/import-export.js
const importBookmarks = async (req, res) => {
  const { bookmarks } = req.parsedData;
  const userId = req.user.id;

  // 获取用户现有书签
  const existingBookmarks = await db('bookmarks')
    .where({ user_id: userId })
    .select('encrypted_data');

  const existingUrls = existingBookmarks.map(b => {
    const data = decryptData(b.encrypted_data);
    return data.url;
  });

  // 过滤重复书签
  const newBookmarks = bookmarks.filter(b => !existingUrls.includes(b.url));

  // 批量插入
  let imported = 0;
  for (const bookmark of newBookmarks) {
    const encrypted = encryptData(bookmark);
    await db('bookmarks').insert({
      user_id: userId,
      encrypted_data: encrypted
    });
    imported++;
  }

  res.json({
    total: bookmarks.length,
    imported,
    skipped: bookmarks.length - imported
  });
};
```

---

### 5. 导出 JSON 格式不正确

**症状：**
- 导出的 JSON 文件格式不规范
- 无法再次导入

**标准格式：**
```json
{
  "version": "1.0",
  "export_date": "2024-01-01T00:00:00.000Z",
  "user_email": "user@example.com",
  "bookmarks": [
    {
      "title": "Example",
      "url": "https://example.com",
      "folder": "技术",
      "tags": ["前端"],
      "description": "",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total_count": 1
}
```

---

### 6. 大文件上传超时

**症状：**
- 上传大文件时请求超时
- 文件大小超过限制

**修复步骤：**
1. 检查 multer 文件大小限制
2. 检查服务器超时配置
3. 考虑使用分片上传

**配置修改：**
```javascript
// backend/src/routes/import-export.js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024  // 增加到 10MB
  }
});

// Express 超时配置
app.use('/api/import-export', express.json({ limit: '10mb' }));
```

---

### 7. 导入时加密失败

**症状：**
```
错误: 数据加密失败
```

**修复步骤：**
1. 检查 `ENCRYPTION_KEY` 配置
2. 确保导入数据格式正确

**修复代码：**
```javascript
const importBookmarks = async (req, res) => {
  try {
    const bookmarks = req.parsedData.bookmarks;
    const encryptedData = bookmarks.map(b => ({
      user_id: req.user.id,
      encrypted_data: encryptData({
        title: b.title || '',
        url: b.url || '',
        folder: b.folder || '',
        tags: b.tags || [],
        description: b.description || ''
      })
    }));

    await db('bookmarks').insert(encryptedData);
  } catch (error) {
    if (error.message.includes('Malformed')) {
      return res.status(400).json({ error: '数据格式错误' });
    }
    throw error;
  }
};
```

---

## 文件上传测试

```bash
# 测试导入书签 (JSON)
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -F "file=@bookmarks.json" \
  http://localhost:3001/api/import-export/bookmarks/import

# 测试导入书签 (HTML)
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -F "file=@bookmarks.html" \
  http://localhost:3001/api/import-export/bookmarks/import
```

---

## 文件下载测试

```bash
# 测试导出书签 (JSON)
curl -H "Authorization: Bearer <token>" \
  -o bookmarks.json \
  http://localhost:3001/api/import-export/bookmarks/export

# 测试导出书签 (HTML)
curl -H "Authorization: Bearer <token>" \
  -o bookmarks.html \
  http://localhost:3001/api/import-export/bookmarks/export/html
```

---

## 数据验证检查清单

- [ ] 检查文件类型是否支持
- [ ] 检查文件大小是否超限
- [ ] 验证 JSON 格式是否正确
- [ ] 验证 HTML 格式是否符合 Netscape 标准
- [ ] 检查必填字段是否存在
- [ ] 处理重复数据
- [ ] 记录导入统计信息
