# Bookmark Bug Patterns and Solutions

## Common Bug Patterns

### 1. Duplicate Bookmarks

**Symptoms**:
- Same URL appears multiple times in "同步收藏夹"
- Server returns multiple bookmarks for identical URLs

**Root Causes**:
```javascript
// Issue: saveBookmark() checks for duplicates but creates if folder differs
if (existingBookmark) {
  const needsUpdate = existingBookmark.folder !== data.folder ||
                     existingBookmark.title !== data.title;
  if (needsUpdate) {
    // Updates existing, but what if we want separate bookmarks in different folders?
  }
}
```

**Solutions**:
- Add unique constraint on (user_id, url) in database
- OR allow multiple bookmarks per URL but track with GUID
- OR update folder field instead of creating duplicate

**Fix Location**: [backend/src/routes/bookmarks.js:1274-1312](backend/src/routes/bookmarks.js#L1274-L1312)

---

### 2. Folder Deletion Not Syncing

**Symptoms**:
- Delete folder in browser
- Bookmarks remain on server
- Next sync recreates them locally

**Root Causes**:
```javascript
// Issue: onBookmarkRemoved checks removeInfo.node.url
if (!removeInfo.node.url && removeInfo.node.children) {
  // Folder detected
} else if (!removeInfo.node.url) {
  // What about folders with no children?
  return;  // Skip sync!
}
```

**Solutions**:
- Check `removeInfo.node.dateGroupModified` or `removeInfo.node.index`
- Use `chrome.bookmarks.get(id)` to get full node info
- Check if node exists first before checking url property

**Fix Location**: [browser-extension/background.js:801-845](browser-extension/background.js#L801-L845)

---

### 3. Position Inconsistency

**Symptoms**:
- Bookmark order differs between browser and server
- Dragging bookmarks in browser doesn't persist order

**Root Causes**:
```javascript
// Backend: Orders by position then created_at
.orderBy('position', 'asc')
.orderBy('created_at', 'desc')

// Extension: Doesn't set position when creating
await chrome.bookmarks.create({
  title: serverBookmark.title,
  url: serverBookmark.url,
  parentId: targetFolderId
  // Missing: index parameter
})
```

**Solutions**:
- Map server `position` to Chrome `index`
- Update position on move: `chrome.bookmarks.move(id, { parentId, index })`
- Sync position back to server on browser reorder

**Fix Location**:
- Backend: [backend/src/routes/bookmarks.js:50-51](backend/src/routes/bookmarks.js#L50-L51)
- Extension: [browser-extension/background.js:258-262](browser-extension/background.js#L258-L262)

---

### 4. Folder Path Duplication

**Symptoms**:
- "同步收藏夹 > 同步收藏夹 > 子文件夹"
- Paths get nested incorrectly

**Root Causes**:
```javascript
// Issue: Folder path already includes "同步收藏夹" prefix
const folder = '同步收藏夹 > ' + folderPath.join(' > ')
// Then on next sync:
const folder = '同步收藏夹 > ' + '同步收藏夹 > 子文件夹'.join(' > ')
```

**Solutions**:
- Already implemented in `ensureFolderPathForSync()` (lines 346-348)
- But need to also strip prefix in `getBookmarkFolderPath()`
- Always store paths WITHOUT "同步收藏夹" prefix

**Fix Location**: [browser-extension/background.js:345-348](browser-extension/background.js#L345-L348)

---

### 5. WebSocket Notification Failures

**Symptoms**:
- Changes saved to database
- Other clients don't see updates
- Browser extension doesn't sync

**Root Causes**:
```javascript
// Issue: Notification sent but WebSocket not ready
webSocketService.notifyBookmarkChange(req.user.id, 'created', bookmarkData);
// If wsManager not connected, notification is lost
```

**Solutions**:
- Check WebSocket connection before sending
- Queue notifications if disconnected
- Implement retry mechanism

**Fix Location**: [backend/src/routes/bookmarks.js:114](backend/src/routes/bookmarks.js#L114)

---

### 6. Decryption Failures

**Symptoms**:
- "书签 ID X 解密失败" in console
- Bookmarks missing from list
- Data corruption after encryption key change

**Root Causes**:
```javascript
// Issue: Hardcoded encryption key or key mismatch
const encryptedData = CryptoJS.AES.encrypt(
  JSON.stringify(data),
  process.env.ENCRYPTION_KEY  // Must be 32 chars, consistent across restarts
).toString();
```

**Solutions**:
- Verify `ENCRYPTION_KEY` is set and correct length (32 chars)
- Never change encryption key without migration
- Add checksum or version field to detect corruption
- Provide recovery mechanism for corrupted bookmarks

**Fix Location**: [backend/src/routes/bookmarks.js:24-40](backend/src/routes/bookmarks.js#L24-L40)

---

### 7. Missing parentId on Delete

**Symptoms**:
- Delete bookmark in browser
- Console: "removeInfo.node不存在，跳过同步"
- Server doesn't delete bookmark

**Root Causes**:
```javascript
// Issue: removeInfo structure varies by browser/context
if (!removeInfo.node) {
  console.log('⚠️ removeInfo.node不存在，跳过同步');
  return;
}
```

**Solutions**:
- Fallback to `chrome.bookmarks.get(id)` if node missing
- Store bookmark URL in metadata before delete
- Implement periodic reconciliation

**Fix Location**: [browser-extension/background.js:795-799](browser-extension/background.js#L795-L799)

---

### 8. Sync Loop (Infinite Sync)

**Symptoms**:
- Constant bookmark creation/deletion
- High CPU usage
- "同步中..." notification never stops

**Root Causes**:
```
Browser creates bookmark → Extension syncs to server
→ Server sends WebSocket → Extension creates bookmark
→ Extension detects new bookmark → Syncs to server
→ (loop repeats)
```

**Solutions**:
- Add "syncSource" flag to ignore self-generated events
- Debounce rapid bookmark operations
- Check if bookmark already exists before creating

**Fix Location**: [browser-extension/background.js:624-678](browser-extension/background.js#L624-L678)

---

## Debugging Checklist

When investigating bookmark bugs:

1. **Check Console Logs**
   - Backend: Look for `[DEBUG]` logs in backend output
   - Extension: Enable `debugMode` in settings
   - Browser: DevTools Console for errors

2. **Verify Database State**
   ```sql
   SELECT id, user_id,
          LENGTH(encrypted_data) as data_length,
          created_at, updated_at
   FROM bookmarks
   ORDER BY created_at DESC;
   ```

3. **Test Encryption/Decryption**
   ```javascript
   // Backend
   const test = { title: 'Test', url: 'http://test.com' };
   const encrypted = encryptData(test);
   const decrypted = decryptData(encrypted);
   console.assert(decrypted.url === test.url);
   ```

4. **Check WebSocket Connection**
   ```javascript
   // In browser console
   chrome.runtime.sendMessage({ type: 'WEBSOCKET_STATUS' }, (resp) => {
     console.log('WebSocket status:', resp.status);
   });
   ```

5. **Trace Bookmark Path**
   ```javascript
   // In browser console
   chrome.bookmarks.getTree((tree) => {
     console.log('Full bookmark tree:', tree);
   });
   ```

6. **Monitor Network Requests**
   - Browser DevTools → Network tab
   - Filter by XHR
   - Check API response codes and bodies

7. **Verify Sync Folder**
   ```javascript
   chrome.bookmarks.search({ title: '同步收藏夹' }, (results) => {
     console.log('Sync folders:', results);
   });
   ```

## Testing Scenarios

### Test 1: Create Bookmark
1. Enable debug mode
2. Create bookmark in "同步收藏夹"
3. Check console for "书签创建事件"
4. Verify server received bookmark
5. Check WebSocket notification

### Test 2: Delete Bookmark
1. Create test bookmark
2. Delete from browser
3. Check console for "书签删除事件"
4. Verify server deleted bookmark
5. Check other clients receive update

### Test 3: Move Bookmark
1. Create bookmark in folder A
2. Move to folder B
3. Check console for "书签移动事件"
4. Verify server updated folder field
5. Verify position updated

### Test 4: Full Sync
1. Clear local "同步收藏夹"
2. Trigger full sync
3. Verify all server bookmarks created locally
4. Check folder structure preserved
5. Verify no duplicates created

### Test 5: Conflict Resolution
1. Create bookmark with same URL in browser and server
2. Modify title in browser
3. Trigger sync
4. Verify correct behavior (update vs duplicate)
