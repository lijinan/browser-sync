// 扩展弹窗逻辑
class ExtensionPopup {
  constructor() {
    this.serverUrl = 'http://localhost:3001'
    this.token = null
    this.init()
  }

  async init() {
    // 等待API加载
    if (typeof extensionAPI === 'undefined') {
      setTimeout(() => this.init(), 100)
      return
    }
    
    await this.loadSettings()
    await this.checkConnection()
    this.bindEvents()
  }

  async loadSettings() {
    const result = await extensionAPI.storage.sync.get(['serverUrl', 'token', 'autoDetect', 'confirmSave'])
    this.serverUrl = result.serverUrl || 'http://localhost:3001'
    this.token = result.token
    
    // 安全地设置DOM元素值
    const serverUrlEl = document.getElementById('serverUrl')
    if (serverUrlEl) {
      serverUrlEl.value = this.serverUrl
    }
    
    // 设置开关状态
    const autoDetectToggle = document.getElementById('autoDetectToggle')
    const confirmSaveToggle = document.getElementById('confirmSaveToggle')
    
    if (autoDetectToggle && result.autoDetect !== false) {
      autoDetectToggle.classList.add('active')
    }
    if (confirmSaveToggle && result.confirmSave !== false) {
      confirmSaveToggle.classList.add('active')
    }
  }

