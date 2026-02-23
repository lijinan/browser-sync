// 浏览器扩展后台脚本公共基类 - ES Module 版本
// 提取 Chrome 和 Firefox 版本的公共逻辑

import { BookmarkSyncManager } from './background/bookmark-sync-manager.js'
import { SyncEngine } from './background/sync-engine.js'
import { SettingsManager } from './background/settings-manager.js'
import { ContextMenuManager } from './background/context-menu-manager.js'
import { MessageHandler } from './background/message-handler.js'
import { PasswordManager } from './background/password-manager.js'

export class ExtensionBackgroundBase {
  constructor(extensionAPI) {
    this.extensionAPI = extensionAPI
    this.settings = {}
    this.wsManager = null

    // 初始化各个管理器
    this.settingsManager = new SettingsManager(
      extensionAPI,
      this.getStorageData.bind(this),
      this.setStorageData.bind(this)
    )

    this.syncEngine = new SyncEngine(
      extensionAPI,
      this.getStorageData.bind(this),
      this.setStorageData.bind(this),
      this.settings
    )

    this.bookmarkSyncManager = new BookmarkSyncManager(
      extensionAPI,
      this.getStorageData.bind(this),
      this.settings
    )

    this.contextMenuManager = new ContextMenuManager(
      extensionAPI,
      this.getStorageData.bind(this)
    )

    this.passwordManager = new PasswordManager(
      extensionAPI,
      this.getStorageData.bind(this),
      this.settings
    )

    this.messageHandler = new MessageHandler(
      extensionAPI,
      this.getStorageData.bind(this),
      this.settingsManager,
      this.syncEngine,
      this.bookmarkSyncManager
    )
  }

  init() {
    // 浏览器启动事件
    if (this.extensionAPI.runtime.onStartup) {
      this.extensionAPI.runtime.onStartup.addListener(() => {
        console.log('🚀 浏览器启动事件触发')
        this.handleBrowserStartup()
      })
    }

    // 扩展安装/更新事件
    this.extensionAPI.runtime.onInstalled.addListener(() => {
      this.contextMenuManager.createContextMenus()
      this.settingsManager.setDefaultSettings()
      this.settingsManager.loadSettings().then(settings => {
        this.settings = settings
      })
    })

    // 消息处理
    this.extensionAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.messageHandler.handleMessage(request, sender, sendResponse)
      return true
    })

    // 标签页更新
    this.extensionAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.passwordManager.onTabUpdated(tabId, tab)
      }
    })

    // 书签事件监听
    if (this.extensionAPI.bookmarks) {
      this.extensionAPI.bookmarks.onCreated.addListener((id, bookmark) => {
        this.bookmarkSyncManager.onBookmarkCreated(id, bookmark)
      })

      this.extensionAPI.bookmarks.onRemoved.addListener((id, removeInfo) => {
        this.bookmarkSyncManager.onBookmarkRemoved(id, removeInfo)
      })

      this.extensionAPI.bookmarks.onMoved.addListener((id, moveInfo) => {
        this.bookmarkSyncManager.onBookmarkMoved(id, moveInfo)
      })

      this.extensionAPI.bookmarks.onChanged.addListener((id, changeInfo) => {
        this.bookmarkSyncManager.onBookmarkChanged(id, changeInfo)
      })
    }

    // 快捷键命令
    if (this.extensionAPI.commands) {
      this.extensionAPI.commands.onCommand.addListener((command) => {
        this.passwordManager.onCommand(command)
      })
    }

    // 加载设置
    this.settingsManager.loadSettings().then(settings => {
      this.settings = settings
      this.syncEngine.settings = settings
      this.bookmarkSyncManager.settings = settings
      this.passwordManager.settings = settings
    })

    // 设置变更监听
    this.settingsManager.setupStorageChangeListener((key, value) => {
      this.settings[key] = value
      this.syncEngine.settings = this.settings
      this.bookmarkSyncManager.settings = this.settings
      this.passwordManager.settings = this.settings
    })

    // 初始化 WebSocket
    this.initWebSocketManager()

    // 设置存储变更监听（用于同步状态）
    this.setupStorageChangeListener()
  }

  // 初始化 WebSocket 管理器
  initWebSocketManager() {
    // WebSocket 管理器在 websocket-manager.js 中定义
    // 这里只是占位，实际由子类实现
  }

  // 处理浏览器启动
  async handleBrowserStartup() {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl', 'syncOnStartup'])

      if (!settings.token) {
        console.log('⚠️ 未登录，跳过启动同步')
        return
      }

      if (!settings.syncOnStartup) {
        console.log('⏭️ 未启用启动时同步')
        return
      }

      // 检查是否正在导入
      const { isImporting } = await this.getStorageData(['isImporting'])
      if (isImporting) {
        console.log('🚫 正在导入中，跳过启动同步')
        return
      }

      console.log('🔄 浏览器启动，执行全量同步')
      await this.syncEngine.performFullSync()

    } catch (error) {
      console.error('❌ 浏览器启动处理失败:', error)
    }
  }

  // 设置存储变更监听
  setupStorageChangeListener() {
    if (this.extensionAPI.storage && this.extensionAPI.storage.onChanged) {
      this.extensionAPI.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
          // 处理同步存储变更
          for (const key in changes) {
            console.log(`同步存储变更: ${key}`)
          }
        }
      })
    }
  }

  // 获取存储数据
  async getStorageData(keys) {
    try {
      if (this.extensionAPI.storage && this.extensionAPI.storage.local) {
        const result = await this.extensionAPI.storage.local.get(keys)
        return result
      }
      return {}
    } catch (error) {
      console.error('获取存储数据失败:', error)
      return {}
    }
  }

  // 设置存储数据
  async setStorageData(data) {
    try {
      if (this.extensionAPI.storage && this.extensionAPI.storage.local) {
        await this.extensionAPI.storage.local.set(data)
      }
    } catch (error) {
      console.error('设置存储数据失败:', error)
    }
  }

  // 启动 WebSocket 连接
  async startWebSocketConnection() {
    // 由子类实现
    console.log('🌐 启动 WebSocket 连接（由子类实现）')
  }

  // 执行初始全量同步
  async performInitialFullSync() {
    await this.syncEngine.performInitialFullSync()
  }

  // 执行全量同步
  async performFullSync() {
    await this.syncEngine.performFullSync()
  }

  // 检查登录状态
  async checkLoginStatus() {
    return await this.syncEngine.checkLoginStatus()
  }

  // 显示通知
  showNotification(message, type = 'info') {
    this.messageHandler.showNotification(message, type)
  }
}
