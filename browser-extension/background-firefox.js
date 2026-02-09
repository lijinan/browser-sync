// 导入WebSocket管理器 - Firefox版本
try {
  // Firefox使用不同的导入方式
  if (typeof importScripts !== 'undefined') {
    importScripts('websocket-manager.js');
  }
} catch (error) {
  console.error('❌ 导入WebSocket管理器失败:', error);
}

// Firefox兼容的后台脚本
class ExtensionBackgroundFirefox {
  constructor() {
    this.settings = {}
    this.wsManager = null
    this.extensionAPI = null
    this.init()
  }

  init() {
    // 等待API加载 - Firefox兼容性处理
    if (typeof browser !== 'undefined') {
      this.extensionAPI = browser
      console.log('✅ 使用Firefox browser API')
    } else if (typeof chrome !== 'undefined') {
      this.extensionAPI = chrome
      console.log('✅ 使用Chrome API')
    } else {
      console.error('❌ 未找到浏览器扩展API')
      setTimeout(() => this.init(), 100)
      return
    }

    console.log('✅ Firefox扩展API已加载')

    // 监听浏览器启动事件（Firefox也支持这个API）
    if (this.extensionAPI.runtime.onStartup) {
      this.extensionAPI.runtime.onStartup.addListener(() => {
        console.log('🚀 浏览器启动事件触发 (Firefox)')
        this.handleBrowserStartup()
      })
    }

    // 安装时初始化
    this.extensionAPI.runtime.onInstalled.addListener(() => {
      this.createContextMenus()
      this.setDefaultSettings()
      this.loadSettings()
    })

    // 监听来自content script的消息
    this.extensionAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse)
      return true
    })

    // 监听标签页更新
    this.extensionAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.onTabUpdated(tabId, tab)
      }
    })

    // 监听书签API (用于自动同步)
    if (this.extensionAPI.bookmarks) {
      this.extensionAPI.bookmarks.onCreated.addListener((id, bookmark) => {
        this.onBookmarkCreated(id, bookmark)
      })

      // 监听书签删除
      this.extensionAPI.bookmarks.onRemoved.addListener((id, removeInfo) => {
        this.onBookmarkRemoved(id, removeInfo)
      })

      // 监听书签移动
      this.extensionAPI.bookmarks.onMoved.addListener((id, moveInfo) => {
        this.onBookmarkMoved(id, moveInfo)
      })

      // 监听书签更新
      this.extensionAPI.bookmarks.onChanged.addListener((id, changeInfo) => {
        this.onBookmarkChanged(id, changeInfo)
      })
    }

    // 监听快捷键命令
    if (this.extensionAPI.commands) {
      this.extensionAPI.commands.onCommand.addListener((command) => {
        this.onCommand(command)
      })
    }

    // 监听设置更新 - Firefox兼容性处理
    try {
      if (this.extensionAPI.storage && this.extensionAPI.storage.onChanged) {
        this.extensionAPI.storage.onChanged.addListener((changes, namespace) => {
          if (namespace === 'sync') {
            this.loadSettings()
          }
        })
        console.log('✅ Firefox storage.onChanged 监听器已设置')
      } else {
        console.log('⚠️ Firefox storage.onChanged 不可用，将使用定时检查')
        // 如果onChanged不可用，使用定时检查作为备选方案
        setInterval(() => {
          this.loadSettings()
        }, 30000) // 每30秒检查一次设置变化
      }
    } catch (error) {
      console.error('❌ 设置storage.onChanged监听器失败:', error)
      console.log('⚠️ 将使用定时检查作为备选方案')
      setInterval(() => {
        this.loadSettings()
      }, 30000)
    }

    // 初始加载设置
    this.loadSettings()
    
    // 初始化WebSocket管理器
    this.initWebSocketManager()
  }

  // 初始化WebSocket管理器
  initWebSocketManager() {
    try {
      // 动态导入WebSocket管理器
      if (typeof WebSocketManager !== 'undefined') {
        this.wsManager = new WebSocketManager()
        
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
      console.log('🔄 Firefox处理浏览器启动...')

      // 检查是否启用启动时同步
      const settings = await this.extensionAPI.storage.sync.get(['syncOnStartup', 'token'])

      if (!settings.token) {
        console.log('⚠️ Firefox未登录，跳过启动时同步')
        return
      }

      if (!settings.syncOnStartup) {
        console.log('⚠️ Firefox启动时同步已关闭')
        return
      }

      // 检查是否正在导入数据
      const { isImporting } = await this.extensionAPI.storage.sync.get(['isImporting'])
      if (isImporting) {
        console.log('🚫 Firefox正在导入数据，跳过启动时同步')
        return
      }

      console.log('✅ Firefox启动时自动同步已触发')

      // 延迟执行，确保浏览器完全启动
      setTimeout(async () => {
        await this.startWebSocketConnection()

        // 再延迟一下，等待WebSocket连接建立
        setTimeout(() => {
          this.performFullSync()
        }, 3000)
      }, 2000)

    } catch (error) {
      console.error('❌ Firefox处理浏览器启动失败:', error)
    }
  }

  // 启动WebSocket连接
  async startWebSocketConnection() {
    try {
      if (!this.wsManager) {
        console.log('⚠️ WebSocket管理器未初始化')
        return
      }
      
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
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

  async loadSettings() {
    try {
      const defaultSettings = {
        workMode: 'cooperative',
        serverUrl: 'http://localhost:3001',
        syncOnStartup: false,  // 浏览器启动时自动同步
        autoBookmarkSave: false,
        overrideBookmarkShortcut: false,
        confirmBookmarkSave: true,
        autoBookmarkCategory: false,
        autoPasswordDetect: true,
        interceptPasswordSave: false,
        autoPasswordFill: false,
        confirmPasswordSave: true,
        debugMode: false
      }
      
      const result = await this.extensionAPI.storage.sync.get(defaultSettings)
      this.settings = result
      
      if (this.settings.debugMode) {
        console.log('Settings loaded:', this.settings)
      }
      
      // 设置加载后启动WebSocket连接和全量同步
      const loginStatus = await this.checkLoginStatus()
      if (loginStatus.loggedIn) {
        console.log('✅ Firefox用户已登录，启动WebSocket连接')
        this.startWebSocketConnection()
        
        // 检查是否正在导入数据，如果是则跳过全量同步
        const { isImporting } = await this.extensionAPI.storage.sync.get(['isImporting'])
        if (isImporting) {
          console.log('🚫 Firefox检测到正在导入数据，跳过自动全量同步')
        } else {
          // 执行全量同步
          console.log('🔄 Firefox开始执行全量同步...')
          setTimeout(() => {
            this.performFullSync()
          }, 3000) // 延迟3秒执行
        }
      } else {
        console.log('⚠️ Firefox用户未登录，跳过WebSocket连接和全量同步')
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  // 执行全量同步 - 从服务器同步所有书签到本地 (Firefox版本)
  async performFullSync() {
    try {
      console.log('🔄 Firefox开始执行全量同步...')

      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ Firefox未登录，无法执行全量同步')
        return
      }

      // 获取服务器上的所有书签
      console.log('📡 Firefox获取服务器书签...')
      const response = await fetch(`${settings.serverUrl}/bookmarks`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (!response.ok) {
        console.error('❌ Firefox获取服务器书签失败:', response.status)
        return
      }

      const data = await response.json()
      const serverBookmarks = data.bookmarks || []
      console.log(`📚 Firefox服务器上有 ${serverBookmarks.length} 个书签`)

      if (serverBookmarks.length === 0) {
        console.log('⚠️ Firefox服务器上没有书签，跳过全量同步')
        return
      }

      // 确保同步收藏夹存在
      const syncFolder = await this.ensureSyncFolder()
      if (!syncFolder) {
        console.error('❌ Firefox无法创建或找到同步收藏夹')
        return
      }

      console.log('✅ Firefox同步收藏夹已准备好:', syncFolder.id)

      let syncedCount = 0

      // 同步服务器书签到本地 (简化版本)
      for (const serverBookmark of serverBookmarks) {
        try {
          // 数据校验：确保书签数据有效
          if (!serverBookmark || !serverBookmark.url || !serverBookmark.url.trim()) {
            console.error('❌ Firefox书签数据无效，跳过同步:', serverBookmark)
            continue
          }

          if (!serverBookmark.title || !serverBookmark.title.trim()) {
            console.error('❌ Firefox书签标题为空，跳过同步:', serverBookmark.url)
            continue
          }

          // 检查书签是否已存在
          const existingBookmarks = await this.extensionAPI.bookmarks.search({ url: serverBookmark.url })

          if (existingBookmarks.length === 0) {
            // 书签不存在，创建新书签
            const targetFolderId = await this.ensureFolderPathForSync(syncFolder.id, serverBookmark.folder)

            await this.extensionAPI.bookmarks.create({
              title: serverBookmark.title,
              url: serverBookmark.url,
              parentId: targetFolderId
            })

            console.log(`➕ Firefox创建书签: ${serverBookmark.title}`)
            syncedCount++
          }

          // 避免请求过快
          await new Promise(resolve => setTimeout(resolve, 100))

        } catch (error) {
          console.error(`❌ Firefox同步书签失败: ${serverBookmark.title}`, error)
        }
      }

      console.log(`✅ Firefox全量同步完成! 同步了 ${syncedCount} 个书签`)
      this.showNotification(`Firefox全量同步完成！同步了 ${syncedCount} 个书签`, 'success')

    } catch (error) {
      console.error('❌ Firefox全量同步失败:', error)
      this.showNotification('Firefox全量同步失败: ' + error.message, 'error')
    }
  }

  // 确保同步收藏夹存在 (Firefox版本)
  async ensureSyncFolder() {
    try {
      // 查找现有的同步收藏夹
      const syncFolders = await this.extensionAPI.bookmarks.search({ title: '同步收藏夹' })
      
      if (syncFolders.length > 0) {
        return syncFolders[0]
      }

      // 创建新的同步收藏夹
      console.log('📁 Firefox创建同步收藏夹...')
      const syncFolder = await this.extensionAPI.bookmarks.create({
        title: '同步收藏夹'
      })
      
      return syncFolder
    } catch (error) {
      console.error('❌ Firefox确保同步收藏夹失败:', error)
      return null
    }
  }

  // 为全量同步确保文件夹路径存在 (Firefox版本)
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
        // 跳过空文件夹名称
        if (!folderName || !folderName.trim()) {
          console.log('⚠️ Firefox跳过空文件夹名称')
          continue
        }

        // 在当前文件夹下查找子文件夹
        const children = await this.extensionAPI.bookmarks.getChildren(currentFolderId)
        let targetFolder = children.find(child => !child.url && child.title === folderName)

        if (targetFolder) {
          currentFolderId = targetFolder.id
        } else {
          // 创建新文件夹
          const newFolder = await this.extensionAPI.bookmarks.create({
            title: folderName,
            parentId: currentFolderId
          })
          currentFolderId = newFolder.id
        }
      }

      return currentFolderId
    } catch (error) {
      console.error('❌ Firefox创建文件夹路径失败:', error)
      // 如果创建失败，返回同步收藏夹根目录
      return syncFolderId
    }
  }

  createContextMenus() {
    try {
      // 创建右键菜单
      this.extensionAPI.contextMenus.create({
        id: 'saveBookmark',
        title: '保存为书签',
        contexts: ['page']
      })

      this.extensionAPI.contextMenus.create({
        id: 'savePassword',
        title: '保存密码信息',
        contexts: ['selection']
      })

      this.extensionAPI.contextMenus.create({
        id: 'separator1',
        type: 'separator',
        contexts: ['page']
      })

      this.extensionAPI.contextMenus.create({
        id: 'openDashboard',
        title: '打开书签管理面板',
        contexts: ['page']
      })

      // 监听右键菜单点击
      this.extensionAPI.contextMenus.onClicked.addListener((info, tab) => {
        this.handleContextMenuClick(info, tab)
      })
    } catch (error) {
      console.error('❌ 创建右键菜单失败:', error)
    }
  }

  async setDefaultSettings() {
    try {
      const defaultSettings = {
        workMode: 'cooperative',
        serverUrl: 'http://localhost:3001',
        apiTimeout: 10,
        syncOnStartup: false,  // 浏览器启动时自动同步
        autoBookmarkSave: false,
        overrideBookmarkShortcut: false,
        confirmBookmarkSave: true,
        autoBookmarkCategory: false,
        autoPasswordDetect: true,
        interceptPasswordSave: false,
        autoPasswordFill: false,
        confirmPasswordSave: true,
        debugMode: false,
        backupReminder: true,
        usageStats: false
      }

      const existing = await this.extensionAPI.storage.sync.get()
      
      // 只设置不存在的默认值
      const toSet = {}
      for (const [key, value] of Object.entries(defaultSettings)) {
        if (!(key in existing)) {
          toSet[key] = value
        }
      }
      
      if (Object.keys(toSet).length > 0) {
        await this.extensionAPI.storage.sync.set(toSet)
      }
    } catch (error) {
      console.error('❌ 设置默认配置失败:', error)
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
          return { success: true }

        case 'SAVE_PASSWORD':
          await this.savePassword(request.data, sender.tab)
          return { success: true }

        case 'GET_SETTINGS':
          const settings = await this.extensionAPI.storage.sync.get()
          return settings

        case 'SETTINGS_UPDATED':
          await this.loadSettings()
          return { success: true }

        case 'CHECK_LOGIN_STATUS':
          const loginStatus = await this.checkLoginStatus()
          return loginStatus

        case 'WEBSOCKET_STATUS':
          const wsStatus = this.wsManager ? this.wsManager.getConnectionStatus() : 'not_initialized'
          return { status: wsStatus }

        case 'WEBSOCKET_CONNECT':
          await this.startWebSocketConnection()
          return { success: true }

        case 'WEBSOCKET_DISCONNECT':
          if (this.wsManager) {
            this.wsManager.disconnect()
          }
          return { success: true }

        case 'GET_PASSWORDS_FOR_SITE':
          const passwords = await this.getPasswordsForSite(request.url)
          return passwords

        case 'TEST_NOTIFICATION':
          this.showNotification(request.message || '测试通知', 'info')
          return { success: true }

        case 'FULL_SYNC':
          await this.performFullSync()
          return { success: true }

        default:
          return { error: 'Unknown message type' }
      }
    } catch (error) {
      console.error('Background script error:', error)
      return { error: error.message }
    }
  }

  async saveBookmark(data, tab, isUpdate = false) {
    try {
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        throw new Error('未登录')
      }

      // 检查是否已存在相同URL的书签
      console.log('🔍 检查书签是否重复:', data.url)
      const existingBookmark = await this.checkBookmarkExistsOnServer(data.url)
      
      if (existingBookmark) {
        console.log('📚 发现现有书签:', existingBookmark.title)
        
        // 检查是否需要更新（文件夹或标题不同）
        const needsUpdate = existingBookmark.folder !== data.folder || 
                           existingBookmark.title !== data.title
        
        if (needsUpdate || isUpdate) {
          console.log('🔄 更新现有书签信息...')
          console.log('📁 原文件夹:', existingBookmark.folder)
          console.log('📁 新文件夹:', data.folder)
          
          // 更新现有书签
          const response = await fetch(`${settings.serverUrl}/bookmarks/${existingBookmark.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.token}`
            },
            body: JSON.stringify(data)
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.message || '更新失败')
          }

          console.log('✅ 书签更新成功:', data.title)
          this.showNotification(`书签"${data.title}"已更新！`, 'success')
        } else {
          console.log('⚠️ 书签信息相同，跳过保存')
          this.showNotification(`书签"${data.title}"已存在且信息相同`, 'info')
        }
        return
      }

      console.log('✅ 书签不重复，开始保存')
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

      console.log('✅ 书签保存成功:', data.title)
      this.showNotification(`书签"${data.title}"保存成功！`, 'success')
      
      // 发送消息到content script
      if (tab) {
        this.extensionAPI.tabs.sendMessage(tab.id, {
          type: 'BOOKMARK_SAVED',
          data: data
        }).catch(() => {
          // 忽略错误
        })
      }
    } catch (error) {
      console.error('❌ 保存书签失败:', error)
      this.showNotification('保存书签失败: ' + error.message, 'error')
    }
  }

  async checkBookmarkExistsOnServer(url) {
    try {
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
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

  async checkLoginStatus() {
    try {
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      
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

  showNotification(message, type = 'info') {
    try {
      // 使用控制台日志代替通知，避免兼容性问题
      const emoji = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️'
      console.log(`${emoji} Firefox通知: ${message}`)
    } catch (error) {
      console.error('❌ 显示通知失败:', error)
      console.log('📢 通知消息:', message)
    }
  }

  // 密码相关方法 - Firefox版本，通过background script发送API请求避免CORS问题

  async savePasswordToServer(passwordData) {
    try {
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      
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
        console.log('✅ Firefox密码保存成功:', data.password.site_name)
        return { success: true, password: data.password }
      } else {
        const error = await response.json()
        console.error('❌ Firefox密码保存失败:', error)
        return { success: false, error: error.message || '保存失败' }
      }
    } catch (error) {
      console.error('❌ Firefox密码保存请求失败:', error)
      return { success: false, error: error.message }
    }
  }

  async checkExistingPassword(siteUrl, username) {
    try {
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        return false
      }

      const response = await fetch(`${settings.serverUrl}/passwords`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const passwords = data.passwords || []
        
        return passwords.some(p => 
          p.site_url === siteUrl && p.username === username
        )
      }
    } catch (error) {
      console.error('❌ Firefox检查现有密码失败:', error)
    }

    return false
  }

  async getPasswordsForSite(siteUrl) {
    try {
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        return []
      }

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
      console.error('❌ Firefox获取网站密码失败:', error)
    }

    return []
  }

  async getPasswordDetail(passwordId) {
    try {
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      
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
      console.error('❌ Firefox获取密码详情失败:', error)
    }

    return null
  }

  // 书签创建事件处理 - Firefox版本
  async onBookmarkCreated(id, bookmark) {
    try {
      const { isImporting, isExporting } = await this.extensionAPI.storage.sync.get(['isImporting', 'isExporting'])
      if (isImporting || isExporting) {
        console.log('🚫 Firefox正在导入/导出，跳过书签创建同步')
        return
      }

      console.log('📚 Firefox书签创建:', bookmark.title)

      // 检查是否为文件夹类型（没有URL的书签项）
      if (!bookmark.url) {
        console.log('📁 Firefox检测到文件夹创建，跳过同步:', bookmark.title)
        return
      }

      // 检查书签是否保存在"同步收藏夹"或其子文件夹中
      const isInSyncFolder = await this.checkBookmarkInSyncFolder(id)
      if (!isInSyncFolder) {
        console.log('Firefox书签不在同步收藏夹中，跳过自动同步')
        return
      }

      console.log('✅ Firefox检测到同步收藏夹中的新书签:', bookmark.title)

      // 检查登录状态
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ Firefox未登录，跳过自动同步')
        this.showNotification('检测到新书签，但未登录扩展', 'warning')
        return
      }

      // 获取完整的文件夹路径
      const folderPath = await this.getBookmarkFolderPath(id)
      const folder = folderPath.length > 0 ? '同步收藏夹 > ' + folderPath.join(' > ') : '同步收藏夹'

      console.log('📁 Firefox书签文件夹路径:', folder)

      // 保存到服务器
      await this.saveBookmark({
        title: bookmark.title,
        url: bookmark.url,
        folder: folder,
        tags: ['自动同步', 'Firefox收藏']
      })

      console.log('✅ Firefox书签自动同步成功:', bookmark.title)
      this.showNotification(`书签"${bookmark.title}"已自动同步到服务器`, 'success')

    } catch (error) {
      console.error('❌ Firefox书签自动同步失败:', error)
      this.showNotification('Firefox书签自动同步失败: ' + error.message, 'error')
    }
  }

  // 书签删除事件处理 - Firefox版本
  async onBookmarkRemoved(id, removeInfo) {
    try {
      const { isImporting, isExporting } = await this.extensionAPI.storage.sync.get(['isImporting', 'isExporting'])
      if (isImporting || isExporting) {
        console.log('🚫 Firefox正在导入/导出，跳过书签删除同步')
        return
      }

      console.log('🗑️ Firefox书签删除:', removeInfo.node?.title || 'Unknown')

      // 检查删除的书签是否在同步收藏夹中
      const isInSyncFolder = await this.checkRemovedBookmarkInSyncFolder(removeInfo)
      if (!isInSyncFolder) {
        console.log('Firefox删除的书签不在同步收藏夹中，跳过同步')
        return
      }

      console.log('✅ Firefox检测到同步收藏夹中的书签删除:', removeInfo.node?.title)

      // 检查登录状态
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ Firefox未登录，跳过删除同步')
        return
      }

      // 如果是文件夹，需要遍历删除其中的所有书签
      if (!removeInfo.node?.url && removeInfo.node?.children) {
        console.log('📁 Firefox删除的是文件夹，遍历删除其中的书签...')
        const bookmarksToDelete = this.getAllBookmarksFromNode(removeInfo.node)
        console.log(`🗑️ Firefox文件夹中包含 ${bookmarksToDelete.length} 个书签`)
        
        for (const bookmark of bookmarksToDelete) {
          if (bookmark.url) {
            await this.deleteBookmarkFromServer(bookmark.url)
            console.log('🗑️ Firefox已从服务器删除书签:', bookmark.title)
          }
        }
        this.showNotification(`文件夹"${removeInfo.node.title}"中的 ${bookmarksToDelete.length} 个书签已从服务器删除`, 'success')
        return
      }

      // 如果有URL，尝试从服务器删除
      if (removeInfo.node?.url) {
        await this.deleteBookmarkFromServer(removeInfo.node.url)
        console.log('✅ Firefox书签删除同步成功:', removeInfo.node.title)
        this.showNotification(`书签"${removeInfo.node.title}"已从服务器删除`, 'success')
      }

    } catch (error) {
      console.error('❌ Firefox书签删除同步失败:', error)
      this.showNotification('Firefox书签删除同步失败: ' + error.message, 'error')
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

  // 书签移动事件处理 - Firefox版本
  async onBookmarkMoved(id, moveInfo) {
    try {
      const { isImporting, isExporting } = await this.extensionAPI.storage.sync.get(['isImporting', 'isExporting'])
      if (isImporting || isExporting) {
        console.log('🚫 Firefox正在导入/导出，跳过书签移动同步')
        return
      }

      console.log('📁 Firefox书签移动:', id)

      // 获取移动后的书签信息
      const bookmark = await this.extensionAPI.bookmarks.get(id)
      if (!bookmark || bookmark.length === 0) {
        console.log('❌ Firefox无法获取移动的书签信息')
        return
      }

      const bookmarkInfo = bookmark[0]
      
      // 检查书签是否在同步收藏夹中
      const isInSyncFolder = await this.checkBookmarkInSyncFolder(id)
      if (!isInSyncFolder) {
        console.log('Firefox移动的书签不在同步收藏夹中，跳过同步')
        return
      }

      console.log('✅ Firefox检测到同步收藏夹中的书签移动:', bookmarkInfo.title)

      // 检查登录状态
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ Firefox未登录，跳过移动同步')
        return
      }

      // 获取新的文件夹路径
      const folderPath = await this.getBookmarkFolderPath(id)
      const folder = folderPath.length > 0 ? '同步收藏夹 > ' + folderPath.join(' > ') : '同步收藏夹'

      console.log('📁 Firefox书签新文件夹路径:', folder)

      // 更新服务器上的书签
      await this.saveBookmark({
        title: bookmarkInfo.title,
        url: bookmarkInfo.url,
        folder: folder,
        tags: ['自动同步', 'Firefox移动']
      }, true) // 传递isUpdate参数

      console.log('✅ Firefox书签移动同步成功:', bookmarkInfo.title)
      this.showNotification(`书签"${bookmarkInfo.title}"位置已同步到服务器`, 'success')

    } catch (error) {
      console.error('❌ Firefox书签移动同步失败:', error)
      this.showNotification('Firefox书签移动同步失败: ' + error.message, 'error')
    }
  }

  // 书签更新事件处理 - Firefox版本
  async onBookmarkChanged(id, changeInfo) {
    try {
      const { isImporting, isExporting } = await this.extensionAPI.storage.sync.get(['isImporting', 'isExporting'])
      if (isImporting || isExporting) {
        console.log('🚫 Firefox正在导入/导出，跳过书签更新同步')
        return
      }

      console.log('✏️ Firefox书签更新:', changeInfo.title || 'Unknown')

      // 检查书签是否在同步收藏夹中
      const isInSyncFolder = await this.checkBookmarkInSyncFolder(id)
      if (!isInSyncFolder) {
        console.log('Firefox更新的书签不在同步收藏夹中，跳过同步')
        return
      }

      console.log('✅ Firefox检测到同步收藏夹中的书签更新:', changeInfo.title)

      // 检查登录状态
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ Firefox未登录，跳过更新同步')
        return
      }

      // 获取完整的书签信息
      const bookmark = await this.extensionAPI.bookmarks.get(id)
      if (!bookmark || bookmark.length === 0) {
        console.log('❌ Firefox无法获取更新的书签信息')
        return
      }

      const bookmarkInfo = bookmark[0]

      // 获取文件夹路径
      const folderPath = await this.getBookmarkFolderPath(id)
      const folder = folderPath.length > 0 ? '同步收藏夹 > ' + folderPath.join(' > ') : '同步收藏夹'

      console.log('📁 Firefox书签文件夹路径:', folder)

      // 更新服务器上的书签
      await this.saveBookmark({
        title: bookmarkInfo.title,
        url: bookmarkInfo.url,
        folder: folder,
        tags: ['自动同步', 'Firefox更新']
      }, true) // 传递isUpdate参数

      console.log('✅ Firefox书签更新同步成功:', bookmarkInfo.title)
      this.showNotification(`书签"${bookmarkInfo.title}"已同步到服务器`, 'success')

    } catch (error) {
      console.error('❌ Firefox书签更新同步失败:', error)
      this.showNotification('Firefox书签更新同步失败: ' + error.message, 'error')
    }
  }

  async onCommand(command) {
    console.log('⌨️ Firefox命令:', command)
    // 简化实现
  }

  // 检查书签是否在"同步收藏夹"或其子文件夹中 - Firefox版本
  async checkBookmarkInSyncFolder(bookmarkId) {
    try {
      if (!this.extensionAPI.bookmarks) return false
      
      const bookmark = await this.extensionAPI.bookmarks.get(bookmarkId)
      if (!bookmark || bookmark.length === 0) return false

      let parentId = bookmark[0].parentId
      while (parentId) {
        const nodes = await this.extensionAPI.bookmarks.get(parentId)
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
      console.error('❌ Firefox检查书签文件夹失败:', error)
      return false
    }
  }

  // 检查删除的书签是否在同步收藏夹中 - Firefox版本
  async checkRemovedBookmarkInSyncFolder(removeInfo) {
    try {
      if (!removeInfo.node) return false
      
      // 通过父级ID检查
      let parentId = removeInfo.parentId
      while (parentId) {
        try {
          const nodes = await this.extensionAPI.bookmarks.get(parentId)
          if (!nodes || nodes.length === 0) break

          const node = nodes[0]
          if (node.title === '同步收藏夹') {
            return true
          }
          parentId = node.parentId
        } catch (error) {
          // 父级可能已被删除，跳出循环
          break
        }
      }
      return false
    } catch (error) {
      console.error('❌ Firefox检查删除书签文件夹失败:', error)
      return false
    }
  }

  // 获取书签的完整文件夹路径（不包含"同步收藏夹"本身）- Firefox版本
  async getBookmarkFolderPath(bookmarkId) {
    try {
      if (!this.extensionAPI.bookmarks) return []
      
      const path = []
      const bookmark = await this.extensionAPI.bookmarks.get(bookmarkId)
      let parentId = bookmark[0]?.parentId

      while (parentId) {
        const nodes = await this.extensionAPI.bookmarks.get(parentId)
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
      console.error('❌ Firefox获取书签路径失败:', error)
      return []
    }
  }

  // 通过URL检查书签是否在服务器上存在 - Firefox版本
  async checkBookmarkExistsOnServer(url) {
    try {
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
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
      console.error('❌ Firefox检查服务器书签失败:', error)
    }
    return null
  }

  // 删除服务器上的书签 - Firefox版本
  async deleteBookmarkFromServer(url) {
    try {
      console.log('🔄 Firefox开始删除服务器书签:', url)
      
      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ Firefox没有token，无法删除服务器书签')
        return false
      }

      console.log('🔍 Firefox搜索服务器上的书签...')
      const serverBookmark = await this.checkBookmarkExistsOnServer(url)
      
      if (!serverBookmark) {
        console.log('⚠️ Firefox服务器上未找到对应书签')
        return false
      }

      console.log('✅ Firefox找到服务器书签:', {
        id: serverBookmark.id,
        title: serverBookmark.title,
        url: serverBookmark.url
      })

      console.log('🗑️ Firefox删除服务器书签...')
      const response = await fetch(`${settings.serverUrl}/bookmarks/${serverBookmark.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        console.log('✅ Firefox服务器书签删除成功')
        return true
      } else {
        console.log('❌ Firefox服务器书签删除失败:', response.status, response.statusText)
        return false
      }
    } catch (error) {
      console.error('❌ Firefox删除服务器书签失败:', error)
      return false
    }
  }

  // 保存书签到服务器 - Firefox版本
  async saveBookmark(data, tab, isUpdate = false) {
    try {
      // 校验书签数据
      if (!data.url || !data.url.trim()) {
        console.log('⚠️ Firefox书签URL为空，跳过保存:', data.title)
        throw new Error('书签URL不能为空')
      }
      
      // 确保标题不为空
      if (!data.title || !data.title.trim()) {
        data.title = 'Untitled'
      }
      
      // 清理数据
      data.url = data.url.trim()
      data.title = data.title.trim()

      const settings = await this.extensionAPI.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        throw new Error('Firefox未登录')
      }

      // 检查是否已存在相同URL的书签
      console.log('🔍 Firefox检查书签是否重复:', data.url)
      const existingBookmark = await this.checkBookmarkExistsOnServer(data.url)
      
      if (existingBookmark) {
        console.log('📚 Firefox发现现有书签:', existingBookmark.title)
        
        // 检查是否需要更新（文件夹或标题不同）
        const needsUpdate = existingBookmark.folder !== data.folder || 
                           existingBookmark.title !== data.title
        
        if (needsUpdate || isUpdate) {
          console.log('🔄 Firefox更新现有书签信息...')
          console.log('📁 原文件夹:', existingBookmark.folder)
          console.log('📁 新文件夹:', data.folder)
          
          // 更新现有书签
          const response = await fetch(`${settings.serverUrl}/bookmarks/${existingBookmark.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.token}`
            },
            body: JSON.stringify(data)
          })

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.message || 'Firefox更新失败')
          }

          console.log('✅ Firefox书签更新成功:', data.title)
          this.showNotification(`书签"${data.title}"已更新！`, 'success')
        } else {
          console.log('⚠️ Firefox书签信息相同，跳过保存')
          this.showNotification(`书签"${data.title}"已存在且信息相同`, 'info')
        }
        return
      }

      console.log('✅ Firefox书签不重复，开始保存')
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
        throw new Error(error.message || 'Firefox保存失败')
      }

      console.log('✅ Firefox书签保存成功:', data.title)
      this.showNotification(`书签"${data.title}"保存成功！`, 'success')
      
    } catch (error) {
      console.error('❌ Firefox保存书签失败:', error)
      throw error
    }
  }

  async onTabUpdated(tabId, tab) {
    // 简化实现
  }

  async handleContextMenuClick(info, tab) {
    console.log('🖱️ Firefox右键菜单:', info.menuItemId)
    // 简化实现
  }

  async savePassword(data, tab) {
    console.log('🔐 Firefox保存密码')
    // 简化实现
  }

  async getPasswordsForSite(url) {
    return []
  }
}

// 初始化后台脚本
new ExtensionBackgroundFirefox()