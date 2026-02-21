// 浏览器扩展后台脚本公共基类 - ES Module 版本
// 提取 Chrome 和 Firefox 版本的公共逻辑

export class ExtensionBackgroundBase {
  constructor(extensionAPI) {
    this.extensionAPI = extensionAPI
    this.settings = {}
    this.wsManager = null
  }

  init() {
    if (this.extensionAPI.runtime.onStartup) {
      this.extensionAPI.runtime.onStartup.addListener(() => {
        console.log('🚀 浏览器启动事件触发')
        this.handleBrowserStartup()
      })
    }

    this.extensionAPI.runtime.onInstalled.addListener(() => {
      this.createContextMenus()
      this.setDefaultSettings()
      this.loadSettings()
    })

    this.extensionAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse)
      return true
    })

    this.extensionAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.onTabUpdated(tabId, tab)
      }
    })

    if (this.extensionAPI.bookmarks) {
      this.extensionAPI.bookmarks.onCreated.addListener((id, bookmark) => {
        this.onBookmarkCreated(id, bookmark)
      })

      this.extensionAPI.bookmarks.onRemoved.addListener((id, removeInfo) => {
        this.onBookmarkRemoved(id, removeInfo)
      })

      this.extensionAPI.bookmarks.onMoved.addListener((id, moveInfo) => {
        this.onBookmarkMoved(id, moveInfo)
      })

      this.extensionAPI.bookmarks.onChanged.addListener((id, changeInfo) => {
        this.onBookmarkChanged(id, changeInfo)
      })
    }

    if (this.extensionAPI.commands) {
      this.extensionAPI.commands.onCommand.addListener((command) => {
        this.onCommand(command)
      })
    }

    this.setupStorageChangeListener()
    this.loadSettings()
  }

  setupStorageChangeListener() {
    try {
      if (this.extensionAPI.storage && this.extensionAPI.storage.onChanged) {
        this.extensionAPI.storage.onChanged.addListener((_, namespace) => {
          if (namespace === 'sync') {
            this.loadSettings()
          }
        })
      }
    } catch (error) {
      console.error('❌ 设置storage.onChanged监听器失败:', error)
    }
  }

  initWebSocketManager() {
    throw new Error('initWebSocketManager must be implemented by subclass')
  }

  async handleBrowserStartup() {
    try {
      console.log('🔄 处理浏览器启动...')
      const settings = await this.getStorageData(['syncOnStartup', 'token'])

      if (!settings.token) {
        console.log('⚠️ 未登录，跳过启动时同步')
        return
      }

      if (!settings.syncOnStartup) {
        console.log('⚠️ 启动时同步已关闭')
        return
      }

      const { isImporting } = await this.getStorageData(['isImporting'])
      if (isImporting) {
        console.log('🚫 正在导入数据，跳过启动时同步')
        return
      }

      console.log('✅ 启动时自动同步已触发')

      setTimeout(async () => {
        await this.startWebSocketConnection()
        setTimeout(() => {
          this.performFullSync()
        }, 3000)
      }, 2000)

    } catch (error) {
      console.error('❌ 处理浏览器启动失败:', error)
    }
  }

  async startWebSocketConnection() {
    try {
      if (!this.wsManager) {
        console.log('⚠️ WebSocket管理器未初始化')
        return
      }

      const settings = await this.getStorageData(['token', 'serverUrl'])
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

  async getStorageData(keys) {
    return await this.extensionAPI.storage.sync.get(keys)
  }

  async setStorageData(data) {
    return await this.extensionAPI.storage.sync.set(data)
  }

  async performFullSync() {
    try {
      console.log('🔄 开始执行全量同步...')

      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        this.showNotification('书签API不可用，无法执行同步', 'error')
        return
      }

      const settings = await this.getStorageData(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('❌ 未登录，无法执行全量同步')
        return
      }

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

      const syncFolder = await this.ensureSyncFolder()
      if (!syncFolder) {
        console.error('❌ 无法创建或找到同步收藏夹')
        return
      }

      console.log('✅ 同步收藏夹已准备好:', syncFolder.id)

      const localBookmarks = await this.getAllLocalSyncBookmarks(syncFolder.id)
      console.log(`📖 本地同步收藏夹中有 ${localBookmarks.length} 个书签`)

      const localBookmarkMap = new Map()
      localBookmarks.forEach(bookmark => {
        if (bookmark.url) {
          localBookmarkMap.set(bookmark.url, bookmark)
        }
      })

      let syncedCount = 0
      let skippedCount = 0

      for (const serverBookmark of serverBookmarks) {
        try {
          if (!serverBookmark || !serverBookmark.url || !serverBookmark.url.trim()) {
            console.error('❌ 书签数据无效，跳过同步:', serverBookmark)
            continue
          }

          if (!serverBookmark.title || !serverBookmark.title.trim()) {
            console.error('❌ 书签标题为空，跳过同步:', serverBookmark.url)
            continue
          }

          const localBookmark = localBookmarkMap.get(serverBookmark.url)

          if (localBookmark) {
            const needsUpdate = localBookmark.title !== serverBookmark.title

            if (needsUpdate) {
              await this.extensionAPI.bookmarks.update(localBookmark.id, {
                title: serverBookmark.title
              })
              console.log(`✏️ 更新书签: ${serverBookmark.title}`)
              syncedCount++
            } else {
              skippedCount++
            }
          } else {
            const targetFolderId = await this.ensureFolderPathForSync(syncFolder.id, serverBookmark.folder)

            await this.extensionAPI.bookmarks.create({
              title: serverBookmark.title,
              url: serverBookmark.url,
              parentId: targetFolderId
            })

            console.log(`➕ 创建书签: ${serverBookmark.title} -> ${serverBookmark.folder}`)
            syncedCount++
          }

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

  async ensureSyncFolder() {
    try {
      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        return null
      }

      const syncFolders = await this.extensionAPI.bookmarks.search({ title: '同步收藏夹' })

      if (syncFolders.length > 0) {
        return syncFolders[0]
      }

      console.log('📁 创建同步收藏夹...')
      const syncFolder = await this.extensionAPI.bookmarks.create({
        title: '同步收藏夹'
      })

      return syncFolder
    } catch (error) {
      console.error('❌ 确保同步收藏夹失败:', error)
      return null
    }
  }

  async getAllLocalSyncBookmarks(syncFolderId) {
    try {
      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        return []
      }

      const allBookmarks = []

      const getBookmarksRecursive = async (folderId) => {
        const children = await this.extensionAPI.bookmarks.getChildren(folderId)

        for (const child of children) {
          if (child.url) {
            allBookmarks.push(child)
          } else {
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

  async ensureFolderPathForSync(syncFolderId, folderPath) {
    try {
      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        return syncFolderId
      }

      if (!folderPath || folderPath === '同步收藏夹') {
        return syncFolderId
      }

      let normalizedPath = folderPath
      while (normalizedPath.startsWith('同步收藏夹 > 同步收藏夹')) {
        normalizedPath = normalizedPath.replace('同步收藏夹 > 同步收藏夹', '同步收藏夹')
      }

      const pathParts = normalizedPath.split(' > ').slice(1)

      let currentFolderId = syncFolderId

      for (const folderName of pathParts) {
        if (!folderName || !folderName.trim()) continue

        const children = await this.extensionAPI.bookmarks.getChildren(currentFolderId)
        let targetFolder = children.find(child => !child.url && child.title === folderName)

        if (targetFolder) {
          currentFolderId = targetFolder.id
        } else {
          const newFolder = await this.extensionAPI.bookmarks.create({
            title: folderName,
            parentId: currentFolderId
          })
          currentFolderId = newFolder.id
        }
      }

      return currentFolderId
    } catch (error) {
      console.error('❌ 创建文件夹路径失败:', error)
      return syncFolderId
    }
  }

  async loadSettings() {
    try {
      const defaultSettings = {
        serverUrl: 'http://localhost:3001',
        syncOnStartup: false,
        autoPasswordDetect: true,
        interceptPasswordSave: false,
        autoPasswordFill: false,
        confirmPasswordSave: true,
        confirmBookmarkSave: true,
        autoBookmarkCategory: false,
        debugMode: false
      }

      const result = await this.getStorageData(defaultSettings)
      this.settings = result

      if (this.settings.debugMode) {
        console.log('Settings loaded:', this.settings)
      }

      if (!this.wsManager) {
        this.initWebSocketManager()
      }

      const loginStatus = await this.checkLoginStatus()
      if (loginStatus.loggedIn) {
        console.log('✅ 用户已登录，启动WebSocket连接')
        this.startWebSocketConnection()

        const { isImporting } = await this.getStorageData(['isImporting'])
        if (isImporting) {
          console.log('🚫 检测到正在导入数据，跳过自动全量同步')
        } else {
          console.log('🔄 开始执行全量同步...')
          setTimeout(() => {
            this.performFullSync()
          }, 3000)
        }
      } else {
        console.log('⚠️ 用户未登录，跳过WebSocket连接和全量同步')
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  createContextMenus() {
    try {
      this.extensionAPI.contextMenus.removeAll(() => {
        this.extensionAPI.contextMenus.create({
          id: 'saveBookmark',
          title: '保存为书签',
          contexts: ['page']
        })

        this.extensionAPI.contextMenus.create({
          id: 'openDashboard',
          title: '打开管理面板',
          contexts: ['page']
        })

        this.extensionAPI.contextMenus.create({
          id: 'openSettings',
          title: '扩展设置',
          contexts: ['page']
        })

        this.extensionAPI.contextMenus.onClicked.addListener((info, tab) => {
          this.handleContextMenuClick(info, tab)
        })
      })
    } catch (error) {
      console.error('❌ 创建右键菜单失败:', error)
    }
  }

  async setDefaultSettings() {
    try {
      const defaultSettings = {
        serverUrl: 'http://localhost:3001',
        apiTimeout: 10,
        syncOnStartup: false,
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

      const existing = await this.getStorageData([])

      const toSet = {}
      for (const [key, value] of Object.entries(defaultSettings)) {
        if (!(key in existing)) {
          toSet[key] = value
        }
      }

      if (Object.keys(toSet).length > 0) {
        await this.setStorageData(toSet)
      }
    } catch (error) {
      console.error('❌ 设置默认配置失败:', error)
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      const result = await this._handleMessageInternal(request, sender)
      sendResponse(result)
    } catch (error) {
      console.error('Background script error:', error)
      sendResponse({ error: error.message })
    }
  }

  async _handleMessageInternal(request, sender) {
    switch (request.type) {
      case 'SAVE_PASSWORD_TO_SERVER':
        return await this.savePasswordToServer(request.data)

      case 'CHECK_EXISTING_PASSWORD':
        const exists = await this.checkExistingPassword(request.data.siteUrl, request.data.username)
        return { exists }

      case 'GET_PASSWORDS_FOR_SITE':
        const siteUrl = request.data?.siteUrl || request.url
        const passwords = await this.getPasswordsForSite(siteUrl)
        return { passwords }

      case 'GET_PASSWORD_DETAIL':
        const passwordDetail = await this.getPasswordDetail(request.data.passwordId)
        return { password: passwordDetail }

      case 'SAVE_BOOKMARK':
        await this.saveBookmark(request.data, sender.tab)
        return { success: true }

      case 'SAVE_PASSWORD':
        await this.savePassword(request.data, sender.tab)
        return { success: true }

      case 'GET_SETTINGS':
        return this.settings

      case 'SETTINGS_UPDATED':
        await this.loadSettings()
        return { success: true }

      case 'CHECK_LOGIN_STATUS':
        return await this.checkLoginStatus()

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

      case 'TEST_NOTIFICATION':
        this.showNotification(request.message || '测试通知', 'info')
        return { success: true }

      case 'FULL_SYNC':
        await this.performFullSync()
        return { success: true }

      default:
        return { error: 'Unknown message type' }
    }
  }

  async handleContextMenuClick(info, tab) {
    try {
      switch (info.menuItemId) {
        case 'saveBookmark':
          await this.saveBookmarkFromContext(tab)
          break

        case 'openDashboard':
          this.extensionAPI.tabs.create({ url: `${this.settings.serverUrl.replace(':3001', ':3002')}` })
          break

        case 'openSettings':
          this.extensionAPI.runtime.openOptionsPage()
          break
      }
    } catch (error) {
      console.error('Context menu error:', error)
    }
  }

  async onTabUpdated(tabId, tab) {
    try {
      if (!this.settings.autoPasswordDetect) return

      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        setTimeout(() => {
          this.extensionAPI.tabs.sendMessage(tabId, {
            type: 'AUTO_DETECT_FORMS',
            settings: this.settings
          }).catch(() => {})
        }, 2000)

        if (this.settings.autoPasswordFill) {
          const passwords = await this.getPasswordsForSite(tab.url)
          if (passwords.length > 0) {
            this.extensionAPI.tabs.sendMessage(tabId, {
              type: 'AUTO_FILL_PASSWORD',
              passwords: passwords
            }).catch(() => {})
          }
        }
      }
    } catch (error) {
      console.error('Tab update error:', error)
    }
  }

  async onBookmarkCreated(id, bookmark) {
    try {
      const { isImporting, isExporting } = await this.getStorageData(['isImporting', 'isExporting'])
      if (isImporting || isExporting) {
        console.log('🚫 正在导入/导出，跳过书签创建同步')
        return
      }

      if (this.settings.debugMode) {
        console.log('书签创建事件:', { id, bookmark })
      }

      if (!bookmark.url) {
        console.log('📁 检测到文件夹创建，跳过同步:', bookmark.title)
        return
      }

      const isInSyncFolder = await this.checkBookmarkInSyncFolder(id)
      if (!isInSyncFolder) {
        if (this.settings.debugMode) {
          console.log('书签不在同步收藏夹中，跳过同步')
        }
        return
      }

      console.log('📚 同步收藏夹中的书签创建:', bookmark.title)

      const settings = await this.getStorageData(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('⚠️ 未登录，跳过书签同步')
        return
      }

      const folderPath = await this.getBookmarkFolderPath(bookmark)

      const response = await fetch(`${settings.serverUrl}/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify({
          title: bookmark.title,
          url: bookmark.url,
          folder: folderPath,
          tags: []
        })
      })

      if (response.ok) {
        console.log('✅ 书签已同步到服务器:', bookmark.title)
        this.showNotification(`书签"${bookmark.title}"已同步`, 'success')
      } else {
        const error = await response.json()
        console.error('❌ 同步书签到服务器失败:', error)
      }

    } catch (error) {
      console.error('❌ 书签创建同步失败:', error)
    }
  }

  async onBookmarkRemoved(id, removeInfo) {
    try {
      const { isImporting, isExporting } = await this.getStorageData(['isImporting', 'isExporting'])
      if (isImporting || isExporting) {
        return
      }

      console.log('🗑️ 书签删除事件:', id)
    } catch (error) {
      console.error('❌ 书签删除同步失败:', error)
    }
  }

  async onBookmarkMoved(id, moveInfo) {
    try {
      const { isImporting, isExporting } = await this.getStorageData(['isImporting', 'isExporting'])
      if (isImporting || isExporting) {
        return
      }

      console.log('📦 书签移动事件:', id)
    } catch (error) {
      console.error('❌ 书签移动同步失败:', error)
    }
  }

  async onBookmarkChanged(id, changeInfo) {
    try {
      const { isImporting, isExporting } = await this.getStorageData(['isImporting', 'isExporting'])
      if (isImporting || isExporting) {
        return
      }

      console.log('✏️ 书签更新事件:', id, changeInfo)
    } catch (error) {
      console.error('❌ 书签更新同步失败:', error)
    }
  }

  async onCommand(command) {
    try {
      console.log('⌨️ 快捷键命令:', command)

      switch (command) {
        case 'save-bookmark':
          const [tab] = await this.extensionAPI.tabs.query({ active: true, currentWindow: true })
          if (tab) {
            await this.saveBookmarkFromContext(tab)
          }
          break

        case 'open-settings':
          this.extensionAPI.runtime.openOptionsPage()
          break
      }
    } catch (error) {
      console.error('Command error:', error)
    }
  }

  async checkBookmarkInSyncFolder(bookmarkId) {
    try {
      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        return false
      }

      const bookmark = await this.extensionAPI.bookmarks.get(bookmarkId)
      if (!bookmark || bookmark.length === 0) return false

      let current = bookmark[0]

      while (current.parentId) {
        if (current.title === '同步收藏夹') {
          return true
        }

        const parent = await this.extensionAPI.bookmarks.get(current.parentId)
        if (!parent || parent.length === 0) break

        current = parent[0]
      }

      return false
    } catch (error) {
      console.error('❌ 检查书签是否在同步收藏夹失败:', error)
      return false
    }
  }

  async getBookmarkFolderPath(bookmark) {
    try {
      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        return ''
      }

      const path = []
      let current = bookmark

      while (current.parentId) {
        const parent = await this.extensionAPI.bookmarks.get(current.parentId)
        if (!parent || parent.length === 0) break

        current = parent[0]
        if (current.title && current.title !== '') {
          path.unshift(current.title)
        }
      }

      return path.join(' > ')
    } catch (error) {
      console.error('❌ 获取书签文件夹路径失败:', error)
      return ''
    }
  }

  async checkLoginStatus() {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])

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
      console.error('Check login status error:', error)
      return { loggedIn: false }
    }
  }

  async savePasswordToServer(data) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])

      if (!settings.token) {
        return { error: '未登录' }
      }

      const response = await fetch(`${settings.serverUrl}/passwords`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify(data)
      })

      if (response.ok) {
        return { success: true }
      } else {
        const error = await response.json()
        return { error: error.message || '保存失败' }
      }
    } catch (error) {
      console.error('Save password error:', error)
      return { error: error.message }
    }
  }

  async checkExistingPassword(siteUrl, username) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])

      if (!settings.token) {
        return false
      }

      const response = await fetch(`${settings.serverUrl}/passwords/check?siteUrl=${encodeURIComponent(siteUrl)}&username=${encodeURIComponent(username)}`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        return data.exists
      }

      return false
    } catch (error) {
      console.error('Check existing password error:', error)
      return false
    }
  }

  async getPasswordsForSite(siteUrl) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])

      if (!settings.token) {
        return []
      }

      const url = new URL(siteUrl)
      const response = await fetch(`${settings.serverUrl}/passwords/site?domain=${encodeURIComponent(url.hostname)}`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        return data.passwords || []
      }

      return []
    } catch (error) {
      console.error('Get passwords for site error:', error)
      return []
    }
  }

  async getPasswordDetail(passwordId) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])

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

      return null
    } catch (error) {
      console.error('Get password detail error:', error)
      return null
    }
  }

  async saveBookmark(data, tab) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])

      if (!settings.token) {
        this.showNotification('请先登录', 'error')
        return
      }

      const response = await fetch(`${settings.serverUrl}/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify({
          title: data.title || tab?.title,
          url: data.url || tab?.url,
          folder: data.folder || '默认',
          tags: data.tags || []
        })
      })

      if (response.ok) {
        this.showNotification('书签保存成功！', 'success')
      } else {
        const error = await response.json()
        this.showNotification('保存失败: ' + (error.message || '未知错误'), 'error')
      }
    } catch (error) {
      console.error('Save bookmark error:', error)
      this.showNotification('保存失败: ' + error.message, 'error')
    }
  }

  async savePassword(data, tab) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])

      if (!settings.token) {
        this.showNotification('请先登录', 'error')
        return
      }

      const response = await fetch(`${settings.serverUrl}/passwords`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify({
          site_name: data.site_name,
          site_url: data.site_url,
          username: data.username,
          password: data.password,
          category: data.category || '默认'
        })
      })

      if (response.ok) {
        this.showNotification('密码保存成功！', 'success')
      } else {
        const error = await response.json()
        this.showNotification('保存失败: ' + (error.message || '未知错误'), 'error')
      }
    } catch (error) {
      console.error('Save password error:', error)
      this.showNotification('保存失败: ' + error.message, 'error')
    }
  }

  async saveBookmarkFromContext(tab) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])

      if (!settings.token) {
        this.showNotification('请先登录', 'error')
        return
      }

      const response = await fetch(`${settings.serverUrl}/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify({
          title: tab.title,
          url: tab.url,
          folder: '右键保存',
          tags: ['右键菜单']
        })
      })

      if (response.ok) {
        this.showNotification(`书签"${tab.title}"已保存`, 'success')
      } else {
        const error = await response.json()
        this.showNotification('保存失败: ' + (error.message || '未知错误'), 'error')
      }
    } catch (error) {
      console.error('Save bookmark from context error:', error)
      this.showNotification('保存失败: ' + error.message, 'error')
    }
  }

  showNotification(message, type = 'info') {
    try {
      const iconMap = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
      }

      this.extensionAPI.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '书签密码同步助手',
        message: `${iconMap[type] || ''} ${message}`
      })
    } catch (error) {
      console.error('Show notification error:', error)
    }
  }
}
