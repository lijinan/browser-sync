# 导入导出 API

> 数据导入导出接口详细说明

---

## 导出书签 (JSON)

### 请求

```
GET /api/import-export/bookmarks/export
Authorization: Bearer <token>
```

### 成功响应

返回 JSON 文件下载。

```json
{
  "version": "1.0",
  "export_date": "2024-01-01T00:00:00.000Z",
  "user_email": "user@example.com",
  "bookmarks": [
    {
      "title": "Example Site",
      "url": "https://example.com",
      "folder": "技术文章",
      "tags": ["前端", "React"],
      "description": "一个示例网站",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total_count": 1
}
```

### 响应头

```
Content-Type: application/json
Content-Disposition: attachment; filename="bookmarks_2024-01-01.json"
```

---

## 导出书签 (HTML)

导出为浏览器兼容的 Netscape Bookmark File 格式。

### 请求

```
GET /api/import-export/bookmarks/export/html
Authorization: Bearer <token>
```

### 成功响应

返回 HTML 文件下载。

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>技术文章</H3>
    <DL><p>
        <DT><A HREF="https://example.com">Example Site</A>
    </DL><p>
</DL><p>
```

### 响应头

```
Content-Type: text/html
Content-Disposition: attachment; filename="bookmarks_2024-01-01.html"
```

### 说明

- 兼容 Chrome、Firefox、Edge 等主流浏览器
- 可直接导入到浏览器书签
- 按文件夹分组

---

## 导入书签

### 请求

```
POST /api/import-export/bookmarks/import
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

### 请求体

| 字段 | 类型 | 说明 |
|------|------|------|
| file | File | 书签文件 (JSON/HTML/CSV) |

### 支持的文件格式

| 格式 | MIME 类型 | 说明 |
|------|-----------|------|
| JSON | application/json | 应用导出格式 |
| HTML | text/html | 浏览器导出格式 |
| CSV | text/csv | CSV 格式 |

### 成功响应

```json
{
  "message": "导入成功",
  "imported": 10,
  "skipped": 2,
  "errors": []
}
```

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| imported | number | 成功导入数量 |
| skipped | number | 跳过数量（重复等） |
| errors | string[] | 错误信息列表 |

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 400 | 不支持的文件类型 |
| 400 | 文件解析失败 |
| 413 | 文件过大 (超过 10MB) |

---

## 导入文件格式

### JSON 格式

```json
{
  "version": "1.0",
  "bookmarks": [
    {
      "title": "Example",
      "url": "https://example.com",
      "folder": "文件夹名",
      "tags": ["标签1", "标签2"],
      "description": "描述"
    }
  ]
}
```

### HTML 格式 (Netscape)

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>文件夹名</H3>
    <DL><p>
        <DT><A HREF="https://example.com">Example</A>
    </DL><p>
</DL><p>
```

### CSV 格式

```csv
title,url,folder,tags,description
Example,https://example.com,文件夹,"标签1,标签2",描述
```

---

## 文件大小限制

| 限制 | 值 |
|------|-----|
| 最大文件大小 | 10 MB |
| 超时时间 | 30 秒 |

---

## 使用示例

### JavaScript (Axios)

```javascript
// 导出书签
const exportBookmarks = async () => {
  const response = await api.get('/import-export/bookmarks/export', {
    responseType: 'blob'
  });
  
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bookmarks_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
};

// 导入书签
const importBookmarks = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/import-export/bookmarks/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  
  return response.data;
};
```

### cURL

```bash
# 导出书签
curl -X GET "http://localhost:3001/api/import-export/bookmarks/export" \
  -H "Authorization: Bearer <token>" \
  -o bookmarks.json

# 导入书签
curl -X POST "http://localhost:3001/api/import-export/bookmarks/import" \
  -H "Authorization: Bearer <token>" \
  -F "file=@bookmarks.json"
```
