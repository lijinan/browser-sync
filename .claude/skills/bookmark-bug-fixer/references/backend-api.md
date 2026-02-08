# Backend API Reference

## Bookmarks API

### GET /bookmarks
获取所有书签
- Response: `{ bookmarks: [{ id, title, url, folder, tags, description, position, created_at, updated_at }] }`
- 解密失败的书签会被跳过并记录警告

### POST /bookmarks
创建书签
- Body: `{ title, url, folder?, tags?, description?, position? }`
- Validation: title (required), url (required, min 1 char), folder (optional)
- Sends WebSocket notification: 'bookmark_change' -> 'created'

### PUT /bookmarks/:id
更新书签
- Body: `{ title, url, folder?, tags?, description?, position? }`
- Checks bookmark ownership before updating
- Sends WebSocket notification: 'bookmark_change' -> 'updated'

### GET /bookmarks/search
搜索书签
- Query params: `q` (keyword) or `url` (exact match)
- Searches in title, url, and description fields

### DELETE /bookmarks/clear
清空用户所有书签
- Returns: `{ success, message, deletedCount }`

### DELETE /bookmarks/:id
删除单个书签
- Checks bookmark ownership before deleting
- Sends WebSocket notification: 'bookmark_change' -> 'deleted'

## Data Flow

1. **Encryption**: All bookmark data is encrypted using AES-256 before storage
2. **Decryption**: Data is decrypted on retrieval, failed decryption is logged but doesn't break the request
3. **WebSocket**: Real-time notifications sent for create/update/delete operations
4. **Position**: Bookmarks are ordered by `position` asc, then `created_at` desc

## Common Issues

### Decryption Failures
- Check: `ENCRYPTION_KEY` environment variable (32 characters)
- Symptom: Console logs "书签 ID X 解密失败"
- Solution: Verify encryption key consistency across operations

### Position Management
- Default position is 0 if not provided
- Ordering: `position` ASC, `created_at` DESC
- Issue: Duplicate positions can cause inconsistent ordering

### WebSocket Notification Timing
- Notifications are sent AFTER database operation completes
- If WebSocket fails, the operation still succeeds
- Check: WebSocket service must be initialized

## Validation Schema

```javascript
{
  title: string (required),
  url: string (required, min 1 char),
  folder: string (optional, default ''),
  tags: array<string> (optional),
  description: string (optional, default ''),
  position: number (optional, integer, default 0)
}
```
