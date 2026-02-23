// WebSocket管理器 - Service Worker版本 - ES Module
// 专门为Chrome Manifest V3 Service Worker环境优化

export class WebSocketManagerSW {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.heartbeatInterval = null;
    this.isConnecting = false;
    this.subscriptions = ['bookmarks', 'passwords'];
    this.messageHandlers = new Map();
    this.connectionCallbacks = [];
  }

  async connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.isConnecting = true;
      
      const settings = await this.getStorageData(['token', 'serverUrl']);
      if (!settings.token) {
        console.log('❌ WebSocket连接失败: 未登录');
        this.isConnecting = false;
        return;
      }

      const serverUrl = settings.serverUrl || 'http://localhost:3001';
      
      const serverAvailable = await this.checkServerAvailability(serverUrl);
      if (!serverAvailable) {
        console.log('❌ WebSocket连接失败: 服务器不可用');
        this.isConnecting = false;
        return;
      }
      
      const wsUrl = serverUrl.replace('http', 'ws') + `/ws?token=${settings.token}`;
      
      console.log('🔄 连接WebSocket:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();
      
    } catch (error) {
      console.error('❌ WebSocket连接失败:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  async checkServerAvailability(serverUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.log('⚠️ 服务器健康检查失败:', error.message);
      return false;
    }
  }

  setupEventHandlers() {
    this.ws.onopen = () => {
      console.log('✅ WebSocket连接成功');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      
      this.subscribe(this.subscriptions);
      this.startHeartbeat();
      this.notifyConnectionCallbacks('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ 处理WebSocket消息失败:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('🔌 WebSocket连接关闭:', event.code, event.reason);
      this.cleanup();
      
      if (!event.wasClean) {
        this.scheduleReconnect();
      }
      
      this.notifyConnectionCallbacks('disconnected');
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket错误:', error);
      this.cleanup();
      this.scheduleReconnect();
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'connection':
        console.log('🔗 连接状态:', message.status);
        break;
        
      case 'pong':
        break;
        
      case 'subscribed':
        console.log('📡 订阅成功:', message.subscriptions);
        break;
        
      case 'bookmark_change':
        this.handleBookmarkChange(message);
        break;
        
      case 'password_change':
        this.handlePasswordChange(message);
        break;
        
      default:
        console.log('❓ 未知消息类型:', message.type);
    }

    if (this.messageHandlers.has(message.type)) {
      const handlers = this.messageHandlers.get(message.type);
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('❌ 消息处理器错误:', error);
        }
      });
    }
  }

  async handleBookmarkChange(message) {
    const { action, data } = message;
    console.log(`📚 书签${action}:`, data.title);

    try {
      switch (action) {
        case 'created':
          await this.syncBookmarkToLocal(data, 'created');
          break;
          
        case 'updated':
          await this.syncBookmarkToLocal(data, 'updated');
          break;
          
        case 'deleted':
          await this.removeBookmarkFromLocal(data);
          break;
      }
    } catch (error) {
      console.error('❌ 同步书签到本地失败:', error);
    }
  }

  async syncBookmarkToLocal(bookmarkData, action) {
    try {
      console.log('🔄 开始同步书签到本地:', bookmarkData.title);

      if (!bookmarkData || !bookmarkData.url || !bookmarkData.url.trim()) {
        console.error('❌ 书签数据无效，跳过同步:', bookmarkData);
        return;
      }

      if (!bookmarkData.title || !bookmarkData.title.trim()) {
        console.error('❌ 书签标题为空，跳过同步:', bookmarkData.url);
        return;
      }

      // 设置标志，表示正在从服务器同步书签到本地
      // 这会阻止 onBookmarkMoved 等事件将书签再次同步回服务器
      await this.setStorageData({ isSyncingFromServer: true });

      try {
        const syncFolders = await this.searchBookmarks({ title: '同步收藏夹' });
      if (syncFolders.length === 0) {
        console.log('⚠️ 未找到"同步收藏夹"，跳过本地同步');
        return;
      }

      const syncFolder = syncFolders[0];
      const targetFolderId = await this.ensureFolderPath(syncFolder.id, bookmarkData.folder);

      const existingBookmarks = await this.findBookmarkInSyncFolder(syncFolder.id, bookmarkData.url, bookmarkData.title);

      if (action === 'created' && existingBookmarks.length === 0) {
        const newBookmark = await this.createBookmark({
          title: bookmarkData.title,
          url: bookmarkData.url,
          parentId: targetFolderId
        });

        console.log('✅ 书签已同步到本地:', newBookmark.title);
        this.showNotification(`书签"${bookmarkData.title}"已从服务器同步到本地`, 'success');

      } else if (action === 'updated' && existingBookmarks.length > 0) {
        const existingBookmark = existingBookmarks[0];
        let needsUpdate = false;

        if (existingBookmark.title !== bookmarkData.title) {
          await this.updateBookmark(existingBookmark.id, {
            title: bookmarkData.title
          });
          needsUpdate = true;
        }

        if (existingBookmark.parentId !== targetFolderId) {
          await this.moveBookmark(existingBookmark.id, {
            parentId: targetFolderId
          });
          needsUpdate = true;
        }

        if (needsUpdate) {
          this.showNotification(`书签"${bookmarkData.title}"已从服务器更新`, 'success');
        }
      }
      } finally {
        // 清除同步标志
        await this.setStorageData({ isSyncingFromServer: false });
        console.log('🔄 清除 isSyncingFromServer 标志');
      }
    } catch (error) {
      console.error('❌ 同步书签到本地失败:', error);
      // 确保即使出错也清除标志
      await this.setStorageData({ isSyncingFromServer: false });
    }
  }

  async ensureFolderPath(syncFolderId, folderPath) {
    try {
      if (!folderPath || folderPath === '同步收藏夹') {
        return syncFolderId;
      }

      const pathParts = folderPath.split(' > ').slice(1);
      let currentFolderId = syncFolderId;

      for (const folderName of pathParts) {
        if (!folderName || !folderName.trim()) continue;

        const children = await this.getBookmarkChildren(currentFolderId);
        let targetFolder = children.find(child => !child.url && child.title === folderName);
        
        if (targetFolder) {
          currentFolderId = targetFolder.id;
        } else {
          const newFolder = await this.createBookmark({
            title: folderName,
            parentId: currentFolderId
          });
          currentFolderId = newFolder.id;
        }
      }
      
      return currentFolderId;
    } catch (error) {
      console.error('❌ 创建文件夹路径失败:', error);
      return syncFolderId;
    }
  }

  async getBookmarkChildren(folderId) {
    return new Promise((resolve) => {
      chrome.bookmarks.getChildren(folderId, resolve);
    });
  }

  async removeBookmarkFromLocal(bookmarkData) {
    try {
      const existingBookmarks = await this.searchBookmarks({ url: bookmarkData.url });
      
      if (existingBookmarks.length > 0) {
        const bookmarkToDelete = existingBookmarks[0];
        await this.removeBookmark(bookmarkToDelete.id);
        
        console.log('✅ 书签已从本地删除:', bookmarkData.title);
        this.showNotification(`书签"${bookmarkData.title}"已从本地删除`, 'success');
      }
    } catch (error) {
      console.error('❌ 从本地删除书签失败:', error);
    }
  }

  async handlePasswordChange(message) {
    const { action, data } = message;
    console.log(`🔐 密码${action}:`, data.site_name);
    
    try {
      const tabs = await this.getActiveTabs();
      
      for (const tab of tabs) {
        if (tab.url && tab.url.startsWith(data.site_url)) {
          try {
            await this.sendMessageToTab(tab.id, {
              type: 'PASSWORD_SYNC',
              action: action,
              data: data
            });
          } catch (error) {
            console.log('⚠️ 向标签页发送消息失败:', tab.id, error.message);
          }
        }
      }
      
      const actionText = action === 'created' ? '新增' : action === 'updated' ? '更新' : '删除';
      this.showNotification(`密码"${data.site_name}"已${actionText}`, 'success');
    } catch (error) {
      console.error('❌ 同步密码失败:', error);
    }
  }

  async getActiveTabs() {
    return new Promise((resolve) => {
      chrome.tabs.query({}, resolve);
    });
  }

  async sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  subscribe(subscriptions) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        subscriptions: subscriptions
      }));
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  cleanup() {
    this.isConnecting = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ WebSocket重连次数已达上限，停止重连');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 ${delay}ms后尝试第${this.reconnectAttempts}次重连...`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, '主动断开');
      this.ws = null;
    }
    this.cleanup();
  }

  onMessage(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  onConnectionChange(callback) {
    this.connectionCallbacks.push(callback);
  }

  notifyConnectionCallbacks(status) {
    this.connectionCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('❌ 连接状态回调错误:', error);
      }
    });
  }

  getConnectionStatus() {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }

  async getStorageData(keys) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, resolve);
    });
  }

  async searchBookmarks(query) {
    return new Promise((resolve) => {
      chrome.bookmarks.search(query, resolve);
    });
  }

  async findBookmarkInSyncFolder(syncFolderId, url, title) {
    try {
      const allBookmarks = await this.getAllBookmarksInFolder(syncFolderId);
      const matches = allBookmarks.filter(bookmark => bookmark.url && bookmark.url === url);
      return matches;
    } catch (error) {
      console.error('❌ 在同步收藏夹中搜索书签失败:', error);
      return [];
    }
  }

  async getAllBookmarksInFolder(folderId) {
    try {
      const allBookmarks = [];
      const stack = [folderId];
      
      while (stack.length > 0) {
        const currentFolderId = stack.pop();
        const children = await this.getBookmarkChildren(currentFolderId);
        
        for (const child of children) {
          if (child.url) {
            allBookmarks.push(child);
          } else {
            stack.push(child.id);
          }
        }
      }
      
      return allBookmarks;
    } catch (error) {
      console.error('❌ 获取文件夹内所有书签失败:', error);
      return [];
    }
  }

  async createBookmark(bookmark) {
    return new Promise((resolve) => {
      chrome.bookmarks.create(bookmark, resolve);
    });
  }

  async updateBookmark(id, changes) {
    return new Promise((resolve) => {
      chrome.bookmarks.update(id, changes, resolve);
    });
  }

  async moveBookmark(id, destination) {
    return new Promise((resolve) => {
      chrome.bookmarks.move(id, destination, resolve);
    });
  }

  async removeBookmark(id) {
    return new Promise((resolve) => {
      chrome.bookmarks.remove(id, resolve);
    });
  }

  showNotification(message, type = 'info') {
    try {
      const iconMap = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
      };

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '书签密码同步助手',
        message: `${iconMap[type] || ''} ${message}`
      });
    } catch (error) {
      console.error('Show notification error:', error);
    }
  }
}