  async checkConnection() {
    const statusEl = document.getElementById('status')
    const loginForm = document.getElementById('loginForm')
    const mainActions = document.getElementById('mainActions')

    if (!statusEl) {
      console.error('Status element not found')
      return
    }

    try {
      statusEl.innerHTML = '<span class="loading"></span> 检查连接...'
      
      if (!this.token) {
        throw new Error('未登录')
      }

      const response = await fetch(`${this.serverUrl}/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        statusEl.textContent = `已连接 - ${data.user.name}`
        statusEl.className = 'status connected'
        if (loginForm) loginForm.classList.add('hidden')
        if (mainActions) mainActions.classList.remove('hidden')
      } else {
        throw new Error('认证失败')
      }
    } catch (error) {
      console.log('Connection check failed:', error.message)
      statusEl.textContent = '未连接 - 请登录'
      statusEl.className = 'status disconnected'
      if (loginForm) loginForm.classList.remove('hidden')
      if (mainActions) mainActions.classList.add('hidden')
    }
  }

  bindEvents() {
    // 登录
    document.getElementById('loginBtn').addEventListener('click', () => this.login())

    // 打开面板
    document.getElementById('openDashboardBtn').addEventListener('click', () => this.openDashboard())
    
    // 同步
    document.getElementById('syncBtn').addEventListener('click', () => this.sync())
    
    // 导入浏览器数据
    document.getElementById('importBrowserDataBtn').addEventListener('click', () => this.importBrowserData())

    // 导出到浏览器
    document.getElementById('exportToBrowserBtn').addEventListener('click', () => this.exportToBrowser())

    // 打开设置
    document.getElementById('openSettingsBtn').addEventListener('click', () => this.openSettings())

    // 退出登录
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout())

    // 设置开关
    document.getElementById('autoDetectToggle').addEventListener('click', (e) => this.toggleSetting(e, 'autoDetect'))
    document.getElementById('confirmSaveToggle').addEventListener('click', (e) => this.toggleSetting(e, 'confirmSave'))
    
    // 回车登录
    document.getElementById('password').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.login()
    })
  }

  async login() {
    const serverUrl = document.getElementById('serverUrl').value
    const username = document.getElementById('username').value
    const password = document.getElementById('password').value
    const loginBtn = document.getElementById('loginBtn')

    if (!username || !password) {
      this.showMessage('请输入用户名和密码', 'error')
      return
    }

    try {
      loginBtn.innerHTML = '<span class="loading"></span> 登录中...'
      loginBtn.disabled = true

      const response = await fetch(`${serverUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      // 检查响应内容类型
      const contentType = response.headers.get('content-type')
      let data
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json()
      } else {
        // 如果不是JSON响应，获取文本内容
        const text = await response.text()
        console.error('服务器返回非JSON响应:', text)
        throw new Error('服务器连接失败，请检查服务器地址和状态')
      }

      if (response.ok) {
        this.token = data.token
        this.serverUrl = serverUrl
        
        await extensionAPI.storage.sync.set({
          serverUrl: this.serverUrl,
          token: this.token
        })

        this.showMessage('登录成功！', 'success')
        
        // 登录成功后，检查并创建"同步收藏夹"
        await this.ensureSyncFolder()
        
        await this.checkConnection()
      } else {
        throw new Error(data.message || '登录失败')
      }
    } catch (error) {
      console.error('登录错误:', error)
      if (error.message.includes('Failed to fetch')) {
        this.showMessage('无法连接到服务器，请检查服务器地址', 'error')
      } else if (error.message.includes('JSON')) {
        this.showMessage('服务器响应格式错误，请检查服务器状态', 'error')
      } else {
        this.showMessage(error.message, 'error')
      }
    } finally {
      loginBtn.innerHTML = '<span class="action-text">登录</span>'
      loginBtn.disabled = false
    }
  }

  async logout() {
    try {
      const confirmed = confirm('确定要退出登录吗？')

      if (!confirmed) return

      // 清除本地存储的token（兼容 Firefox 和 Chrome）
      // Firefox: 将 token 设置为 null
      // Chrome: 使用 remove 方法
      if (typeof extensionAPI.storage.sync.remove === 'function') {
        await extensionAPI.storage.sync.remove(['token'])
      } else {
        // Firefox 兼容方案：设置为 null
        await extensionAPI.storage.sync.set({ token: null })
      }

      // 清除本地缓存的token
      this.token = null

      this.showMessage('已退出登录', 'success')

      // 延迟一下再检查连接状态，让用户看到成功消息
      setTimeout(async () => {
        await this.checkConnection()
      }, 500)
    } catch (error) {
      console.error('Logout error:', error)
      this.showMessage('退出登录失败: ' + error.message, 'error')
    }
  }

  async openDashboard() {
    try {
      const settings = await extensionAPI.storage.sync.get(['token', 'serverUrl'])

      if (!settings.token) {
        this.showMessage('请先登录扩展', 'error')
        return
      }

      // 构建带有token的URL，实现自动登录
      const dashboardUrl = `${settings.serverUrl.replace(':3001', ':3002')}?token=${encodeURIComponent(settings.token)}`

      console.log('打开管理面板:', dashboardUrl)
      extensionAPI.tabs.create({ url: dashboardUrl })

    } catch (error) {
      console.error('打开管理面板失败:', error)
      // 如果出错，使用默认URL
      extensionAPI.tabs.create({ url: 'http://localhost:3002' })
    }
  }

  async openSettings() {
    extensionAPI.runtime.openOptionsPage()
  }

  // 确保"同步收藏夹"存在
  async ensureSyncFolder() {
    try {
      // 检查浏览器是否支持书签API
      if (!extensionAPI.bookmarks) {
        console.log('⚠️ 浏览器不支持书签API，跳过创建同步收藏夹')
        return
      }

      console.log('📁 检查"同步收藏夹"...')

      // 搜索是否已存在"同步收藏夹"文件夹
      const searchResults = await extensionAPI.bookmarks.search({
        title: '同步收藏夹'
      })

      // 过滤出文件夹类型（没有url属性的节点）
      const existingFolders = searchResults.filter(node => !node.url)

      if (existingFolders.length > 0) {
        console.log('✅ "同步收藏夹"已存在，ID:', existingFolders[0].id)
        return existingFolders[0]
      }

      // 获取书签工具栏ID
      const toolbarId = await this.getBookmarksMenuRoot()
      if (!toolbarId) {
        console.error('❌ 无法获取书签工具栏ID')
        return null
      }

      // 创建"同步收藏夹"文件夹
      const syncFolder = await extensionAPI.bookmarks.create({
        title: '同步收藏夹',
        parentId: toolbarId
      })

      console.log('✅ 已创建"同步收藏夹"，ID:', syncFolder.id)
      return syncFolder

    } catch (error) {
      console.error('❌ 创建同步收藏夹失败:', error)
      return null
    }
  }

  // 获取书签工具栏ID（支持 Firefox 和 Chrome）
  async getBookmarksMenuRoot() {
    try {
      const tree = await extensionAPI.bookmarks.getTree()

      if (tree[0] && tree[0].children && tree[0].children.length > 0) {
        // 查找书签工具栏
        let toolbarNode = tree[0].children.find(child =>
          child.id === 'toolbar_____' || // Firefox
          child.id === '1' || child.id === 1 // Chrome
        )

        if (toolbarNode) {
          return toolbarNode.id
        }

        // 如果找不到工具栏，尝试找书签菜单（回退方案）
        let menuNode = tree[0].children.find(child =>
          child.id === 'menu________' || // Firefox
          child.id === '0' || child.id === 0 // Chrome
        )

        if (menuNode) {
          return menuNode.id
        }

        // 最后的回退：使用第一个子节点
        return tree[0].children[0].id
      }

      return null
    } catch (error) {
      console.error('查找书签根目录失败:', error)
      return null
    }
  }

  async sync() {
    try {
      const syncBtn = document.getElementById('syncBtn')
      const originalText = syncBtn.innerHTML
      
      syncBtn.innerHTML = '<span class="loading"></span> 同步中...'
      syncBtn.disabled = true

      const settings = await extensionAPI.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        throw new Error('请先登录')
      }

      await this.syncReplaceMode(settings)
      
      this.showMessage('同步完成！', 'success')
    } catch (error) {
      console.error('Sync error:', error)
      this.showMessage('同步失败: ' + error.message, 'error')
    } finally {
      const syncBtn = document.getElementById('syncBtn')
      syncBtn.innerHTML = `
        <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
        <div class="action-text">
          <div class="action-title">立即同步</div>
          <div class="action-desc">同步最新数据</div>
        </div>
      `
      syncBtn.disabled = false
    }
  }

