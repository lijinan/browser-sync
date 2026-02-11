// Chrome 浏览器扩展后台脚本
// 导入公共基类
importScripts('background-common.js')

// 导入WebSocket管理器 - Service Worker版本
try {
  importScripts('websocket-manager-sw.js')
} catch (error) {
  console.error('❌ 导入WebSocket管理器失败:', error)
}

// Chrome 后台脚本类 - 继承公共基类
class ExtensionBackground extends ExtensionBackgroundBase {
  constructor() {
    // Chrome 使用 chrome API
    super(chrome)
    this.init()
    this.initWebSocketManager()
  }

  // 初始化WebSocket管理器 - Chrome 版本使用 Service Worker 版本
  initWebSocketManager() {
    try {
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

        console.log('✅ WebSocket管理器初始化成功 (Chrome)')
      } else {
        console.log('⚠️ WebSocket管理器未加载，将在设置加载后重试')
      }
    } catch (error) {
      console.error('❌ WebSocket管理器初始化失败:', error)
    }
  }
}

// 初始化后台脚本
new ExtensionBackground()
