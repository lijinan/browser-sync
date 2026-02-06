// 导入WebSocket管理器 - Service Worker版本
try {
  importScripts('websocket-manager-sw.js');
} catch (error) {
  console.error('❌ 导入WebSocket管理器失败:', error);
}

// 后台服务脚本 - 支持可配置模式和自动同步
class ExtensionBackground {
  constructor() {
    this.settings = {}
    this.wsManager = null
    this.init()
  }

  init() {
    // 监听浏览器启动事件
    if (chrome.runtime.onStartup) {
      chrome.runtime.onStartup.addListener(() => {
        console.log('🚀 浏览器启动事件触发')
        this.handleBrowserStartup()
      })
    }

    // 安装时初始化
    chrome.runtime.onInstalled.addListener(() => {
      this.createContextMenus()
      this.setDefaultSettings()
      this.loadSettings()
    })

    // 监听来自content script和popup的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse)
      return true
    })

    // 监听标签页更新
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.onTabUpdated(tabId, tab)
      }
    })

    // 监听书签API (用于自动同步)
    if (chrome.bookmarks) {
      chrome.bookmarks.onCreated.addListener((id, bookmark) => {
        this.onBookmarkCreated(id, bookmark)
      })

      // 监听书签删除
      chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
        this.onBookmarkRemoved(id, removeInfo)
      })

      // 监听书签移动
      chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
        this.onBookmarkMoved(id, moveInfo)
      })

      // 监听书签更新
      chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
        this.onBookmarkChanged(id, changeInfo)
      })
    }

    // 监听快捷键命令
    chrome.commands.onCommand.addListener((command) => {
      this.onCommand(command)
    })

    // 监听设置更新
    chrome.storage.onChanged.addListener((_, namespace) => {
      if (namespace === 'sync') {
        this.loadSettings()
      }
    })

    // 初始加载设置
    this.loadSettings()
    
    // 初始化WebSocket管理器
    this.initWebSocketManager()
  }

  // 初始化WebSocket管理器
  initWebSocketManager() {
    try {
      // 使用Service Worker版本的WebSocket管理器
      if (typeof WebSocketManagerSW !== 'undefined') {
        this.wsManager = new WebSocketManagerSW()
        
        // 监听连接状态变化
        this.wsManager.onConnectionChange((status) => {
          console.log('🔗 WebSocket连接状态变化:', status)
          if (status === 'connected') {
            this.showNotification('实时同步已连接', 'success')
          } else if (status === 'disconnected') {
            console.log('⚠️ 实时同步已断开')
          }
        })
        
        // 监听书签变更消息
        this.wsManager.onMessage('bookmark_change', (message) => {
          console.log('📚 收到书签变更通知:', message)
        })
        
        console.log('✅ WebSocket管理器初始化成功')
      } else {
        console.log('⚠️ WebSocket管理器未加载，将在设置加载后重试')
      }
    } catch (error) {
      console.error('❌ WebSocket管理器初始化失败:', error)
    }
  }

  // 处理浏览器启动事件
  async handleBrowserStartup() {
    try {
      console.log('🔄 处理浏览器启动...')

      // 检查是否启用启动时同步
      const settings = await chrome.storage.sync.get(['syncOnStartup', 'token'])

      if (!settings.token) {
        console.log('⚠️ 未登录，跳过启动时同步')
        return
      }

      if (!settings.syncOnStartup) {
        console.log('⚠️ 启动时同步已关闭')
        return
      }

      // 检查是否正在导入数据
      const { isImporting } = await chrome.storage.sync.get(['isImporting'])
      if (isImporting) {
        console.log('🚫 正在导入数据，跳过启动时同步')
        return
      }

      console.log('✅ 启动时自动同步已触发')

      // 延迟执行，确保浏览器完全启动
      setTimeout(async () => {
        await this.startWebSocketConnection()

        // 再延迟一下，等待WebSocket连接建立
        setTimeout(() => {
          this.performFullSync()
        }, 3000)
      }, 2000)

    } catch (error) {
      console.error('❌ 处理浏览器启动失败:', error)
    }
  }

  // 启动WebSocket连接
  async startWebSocketConnection() {
    try {
      if (!this.wsManager) {
        console.log('⚠️ WebSocket管理器未初始化')
        return
      }
      
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      if (settings.token) {
        console.log('🔄 启动WebSocket连接...')
        await this.wsManager.connect()
      } else {
        console.log('⚠️ 未登录，跳过WebSocket连接')
      }
    } catch (error) {
      console.error('❌ 启动WebSocket连接失败:', error)
    }
  }

  // 执行全量同步 - 从服务器同步所有书签到本地
  async performFullSync() {
    try {
      console.log('🔄 开始执行全量同步...')
      
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ 未登录，无法执行全量同步')
        return
      }

      // 获取服务器上的所有书签
      console.log('📡 获取服务器书签...')
      const response = await fetch(`${settings.serverUrl}/bookmarks`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (!response.ok) {
        console.error('❌ 获取服务器书签失败:', response.status)
        return
      }

      const data = await response.json()
      const serverBookmarks = data.bookmarks || []
      console.log(`📚 服务器上有 ${serverBookmarks.length} 个书签`)

      if (serverBookmarks.length === 0) {
        console.log('⚠️ 服务器上没有书签，跳过全量同步')
        return
      }

      // 确保同步收藏夹存在
      const syncFolder = await this.ensureSyncFolder()
      if (!syncFolder) {
        console.error('❌ 无法创建或找到同步收藏夹')
        return
      }

      console.log('✅ 同步收藏夹已准备好:', syncFolder.id)

      // 获取本地同步收藏夹中的所有书签
      const localBookmarks = await this.getAllLocalSyncBookmarks(syncFolder.id)
      console.log(`📖 本地同步收藏夹中有 ${localBookmarks.length} 个书签`)

      // 创建本地书签URL映射
      const localBookmarkMap = new Map()
      localBookmarks.forEach(bookmark => {
        if (bookmark.url) {
          localBookmarkMap.set(bookmark.url, bookmark)
        }
      })

      let syncedCount = 0
      let skippedCount = 0

      // 同步服务器书签到本地
      for (const serverBookmark of serverBookmarks) {
        try {
          const localBookmark = localBookmarkMap.get(serverBookmark.url)
          
          if (localBookmark) {
            // 书签已存在，检查是否需要更新
            const needsUpdate = localBookmark.title !== serverBookmark.title
            
            if (needsUpdate) {
              await chrome.bookmarks.update(localBookmark.id, {
                title: serverBookmark.title
              })
              console.log(`✏️ 更新书签: ${serverBookmark.title}`)
              syncedCount++
            } else {
              skippedCount++
            }
          } else {
            // 书签不存在，创建新书签
            const targetFolderId = await this.ensureFolderPathForSync(syncFolder.id, serverBookmark.folder)
            
            await chrome.bookmarks.create({
              title: serverBookmark.title,
              url: serverBookmark.url,
              parentId: targetFolderId
            })
            
            console.log(`➕ 创建书签: ${serverBookmark.title} -> ${serverBookmark.folder}`)
            syncedCount++
          }
          
          // 避免请求过快
          await new Promise(resolve => setTimeout(resolve, 100))
          
        } catch (error) {
          console.error(`❌ 同步书签失败: ${serverBookmark.title}`, error)
        }
      }

      console.log(`✅ 全量同步完成! 同步了 ${syncedCount} 个书签，跳过 ${skippedCount} 个`)
      this.showNotification(`全量同步完成！同步了 ${syncedCount} 个书签`, 'success')

    } catch (error) {
      console.error('❌ 全量同步失败:', error)
      this.showNotification('全量同步失败: ' + error.message, 'error')
    }
  }

  // 确保同步收藏夹存在
  async ensureSyncFolder() {
    try {
      // 查找现有的同步收藏夹
      const syncFolders = await chrome.bookmarks.search({ title: '同步收藏夹' })
      
      if (syncFolders.length > 0) {
        return syncFolders[0]
      }

      // 创建新的同步收藏夹
      console.log('📁 创建同步收藏夹...')
      const syncFolder = await chrome.bookmarks.create({
        title: '同步收藏夹'
      })
      
      return syncFolder
    } catch (error) {
      console.error('❌ 确保同步收藏夹失败:', error)
      return null
    }
  }

  // 获取本地同步收藏夹中的所有书签
  async getAllLocalSyncBookmarks(syncFolderId) {
    try {
      const allBookmarks = []
      
      const getBookmarksRecursive = async (folderId) => {
        const children = await chrome.bookmarks.getChildren(folderId)
        
        for (const child of children) {
          if (child.url) {
            // 这是一个书签
            allBookmarks.push(child)
          } else {
            // 这是一个文件夹，递归获取
            await getBookmarksRecursive(child.id)
          }
        }
      }
      
      await getBookmarksRecursive(syncFolderId)
      return allBookmarks
    } catch (error) {
      console.error('❌ 获取本地书签失败:', error)
      return []
    }
  }

  // 为全量同步确保文件夹路径存在
  async ensureFolderPathForSync(syncFolderId, folderPath) {
    try {
      // 如果没有指定文件夹或只是"同步收藏夹"，直接返回根目录
      if (!folderPath || folderPath === '同步收藏夹') {
        return syncFolderId
      }
      
      // 规范化路径：处理重复的"同步收藏夹"前缀
      // 例如 "同步收藏夹 > 同步收藏夹 > 编程语言" 变为 "同步收藏夹 > 编程语言"
      let normalizedPath = folderPath
      while (normalizedPath.startsWith('同步收藏夹 > 同步收藏夹')) {
        normalizedPath = normalizedPath.replace('同步收藏夹 > 同步收藏夹', '同步收藏夹')
      }
      
      // 解析文件夹路径 "同步收藏夹 > 个人资料 > 工作"
      const pathParts = normalizedPath.split(' > ').slice(1) // 移除"同步收藏夹"部分
      
      let currentFolderId = syncFolderId
      
      // 逐级创建/查找文件夹
      for (const folderName of pathParts) {
        if (!folderName.trim()) continue
        
        // 在当前文件夹下查找子文件夹
        const children = await chrome.bookmarks.getChildren(currentFolderId)
        let targetFolder = children.find(child => !child.url && child.title === folderName)
        
        if (targetFolder) {
          currentFolderId = targetFolder.id
        } else {
          // 创建新文件夹
          const newFolder = await chrome.bookmarks.create({
            title: folderName,
            parentId: currentFolderId
          })
          currentFolderId = newFolder.id
        }
      }
      
      return currentFolderId
    } catch (error) {
      console.error('❌ 创建文件夹路径失败:', error)
      // 如果创建失败，返回同步收藏夹根目录
      return syncFolderId
    }
  }

  async loadSettings() {
    try {
      const defaultSettings = {
        serverUrl: 'http://localhost:3001',
        syncOnStartup: false,  // 浏览器启动时自动同步
        autoPasswordDetect: true,
        interceptPasswordSave: false,
        autoPasswordFill: false,
        confirmPasswordSave: true,
        debugMode: false
      }
      
      const result = await chrome.storage.sync.get(defaultSettings)
      this.settings = result
      
      if (this.settings.debugMode) {
        console.log('Settings loaded:', this.settings)
      }
      
      // 只有在用户已登录时才启动WebSocket连接和全量同步
      const loginStatus = await this.checkLoginStatus()
      if (loginStatus.loggedIn) {
        console.log('✅ 用户已登录，启动WebSocket连接')
        this.startWebSocketConnection()
        
        // 检查是否正在导入数据，如果是则跳过全量同步
        const { isImporting } = await chrome.storage.sync.get(['isImporting'])
        if (isImporting) {
          console.log('🚫 检测到正在导入数据，跳过自动全量同步')
        } else {
          // 执行全量同步
          console.log('🔄 开始执行全量同步...')
          setTimeout(() => {
            this.performFullSync()
          }, 3000) // 延迟3秒执行，确保WebSocket连接已建立
        }
      } else {
        console.log('⚠️ 用户未登录，跳过WebSocket连接和全量同步')
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  createContextMenus() {
    // 清除现有菜单
    chrome.contextMenus.removeAll(() => {
      // 创建右键菜单
      chrome.contextMenus.create({
        id: 'saveBookmark',
        title: '保存为书签',
        contexts: ['page']
      })

      chrome.contextMenus.create({
        id: 'openDashboard',
        title: '打开管理面板',
        contexts: ['page']
      })

      chrome.contextMenus.create({
        id: 'openSettings',
        title: '扩展设置',
        contexts: ['page']
      })

      // 监听右键菜单点击
      chrome.contextMenus.onClicked.addListener((info, tab) => {
        this.handleContextMenuClick(info, tab)
      })
    })
  }

  async setDefaultSettings() {
    const defaultSettings = {
      serverUrl: 'http://localhost:3001',
      apiTimeout: 10,
      syncOnStartup: false,  // 浏览器启动时自动同步
      autoPasswordDetect: true,
      interceptPasswordSave: false,
      autoPasswordFill: false,
      confirmPasswordSave: true,
      debugMode: false
    }

    const existing = await chrome.storage.sync.get()
    
    // 只设置不存在的默认值
    const toSet = {}
    for (const [key, value] of Object.entries(defaultSettings)) {
      if (!(key in existing)) {
        toSet[key] = value
      }
    }
    
    if (Object.keys(toSet).length > 0) {
      await chrome.storage.sync.set(toSet)
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.type) {
        case 'SAVE_PASSWORD_TO_SERVER':
          const saveResult = await this.savePasswordToServer(request.data)
          sendResponse(saveResult)
          break

        case 'CHECK_EXISTING_PASSWORD':
          const existsResult = await this.checkExistingPassword(request.data.siteUrl, request.data.username)
          sendResponse({ exists: existsResult })
          break

        case 'GET_PASSWORDS_FOR_SITE':
          const sitePasswords = await this.getPasswordsForSite(request.data.siteUrl)
          sendResponse({ passwords: sitePasswords })
          break

        case 'GET_PASSWORD_DETAIL':
          const passwordDetail = await this.getPasswordDetail(request.data.passwordId)
          sendResponse({ password: passwordDetail })
          break

        case 'SAVE_BOOKMARK':
          await this.saveBookmark(request.data, sender.tab)
          sendResponse({ success: true })
          break

        case 'SAVE_PASSWORD':
          await this.savePassword(request.data, sender.tab)
          sendResponse({ success: true })
          break

        case 'GET_SETTINGS':
          sendResponse(this.settings)
          break

        case 'SETTINGS_UPDATED':
          await this.loadSettings()
          sendResponse({ success: true })
          break

        case 'CHECK_LOGIN_STATUS':
          const loginStatus = await this.checkLoginStatus()
          sendResponse(loginStatus)
          break

        case 'WEBSOCKET_STATUS':
          const wsStatus = this.wsManager ? this.wsManager.getConnectionStatus() : 'not_initialized'
          sendResponse({ status: wsStatus })
          break

        case 'WEBSOCKET_CONNECT':
          await this.startWebSocketConnection()
          sendResponse({ success: true })
          break

        case 'WEBSOCKET_DISCONNECT':
          if (this.wsManager) {
            this.wsManager.disconnect()
          }
          sendResponse({ success: true })
          break

        case 'GET_PASSWORDS_FOR_SITE':
          const passwords = await this.getPasswordsForSite(request.url)
          sendResponse(passwords)
          break

        case 'TEST_NOTIFICATION':
          this.showNotification(request.message || '测试通知', 'info')
          sendResponse({ success: true })
          break

        case 'FULL_SYNC':
          await this.performFullSync()
          sendResponse({ success: true })
          break

        default:
          sendResponse({ error: 'Unknown message type' })
      }
    } catch (error) {
      console.error('Background script error:', error)
      sendResponse({ error: error.message })
    }
  }

  async handleContextMenuClick(info, tab) {
    try {
      switch (info.menuItemId) {
        case 'saveBookmark':
          await this.saveBookmarkFromContext(tab)
          break

        case 'openDashboard':
          chrome.tabs.create({ url: `${this.settings.serverUrl.replace(':3001', ':3002')}` })
          break

        case 'openSettings':
          chrome.runtime.openOptionsPage()
          break
      }
    } catch (error) {
      console.error('Context menu error:', error)
    }
  }

  async onTabUpdated(tabId, tab) {
    try {
      if (!this.settings.autoPasswordDetect) return

      // 如果开启了自动检测，向页面注入检测脚本
      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            type: 'AUTO_DETECT_FORMS',
            settings: this.settings
          }).catch(() => {
            // 忽略错误，可能是页面还没准备好
          })
        }, 2000)

        // 如果启用了自动填充，获取该站点的密码
        if (this.settings.autoPasswordFill) {
          const passwords = await this.getPasswordsForSite(tab.url)
          if (passwords.length > 0) {
            chrome.tabs.sendMessage(tabId, {
              type: 'AUTO_FILL_PASSWORD',
              passwords: passwords
            }).catch(() => {
              // 忽略错误
            })
          }
        }
      }
    } catch (error) {
      console.error('Tab update error:', error)
    }
  }

  async onBookmarkCreated(id, bookmark) {
    try {
      if (this.settings.debugMode) {
        console.log('书签创建事件:', { id, bookmark })
      }

      // 检查是否为文件夹类型（没有URL的书签项）
      if (!bookmark.url) {
        console.log('📁 检测到文件夹创建，跳过同步:', bookmark.title)
        return
      }

      // 检查书签是否保存在"同步收藏夹"或其子文件夹中
      const isInSyncFolder = await this.checkBookmarkInSyncFolder(id)
      if (!isInSyncFolder) {
        if (this.settings.debugMode) {
          console.log('书签不在同步收藏夹中，跳过自动同步')
        }
        return
      }

      console.log('检测到同步收藏夹中的新书签:', bookmark.title)

      // 检查登录状态
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('未登录，跳过自动同步')
        this.showNotification('检测到新书签，但未登录扩展', 'warning')
        return
      }

      // 获取完整的文件夹路径
      const folderPath = await this.getBookmarkFolderPath(id)
      const folder = folderPath.length > 0 ? '同步收藏夹 > ' + folderPath.join(' > ') : '同步收藏夹'

      if (this.settings.debugMode) {
        console.log('书签文件夹路径:', folder)
      }

      // 保存到服务器
      await this.saveBookmark({
        title: bookmark.title,
        url: bookmark.url,
        folder: folder,
        tags: ['自动同步', '浏览器收藏']
      })

      console.log('✅ 书签自动同步成功:', bookmark.title)
      this.showNotification(`书签"${bookmark.title}"已自动同步到服务器`, 'success')

    } catch (error) {
      console.error('书签自动同步失败:', error)
      this.showNotification('书签自动同步失败: ' + error.message, 'error')
    }
  }

  // 检查书签是否在"同步收藏夹"或其子文件夹中
  async checkBookmarkInSyncFolder(bookmarkId) {
    try {
      if (!chrome.bookmarks) return false
      
      const bookmark = await new Promise((resolve) => {
        chrome.bookmarks.get(bookmarkId, resolve)
      })
      if (!bookmark || bookmark.length === 0) return false

      let parentId = bookmark[0].parentId
      while (parentId) {
        const nodes = await new Promise((resolve) => {
          chrome.bookmarks.get(parentId, resolve)
        })
        if (!nodes || nodes.length === 0) break

        const node = nodes[0]
        // 检查是否是"同步收藏夹"
        if (node.title === '同步收藏夹') {
          return true
        }

        parentId = node.parentId
      }
      return false
    } catch (error) {
      console.error('检查书签文件夹失败:', error)
      return false
    }
  }

  // 通过URL检查书签是否在服务器上存在
  async checkBookmarkExistsOnServer(url) {
    try {
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) return null

      const response = await fetch(`${settings.serverUrl}/bookmarks/search?url=${encodeURIComponent(url)}`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        return data.bookmarks && data.bookmarks.length > 0 ? data.bookmarks[0] : null
      }
    } catch (error) {
      console.error('检查服务器书签失败:', error)
    }
    return null
  }

  // 删除服务器上的书签
  async deleteBookmarkFromServer(url) {
    try {
      console.log('🔄 开始删除服务器书签:', url)
      
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ 没有token，无法删除服务器书签')
        return false
      }

      console.log('🔍 搜索服务器上的书签...')
      const serverBookmark = await this.checkBookmarkExistsOnServer(url)
      
      if (!serverBookmark) {
        console.log('⚠️ 服务器上未找到对应书签')
        return false
      }

      console.log('✅ 找到服务器书签:', {
        id: serverBookmark.id,
        title: serverBookmark.title,
        url: serverBookmark.url
      })

      console.log('🗑️ 删除服务器书签...')
      const response = await fetch(`${settings.serverUrl}/bookmarks/${serverBookmark.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        console.log('✅ 服务器书签删除成功')
        return true
      } else {
        console.log('❌ 服务器书签删除失败:', response.status, response.statusText)
        return false
      }
    } catch (error) {
      console.error('❌ 删除服务器书签失败:', error)
      return false
    }
  }

  // 书签删除事件处理
  async onBookmarkRemoved(id, removeInfo) {
    try {
      console.log('🔔 书签删除事件触发:', { id, removeInfo })
      
      if (this.settings.debugMode) {
        console.log('书签删除事件详细信息:', { 
          id, 
          removeInfo,
          nodeTitle: removeInfo.node?.title,
          nodeUrl: removeInfo.node?.url,
          nodeParentId: removeInfo.node?.parentId
        })
      }

      // 检查removeInfo.node是否存在
      if (!removeInfo.node) {
        console.log('⚠️ removeInfo.node不存在，跳过同步')
        return
      }

      // 检查是否是文件夹（没有URL但有children）
      if (!removeInfo.node.url && removeInfo.node.children) {
        console.log('📁 删除的是文件夹，检查是否在同步收藏夹中...')
        
        // 检查文件夹是否在同步收藏夹中
        let wasInSyncFolder = false
        if (removeInfo.parentId) {
          wasInSyncFolder = await this.checkParentIsSyncFolder(removeInfo.parentId)
        }
        if (!wasInSyncFolder) {
          wasInSyncFolder = await this.checkBookmarkInSyncFolderByNode(removeInfo.node)
        }
        
        if (!wasInSyncFolder) {
          console.log('📁 文件夹不在同步收藏夹中，跳过同步')
          return
        }
        
        console.log('✅ 检测到同步收藏夹中的文件夹被删除:', removeInfo.node.title)
        
        // 检查登录状态
        const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
        if (!settings.token) {
          console.log('❌ 未登录，跳过删除同步')
          return
        }
        
        // 遍历删除文件夹中的所有书签
        const bookmarksToDelete = this.getAllBookmarksFromNode(removeInfo.node)
        console.log(`🗑️ 文件夹中包含 ${bookmarksToDelete.length} 个书签，开始从服务器删除...`)
        
        for (const bookmark of bookmarksToDelete) {
          if (bookmark.url) {
            await this.deleteBookmarkFromServer(bookmark.url)
            console.log('🗑️ 已从服务器删除书签:', bookmark.title)
          }
        }
        this.showNotification(`文件夹"${removeInfo.node.title}"中的 ${bookmarksToDelete.length} 个书签已从服务器删除`, 'success')
        return
      }

      // 检查是否是书签（有URL）
      if (!removeInfo.node.url) {
        console.log('⚠️ 删除的不是书签也不是文件夹，跳过同步')
        return
      }

      // 检查删除的书签是否来自同步收藏夹
      // 首先尝试通过removeInfo.parentId检查
      let wasInSyncFolder = false
      
      if (removeInfo.parentId) {
        console.log('🔍 使用removeInfo.parentId检查:', removeInfo.parentId)
        wasInSyncFolder = await this.checkParentIsSyncFolder(removeInfo.parentId)
      }
      
      // 如果通过parentId检查失败，再尝试通过node信息检查
      if (!wasInSyncFolder) {
        console.log('🔍 使用node信息检查')
        wasInSyncFolder = await this.checkBookmarkInSyncFolderByNode(removeInfo.node)
      }
      
      console.log('📁 文件夹检查结果:', wasInSyncFolder)
      
      if (!wasInSyncFolder) {
        if (this.settings.debugMode) {
          console.log('删除的书签不在同步收藏夹中，跳过同步')
        }
        return
      }

      console.log('✅ 检测到同步收藏夹中的书签被删除:', removeInfo.node.title)

      // 检查登录状态
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ 未登录，跳过删除同步')
        this.showNotification('检测到书签删除，但扩展未登录', 'warning')
        return
      }

      console.log('🔄 开始同步删除到服务器...')

      // 从服务器删除对应书签
      const deleted = await this.deleteBookmarkFromServer(removeInfo.node.url)
      if (deleted) {
        console.log('✅ 书签删除已同步到服务器:', removeInfo.node.title)
        this.showNotification(`书签"${removeInfo.node.title}"的删除已同步到服务器`, 'success')
      } else {
        console.log('⚠️ 服务器上未找到对应书签或删除失败')
        this.showNotification(`书签"${removeInfo.node.title}"在服务器上未找到`, 'warning')
      }

    } catch (error) {
      console.error('❌ 书签删除同步失败:', error)
      this.showNotification('书签删除同步失败: ' + error.message, 'error')
    }
  }

  // 书签移动事件处理
  async onBookmarkMoved(id, moveInfo) {
    try {
      if (this.settings.debugMode) {
        console.log('书签移动事件:', { id, moveInfo })
      }

      const bookmark = await new Promise((resolve) => {
        chrome.bookmarks.get(id, resolve)
      })
      if (!bookmark || bookmark.length === 0) return

      const bookmarkNode = bookmark[0]
      
      // 检查是否是文件夹（没有URL的书签项）
      if (!bookmarkNode.url) {
        console.log('📁 检测到文件夹移动，跳过同步:', bookmarkNode.title)
        return
      }

      const isNowInSyncFolder = await this.checkBookmarkInSyncFolder(id)
      
      // 检查登录状态
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('未登录，跳过移动同步')
        return
      }

      if (isNowInSyncFolder) {
        // 移动到同步收藏夹 - 添加到服务器或更新现有书签
        console.log('书签移动到同步收藏夹:', bookmarkNode.title)
        
        const folderPath = await this.getBookmarkFolderPath(id)
        const folder = folderPath.length > 0 ? '同步收藏夹 > ' + folderPath.join(' > ') : '同步收藏夹'

        // 使用更新模式，这样如果书签已存在会更新文件夹信息
        await this.saveBookmark({
          title: bookmarkNode.title,
          url: bookmarkNode.url,
          folder: folder,
          tags: ['移动同步', '浏览器收藏']
        }, null, true) // 第三个参数表示这是更新操作

        this.showNotification(`书签"${bookmarkNode.title}"已同步到服务器`, 'success')
      } else {
        // 移出同步收藏夹 - 从服务器删除
        console.log('书签移出同步收藏夹:', bookmarkNode.title)
        
        const deleted = await this.deleteBookmarkFromServer(bookmarkNode.url)
        if (deleted) {
          this.showNotification(`书签"${bookmarkNode.title}"已从服务器移除`, 'success')
        }
      }

    } catch (error) {
      console.error('书签移动同步失败:', error)
      this.showNotification('书签移动同步失败: ' + error.message, 'error')
    }
  }

  // 书签更新事件处理
  async onBookmarkChanged(id, changeInfo) {
    try {
      if (this.settings.debugMode) {
        console.log('书签更新事件:', { id, changeInfo })
      }

      const isInSyncFolder = await this.checkBookmarkInSyncFolder(id)
      if (!isInSyncFolder) {
        if (this.settings.debugMode) {
          console.log('更新的书签不在同步收藏夹中，跳过同步')
        }
        return
      }

      console.log('检测到同步收藏夹中的书签被更新:', changeInfo.title)

      // 检查登录状态
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('未登录，跳过更新同步')
        return
      }

      const bookmark = await new Promise((resolve) => {
        chrome.bookmarks.get(id, resolve)
      })
      if (!bookmark || bookmark.length === 0) return

      const bookmarkNode = bookmark[0]
      const folderPath = await this.getBookmarkFolderPath(id)
      const folder = folderPath.length > 0 ? '同步收藏夹 > ' + folderPath.join(' > ') : '同步收藏夹'

      // 使用新的saveBookmark方法，它会自动处理更新逻辑
      await this.saveBookmark({
        title: bookmarkNode.title,
        url: bookmarkNode.url,
        folder: folder,
        tags: ['更新同步', '浏览器收藏']
      }, null, true) // 第三个参数表示这是更新操作

      this.showNotification(`书签"${bookmarkNode.title}"的更新已同步到服务器`, 'success')

    } catch (error) {
      console.error('书签更新同步失败:', error)
      this.showNotification('书签更新同步失败: ' + error.message, 'error')
    }
  }

  // 检查指定的父级ID是否是同步收藏夹或其子文件夹
  async checkParentIsSyncFolder(parentId) {
    try {
      console.log('🔍 检查父级ID是否为同步收藏夹:', parentId)
      
      let currentId = parentId
      let depth = 0
      const maxDepth = 10
      
      while (currentId && depth < maxDepth) {
        const nodes = await new Promise((resolve, reject) => {
          chrome.bookmarks.get(currentId, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve(result)
            }
          })
        })
        
        if (!nodes || nodes.length === 0) {
          console.log('❌ 无法获取节点信息')
          break
        }

        const node = nodes[0]
        console.log(`📁 检查节点:`, {
          id: node.id,
          title: node.title,
          parentId: node.parentId
        })
        
        if (node.title === '同步收藏夹') {
          console.log('✅ 找到同步收藏夹！')
          return true
        }

        currentId = node.parentId
        depth++
      }
      
      console.log('❌ 未找到同步收藏夹')
      return false
    } catch (error) {
      console.error('❌ 检查父级ID失败:', error)
      return false
    }
  }

  // 通过节点检查是否在同步文件夹中
  async checkBookmarkInSyncFolderByNode(node) {
    try {
      console.log('🔍 检查书签是否在同步文件夹中:', {
        title: node.title,
        url: node.url,
        parentId: node.parentId
      })
      
      // 特殊处理：如果没有parentId，可能是根目录书签，需要额外检查
      if (!node.parentId) {
        console.log('⚠️ 节点没有父级ID，可能是根目录书签')
        // 对于没有parentId的情况，我们无法确定是否在同步文件夹中
        // 但可以通过其他方式检查，比如通过removeInfo中的其他信息
        return false
      }
      
      let parentId = node.parentId
      let depth = 0
      const maxDepth = 10 // 防止无限循环
      
      while (parentId && depth < maxDepth) {
        console.log(`🔍 检查父级文件夹 (深度${depth}):`, parentId)
        
        const nodes = await new Promise((resolve, reject) => {
          chrome.bookmarks.get(parentId, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve(result)
            }
          })
        })
        
        if (!nodes || nodes.length === 0) {
          console.log('❌ 无法获取父级节点信息')
          break
        }

        const parentNode = nodes[0]
        console.log(`📁 父级文件夹信息:`, {
          id: parentNode.id,
          title: parentNode.title,
          parentId: parentNode.parentId
        })
        
        // 检查当前节点是否就是"同步收藏夹"
        if (parentNode.title === '同步收藏夹') {
          console.log('✅ 找到同步收藏夹！')
          return true
        }

        parentId = parentNode.parentId
        depth++
      }
      
      if (depth >= maxDepth) {
        console.log('⚠️ 达到最大搜索深度，停止搜索')
      }
      
      console.log('❌ 未找到同步收藏夹')
      return false
    } catch (error) {
      console.error('❌ 检查节点文件夹失败:', error)
      return false
    }
  }

  // 从节点递归获取所有书签（用于文件夹删除时）
  getAllBookmarksFromNode(node) {
    const bookmarks = []
    if (node.url) {
      bookmarks.push(node)
    }
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        bookmarks.push(...this.getAllBookmarksFromNode(child))
      }
    }
    return bookmarks
  }

  // 更新服务器上的书签
  async updateBookmarkOnServer(url, bookmarkData) {
    try {
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) return false

      const serverBookmark = await this.checkBookmarkExistsOnServer(url)
      if (!serverBookmark) {
        // 如果服务器上不存在，则创建新的
        await this.saveBookmark(bookmarkData)
        return true
      }

      const response = await fetch(`${settings.serverUrl}/bookmarks/${serverBookmark.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify(bookmarkData)
      })

      return response.ok
    } catch (error) {
      console.error('更新服务器书签失败:', error)
      return false
    }
  }

  // 获取书签的完整文件夹路径（不包含"同步收藏夹"本身）
  async getBookmarkFolderPath(bookmarkId) {
    try {
      if (!chrome.bookmarks) return []
      
      const path = []
      const bookmark = await new Promise((resolve) => {
        chrome.bookmarks.get(bookmarkId, resolve)
      })
      let parentId = bookmark[0]?.parentId

      while (parentId) {
        const nodes = await new Promise((resolve) => {
          chrome.bookmarks.get(parentId, resolve)
        })
        if (!nodes || nodes.length === 0) break

        const node = nodes[0]
        if (node.title === '同步收藏夹') {
          break
        }
        if (node.title) {
          path.unshift(node.title)
        }
        parentId = node.parentId
      }

      return path
    } catch (error) {
      console.error('获取书签路径失败:', error)
      return []
    }
  }

  async onCommand(command) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      
      switch (command) {
        case 'save-bookmark':
          await this.saveBookmarkFromContext(tab)
          break
          
        case 'open-settings':
          chrome.runtime.openOptionsPage()
          break
      }
    } catch (error) {
      console.error('Command handler error:', error)
    }
  }

  async saveBookmarkFromContext(tab) {
    try {
      const settings = await chrome.storage.sync.get(['token', 'serverUrl', 'confirmBookmarkSave'])
      
      if (!settings.token) {
        this.showNotification('请先登录扩展', 'error')
        return
      }

      if (settings.confirmBookmarkSave !== false) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CONFIRM_SAVE_BOOKMARK',
          data: { title: tab.title, url: tab.url }
        })
        return
      }

      await this.saveBookmark({
        title: tab.title,
        url: tab.url,
        folder: this.settings.autoBookmarkCategory ? this.extractDomain(tab.url) : '扩展保存',
        tags: ['扩展保存']
      }, tab)

    } catch (error) {
      console.error('Save bookmark error:', error)
      this.showNotification('保存书签失败', 'error')
    }
  }

  async saveBookmark(data, tab, isUpdate = false) {
    // 校验书签数据
    if (!data.url || !data.url.trim()) {
      console.log('⚠️ 书签URL为空，跳过保存:', data.title)
      throw new Error('书签URL不能为空')
    }
    
    // 确保标题不为空
    if (!data.title || !data.title.trim()) {
      data.title = 'Untitled'
    }
    
    // 清理数据
    data.url = data.url.trim()
    data.title = data.title.trim()

    const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
    
    if (!settings.token) {
      throw new Error('未登录')
    }

    // 检查是否已存在相同URL的书签
    console.log('🔍 检查书签是否重复:', data.url);
    const existingBookmark = await this.checkBookmarkExistsOnServer(data.url);
    
    if (existingBookmark) {
      console.log('📚 发现现有书签:', existingBookmark.title);
      
      // 检查是否需要更新（文件夹或标题不同）
      const needsUpdate = existingBookmark.folder !== data.folder || 
                         existingBookmark.title !== data.title;
      
      if (needsUpdate || isUpdate) {
        console.log('🔄 更新现有书签信息...');
        console.log('📁 原文件夹:', existingBookmark.folder);
        console.log('📁 新文件夹:', data.folder);
        
        // 更新现有书签
        const response = await fetch(`${settings.serverUrl}/bookmarks/${existingBookmark.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.token}`
          },
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || '更新失败')
        }

        console.log('✅ 书签更新成功:', data.title);
        this.showNotification(`书签"${data.title}"已更新！`, 'success');
      } else {
        console.log('⚠️ 书签信息相同，跳过保存');
        this.showNotification(`书签"${data.title}"已存在且信息相同`, 'info');
      }
      return;
    }

    console.log('✅ 书签不重复，开始保存');
    const response = await fetch(`${settings.serverUrl}/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.token}`
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || '保存失败')
    }

    console.log('✅ 书签保存成功:', data.title);
    this.showNotification(`书签"${data.title}"保存成功！`, 'success')
    
    if (tab) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'BOOKMARK_SAVED',
        data: data
      }).catch(() => {
        // 忽略错误
      })
    }
  }

  async savePassword(data, tab) {
    const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
    
    if (!settings.token) {
      throw new Error('未登录')
    }

    const response = await fetch(`${settings.serverUrl}/passwords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.token}`
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || '保存失败')
    }

    this.showNotification('密码保存成功！', 'success')
    
    if (tab) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'PASSWORD_SAVED',
        data: data
      }).catch(() => {
        // 忽略错误
      })
    }
  }

  async getPasswordsForSite(siteUrl) {
    try {
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) return []

      const response = await fetch(`${settings.serverUrl}/passwords`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const passwords = data.passwords || []
        
        return passwords.filter(p => p.site_url === siteUrl)
      }
    } catch (error) {
      console.error('❌ 获取网站密码失败:', error)
    }

    return []
  }

  async checkLoginStatus() {
    try {
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        return { loggedIn: false }
      }

      const response = await fetch(`${settings.serverUrl}/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        return { loggedIn: true, user: data.user }
      } else {
        return { loggedIn: false }
      }
    } catch (error) {
      return { loggedIn: false, error: error.message }
    }
  }

  extractDomain(url) {
    try {
      const domain = new URL(url).hostname
      return domain.replace(/^www\./, '')
    } catch {
      return 'unknown'
    }
  }

  showNotification(message, type = 'info') {
    try {
      // 暂时禁用通知功能，使用控制台日志代替
      // 这样可以避免通知API的兼容性问题
      const emoji = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️';
      console.log(`${emoji} 通知: ${message}`);
      
      // 可选：尝试创建通知，但不依赖它成功
      if (chrome.notifications && false) { // 暂时禁用
        const notificationOptions = {
          type: 'basic',
          title: '书签密码同步',
          message: message,
          iconUrl: chrome.runtime.getURL('icons/icon16.png') // 使用存在的图标
        };
        
        chrome.notifications.create('', notificationOptions, (notificationId) => {
          if (chrome.runtime.lastError) {
            console.log('📢 通知创建失败，但功能正常:', chrome.runtime.lastError.message);
          } else {
            console.log('✅ 通知创建成功:', notificationId);
          }
        });
      }
    } catch (error) {
      console.error('❌ 显示通知失败:', error);
      console.log('📢 通知消息:', message);
    }
  }

  // 密码相关方法 - 通过background script发送API请求避免CORS问题

  async savePasswordToServer(passwordData) {
    try {
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        return { success: false, error: '未登录' }
      }

      const response = await fetch(`${settings.serverUrl}/passwords`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify(passwordData)
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ 密码保存成功:', data.password.site_name)
        return { success: true, password: data.password }
      } else {
        const error = await response.json()
        console.error('❌ 密码保存失败:', error)
        return { success: false, error: error.message || '保存失败' }
      }
    } catch (error) {
      console.error('❌ 密码保存请求失败:', error)
      return { success: false, error: error.message }
    }
  }

  async checkExistingPassword(siteUrl, username) {
    try {
      console.log('🔍 Background: 检查现有密码:', { siteUrl, username })
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        console.log('⚠️ Background: 没有token')
        return false
      }

      console.log('📤 Background: 发送API请求检查密码')
      const response = await fetch(`${settings.serverUrl}/passwords`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const passwords = data.passwords || []
        console.log('📥 Background: 获取到密码列表:', passwords.length, '个')
        
        const exists = passwords.some(p => 
          p.site_url === siteUrl && p.username === username
        )
        console.log('🔍 Background: 密码存在检查结果:', exists)
        return exists
      } else {
        console.error('❌ Background: API请求失败:', response.status, response.statusText)
        return false
      }
    } catch (error) {
      console.error('❌ Background: 检查现有密码失败:', error)
      return false
    }
  }

  async getPasswordDetail(passwordId) {
    try {
      const settings = await chrome.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        return null
      }

      const response = await fetch(`${settings.serverUrl}/passwords/${passwordId}`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        return data.password
      }
    } catch (error) {
      console.error('❌ 获取密码详情失败:', error)
    }

    return null
  }
}

// 初始化后台脚本
new ExtensionBackground()