  // 替换模式同步：将服务器书签同步到"同步收藏夹"
  async syncReplaceMode(settings) {
    console.log('🎯 执行替换模式同步')
    
    // 1. 获取服务器上的书签
    const serverBookmarks = await this.fetchServerBookmarks(settings)
    console.log('📚 获取到服务器书签:', serverBookmarks.length, '个')
    
    if (serverBookmarks.length === 0) {
      console.log('⚠️ 服务器上没有书签')
      return
    }
    
    // 2. 检查浏览器是否支持书签API
    if (extensionAPI.bookmarks) {
      // 3. 清空"同步收藏夹"中的现有书签
      await this.clearSyncFolderBookmarks()
      console.log('🗑️ 已清空同步收藏夹中的书签')
      
      // 4. 将服务器书签同步到浏览器"同步收藏夹"
      await this.syncBookmarksToLocal(serverBookmarks)
      console.log('⬇️ 已同步服务器书签到本地')
    } else {
      console.log('⚠️ 浏览器不支持书签API，跳过本地书签同步')
    }
    
    // 5. 通知用户
    this.showMessage(`同步完成！同步了 ${serverBookmarks.length} 个书签到"同步收藏夹"`, 'success')
  }

  // 获取服务器书签
  async fetchServerBookmarks(settings) {
    const response = await fetch(`${settings.serverUrl}/bookmarks`, {
      headers: {
        'Authorization': `Bearer ${settings.token}`
      }
    })
    
    if (!response.ok) {
      throw new Error('获取服务器书签失败')
    }
    
    const data = await response.json()
    return data.bookmarks || []
  }

  // 清空"同步收藏夹"中的书签
  async clearSyncFolderBookmarks() {
    if (!extensionAPI.bookmarks) {
      return
    }
    
    try {
      // 搜索"同步收藏夹"文件夹
      const searchResults = await extensionAPI.bookmarks.search({ title: '同步收藏夹' })
      const syncFolders = searchResults.filter(node => !node.url)
      
      if (syncFolders.length === 0) {
        console.log('⚠️ 未找到"同步收藏夹"文件夹')
        return
      }
      
      // 递归删除同步收藏夹中的所有书签（保留文件夹结构）
      const clearBookmarksRecursive = async (folderId) => {
        const children = await extensionAPI.bookmarks.getChildren(folderId)
        
        for (const node of children) {
          if (node.url) {
            // 这是一个书签，删除它
            await extensionAPI.bookmarks.remove(node.id)
          } else if (node.children) {
            // 这是一个文件夹，递归处理
            await clearBookmarksRecursive(node.id)
          }
        }
      }
      
      // 清空每个同步收藏夹
      for (const syncFolder of syncFolders) {
        await clearBookmarksRecursive(syncFolder.id)
      }
      
      console.log('✅ 已清空"同步收藏夹"中的书签')
    } catch (error) {
      console.error('清空同步收藏夹书签失败:', error)
    }
  }

