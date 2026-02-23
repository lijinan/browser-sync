// 消息处理器 - 处理来自 popup 和 content script 的消息

export class MessageHandler {
  constructor(extensionAPI, getStorageData, settingsManager, syncEngine, bookmarkSyncManager) {
    this.extensionAPI = extensionAPI
    this.getStorageData = getStorageData
    this.settingsManager = settingsManager
    this.syncEngine = syncEngine
    this.bookmarkSyncManager = bookmarkSyncManager
  }

  // 处理消息
  async handleMessage(request, sender, sendResponse) {
    try {
      const result = await this._handleMessageInternal(request, sender)
      sendResponse(result)
    } catch (error) {
      console.error('Message handler error:', error)
      sendResponse({ success: false, error: error.message })
    }
  }

  // 内部消息处理
  async _handleMessageInternal(request, sender) {
    switch (request.type) {
      case 'GET_SETTINGS':
        return { success: true, settings: this.settingsManager.getSettings() }

      case 'SAVE_SETTINGS':
        const updated = await this.settingsManager.updateSettings(request.settings)
        return { success: updated }

      case 'TRIGGER_SYNC':
        await this.syncEngine.performFullSync()
        return { success: true }

      case 'CHECK_LOGIN_STATUS':
        const loginStatus = await this.syncEngine.checkLoginStatus()
        return { success: true, ...loginStatus }

      case 'LOGIN':
        await this.getStorageData(['token', 'serverUrl'])
        return { success: true }

      case 'LOGOUT':
        await this.extensionAPI.storage.local.remove(['token'])
        return { success: true }

      case 'GET_PASSWORDS_FOR_SITE':
        const passwords = await this.getPasswordsForSite(request.url)
        return { success: true, passwords }

      case 'SAVE_PASSWORD':
        await this.savePassword(request.passwordData)
        return { success: true }

      case 'SHOW_NOTIFICATION':
        this.showNotification(request.message, request.notificationType)
        return { success: true }

      default:
        console.log('未知消息类型:', request.type)
        return { success: false, error: '未知消息类型' }
    }
  }

  // 获取网站的密码
  async getPasswordsForSite(url) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])
      if (!settings.token) {
        return []
      }

      const urlObj = new URL(url)
      const domain = urlObj.hostname

      const response = await fetch(`${settings.serverUrl}/passwords/search?domain=${encodeURIComponent(domain)}`, {
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
      console.error('获取密码失败:', error)
      return []
    }
  }

  // 保存密码
  async savePassword(passwordData) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])
      if (!settings.token) {
        throw new Error('未登录')
      }

      const response = await fetch(`${settings.serverUrl}/passwords`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify(passwordData)
      })

      if (!response.ok) {
        throw new Error('保存密码失败')
      }

      return true
    } catch (error) {
      console.error('保存密码失败:', error)
      throw error
    }
  }

  // 显示通知
  showNotification(message, type = 'info') {
    try {
      const iconMap = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
      }

      if (this.extensionAPI.notifications) {
        this.extensionAPI.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '书签密码同步助手',
          message: `${iconMap[type] || ''} ${message}`
        })
      }
    } catch (error) {
      console.error('Show notification error:', error)
    }
  }
}
