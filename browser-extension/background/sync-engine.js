// 同步引擎 - 处理全量同步逻辑

export class SyncEngine {
  constructor(extensionAPI, getStorageData, setStorageData, settings) {
    this.extensionAPI = extensionAPI
    this.getStorageData = getStorageData
    this.setStorageData = setStorageData
    this.settings = settings
    this.isFullSyncing = false
  }

  // 执行全量同步
  async performFullSync() {
    if (this.isFullSyncing) {
      console.log('🚫 全量同步正在进行中，跳过重复调用')
      return
    }

    this.isFullSyncing = true
    console.log('🔄 开始全量同步...')

    try {
      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        return
      }

      const settings = await this.getStorageData(['token', 'serverUrl'])
      if (!settings.token) {
        console.log('⚠️ 未登录，跳过全量同步')
        return
      }

      // 获取服务器书签
      const response = await fetch(`${settings.serverUrl}/bookmarks`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (!response.ok) {
        console.error('❌ 获取服务器书签失败')
        return
      }

      const { bookmarks: serverBookmarks } = await response.json()
      console.log(`📥 从服务器获取 ${serverBookmarks.length} 个书签`)

      if (serverBookmarks.length === 0) {
        console.log('ℹ️ 服务器上没有书签，无需同步')
        return
      }

      // 确保同步文件夹存在
      const syncFolder = await this.ensureSyncFolder()
      if (!syncFolder) {
        console.error('❌ 无法创建同步文件夹')
        return
      }

      // 获取本地同步收藏夹中的所有书签
      const localBookmarks = await this.getAllLocalSyncBookmarks(syncFolder.id)
      console.log(`📂 本地同步收藏夹中有 ${localBookmarks.length} 个书签`)

      // 设置同步标志，防止触发书签事件
      await this.setStorageData({ isSyncingFromServer: true })

      // 同步服务器书签到本地
      for (const serverBookmark of serverBookmarks) {
        const localBookmark = localBookmarks.find(b => b.url === serverBookmark.url)

        if (localBookmark) {
          // 检查是否需要更新
          const needsUpdate = localBookmark.title !== serverBookmark.title ||
                             localBookmark.folder !== serverBookmark.folder

          if (needsUpdate) {
            console.log(`📝 更新本地书签: ${serverBookmark.title}`)
            await this.extensionAPI.bookmarks.update(localBookmark.id, {
              title: serverBookmark.title
            })
          }
        } else {
          // 创建新书签
          console.log(`➕ 创建本地书签: ${serverBookmark.title}`)
          await this.createLocalBookmark(syncFolder.id, serverBookmark)
        }
      }

      console.log('✅ 全量同步完成')

    } catch (error) {
      console.error('❌ 全量同步失败:', error)
    } finally {
      // 清除同步标志
      await this.setStorageData({ isSyncingFromServer: false })
      this.isFullSyncing = false
    }
  }

  // 确保同步文件夹存在
  async ensureSyncFolder() {
    try {
      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        return null
      }

      // 查找现有的同步收藏夹
      const bookmarkTree = await this.extensionAPI.bookmarks.getTree()
      const otherBookmarks = bookmarkTree[0].children.find(child => child.id === 'unfiled')

      if (otherBookmarks) {
        const syncFolders = otherBookmarks.children.filter(
          child => child.title === '同步收藏夹' && !child.url
        )

        if (syncFolders.length > 0) {
          console.log('📁 找到同步收藏夹:', syncFolders[0].id)
          return syncFolders[0]
        }
      }

      // 创建同步收藏夹
      const newFolder = await this.extensionAPI.bookmarks.create({
        parentId: 'unfiled',
        title: '同步收藏夹'
      })

      console.log('📁 创建同步收藏夹:', newFolder.id)
      return newFolder

    } catch (error) {
      console.error('❌ 确保同步文件夹失败:', error)
      return null
    }
  }

  // 获取本地同步收藏夹中的所有书签
  async getAllLocalSyncBookmarks(syncFolderId) {
    try {
      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        return []
      }

      const bookmarks = []

      const getBookmarksRecursive = async (parentId, folderPath = '') => {
        const children = await this.extensionAPI.bookmarks.getChildren(parentId)

        for (const child of children) {
          if (child.url) {
            bookmarks.push({
              id: child.id,
              title: child.title,
              url: child.url,
              folder: folderPath,
              parentId: child.parentId
            })
          } else {
            // 递归处理子文件夹
            const newPath = folderPath ? `${folderPath} > ${child.title}` : child.title
            await getBookmarksRecursive(child.id, newPath)
          }
        }
      }

      await getBookmarksRecursive(syncFolderId)
      return bookmarks

    } catch (error) {
      console.error('❌ 获取本地同步书签失败:', error)
      return []
    }
  }

  // 确保文件夹路径存在
  async ensureFolderPathForSync(syncFolderId, folderPath) {
    try {
      if (!this.extensionAPI.bookmarks) {
        console.error('❌ 书签API不可用')
        return syncFolderId
      }

      if (!folderPath || folderPath === '同步收藏夹') {
        return syncFolderId
      }

      const pathParts = folderPath.split(' > ')
      let currentParentId = syncFolderId

      for (const folderName of pathParts) {
        if (folderName === '同步收藏夹') continue

        // 查找是否已存在该文件夹
        const children = await this.extensionAPI.bookmarks.getChildren(currentParentId)
        let targetFolder = children.find(child => child.title === folderName && !child.url)

        if (targetFolder) {
          currentParentId = targetFolder.id
        } else {
          // 创建新文件夹
          const newFolder = await this.extensionAPI.bookmarks.create({
            parentId: currentParentId,
            title: folderName
          })
          currentParentId = newFolder.id
        }
      }

      return currentParentId

    } catch (error) {
      console.error('❌ 确保文件夹路径失败:', error)
      return syncFolderId
    }
  }

  // 创建本地书签
  async createLocalBookmark(syncFolderId, serverBookmark) {
    try {
      // 确保文件夹路径存在
      const parentId = await this.ensureFolderPathForSync(syncFolderId, serverBookmark.folder)

      // 创建书签
      await this.extensionAPI.bookmarks.create({
        parentId: parentId,
        title: serverBookmark.title,
        url: serverBookmark.url
      })

    } catch (error) {
      console.error('❌ 创建本地书签失败:', error)
    }
  }

  // 执行初始全量同步
  async performInitialFullSync() {
    try {
      const { isImporting } = await this.getStorageData(['isImporting'])
      if (isImporting) {
        console.log('🚫 正在导入中，跳过初始全量同步')
        return
      }

      // 检查登录状态
      const loginStatus = await this.checkLoginStatus()
      if (!loginStatus.loggedIn) {
        console.log('⚠️ 未登录，跳过初始全量同步')
        return
      }

      // 检查是否启用了启动时同步
      const { syncOnStartup } = await this.getStorageData(['syncOnStartup'])
      if (syncOnStartup !== false) {
        console.log('🔄 执行初始全量同步')
        await this.performFullSync()
      }

    } catch (error) {
      console.error('❌ 初始全量同步失败:', error)
    }
  }

  // 检查登录状态
  async checkLoginStatus() {
    try {
      const settings = await this.getStorageData(['token', 'serverUrl'])

      if (!settings.token) {
        return { loggedIn: false }
      }

      const response = await fetch(`${settings.serverUrl}/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${settings.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        return { loggedIn: true, user: data.user }
      } else {
        return { loggedIn: false }
      }
    } catch (error) {
      console.error('检查登录状态失败:', error)
      return { loggedIn: false }
    }
  }
}