  // 同步书签到本地
  async syncBookmarksToLocal(serverBookmarks) {
    if (!extensionAPI.bookmarks) {
      return
    }

    const folderMap = new Map() // 缓存文件夹ID

    for (const bookmark of serverBookmarks) {
      try {
        await this.createLocalBookmark(bookmark, folderMap)
      } catch (error) {
        console.error('创建本地书签失败:', bookmark.title, error)
      }
    }
  }

  // 创建本地书签（支持多级文件夹）
  async createLocalBookmark(bookmark, folderMap = new Map()) {
    if (!extensionAPI.bookmarks) {
      return
    }

    try {
      console.log('开始创建书签:', bookmark.title, 'folder:', bookmark.folder)

      // 确定父文件夹ID
      let parentId = undefined

      // 步骤1：确保"同步收藏夹"根文件夹存在（在书签工具栏下）
      const syncRootPath = '同步收藏夹'
      if (!folderMap.has(syncRootPath)) {
        const toolbarId = await this.getBookmarksMenuRoot() // 获取书签工具栏ID
        console.log('工具栏ID:', toolbarId, '类型:', typeof toolbarId)

        // 搜索是否已存在"同步收藏夹"文件夹
        const searchResults = await extensionAPI.bookmarks.search({
          title: '同步收藏夹'
        })

        console.log('搜索结果数量:', searchResults.length)
        searchResults.forEach((node, i) => {
          console.log(`搜索结果${i}:`, {
            title: node.title,
            id: node.id,
            parentId: node.parentId,
            parentIdType: typeof node.parentId
          })
        })

        // 使用宽松比较来匹配 ID（处理字符串和数字类型差异）
        let syncRootFolder = searchResults.find(node =>
          node.title === '同步收藏夹' &&
          !node.url &&
          String(node.parentId) === String(toolbarId)
        )

        if (!syncRootFolder) {
          // 创建"同步收藏夹"文件夹
          syncRootFolder = await extensionAPI.bookmarks.create({
            title: '同步收藏夹',
            parentId: toolbarId
          })
          console.log('✅ 创建"同步收藏夹"根文件夹, ID:', syncRootFolder.id, 'parentId:', toolbarId)
        } else {
          console.log('✅ 找到已存在的"同步收藏夹"文件夹, ID:', syncRootFolder.id)
        }

        folderMap.set(syncRootPath, syncRootFolder.id)
      }

      // 步骤2：处理书签的folder路径
      if (bookmark.folder) {
        // 规范化路径：处理重复的"同步收藏夹"前缀
        // 例如 "同步收藏夹 > 同步收藏夹 > 编程语言" 变为 "同步收藏夹 > 编程语言"
        let normalizedFolder = bookmark.folder
        while (normalizedFolder.startsWith('同步收藏夹 > 同步收藏夹')) {
          normalizedFolder = normalizedFolder.replace('同步收藏夹 > 同步收藏夹', '同步收藏夹')
        }
        
        if (normalizedFolder === '同步收藏夹' || normalizedFolder === '') {
          // 直接放在"同步收藏夹"根文件夹下
          parentId = folderMap.get(syncRootPath)
          console.log('书签放在"同步收藏夹"根文件夹下, ID:', parentId)
        } else if (normalizedFolder.startsWith('同步收藏夹 > ')) {
          // 处理"同步收藏夹 > 子文件夹1 > 子文件夹2"的情况
          const remainingPath = normalizedFolder.replace('同步收藏夹 > ', '')
          const folderPath = remainingPath.split(' > ').filter(f => f.trim())

          // 从"同步收藏夹"根文件夹开始
          parentId = folderMap.get(syncRootPath)
          console.log('从"同步收藏夹"开始创建子文件夹, 起始ID:', parentId)

          // 逐级创建子文件夹
          let currentPath = syncRootPath
          for (const folderName of folderPath) {
            // 跳过空文件夹名
            if (!folderName || !folderName.trim()) {
              console.log('⚠️ 跳过空文件夹名')
              continue
            }
            
            currentPath = currentPath ? `${currentPath} > ${folderName}` : folderName

            if (!folderMap.has(currentPath)) {
              // 获取当前父文件夹的直接子项，而不是搜索整个浏览器
              const children = await extensionAPI.bookmarks.getChildren(parentId)

              // 在直接子项中查找同名文件夹
              let folderNode = children.find(node =>
                node.title === folderName &&
                !node.url  // 是文件夹
              )

              if (!folderNode) {
                folderNode = await extensionAPI.bookmarks.create({
                  title: folderName,
                  parentId: parentId
                })
                console.log('创建子文件夹:', folderName, 'ID:', folderNode.id, 'parentId:', parentId)
              } else {
                console.log('找到已存在的子文件夹:', folderName, 'ID:', folderNode.id)
              }

              folderMap.set(currentPath, folderNode.id)
            }

            parentId = folderMap.get(currentPath)
            console.log('文件夹路径:', currentPath, 'ID:', parentId)
          }
        } else {
          // 其他文件夹格式，也放在"同步收藏夹"下
          console.log('其他文件夹格式，放在"同步收藏夹"下')
          const folderPath = bookmark.folder.split(' > ').filter(f => f.trim())

          parentId = folderMap.get(syncRootPath)
          let currentPath = syncRootPath

          for (const folderName of folderPath) {
            // 跳过空文件夹名
            if (!folderName || !folderName.trim()) {
              console.log('⚠️ 跳过空文件夹名')
              continue
            }
            
            currentPath = currentPath ? `${currentPath} > ${folderName}` : folderName

            if (!folderMap.has(currentPath)) {
              // 获取当前父文件夹的直接子项，而不是搜索整个浏览器
              const children = await extensionAPI.bookmarks.getChildren(parentId)

              // 在直接子项中查找同名文件夹
              let folderNode = children.find(node =>
                node.title === folderName &&
                !node.url  // 是文件夹
              )

              if (!folderNode) {
                folderNode = await extensionAPI.bookmarks.create({
                  title: folderName,
                  parentId: parentId
                })
                console.log('创建文件夹:', folderName, 'ID:', folderNode.id, 'parentId:', parentId)
              } else {
                console.log('找到已存在的文件夹:', folderName, 'ID:', folderNode.id)
              }

              folderMap.set(currentPath, folderNode.id)
            }

            parentId = folderMap.get(currentPath)
          }
        }
      } else {
        // 没有指定文件夹，放在"同步收藏夹"根文件夹下
        parentId = folderMap.get(syncRootPath)
        console.log('无文件夹书签，放在"同步收藏夹"下, ID:', parentId)
      }

      console.log('最终使用的parentId:', parentId)
      console.log('准备创建书签:', bookmark.title, 'URL:', bookmark.url)

      // 验证parentId是否有效
      if (!parentId) {
        console.error('❌ parentId 为空，可能导致书签被创建到错误位置！')
      }

      // 创建书签
      const created = await extensionAPI.bookmarks.create({
        title: bookmark.title,
        url: bookmark.url,
        parentId: parentId
      })

      console.log('✅ 书签创建成功:', {
        id: created.id,
        title: created.title,
        parentId: created.parentId,
        index: created.index
      })
    } catch (error) {
      console.error('创建书签失败:', error)
    }
  }

