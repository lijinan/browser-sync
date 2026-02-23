// 书签同步管理器 - 处理书签的创建、移动、删除和ID映射

export class BookmarkSyncManager {
  constructor(extensionAPI, getStorageData, settings) {
    this.extensionAPI = extensionAPI
    this.getStorageData = getStorageData
    this.settings = settings
  }

  // 保存书签ID映射
  async saveBookmarkIdMapping(localId, serverId) {
    try {
      const { bookmarkIdMap = {} } = await this.getStorageData(['bookmarkIdMap'])
      bookmarkIdMap[localId] = serverId
      await this.extensionAPI.storage.local.set({ bookmarkIdMap })
    } catch (error) {
      console.error('❌ 保存书签ID映射失败:', error)
    }
  }

  // 获取服务器书签ID
  async getServerBookmarkId(localId) {
    try {
      const { bookmarkIdMap = {} } = await this.getStorageData(['bookmarkIdMap'])
      return bookmarkIdMap[localId] || null
    } catch (error) {
      console.error('❌ 获取服务器书签ID失败:', error)
      return null
    }
  }

  // 删除书签ID映射
  async removeBookmarkIdMapping(localId) {
    try {
      const { bookmarkIdMap = {} } = await this.getStorageData(['bookmarkIdMap'])
      delete bookmarkIdMap[localId]
      await this.extensionAPI.storage.local.set({ bookmarkIdMap })
    } catch (error) {
      console.error('❌ 删除书签ID映射失败:', error)
    }
  }

  // 检查书签是否在同步收藏夹中
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

  // 获取书签文件夹路径
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

  // 处理书签创建事件
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
        const result = await response.json()
        // 保存本地书签ID到服务器书签ID的映射
        await this.saveBookmarkIdMapping(id, result.bookmark.id)
        console.log('✅ 书签已同步到服务器:', bookmark.title, '服务器ID:', result.bookmark.id)
      } else {
        const error = await response.json()
        console.error('❌ 同步书签到服务器失败:', error)
      }

    } catch (error) {
      console.error('❌ 书签创建同步失败:', error)
    }
  }

  // 处理书签删除事件
  async onBookmarkRemoved(id, removeInfo) {
    try {
      const { isImporting, isExporting, isSyncingFromServer } = await this.getStorageData(['isImporting', 'isExporting', 'isSyncingFromServer'])
      if (isImporting || isExporting) {
        return
      }

      // 如果当前正在从服务器同步书签到本地，跳过（防止循环同步）
      if (isSyncingFromServer) {
        console.log('🚫 正在从服务器同步书签到本地，跳过书签删除同步')
        return
      }

      console.log('🗑️ 书签删除事件:', id)

      // 获取服务器书签ID
      const serverBookmarkId = await this.getServerBookmarkId(id)
      if (!serverBookmarkId) {
        console.log('⚠️ 未找到服务器书签ID，跳过删除同步')
        return
      }

      // 获取服务器配置
      const settings = await this.getStorageData(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('⚠️ 未登录，跳过书签删除同步')
        return
      }

      // 从服务器删除书签
      const response = await fetch(`${settings.serverUrl}/bookmarks/${serverBookmarkId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        // 删除ID映射
        await this.removeBookmarkIdMapping(id)
        console.log('✅ 书签已从服务器删除')
      } else {
        const error = await response.json()
        console.error('❌ 从服务器删除书签失败:', error)
      }

    } catch (error) {
      console.error('❌ 书签删除同步失败:', error)
    }
  }

  // 处理书签移动事件
  async onBookmarkMoved(id, moveInfo) {
    try {
      const { isImporting, isExporting, isSyncingFromServer } = await this.getStorageData(['isImporting', 'isExporting', 'isSyncingFromServer'])
      if (isImporting || isExporting) {
        return
      }

      // 如果当前正在从服务器同步书签到本地，跳过（防止循环同步）
      if (isSyncingFromServer) {
        console.log('🚫 正在从服务器同步书签到本地，跳过书签移动同步')
        return
      }

      console.log('📦 书签移动事件:', id, moveInfo)

      // 获取书签信息
      const bookmark = await this.extensionAPI.bookmarks.get(id)
      if (!bookmark || bookmark.length === 0) {
        console.log('⚠️ 书签不存在:', id)
        return
      }

      const bookmarkData = bookmark[0]

      // 如果是文件夹，跳过
      if (!bookmarkData.url) {
        console.log('📁 检测到文件夹移动，跳过同步:', bookmarkData.title)
        return
      }

      // 获取服务器配置
      const settings = await this.getStorageData(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('⚠️ 未登录，跳过书签同步')
        return
      }

      // 检查书签当前是否在同步收藏夹中
      const isInSyncFolder = await this.checkBookmarkInSyncFolder(id)

      // 获取文件夹路径（如果在同步收藏夹中）
      let folderPath = ''
      if (isInSyncFolder) {
        folderPath = await this.getBookmarkFolderPath(bookmarkData)
      }

      // 获取服务器书签ID（如果有映射）
      const serverBookmarkId = await this.getServerBookmarkId(id)

      // 发送同步请求到后端，由后端决定创建、更新或删除
      const response = await fetch(`${settings.serverUrl}/bookmarks/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify({
          id: serverBookmarkId,
          title: bookmarkData.title,
          url: bookmarkData.url,
          folder: folderPath,
          tags: [],
          position: moveInfo.index,
          isInSyncFolder: isInSyncFolder
        })
      })

      if (response.ok) {
        const result = await response.json()

        // 根据操作结果更新ID映射
        if (result.action === 'created' && result.bookmark) {
          await this.saveBookmarkIdMapping(id, result.bookmark.id)
        } else if (result.action === 'deleted') {
          await this.removeBookmarkIdMapping(id)
        }

        console.log(`✅ 书签移动同步成功 [${result.action}]:`, bookmarkData.title)
      } else {
        const error = await response.json()
        console.error('❌ 书签移动同步失败:', error)
      }

    } catch (error) {
      console.error('❌ 书签移动同步失败:', error)
    }
  }

  // 处理书签修改事件
  async onBookmarkChanged(id, changeInfo) {
    try {
      const { isImporting, isExporting } = await this.getStorageData(['isImporting', 'isExporting'])
      if (isImporting || isExporting) {
        return
      }

      console.log('✏️ 书签更新事件:', id, changeInfo)
      // TODO: 实现书签修改同步
    } catch (error) {
      console.error('❌ 书签更新同步失败:', error)
    }
  }
}
