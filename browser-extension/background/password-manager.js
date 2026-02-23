// 密码管理器 - 处理密码自动填充和检测

export class PasswordManager {
  constructor(extensionAPI, getStorageData, settings) {
    this.extensionAPI = extensionAPI
    this.getStorageData = getStorageData
    this.settings = settings
  }

  // 处理标签页更新
  async onTabUpdated(tabId, tab) {
    try {
      if (!this.settings.autoPasswordDetect) return

      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        // 延迟发送消息，等待页面加载完成
        setTimeout(() => {
          this.extensionAPI.tabs.sendMessage(tabId, {
            type: 'AUTO_DETECT_FORMS',
            settings: this.settings
          }).catch(() => {
            // 忽略错误（可能是内容脚本未加载）
          })
        }, 2000)

        // 自动填充密码
        if (this.settings.autoPasswordFill) {
          const passwords = await this.getPasswordsForSite(tab.url)
          if (passwords.length > 0) {
            setTimeout(() => {
              this.extensionAPI.tabs.sendMessage(tabId, {
                type: 'AUTO_FILL_PASSWORD',
                passwords: passwords
              }).catch(() => {
                // 忽略错误
              })
            }, 2500)
          }
        }
      }
    } catch (error) {
      console.error('Tab update error:', error)
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

  // 处理快捷键命令
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

  // 从上下文保存书签
  async saveBookmarkFromContext(tab) {
    try {
      if (!tab || !tab.url) return

      const settings = await this.getStorageData(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('⚠️ 未登录，无法保存书签')
        return
      }

      const response = await fetch(`${settings.serverUrl}/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify({
          title: tab.title || tab.url,
          url: tab.url,
          folder: '',
          tags: []
        })
      })

      if (response.ok) {
        console.log('✅ 书签已保存:', tab.title)
      } else {
        console.error('❌ 保存书签失败')
      }

    } catch (error) {
      console.error('保存书签失败:', error)
    }
  }
}