  // 获取书签工具栏ID（支持 Firefox 和 Chrome）
  async getBookmarksMenuRoot() {
    try {
      // 获取完整的书签树
      const tree = await extensionAPI.bookmarks.getTree()

      console.log('书签树根节点:', {
        title: tree[0]?.title,
        id: tree[0]?.id,
        childrenCount: tree[0]?.children?.length
      })

      if (tree[0] && tree[0].children && tree[0].children.length > 0) {
        // 打印所有子节点信息（用于调试）
        tree[0].children.forEach((child, index) => {
          console.log(`子节点${index}:`, {
            title: child.title,
            id: child.id,
            dateAdded: child.dateAdded
          })
        })

        // Chrome 使用数字 ID: 1=书签栏, 2=其他书签, 0=书签菜单
        // Firefox 使用字符串 ID: toolbar_____=书签工具栏, menu________=书签菜单
        let toolbarNode = tree[0].children.find(child =>
          // Firefox: toolbar_____
          child.id === 'toolbar_____' ||
          // Chrome: 书签栏 (id=1)
          child.id === '1' ||
          child.id === 1
        )

        if (toolbarNode) {
          console.log('✅ 找到书签工具栏节点:', {
            id: toolbarNode.id,
            title: `"${toolbarNode.title}"`,
            index: tree[0].children.findIndex(c => c.id === toolbarNode.id)
          })
          return toolbarNode.id
        }

        // 如果找不到工具栏，尝试找书签菜单（回退方案）
        let menuNode = tree[0].children.find(child =>
          child.id === 'menu________' || // Firefox
          child.id === '0' || child.id === 0 // Chrome
        )

        if (menuNode) {
          console.log('⚠️ 未找到工具栏，使用书签菜单节点:', {
            id: menuNode.id,
            title: `"${menuNode.title}"`
          })
          return menuNode.id
        }

        // 最后的回退：使用第一个子节点
        const firstChild = tree[0].children[0]
        console.log('⚠️ 使用第一个子节点作为默认位置:', firstChild.id, firstChild.title)
        return firstChild.id
      }

      console.warn('未找到书签节点')
      return null
    } catch (error) {
      console.error('查找书签根目录失败:', error)
      return null
    }
  }

