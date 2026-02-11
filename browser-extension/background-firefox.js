// Firefox 浏览器扩展后台脚本
// 导入公共基类
try {
  if (typeof importScripts !== 'undefined') {
    importScripts('background-common.js')
  }
} catch (error) {
  console.error('❌ 导入公共基类失败:', error)
}

// 导入WebSocket管理器 - Firefox版本
try {
  if (typeof importScripts !== 'undefined') {
    importScripts('websocket-manager.js')
  }
} catch (error) {
  console.error('❌ 导入WebSocket管理器失败:', error)
}

// Firefox 后台脚本类 - 继承公共基类
class ExtensionBackgroundFirefox extends ExtensionBackgroundBase {
  constructor() {
    // Firefox 优先使用 browser API，回退到 chrome API
    const api = typeof browser !== 'undefined' ? browser : chrome
    super(api)

    this.extensionAPI = api
    console.log('✅ Firefox扩展API已加载')

    this.init()
    this.initWebSocketManager()
  }

  // 设置存储变化监听器 - Firefox 特定实现
  setupStorageChangeListener() {
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
        setInterval(() => {
          this.loadSettings()
        }, 30000)
      }
    } catch (error) {
      console.error('❌ 设置storage.onChanged监听器失败:', error)
      setInterval(() => {
        this.loadSettings()
      }, 30000)
    }
  }

  // 初始化WebSocket管理器 - Firefox 版本
  initWebSocketManager() {
    try {
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

        console.log('✅ WebSocket管理器初始化成功 (Firefox)')
      } else {
        console.log('⚠️ WebSocket管理器未加载，将在设置加载后重试')
      }
    } catch (error) {
      console.error('❌ WebSocket管理器初始化失败:', error)
    }
  }

  // 创建右键菜单 - Firefox 特定实现（支持更多菜单项）
  createContextMenus() {
    try {
      // 清除现有菜单
      this.extensionAPI.contextMenus.removeAll(() => {
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
      })
    } catch (error) {
      console.error('❌ 创建右键菜单失败:', error)
    }
  }

  // 设置默认设置 - Firefox 版本包含额外的默认设置
  async setDefaultSettings() {
    try {
      const defaultSettings = {
        workMode: 'cooperative',
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
        debugMode: false,
        backupReminder: true,
        usageStats: false
      }

      const existing = await this.getStorageData([])

      // 只设置不存在的默认值
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
}

// 初始化后台脚本
new ExtensionBackgroundFirefox()
