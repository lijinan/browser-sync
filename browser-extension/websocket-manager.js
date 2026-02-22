// WebSocket管理器 - 处理实时数据同步
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // 1秒
    this.heartbeatInterval = null;
    this.isConnecting = false;
    this.subscriptions = ['bookmarks', 'passwords'];
    this.messageHandlers = new Map();
    this.connectionCallbacks = [];
  }

  // 连接WebSocket
  async connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.isConnecting = true;
      
      // 获取token
      const settings = await this.getStorageData(['token', 'serverUrl']);
      if (!settings.token) {
        console.log('❌ WebSocket连接失败: 未登录');
        this.isConnecting = false;
        return;
      }

      const serverUrl = settings.serverUrl || 'http://localhost:3001';
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

  // 设置事件处理器
  setupEventHandlers() {
    this.ws.onopen = () => {
      console.log('✅ WebSocket连接成功');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      
      // 订阅数据更新
      this.subscribe(this.subscriptions);
      
      // 启动心跳
      this.startHeartbeat();
      
      // 通知连接成功
      this.notifyConnectionCallbacks('connected');
    };

    this.ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await this.handleMessage(message);
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
      
      // 通知连接断开
      this.notifyConnectionCallbacks('disconnected');
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket错误:', error);
      this.cleanup();
      this.scheduleReconnect();
    };
  }

  // 处理接收到的消息
  async handleMessage(message) {
    // console.log('📨 收到WebSocket消息:', message);

    switch (message.type) {
      case 'connection':
        console.log('🔗 连接状态:', message.status);
        break;

      case 'init':
        console.log('🚀 收到初始化数据:', message.data);
        if (message.data) {
          // 同步初始书签到本地
          if (message.data.bookmarks && Array.isArray(message.data.bookmarks)) {
            console.log(`📚 同步 ${message.data.bookmarks.length} 个书签到本地`);
            for (const bookmark of message.data.bookmarks) {
              await this.syncBookmarkToLocal(bookmark, 'created');
            }
          }
          // 同步初始密码到本地
          if (message.data.passwords && Array.isArray(message.data.passwords)) {
            console.log(`🔐 同步 ${message.data.passwords.length} 个密码到本地`);
            for (const password of message.data.passwords) {
              await this.syncPasswordToLocal(password, 'created');
            }
          }
        }
        break;
        
      case 'pong':
        // 心跳响应
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

    // 调用注册的消息处理器
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

  // 处理书签变更
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

  // 同步书签到本地浏览器
  async syncBookmarkToLocal(bookmarkData, action) {
    try {
      console.log('🔄 开始同步书签到本地:', bookmarkData.title);
      console.log('📁 目标文件夹:', bookmarkData.folder);

      // 设置标志，表示正在从服务器同步书签到本地
      // 这会阻止 onBookmarkCreated 事件将书签再次同步回服务器
      await this.setStorageData({ isSyncingFromServer: true });

      try {
        // 检查是否在同步收藏夹中
        const syncFolders = await this.searchBookmarks({ title: '同步收藏夹' });
        if (syncFolders.length === 0) {
          console.log('⚠️ 未找到"同步收藏夹"，跳过本地同步');
          return;
        }

        const syncFolder = syncFolders[0];
        console.log('✅ 找到同步收藏夹:', syncFolder.id);

        // 解析文件夹路径并创建/查找目标文件夹
        const targetFolderId = await this.ensureFolderPath(syncFolder.id, bookmarkData.folder);

        // 在同步收藏夹内搜索现有书签（更精确的搜索）
        const existingBookmarks = await this.findBookmarkInSyncFolder(syncFolder.id, bookmarkData.url, bookmarkData.title);
      
      if (action === 'created' && existingBookmarks.length === 0) {
        // 再次检查目标文件夹中是否已存在相同URL的书签（防止重复创建）
        const duplicateInTarget = await this.findBookmarkInFolder(targetFolderId, bookmarkData.url);

        if (duplicateInTarget.length > 0) {
          console.log('⚠️ 目标文件夹中已存在相同URL的书签，跳过创建:', bookmarkData.title);
          // 如果标题不同，更新标题
          if (duplicateInTarget[0].title !== bookmarkData.title) {
            await this.updateBookmark(duplicateInTarget[0].id, {
              title: bookmarkData.title
            });
            console.log('✏️ 更新现有书签标题:', bookmarkData.title);
          }
          return;
        }

        // 创建新书签
        const newBookmark = await this.createBookmark({
          title: bookmarkData.title,
          url: bookmarkData.url,
          parentId: targetFolderId
        });

        console.log('✅ Firefox书签已同步到本地:', newBookmark.title);
        console.log('📁 创建位置:', targetFolderId);
        this.showNotification(`书签"${bookmarkData.title}"已从服务器同步到本地`, 'success');
        
      } else if (action === 'updated' && existingBookmarks.length > 0) {
        // 更新现有书签
        const existingBookmark = existingBookmarks[0];
        let needsUpdate = false;
        
        // 检查标题是否需要更新
        if (existingBookmark.title !== bookmarkData.title) {
          await this.updateBookmark(existingBookmark.id, {
            title: bookmarkData.title
          });
          needsUpdate = true;
          console.log('✏️ Firefox书签标题已更新:', bookmarkData.title);
        }
        
        // 检查文件夹位置是否需要更新
        if (existingBookmark.parentId !== targetFolderId) {
          await this.moveBookmark(existingBookmark.id, {
            parentId: targetFolderId
          });
          needsUpdate = true;
          console.log('📁 Firefox书签位置已更新:', bookmarkData.folder);
        }
        
        if (needsUpdate) {
          this.showNotification(`书签"${bookmarkData.title}"已从服务器更新`, 'success');
        }
      } else if (action === 'updated' && existingBookmarks.length === 0) {
        // 书签不存在，但在创建前再次检查避免重复
        console.log('⚠️ 未找到现有书签，准备创建新书签');
        
        // 最后一次检查：在目标文件夹中查找相同URL的书签
        const duplicateCheck = await this.findBookmarkInFolder(targetFolderId, bookmarkData.url);
        
        if (duplicateCheck.length === 0) {
          const newBookmark = await this.createBookmark({
            title: bookmarkData.title,
            url: bookmarkData.url,
            parentId: targetFolderId
          });
          
          console.log('➕ Firefox书签已创建到本地:', newBookmark.title);
          this.showNotification(`书签"${bookmarkData.title}"已从服务器同步到本地`, 'success');
        } else {
          console.log('⚠️ 发现重复书签，跳过创建:', duplicateCheck[0].title);
          // 如果发现重复，更新现有书签的标题（如果需要）
          const duplicate = duplicateCheck[0];
          if (duplicate.title !== bookmarkData.title) {
            await this.updateBookmark(duplicate.id, {
              title: bookmarkData.title
            });
            console.log('✏️ 更新重复书签的标题:', bookmarkData.title);
          }
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

  // 确保文件夹路径存在，返回目标文件夹ID
  async ensureFolderPath(syncFolderId, folderPath) {
    try {
      console.log('🔍 解析文件夹路径:', folderPath);

      // 如果没有指定文件夹或只是"同步收藏夹"，直接返回根目录
      if (!folderPath || folderPath === '同步收藏夹') {
        console.log('📁 使用同步收藏夹根目录');
        return syncFolderId;
      }

      // 规范化路径：处理 "书签栏 > 同步收藏夹" 这种情况
      // 如果路径中包含"同步收藏夹"，我们需要找到它并以其为根
      if (folderPath.includes('同步收藏夹')) {
        // 找到"同步收藏夹"在路径中的位置
        const parts = folderPath.split(' > ');
        const syncIndex = parts.findIndex(p => p === '同步收藏夹');

        if (syncIndex !== -1) {
          // 只保留"同步收藏夹"之后的部分
          const pathParts = parts.slice(syncIndex + 1);
          console.log('📂 文件夹路径部分:', pathParts);

          let currentFolderId = syncFolderId;

          // 逐级创建/查找文件夹
          for (const folderName of pathParts) {
            if (!folderName.trim()) continue;

            console.log('🔍 查找/创建文件夹:', folderName);

            // 在当前文件夹下查找子文件夹
            const children = await this.getBookmarkChildren(currentFolderId);
            let targetFolder = children.find(child => !child.url && child.title === folderName);

            if (targetFolder) {
              console.log('✅ 找到现有文件夹:', folderName, targetFolder.id);
              currentFolderId = targetFolder.id;
            } else {
              // 创建新文件夹
              console.log('📁 创建新文件夹:', folderName);
              const newFolder = await this.createBookmark({
                title: folderName,
                parentId: currentFolderId
              });
              console.log('✅ 文件夹创建成功:', folderName, newFolder.id);
              currentFolderId = newFolder.id;
            }
          }

          console.log('📁 最终目标文件夹ID:', currentFolderId);
          return currentFolderId;
        }
      }

      // 解析文件夹路径 "同步收藏夹 > 个人资料 > 工作"
      const pathParts = folderPath.split(' > ').slice(1); // 移除"同步收藏夹"部分
      console.log('📂 文件夹路径部分:', pathParts);
      
      let currentFolderId = syncFolderId;
      
      // 逐级创建/查找文件夹
      for (const folderName of pathParts) {
        if (!folderName.trim()) continue;
        
        console.log('🔍 查找/创建文件夹:', folderName);
        
        // 在当前文件夹下查找子文件夹
        const children = await this.getBookmarkChildren(currentFolderId);
        let targetFolder = children.find(child => !child.url && child.title === folderName);
        
        if (targetFolder) {
          console.log('✅ 找到现有文件夹:', folderName, targetFolder.id);
          currentFolderId = targetFolder.id;
        } else {
          // 创建新文件夹
          console.log('📁 创建新文件夹:', folderName);
          const newFolder = await this.createBookmark({
            title: folderName,
            parentId: currentFolderId
            // 注意：不设置url，这样就是文件夹
          });
          console.log('✅ 文件夹创建成功:', folderName, newFolder.id);
          currentFolderId = newFolder.id;
        }
      }
      
      console.log('📁 最终目标文件夹ID:', currentFolderId);
      return currentFolderId;
      
    } catch (error) {
      console.error('❌ 创建文件夹路径失败:', error);
      // 如果创建失败，返回同步收藏夹根目录
      return syncFolderId;
    }
  }

  // 获取书签文件夹的子项
  async getBookmarkChildren(folderId) {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      return new Promise((resolve) => {
        chrome.bookmarks.getChildren(folderId, resolve);
      });
    } else if (typeof browser !== 'undefined' && browser.bookmarks) {
      return await browser.bookmarks.getChildren(folderId);
    }
    return [];
  }

  // 从本地移除书签
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

  // 处理密码变更
  async handlePasswordChange(message) {
    const { action, data } = message;
    console.log(`🔐 密码${action}:`, data.site_name);
    
    try {
      switch (action) {
        case 'created':
          await this.syncPasswordToLocal(data, 'created');
          break;
          
        case 'updated':
          await this.syncPasswordToLocal(data, 'updated');
          break;
          
        case 'deleted':
          await this.removePasswordFromLocal(data);
          break;
      }
    } catch (error) {
      console.error('❌ 同步密码失败:', error);
    }
  }

  // 同步密码到本地（通知content script）
  async syncPasswordToLocal(passwordData, action) {
    try {
      console.log('🔄 开始同步密码到本地:', passwordData.site_name);
      
      // 获取当前活动标签页
      const tabs = await this.getActiveTabs();
      
      for (const tab of tabs) {
        // 检查标签页URL是否匹配密码的网站
        if (tab.url && tab.url.startsWith(passwordData.site_url)) {
          try {
            // 向content script发送密码同步消息
            await this.sendMessageToTab(tab.id, {
              type: 'PASSWORD_SYNC',
              action: action,
              data: passwordData
            });
            
            console.log('✅ 密码同步消息已发送到标签页:', tab.id);
          } catch (error) {
            console.log('⚠️ 向标签页发送消息失败:', tab.id, error.message);
          }
        }
      }
      
      // 显示通知
      const actionText = action === 'created' ? '新增' : action === 'updated' ? '更新' : '删除';
      this.showNotification(`密码"${passwordData.site_name}"已${actionText}`, 'success');
      
    } catch (error) {
      console.error('❌ 同步密码到本地失败:', error);
    }
  }

  // 从本地移除密码（通知content script）
  async removePasswordFromLocal(passwordData) {
    try {
      console.log('🗑️ 从本地移除密码:', passwordData.site_name);
      
      // 获取当前活动标签页
      const tabs = await this.getActiveTabs();
      
      for (const tab of tabs) {
        if (tab.url && tab.url.startsWith(passwordData.site_url)) {
          try {
            await this.sendMessageToTab(tab.id, {
              type: 'PASSWORD_SYNC',
              action: 'deleted',
              data: passwordData
            });
          } catch (error) {
            console.log('⚠️ 向标签页发送消息失败:', tab.id, error.message);
          }
        }
      }
      
      this.showNotification(`密码"${passwordData.site_name}"已删除`, 'success');
      
    } catch (error) {
      console.error('❌ 从本地移除密码失败:', error);
    }
  }

  // 获取活动标签页
  async getActiveTabs() {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      return new Promise((resolve) => {
        chrome.tabs.query({}, resolve);
      });
    } else if (typeof browser !== 'undefined' && browser.tabs) {
      return await browser.tabs.query({});
    }
    return [];
  }

  // 向标签页发送消息
  async sendMessageToTab(tabId, message) {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    } else if (typeof browser !== 'undefined' && browser.tabs) {
      return await browser.tabs.sendMessage(tabId, message);
    }
    throw new Error('浏览器不支持标签页消息');
  }

  // 订阅数据更新
  subscribe(subscriptions) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        subscriptions: subscriptions
      }));
    }
  }

  // 发送心跳
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000); // 25秒发送一次心跳
  }

  // 清理资源
  cleanup() {
    this.isConnecting = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // 安排重连
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ WebSocket重连次数已达上限，停止重连');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // 指数退避
    
    console.log(`🔄 ${delay}ms后尝试第${this.reconnectAttempts}次重连...`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  // 断开连接
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, '主动断开');
      this.ws = null;
    }
    this.cleanup();
  }

  // 注册消息处理器
  onMessage(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  // 注册连接状态回调
  onConnectionChange(callback) {
    this.connectionCallbacks.push(callback);
  }

  // 通知连接状态变化
  notifyConnectionCallbacks(status) {
    this.connectionCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('❌ 连接状态回调错误:', error);
      }
    });
  }

  // 获取存储数据 (需要在具体环境中实现)
  async getStorageData(keys) {
    // Chrome/Firefox兼容
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise((resolve) => {
        chrome.storage.sync.get(keys, resolve);
      });
    } else if (typeof browser !== 'undefined' && browser.storage) {
      return await browser.storage.sync.get(keys);
    }
    return {};
  }

  // 设置存储数据 (需要在具体环境中实现)
  async setStorageData(data) {
    // Chrome/Firefox兼容
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise((resolve) => {
        chrome.storage.sync.set(data, resolve);
      });
    } else if (typeof browser !== 'undefined' && browser.storage) {
      return await browser.storage.sync.set(data);
    }
  }

  // 搜索书签 (需要在具体环境中实现)
  async searchBookmarks(query) {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      return new Promise((resolve) => {
        chrome.bookmarks.search(query, resolve);
      });
    } else if (typeof browser !== 'undefined' && browser.bookmarks) {
      return await browser.bookmarks.search(query);
    }
    return [];
  }

  // 在同步收藏夹内查找书签（更精确的搜索）
  async findBookmarkInSyncFolder(syncFolderId, url, title) {
    try {
      // 获取同步收藏夹的所有子项
      const allBookmarks = await this.getAllBookmarksInFolder(syncFolderId);
      
      // 只按URL匹配，URL是书签的唯一标识
      const matches = allBookmarks.filter(bookmark => {
        return bookmark.url && bookmark.url === url;
      });
      
      console.log(`🔍 在同步收藏夹中找到 ${matches.length} 个匹配的书签 (URL: ${url})`);
      return matches;
    } catch (error) {
      console.error('❌ 在同步收藏夹中搜索书签失败:', error);
      return [];
    }
  }

  // 在指定文件夹中查找书签
  async findBookmarkInFolder(folderId, url) {
    try {
      const children = await this.getBookmarkChildren(folderId);
      const matches = children.filter(child => child.url === url);
      console.log(`🔍 在文件夹 ${folderId} 中找到 ${matches.length} 个匹配的书签`);
      return matches;
    } catch (error) {
      console.error('❌ 在文件夹中搜索书签失败:', error);
      return [];
    }
  }

  // 递归获取文件夹内所有书签
  async getAllBookmarksInFolder(folderId) {
    try {
      const allBookmarks = [];
      const stack = [folderId];
      
      while (stack.length > 0) {
        const currentFolderId = stack.pop();
        const children = await this.getBookmarkChildren(currentFolderId);
        
        for (const child of children) {
          if (child.url) {
            // 这是一个书签
            allBookmarks.push(child);
          } else {
            // 这是一个文件夹，添加到栈中继续搜索
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

  // 创建书签 (需要在具体环境中实现)
  async createBookmark(bookmark) {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      return new Promise((resolve) => {
        chrome.bookmarks.create(bookmark, resolve);
      });
    } else if (typeof browser !== 'undefined' && browser.bookmarks) {
      return await browser.bookmarks.create(bookmark);
    }
    return null;
  }

  // 更新书签 (需要在具体环境中实现)
  async updateBookmark(id, changes) {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      return new Promise((resolve) => {
        chrome.bookmarks.update(id, changes, resolve);
      });
    } else if (typeof browser !== 'undefined' && browser.bookmarks) {
      return await browser.bookmarks.update(id, changes);
    }
    return null;
  }

  // 移动书签 (需要在具体环境中实现)
  async moveBookmark(id, destination) {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      return new Promise((resolve) => {
        chrome.bookmarks.move(id, destination, resolve);
      });
    } else if (typeof browser !== 'undefined' && browser.bookmarks) {
      return await browser.bookmarks.move(id, destination);
    }
    return null;
  }

  // 删除书签 (需要在具体环境中实现)
  async removeBookmark(id) {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      return new Promise((resolve) => {
        chrome.bookmarks.remove(id, resolve);
      });
    } else if (typeof browser !== 'undefined' && browser.bookmarks) {
      return await browser.bookmarks.remove(id);
    }
    return null;
  }

  // 显示通知 (需要在具体环境中实现)
  showNotification(message, type = 'info') {
    const emoji = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️';
    console.log(`${emoji} WebSocket通知: ${message}`);
  }

  // 获取连接状态
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
}

// 导出WebSocket管理器
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketManager;
} else if (typeof self !== 'undefined') {
  // Service Worker环境
  self.WebSocketManager = WebSocketManager;
} else if (typeof window !== 'undefined') {
  // 浏览器环境
  window.WebSocketManager = WebSocketManager;
} else {
  // 其他环境，直接赋值到全局
  this.WebSocketManager = WebSocketManager;
}