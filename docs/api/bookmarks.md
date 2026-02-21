# 书签 API

> 书签管理接口详细说明

---

## 获取书签列表

### 请求

```
GET /api/bookmarks
Authorization: Bearer <token>
```

### 成功响应

```json
{
  "bookmarks": [
    {
      "id": 1,
      "title": "Example Site",
      "url": "https://example.com",
      "folder": "技术文章",
      "tags": ["前端", "React"],
      "description": "一个示例网站",
      "position": 0,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 说明

- 返回当前用户的所有书签
- 按 position 升序、created_at 降序排列
- 数据已解密

---

## 创建书签

### 请求

```
POST /api/bookmarks
Authorization: Bearer <token>
Content-Type: application/json
```

### 请求体

```json
{
  "title": "Example Site",
  "url": "https://example.com",
  "folder": "技术文章",
  "tags": ["前端", "React"],
  "description": "一个示例网站",
  "position": 0
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 书签标题 |
| url | string | 是 | 书签 URL |
| folder | string | 否 | 所属文件夹 |
| tags | string[] | 否 | 标签数组 |
| description | string | 否 | 描述 |
| position | number | 否 | 排序位置，默认 0 |

### 成功响应

```json
{
  "message": "书签创建成功",
  "bookmark": {
    "id": 1,
    "title": "Example Site",
    "url": "https://example.com",
    "folder": "技术文章",
    "tags": ["前端", "React"],
    "description": "一个示例网站",
    "position": 0,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 400 | 参数验证失败 |
| 401 | 未授权 |

---

## 更新书签

### 请求

```
PUT /api/bookmarks/:id
Authorization: Bearer <token>
Content-Type: application/json
```

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 书签 ID |

### 请求体

```json
{
  "title": "Updated Title",
  "url": "https://updated-example.com",
  "folder": "新文件夹",
  "tags": ["新标签"],
  "description": "更新后的描述",
  "position": 1
}
```

### 参数说明

所有字段均为可选，只更新提供的字段。

### 成功响应

```json
{
  "message": "书签更新成功",
  "bookmark": {
    "id": 1,
    "title": "Updated Title",
    "url": "https://updated-example.com",
    "folder": "新文件夹",
    "tags": ["新标签"],
    "description": "更新后的描述",
    "position": 1,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-02T00:00:00.000Z"
  }
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 400 | 参数验证失败 |
| 401 | 未授权 |
| 404 | 书签不存在 |

---

## 删除书签

### 请求

```
DELETE /api/bookmarks/:id
Authorization: Bearer <token>
```

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 书签 ID |

### 成功响应

```json
{
  "message": "书签删除成功"
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 401 | 未授权 |
| 404 | 书签不存在 |

---

## WebSocket 同步

书签变更会通过 WebSocket 广播给用户的所有连接设备。

### 消息格式

```json
{
  "type": "bookmark_change",
  "data": {
    "action": "create",
    "bookmark": {
      "id": 1,
      "title": "Example Site",
      "url": "https://example.com"
    }
  }
}
```

### action 类型

| 值 | 说明 |
|------|------|
| create | 书签创建 |
| update | 书签更新 |
| delete | 书签删除 |
