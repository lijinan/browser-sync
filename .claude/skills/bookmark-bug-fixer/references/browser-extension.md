# Browser Extension Reference

## Cross-Browser Manifest Sync

**IMPORTANT**: The extension supports both Chrome and Firefox with separate manifest files:

- **manifest.json** (Current, Manifest V3) - Used by Chrome
- **manifest-chrome.json** (Manifest V3) - Chrome-specific configuration
- **manifest-firefox.json** (Manifest V2) - Firefox-specific configuration

### When Modifying Manifest Files

1. **Check current version** - Always check `manifest.json` first to see which version is active
2. **Identify the target browser** - Are you fixing a Chrome or Firefox specific issue?
3. **Sync changes accordingly**:
   - If modifying Chrome features → Update `manifest.json` AND `manifest-chrome.json`
   - If modifying Firefox features → Update `manifest-firefox.json`
   - If modifying shared features → Update ALL THREE files

### Key Differences Between Versions

| Feature | Chrome (V3) | Firefox (V2) |
|---------|-------------|--------------|
| Background | `service_worker: "background.js"` | `scripts: ["browser-polyfill.js", "websocket-manager.js", "background-firefox.js"]` |
| Host Permissions | `host_permissions` array | Inside `permissions` array |
| Browser Action | `action` | `browser_action` |
| Options Page | `options_page` | `options_ui.open_in_tab` |
| Firefox-specific | None | `applications.gecko` id and version |

### Common Manifest-Related Bugs

- **Permission missing in one version**: Feature works in Chrome but not Firefox
- **Background script mismatch**: Chrome uses `background.js`, Firefox uses `background-firefox.js`
- **Host permissions format**: V3 separates `host_permissions`, V2 includes in `permissions`

**Before testing bookmark bugs**, always verify the correct manifest is loaded for the target browser.

## Background Script Event Handlers

### onBookmarkCreated(id, bookmark)
触发时机：创建新书签时
- 检查是否在"同步收藏夹"中（`checkBookmarkInSyncFolder`）
- 跳过文件夹（没有URL的书签项）
- 获取文件夹路径（`getBookmarkFolderPath`）
- 调用 `saveBookmark()` 同步到服务器
- 重复检测：`checkBookmarkExistsOnServer()` 然后更新或创建

### onBookmarkRemoved(id, removeInfo)
触发时机：删除书签/文件夹时
- 检查 `removeInfo.node` 是否存在
- 如果是文件夹（没有URL但有children）：
  - 检查是否在同步收藏夹中
  - 递归获取所有书签（`getAllBookmarksFromNode`）
  - 逐个删除服务器上的书签
- 如果是书签（有URL）：
  - 检查是否在同步收藏夹中
  - 调用 `deleteBookmarkFromServer()`

### onBookmarkMoved(id, moveInfo)
触发时机：移动书签时
- 跳过文件夹移动
- 检查是否移动到同步收藏夹
  - 是：更新服务器的文件夹信息
  - 否：从服务器删除书签
- 获取新的文件夹路径并更新

### onBookmarkChanged(id, changeInfo)
触发时机：修改书签标题或URL时
- 检查是否在同步收藏夹中
- 获取新的文件夹路径
- 调用 `saveBookmark()` with `isUpdate=true`

## Key Helper Methods

### checkBookmarkInSyncFolder(bookmarkId)
检查书签是否在"同步收藏夹"或其子文件夹中
- 向上遍历父级文件夹
- 检查每个父级的 `title === '同步收藏夹'`
- 返回：`true`/`false`

### getBookmarkFolderPath(bookmarkId)
获取书签的完整文件夹路径（不包含"同步收藏夹"本身）
- 向上遍历父级
- 在"同步收藏夹"处停止
- 返回：`['父级', '子级']` 或 `[]`

### saveBookmark(data, tab, isUpdate)
保存书签到服务器
- 验证：URL不能为空，标题不能为空
- 检查重复：`checkBookmarkExistsOnServer()`
- 如果重复且需要更新：调用 PUT `/bookmarks/:id`
- 如果不重复：调用 POST `/bookmarks`
- 显示通知

