// 上下文菜单管理器 - 处理右键菜单

export class ContextMenuManager {
  constructor(extensionAPI, getStorageData) {
    this.extensionAPI = extensionAPI
    this.getStorageData = getStorageData
  }

  // 创建上下文菜单
  createContextMenus() {
    try {
      // 先移除所有现有菜单
      this.extensionAPI.contextMenus.removeAll(() => {
        // 添加当前页面到同步收藏夹
        this.extensionAPI.contextMenus.create({
          id: 'add-to-sync',
          title: '添加当前页面到同步收藏夹',
          contexts: ['page', 'link'],
          documentUrlPatterns: ['http://*/*', 'https://*/*']
        })

        // 保存选中的链接
        this.extensionAPI.contextMenus.create({
          id: 'save-link',
          title: '保存链接到同步收藏夹',
          contexts: ['link'],
          documentUrlPatterns: ['http://*/*', 'https://*/*']
        })

        // 分隔线
        this.extensionAPI.contextMenus.create({
          id: 'separator-1',
          type: 'separator',
          contexts: ['page', 'link']
        })

        // 快速同步
        this.extensionAPI.contextMenus.create({
          id: 'quick-sync',
          title: '立即同步书签',
          contexts: ['page', 'link']
        })

        console.log('✅ 上下文菜单已创建')
      })

      // 监听菜单点击
      this.extensionAPI.contextMenus.onClicked.addListener((info, tab) => {
        this.handleContextMenuClick(info, tab)
      })

    } catch (error) {
      console.error('创建上下文菜单失败:', error)
    }
  }

  // 处理上下文菜单点击
  async handleContextMenuClick(info, tab) {
    try {
      switch (info.menuItemId) {
        case 'add-to-sync':
          await this.saveBookmarkFromContext(tab)
          break

        case 'save-link':
          if (info.linkUrl) {
            await this.saveLinkToSync(info.linkUrl, info.linkText || info.linkUrl)
          }
          break

        case 'quick-sync':
          // 触发同步事件
          this.extensionAPI.runtime.sendMessage({ type: 'TRIGGER_SYNC' })
          break
      }
    } catch (error) {
      console.error('Context menu error:', error)
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

  // 保存链接到同步收藏夹
  async saveLinkToSync(url, title) {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('⚠️ 未登录，无法保存链接')
        return
      }

      const response = await fetch(`${settings.serverUrl}/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify({
          title: title || url,
          url: url,
          folder: '',
          tags: []
        })
      })

      if (response.ok) {
        console.log('✅ 链接已保存:', title)
      } else {
        console.error('❌ 保存链接失败')
      }

    } catch (error) {
      console.error('保存链接失败:', error)
    }
  }
}
