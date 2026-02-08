---
name: bookmark-bug-fixer
description: Debug and fix bookmark synchronization bugs in the bookmark-password sync application. Use for investigating bookmark create/update/delete/move issues, fixing sync problems between browser extension and backend API, resolving encryption/decryption errors, debugging WebSocket real-time sync failures, troubleshooting folder path and structure issues, and analyzing race conditions and duplicate bookmarks. Covers both backend (Node.js/Express) and browser extension (Chrome/Extension API) components.
---

# Bookmark Bug Fixer

Debug and fix bugs in the bookmark synchronization system spanning backend API, browser extension, and WebSocket real-time sync.

## Quick Reference

**Backend**: [backend/src/routes/bookmarks.js](../../../backend/src/routes/bookmarks.js) - REST API with AES-256 encryption
**Extension**: [browser-extension/background.js](../../../browser-extension/background.js) - Chrome bookmarks API event handlers
**Database**: `bookmarks` table with encrypted `encrypted_data` field (see [docs/database-init.sql](../../../docs/database-init.sql))

## Common Bug Types

### Duplicate Bookmarks
**Symptom**: Same URL appearing multiple times in "同步收藏夹"
**Check**: Unique constraints in backend, duplicate detection in `saveBookmark()`
**Reference**: [bug-patterns.md](references/bug-patterns.md) - Bug Pattern #1

### Folder Delete Not Syncing
**Symptom**: Delete folder in browser but bookmarks remain on server
**Check**: `onBookmarkRemoved()` handler, folder recursion in `getAllBookmarksFromNode()`
**Reference**: [bug-patterns.md](references/bug-patterns.md) - Bug Pattern #2

### Position Inconsistency
**Symptom**: Bookmark order differs between clients
**Check**: `position` field mapping to Chrome `index`, ordering in backend query
**Reference**: [bug-patterns.md](references/bug-patterns.md) - Bug Pattern #3

### Folder Path Duplication
**Symptom**: "同步收藏夹 > 同步收藏夹 > 子文件夹"
**Check**: Path normalization in `ensureFolderPathForSync()`
**Reference**: [bug-patterns.md](references/bug-patterns.md) - Bug Pattern #4

### Decryption Failures
**Symptom**: "书签 ID X 解密失败" in backend logs
**Check**: `ENCRYPTION_KEY` consistency (32 characters), key rotation
**Reference**: [bug-patterns.md](references/bug-patterns.md) - Bug Pattern #6

### Sync Loop
**Symptom**: Infinite bookmark creation/sync cycle, high CPU
**Check**: Event source tracking, debounce logic, self-trigger prevention
**Reference**: [bug-patterns.md](references/bug-patterns.md) - Bug Pattern #8

## Investigation Workflow

1. **Reproduce the bug**
   - Enable debug mode: `chrome.storage.sync.set({ debugMode: true })`
   - Monitor console: Backend `logs/backend.log` and browser DevTools Console

2. **Identify the component**
   - Backend API issue? Check [backend-api.md](references/backend-api.md)
   - Extension issue? Check [browser-extension.md](references/browser-extension.md)
   - WebSocket issue? Check connection status and notification flow

3. **Trace the data flow**
   ```
   Chrome API Event → Extension Handler → HTTP Request → Backend
   → Database → WebSocket Notification → Extension Update
   ```

4. **Locate the bug**
   - Use grep to find related functions
   - Review similar bug patterns in [bug-patterns.md](references/bug-patterns.md)
   - Check recent git changes: `git log --oneline -10`

5. **Implement fix**
   - Apply solution pattern from references
   - Add comments explaining the bug and fix
   - Test with scenarios from bug-patterns.md

## Reference Documentation

Load these reference files when you need detailed information:

### [backend-api.md](references/backend-api.md)
**Load when**: Working on backend CRUD operations, encryption, or WebSocket notifications

**Contains**:
- Complete API reference (GET/POST/PUT/DELETE /bookmarks)
- Data encryption/decryption flow
- WebSocket notification timing
- Validation schemas
- Common backend issues and solutions

### [browser-extension.md](references/browser-extension.md)
**Load when**: Debugging Chrome extension event handlers or sync logic

**Contains**:
- Event handler details (`onBookmarkCreated`, `onBookmarkRemoved`, etc.)
- Helper method reference (`checkBookmarkInSyncFolder`, `saveBookmark`, etc.)
- Chrome Bookmark API usage
- WebSocket integration
- Settings and debug mode

### [bug-patterns.md](references/bug-patterns.md)
**Load when**: Diagnosing specific bug types or planning fixes

**Contains**:
- 8 common bug patterns with root causes and solutions
- Debugging checklist
- Testing scenarios for each bug type
- Code location references
- Fix strategies

## Key Files by Component

**Backend**:
- [backend/src/routes/bookmarks.js](../../../backend/src/routes/bookmarks.js) - CRUD operations, encryption, WebSocket notifications
- [backend/src/services/websocket.js](../../../backend/src/services/websocket.js) - Real-time sync service
- [backend/src/middleware/auth.js](../../../backend/src/middleware/auth.js) - JWT authentication

**Extension**:
- [browser-extension/background.js](../../../browser-extension/background.js) - Main event handlers, sync logic
- [browser-extension/websocket-manager-sw.js](../../../browser-extension/websocket-manager-sw.js) - WebSocket connection management
- **Manifest Files** (Chrome + Firefox support):
  - [manifest.json](../../../browser-extension/manifest.json) - Current (Chrome Manifest V3)
  - [manifest-chrome.json](../../../browser-extension/manifest-chrome.json) - Chrome configuration
  - [manifest-firefox.json](../../../browser-extension/manifest-firefox.json) - Firefox (Manifest V2)
  - **⚠️ IMPORTANT**: When modifying manifest files, check the current version and sync changes to both Chrome and Firefox versions

**Database**:
- [docs/database-init.sql](../../../docs/database-init.sql) - Schema, triggers, indexes

## Debug Commands

```bash
# Backend logs with bookmark-related output
tail -f logs/backend.log | grep -E "DEBUG|书签"

# Enable extension debug mode (in browser console)
chrome.storage.sync.set({ debugMode: true })

# Check WebSocket connection status
chrome.runtime.sendMessage({ type: 'WEBSOCKET_STATUS' }, console.log)

# View sync folder structure
chrome.bookmarks.search({ title: '同步收藏夹' }, console.log)

# Get full bookmark tree
chrome.bookmarks.getTree((tree) => console.log(tree))

# Trigger manual full sync
chrome.runtime.sendMessage({ type: 'FULL_SYNC' })
```

## Quick Fix Patterns

### Add Missing Validation
```javascript
// backend/src/routes/bookmarks.js
const bookmarkSchema = Joi.object({
  title: Joi.string().required(),
  url: Joi.string().min(1).required(),
  // Add more validation as needed
});
```

### Prevent Event Re-triggering
```javascript
// browser-extension/background.js
// Add flag to track sync source
const SYNC_SOURCE = {
  BROWSER: 'browser',
  SERVER: 'server',
  MANUAL: 'manual'
};

let currentSyncSource = null;
```

### Fix Race Conditions
```javascript
// Debounce rapid operations
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};
```

## Testing After Fixes

Use scenarios from [bug-patterns.md](references/bug-patterns.md):

1. **Test Create**: Enable debug, create bookmark, verify sync
2. **Test Delete**: Create then delete, verify removed from server
3. **Test Move**: Move between folders, verify position updated
4. **Test Full Sync**: Clear local, trigger sync, verify no duplicates
5. **Test Conflict**: Same URL in both locations, verify correct behavior