### checkBookmarkExistsOnServer(url)
通过URL检查服务器上是否存在书签
- 调用 GET `/bookmarks/search?url=...`
- 返回：`{ id, title, url, folder, ... }` 或 `null`

### deleteBookmarkFromServer(url)
删除服务器上的书签
- 先调用 `checkBookmarkExistsOnServer()` 获取ID
- 调用 DELETE `/bookmarks/:id`
- 返回：`true`/`false`

## Common Issues

### Race Conditions
**问题**: 同步收藏夹被多次创建
```javascript
// background.js:289-292 - 可能创建多个"同步收藏夹"
const syncFolders = await chrome.bookmarks.search({ title: '同步收藏夹' })
if (syncFolders.length > 0) {
  return syncFolders[0]  // 返回第一个，但可能有多个
}
```
**解决方案**: 检查并合并重复的同步收藏夹

### Path Normalization
**问题**: "同步收藏夹 > 同步收藏夹 > 子文件夹"
```javascript
// background.js:346-348 - 已有修复
while (normalizedPath.startsWith('同步收藏夹 > 同步收藏夹')) {
  normalizedPath = normalizedPath.replace('同步收藏夹 > 同步收藏夹', '同步收藏夹')
}
```

### Folder Deletion Cascading
**问题**: 删除文件夹时可能遗漏子书签
- 需要递归遍历所有子项
- `getAllBookmarksFromNode()` 递归实现

### Missing parentId
**问题**: `removeInfo.node.parentId` 可能为 undefined
- `checkBookmarkInSyncFolderByNode()` 处理无parentId情况
- 向上遍历需要检查节点是否存在

## WebSocket Integration

### WebSocket Manager
- File: `websocket-manager-sw.js`
- Events: `bookmark_change` (created, updated, deleted)
- Auto-reconnect on connection loss
- Status notifications: connected, disconnected

### Full Sync (performFullSync)
从服务器同步所有书签到本地：
1. 获取服务器所有书签
2. 确保"同步收藏夹"存在
3. 创建本地URL映射
4. 对比并更新/创建本地书签
5. 处理文件夹路径（`ensureFolderPathForSync`）
6. 显示同步结果通知

## Settings

### Default Settings
```javascript
{
  serverUrl: 'http://localhost:3001',
  syncOnStartup: false,
  autoPasswordDetect: true,
  interceptPasswordSave: false,
  autoPasswordFill: false,
  confirmPasswordSave: true,
  debugMode: false
}
```

### Debug Mode
- Enable: `chrome.storage.sync.set({ debugMode: true })`
- Logs: Detailed console logs for all bookmark operations
- Useful for: Troubleshooting sync issues

## Chrome Bookmark API

### chrome.bookmarks.create()
```javascript
chrome.bookmarks.create({
  title: 'Bookmark Title',
  url: 'https://example.com',
  parentId: 'folderId'  // optional
})
```

### chrome.bookmarks.update()
```javascript
chrome.bookmarks.update(bookmarkId, {
  title: 'New Title',
  url: 'https://new-url.com'
})
```

### chrome.bookmarks.move()
```javascript
chrome.bookmarks.move(bookmarkId, {
  parentId: 'newFolderId',
  index: 0  // optional position
})
```

### chrome.bookmarks.remove()
```javascript
chrome.bookmarks.remove(bookmarkId)
// or remove tree (folder with children)
chrome.bookmarks.removeTree(folderId)
```

### chrome.bookmarks.search()
```javascript
// By title
chrome.bookmarks.search({ title: '搜索词' })
// By URL
chrome.bookmarks.search({ url: 'https://example.com' })
// By query (matches title or URL)
chrome.bookmarks.search('查询词')
```

### chrome.bookmarks.getChildren()
```javascript
chrome.bookmarks.getChildren(folderId, (children) => {
  // children: array of bookmark nodes
})
```
