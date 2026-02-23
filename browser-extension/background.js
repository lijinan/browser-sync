// 浏览器扩展后台脚本 - Manifest V3
// 支持 Chrome/Edge 和 Firefox

import { ExtensionBackgroundBase } from './background-core.js';
import { WebSocketManagerSW } from './websocket-manager.js';

// 后台脚本类 - 继承公共基类
class ExtensionBackground extends ExtensionBackgroundBase {
  constructor() {
    super(chrome);
    this.init();
    this.initWebSocketManager();
  }

  initWebSocketManager() {
    try {
      this.wsManager = new WebSocketManagerSW();

      this.wsManager.onConnectionChange((status) => {
        console.log('🔗 WebSocket连接状态变化:', status);
        if (status === 'connected') {
          this.showNotification('实时同步已连接', 'success');
        } else if (status === 'disconnected') {
          console.log('⚠️ 实时同步已断开');
        }
      });

      this.wsManager.onMessage('bookmark_change', (message) => {
        console.log('📚 收到书签变更通知:', message);
      });

      console.log('✅ WebSocket管理器初始化成功');
    } catch (error) {
      console.error('❌ WebSocket管理器初始化失败:', error);
    }
  }
}

// 初始化后台脚本
new ExtensionBackground();
