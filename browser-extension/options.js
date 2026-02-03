// 扩展设置页面逻辑
class ExtensionOptions {
  constructor() {
    this.defaultSettings = {
      // 服务器设置
      serverUrl: 'http://localhost:3001',
      apiTimeout: 10,

      // 书签设置
      syncOnStartup: false,  // 浏览器启动时自动同步

      // 密码设置
      autoPasswordDetect: true,
      interceptPasswordSave: false,
      autoPasswordFill: false,
      confirmPasswordSave: true,

      // 高级设置
      debugMode: false
    }

    this.init()
  }

  async init() {
    await this.loadSettings()
    this.bindEvents()
  }

  async loadSettings() {
    try {
      const result = await extensionAPI.storage.sync.get(this.defaultSettings)
      
      // 设置服务器配置
      document.getElementById('serverUrl').value = result.serverUrl
      document.getElementById('apiTimeout').value = result.apiTimeout

      // 设置开关状态
      this.setToggleState('syncOnStartup', result.syncOnStartup)
      this.setToggleState('autoPasswordDetect', result.autoPasswordDetect)
      this.setToggleState('interceptPasswordSave', result.interceptPasswordSave)
      this.setToggleState('autoPasswordFill', result.autoPasswordFill)
      this.setToggleState('confirmPasswordSave', result.confirmPasswordSave)
      this.setToggleState('debugMode', result.debugMode)
      
    } catch (error) {
      console.error('加载设置失败:', error)
      this.showMessage('加载设置失败', 'error')
    }
  }

  bindEvents() {
    // 开关切换
    document.querySelectorAll('.toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active')
      })
    })
    
    // 保存设置
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.saveSettings()
    })
    
    // 重置设置
    document.getElementById('resetSettings').addEventListener('click', () => {
      this.resetSettings()
    })
  }

  setToggleState(id, active) {
    const toggle = document.getElementById(id)
    if (toggle) {
      if (active) {
        toggle.classList.add('active')
      } else {
        toggle.classList.remove('active')
      }
    }
  }

  getToggleState(id) {
    const toggle = document.getElementById(id)
    return toggle ? toggle.classList.contains('active') : false
  }

  async saveSettings() {
    try {
      const settings = {
        // 服务器设置
        serverUrl: document.getElementById('serverUrl').value,
        apiTimeout: parseInt(document.getElementById('apiTimeout').value),

        // 书签设置
        syncOnStartup: this.getToggleState('syncOnStartup'),

        // 密码设置
        autoPasswordDetect: this.getToggleState('autoPasswordDetect'),
        interceptPasswordSave: this.getToggleState('interceptPasswordSave'),
        autoPasswordFill: this.getToggleState('autoPasswordFill'),
        confirmPasswordSave: this.getToggleState('confirmPasswordSave'),

        // 高级设置
        debugMode: this.getToggleState('debugMode')
      }
      
      await extensionAPI.storage.sync.set(settings)
      
      // 通知后台脚本设置已更新
      extensionAPI.runtime.sendMessage({
        type: 'SETTINGS_UPDATED',
        settings: settings
      }).catch(() => {
        // 忽略错误，后台脚本可能未准备好
      })
      
      this.showMessage('设置保存成功！', 'success')
      
    } catch (error) {
      console.error('保存设置失败:', error)
      this.showMessage('保存设置失败', 'error')
    }
  }

  async resetSettings() {
    if (confirm('确定要重置所有设置为默认值吗？')) {
      try {
        await extensionAPI.storage.sync.set(this.defaultSettings)
        await this.loadSettings()
        this.showMessage('设置已重置为默认值', 'success')
      } catch (error) {
        console.error('重置设置失败:', error)
        this.showMessage('重置设置失败', 'error')
      }
    }
  }

  showMessage(text, type = 'success') {
    const messageEl = document.getElementById('statusMessage')
    messageEl.textContent = text
    messageEl.className = `status-message status-${type}`
    messageEl.style.display = 'block'
    
    // 3秒后自动隐藏
    setTimeout(() => {
      messageEl.style.display = 'none'
    }, 3000)
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  new ExtensionOptions()
})
