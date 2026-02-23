// 设置管理器 - 处理扩展设置

export class SettingsManager {
  constructor(extensionAPI, getStorageData, setStorageData) {
    this.extensionAPI = extensionAPI
    this.getStorageData = getStorageData
    this.setStorageData = setStorageData
    this.settings = {}
  }

  // 加载设置
  async loadSettings() {
    try {
      const keys = [
        'serverUrl',
        'autoSync',
        'syncOnStartup',
        'autoPasswordFill',
        'autoPasswordDetect',
        'debugMode'
      ]

      const stored = await this.getStorageData(keys)

      this.settings = {
        serverUrl: stored.serverUrl || 'http://localhost:3001',
        autoSync: stored.autoSync !== false,
        syncOnStartup: stored.syncOnStartup !== false,
        autoPasswordFill: stored.autoPasswordFill !== false,
        autoPasswordDetect: stored.autoPasswordDetect !== false,
        debugMode: stored.debugMode === true
      }

      if (this.settings.debugMode) {
        console.log('🔧 设置已加载:', this.settings)
      }

      return this.settings

    } catch (error) {
      console.error('加载设置失败:', error)
      // 返回默认设置
      this.settings = {
        serverUrl: 'http://localhost:3001',
        autoSync: true,
        syncOnStartup: true,
        autoPasswordFill: true,
        autoPasswordDetect: true,
        debugMode: false
      }
      return this.settings
    }
  }

  // 获取设置
  getSettings() {
    return this.settings
  }

  // 更新设置
  async updateSettings(newSettings) {
    try {
      this.settings = { ...this.settings, ...newSettings }
      await this.setStorageData(newSettings)

      if (this.settings.debugMode) {
        console.log('🔧 设置已更新:', this.settings)
      }

      return true
    } catch (error) {
      console.error('更新设置失败:', error)
      return false
    }
  }

  // 设置默认值
  async setDefaultSettings() {
    try {
      const { settingsInitialized } = await this.getStorageData(['settingsInitialized'])

      if (!settingsInitialized) {
        const defaultSettings = {
          serverUrl: 'http://localhost:3001',
          autoSync: true,
          syncOnStartup: true,
          autoPasswordFill: true,
          autoPasswordDetect: true,
          debugMode: false,
          settingsInitialized: true
        }

        await this.setStorageData(defaultSettings)
        console.log('✅ 默认设置已初始化')
      }
    } catch (error) {
      console.error('设置默认值失败:', error)
    }
  }

  // 设置存储变更监听
  setupStorageChangeListener(callback) {
    if (this.extensionAPI.storage && this.extensionAPI.storage.onChanged) {
      this.extensionAPI.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' || namespace === 'local') {
          for (const key in changes) {
            if (this.settings.hasOwnProperty(key)) {
              this.settings[key] = changes[key].newValue
              console.log(`设置已变更: ${key} =`, changes[key].newValue)

              if (callback) {
                callback(key, changes[key].newValue)
              }
            }
          }
        }
      })
    }
  }
}