  // 查找新书签
  findNewBookmarks(source, target) {
    return source.filter(sourceBookmark => 
      !target.some(targetBookmark => 
        targetBookmark.url === sourceBookmark.url
      )
    )
  }

  // 上传书签到服务器
  async uploadBookmark(bookmark, settings) {
    try {
      const response = await fetch(`${settings.serverUrl}/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.token}`
        },
        body: JSON.stringify({
          title: bookmark.title,
          url: bookmark.url,
          folder: '浏览器同步',
          tags: ['自动同步']
        })
      })
      
      if (!response.ok) {
        throw new Error('上传书签失败')
      }
    } catch (error) {
      console.error('上传书签失败:', bookmark.title, error)
    }
  }

  async toggleSetting(event, setting) {
    const toggle = event.target
    toggle.classList.toggle('active')
    
    const isActive = toggle.classList.contains('active')
    await extensionAPI.storage.sync.set({ [setting]: isActive })
    
    this.showMessage(`${setting === 'autoDetect' ? '自动检测' : '确认保存'}已${isActive ? '开启' : '关闭'}`, 'info')
  }

  // 导入浏览器数据功能
  async importBrowserData() {
    try {
      const importBtn = document.getElementById('importBrowserDataBtn')
      const originalText = importBtn.innerHTML
      
      // 确认操作
      const confirmed = confirm(
        '⚠️ 警告：此操作将会：\n\n' +
        '1. 获取当前浏览器的所有书签\n' +
        '2. 清空您账号在服务器上的所有数据\n' +
        '3. 将浏览器数据上传到服务器\n\n' +
        '此操作不可撤销！确定要继续吗？'
      )
      
      if (!confirmed) {
        return
      }
      
      // 二次确认
      const doubleConfirmed = confirm(
        '🔴 最后确认：\n\n' +
        '您即将用当前浏览器的数据完全覆盖服务器上的账号数据。\n' +
        '这将删除服务器上的所有书签和密码！\n\n' +
        '确定要继续吗？'
      )
      
      if (!doubleConfirmed) {
        return
      }
      
      importBtn.innerHTML = '<span class="loading"></span> 导入中...'
      importBtn.disabled = true

      const settings = await extensionAPI.storage.sync.get(['token', 'serverUrl'])
      
      if (!settings.token) {
        throw new Error('请先登录')
      }

      console.log('🔄 开始导入浏览器数据')
      
      // 设置导入标志，防止触发自动全量同步
      await extensionAPI.storage.sync.set({ isImporting: true })
      console.log('🚫 已设置导入标志，暂停自动同步')
      
      // 1. 获取浏览器书签
      const browserBookmarks = await this.getAllBrowserBookmarks()
      console.log('📚 获取到浏览器书签:', browserBookmarks.length, '个')
      
      // 2. 获取浏览器保存的密码（如果可能）
      const browserPasswords = await this.getAllBrowserPasswords()
      console.log('🔐 获取到浏览器密码:', browserPasswords.length, '个')
      
      // 3. 清空服务器书签（保留密码）
      await this.clearServerData(settings, { clearBookmarks: true, clearPasswords: false })
      console.log('🗑️ 已清空服务器书签（密码保留）')
      
      // 4. 上传书签到服务器
      let uploadedBookmarks = 0
      for (const bookmark of browserBookmarks) {
        try {
          await this.uploadBookmarkToServer(bookmark, settings)
          uploadedBookmarks++
        } catch (error) {
          console.error('上传书签失败:', bookmark.title, error)
        }
      }
      console.log('📤 已上传书签:', uploadedBookmarks, '个')
      
      // 5. 上传密码到服务器
      let uploadedPasswords = 0
      for (const password of browserPasswords) {
        try {
          await this.uploadPasswordToServer(password, settings)
          uploadedPasswords++
        } catch (error) {
          console.error('上传密码失败:', password.site_name, error)
        }
      }
      console.log('📤 已上传密码:', uploadedPasswords, '个')
      
      this.showMessage(
        `导入完成！书签: ${uploadedBookmarks}个，密码: ${uploadedPasswords}个`, 
        'success'
      )
      
    } catch (error) {
      console.error('导入浏览器数据失败:', error)
      this.showMessage('导入失败: ' + error.message, 'error')
    } finally {
      // 清除导入标志，恢复自动同步
      await extensionAPI.storage.sync.set({ isImporting: false })
      console.log('✅ 已清除导入标志，恢复自动同步')
      
      const importBtn = document.getElementById('importBrowserDataBtn')
      importBtn.innerHTML = `
        <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z M12,12L16,16H13.5V19H10.5V16H8L12,12Z"/>
        </svg>
        <div class="action-text">
          <div class="action-title">从浏览器导入</div>
          <div class="action-desc">覆盖账号所有数据</div>
        </div>
      `
      importBtn.disabled = false
    }
  }

  // 获取所有浏览器书签（仅获取"同步收藏夹"下的书签）
  async getAllBrowserBookmarks() {
    if (!extensionAPI.bookmarks) {
      console.log('⚠️ 浏览器不支持书签API')
      return []
    }

    try {
      // 搜索"同步收藏夹"文件夹
      const searchResults = await extensionAPI.bookmarks.search({ title: '同步收藏夹' })
      // 过滤出文件夹类型（没有url属性的节点）
      const syncFolders = searchResults.filter(node => !node.url)

      if (syncFolders.length === 0) {
        console.log('⚠️ 未找到"同步收藏夹"文件夹')
        return []
      }

      const bookmarks = []
      let globalPosition = 0

      // 广度优先遍历"同步收藏夹"下的书签
      const traverseBookmarks = async (folderId, folderPath = []) => {
        const queue = [{ folderId, folderPath }]

        while (queue.length > 0) {
          const { folderId: currentFolderId, folderPath: currentFolderPath } = queue.shift()
          const children = await extensionAPI.bookmarks.getChildren(currentFolderId)

          for (const node of children) {
            if (node.url) {
              // 这是一个书签
              // 跳过URL为空或无效的书签
              if (!node.url.trim()) {
                console.log('⚠️ 跳过空URL书签:', node.title)
                globalPosition++
                continue
              }

              // 使用 > 作为多级文件夹的分隔符
              // 根目录固定为"同步收藏夹"
              const folder = currentFolderPath.length > 0
                ? `同步收藏夹 > ${currentFolderPath.join(' > ')}`
                : '同步收藏夹'

              bookmarks.push({
                title: node.title || 'Untitled',
                url: node.url.trim(),
                folder: folder,
                tags: ['浏览器导入'],
                description: `导入时间: ${node.dateAdded ? new Date(node.dateAdded).toLocaleString() : new Date().toLocaleString()}`,
                position: globalPosition++
              })
            } else {
              // 这是一个文件夹，加入队列（广度优先）
              const folderName = node.title || '未命名文件夹'
              queue.push({ 
                folderId: node.id, 
                folderPath: [...currentFolderPath, folderName] 
              })
            }
          }
        }
      }

      // 只遍历"同步收藏夹"下的内容
      for (const syncFolder of syncFolders) {
        console.log('📁 正在导入"同步收藏夹":', syncFolder.id)
        await traverseBookmarks(syncFolder.id)
      }

      console.log(`✅ 从"同步收藏夹"导入 ${bookmarks.length} 个书签`)
      return bookmarks

    } catch (error) {
      console.error('获取浏览器书签失败:', error)
      return []
    }
  }

  // 获取浏览器密码（模拟，实际上浏览器不允许直接访问密码）
  async getAllBrowserPasswords() {
    // 注意：出于安全考虑，浏览器不允许扩展直接访问保存的密码
    // 这里返回空数组，实际实现可能需要用户手动导出密码文件
    console.log('⚠️ 浏览器密码需要用户手动导出')
    return []
  }

  // 清空服务器数据
  async clearServerData(settings, options = { clearBookmarks: true, clearPasswords: false }) {
    try {
      // 清空书签
      if (options.clearBookmarks) {
        const bookmarksResponse = await fetch(`${settings.serverUrl}/bookmarks/clear`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${settings.token}`
          }
        })
        
        if (!bookmarksResponse.ok) {
          console.error('清空服务器书签失败')
        }
      }
      
      // 清空密码（仅在明确指定时）
      if (options.clearPasswords) {
        const passwordsResponse = await fetch(`${settings.serverUrl}/passwords/clear`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${settings.token}`
          }
        })
        
        if (!passwordsResponse.ok) {
          console.error('清空服务器密码失败')
        }
      }
      
    } catch (error) {
      console.error('清空服务器数据失败:', error)
      // 不抛出错误，继续执行
    }
  }

  // 上传书签到服务器
  async uploadBookmarkToServer(bookmark, settings) {
    // 验证书签数据
    if (!bookmark.url || !bookmark.url.trim()) {
      throw new Error('书签URL不能为空')
    }
    if (!bookmark.title || !bookmark.title.trim()) {
      throw new Error('书签标题不能为空')
    }
    
    const response = await fetch(`${settings.serverUrl}/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.token}`
      },
      body: JSON.stringify({
        ...bookmark,
        url: bookmark.url.trim(),
        title: bookmark.title.trim() || 'Untitled'
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || '上传书签失败')
    }
    
    return await response.json()
  }

  // 上传密码到服务器
  async uploadPasswordToServer(password, settings) {
    const response = await fetch(`${settings.serverUrl}/passwords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.token}`
      },
      body: JSON.stringify(password)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || '上传密码失败')
    }

    return await response.json()
  }

  // 导出到浏览器功能
  async exportToBrowser() {
    try {
      const exportBtn = document.getElementById('exportToBrowserBtn')

      // 检查浏览器是否支持书签API
      if (!extensionAPI.bookmarks) {
        this.showMessage('当前浏览器不支持书签API', 'error')
        return
      }

      const settings = await extensionAPI.storage.sync.get(['token', 'serverUrl'])

      if (!settings.token) {
        throw new Error('请先登录')
      }

      // 导出到浏览器：仅操作"同步收藏夹"
      const confirmed = confirm(
        '📤 导出到浏览器"同步收藏夹"\n\n' +
        '此操作将清空"同步收藏夹"中的现有书签，\n' +
        '然后从服务器同步最新的书签到浏览器。\n\n' +
        '确定要继续吗？'
      )

      if (!confirmed) {
        return
      }

      exportBtn.innerHTML = '<span class="loading"></span> 导出中...'
      exportBtn.disabled = true

      console.log('🔄 开始导出数据到浏览器"同步收藏夹"')

      // 1. 从服务器获取所有书签
      const serverBookmarks = await this.fetchServerBookmarks(settings)
      console.log('📚 从服务器获取到书签:', serverBookmarks.length, '个')

      if (serverBookmarks.length === 0) {
        this.showMessage('服务器上没有书签数据', 'warning')
        return
      }

      // 2. 清空"同步收藏夹"中的现有书签
      await this.clearSyncFolderBookmarks()
      console.log('🗑️ 已清空同步收藏夹中的书签')

      // 3. 将服务器书签同步到浏览器"同步收藏夹"
      await this.syncBookmarksToLocal(serverBookmarks)
      console.log('⬇️ 已同步服务器书签到本地')

      console.log('✅ 导出完成！')
      this.showMessage(`导出完成！同步了 ${serverBookmarks.length} 个书签到"同步收藏夹"`, 'success')

    } catch (error) {
      console.error('导出到浏览器失败:', error)
      this.showMessage('导出失败: ' + error.message, 'error')
    } finally {
      const exportBtn = document.getElementById('exportToBrowserBtn')
      exportBtn.innerHTML = `
        <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z M16,11V8H8V11H5L12,18L19,11H16Z"/>
        </svg>
        <div class="action-text">
          <div class="action-title">导出到浏览器</div>
          <div class="action-desc">同步服务器书签到浏览器</div>
        </div>
      `
      exportBtn.disabled = false
    }
  }

  showMessage(message, type = 'info') {
    // 创建临时消息显示
    const messageEl = document.createElement('div')
    messageEl.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      color: white;
      background: ${type === 'success' ? '#52c41a' : type === 'error' ? '#ff4d4f' : type === 'warning' ? '#faad14' : '#1890ff'};
    `
    messageEl.textContent = message
    document.body.appendChild(messageEl)
    
    setTimeout(() => {
      document.body.removeChild(messageEl)
    }, 3000)
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new ExtensionPopup()
})