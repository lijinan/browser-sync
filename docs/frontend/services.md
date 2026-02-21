# 前端 API 服务

> Level 3 文档 - API 服务详细说明

---

## 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [web-client/src/services/api.js](../../web-client/src/services/api.js) |
| **依赖** | axios, antd (message) |
| **基础 URL** | `/api` |

---

## Axios 实例配置

```javascript
// services/api.js
import axios from 'axios'
import { message } from 'antd'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})
```

---

## 请求拦截器

### 功能

- 自动添加 JWT Token 到请求头

### 实现

```javascript
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)
```

### 请求头格式

```
Authorization: Bearer <jwt_token>
```

---

## 响应拦截器

### 功能

- 处理 401 未授权错误
- 处理 500 服务器错误
- 显示错误提示消息

### 实现

```javascript
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    // 密码验证 API 的 401 错误不跳转登录页
    const isVerifyPasswordEndpoint = error.config?.url?.includes('/auth/verify-password')

    if (error.response?.status === 401 && !isVerifyPasswordEndpoint) {
      message.error('登录已过期，请重新登录')
      // 清除 token 并跳转到登录页
      localStorage.removeItem('token')
      window.location.href = '/login'
    } else if (error.response?.status >= 500) {
      message.error('服务器错误，请稍后重试')
    }
    return Promise.reject(error)
  }
)
```

### 错误处理逻辑

| 状态码 | 处理方式 |
|--------|----------|
| 401 | 清除 Token，跳转登录页 |
| 403 | 显示权限错误 |
| 404 | 显示资源不存在 |
| 500+ | 显示服务器错误 |

---

## API 调用示例

### 认证相关

```javascript
// 登录
const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials)
  return response.data
}

// 注册
const register = async (userData) => {
  const response = await api.post('/auth/register', userData)
  return response.data
}

// 获取当前用户
const getCurrentUser = async () => {
  const response = await api.get('/auth/me')
  return response.data
}

// 二次密码验证
const verifyPassword = async (password) => {
  const response = await api.post('/auth/verify-password', { password })
  return response.data
}
```

### 书签相关

```javascript
// 获取书签列表
const getBookmarks = async () => {
  const response = await api.get('/bookmarks')
  return response.data.bookmarks
}

// 创建书签
const createBookmark = async (bookmarkData) => {
  const response = await api.post('/bookmarks', bookmarkData)
  return response.data.bookmark
}

// 更新书签
const updateBookmark = async (id, bookmarkData) => {
  const response = await api.put(`/bookmarks/${id}`, bookmarkData)
  return response.data.bookmark
}

// 删除书签
const deleteBookmark = async (id) => {
  await api.delete(`/bookmarks/${id}`)
}
```

### 密码相关

```javascript
// 获取密码列表
const getPasswords = async () => {
  const response = await api.get('/passwords')
  return response.data.passwords
}

// 获取密码详情
const getPasswordDetail = async (id) => {
  const response = await api.get(`/passwords/${id}`)
  return response.data.password
}

// 创建密码
const createPassword = async (passwordData) => {
  const response = await api.post('/passwords', passwordData)
  return response.data.password
}

// 更新密码
const updatePassword = async (id, passwordData) => {
  const response = await api.put(`/passwords/${id}`, passwordData)
  return response.data.password
}

// 删除密码
const deletePassword = async (id) => {
  await api.delete(`/passwords/${id}`)
}
```

### 导入导出

```javascript
// 导出书签 JSON
const exportBookmarks = async () => {
  const response = await api.get('/import-export/bookmarks/export', {
    responseType: 'blob'
  })
  return response.data
}

// 导出书签 HTML
const exportBookmarksHtml = async () => {
  const response = await api.get('/import-export/bookmarks/export/html', {
    responseType: 'blob'
  })
  return response.data
}

// 导入书签
const importBookmarks = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await api.post('/import-export/bookmarks/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}
```

---

## 文件下载处理

```javascript
// 通用文件下载函数
const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

// 使用示例
const handleExport = async () => {
  const blob = await exportBookmarks()
  downloadFile(blob, `bookmarks_${new Date().toISOString().split('T')[0]}.json`)
}
```

---

## 错误处理模式

### 在组件中处理错误

```javascript
const handleSubmit = async (values) => {
  try {
    setLoading(true)
    await createBookmark(values)
    message.success('书签创建成功')
    loadBookmarks()
  } catch (error) {
    // 拦截器已处理通用错误
    // 这里处理业务特定错误
    if (error.response?.data?.error) {
      message.error(error.response.data.error)
    }
  } finally {
    setLoading(false)
  }
}
```

### 统一错误处理

```javascript
// 封装 API 调用
const apiCall = async (fn, successMsg, errorMsg) => {
  try {
    const result = await fn()
    if (successMsg) message.success(successMsg)
    return result
  } catch (error) {
    if (errorMsg) message.error(errorMsg)
    throw error
  }
}

// 使用
await apiCall(() => createBookmark(data), '创建成功', '创建失败')
```

---

## Vite 代理配置

```javascript
// vite.config.js
export default defineConfig({
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
```

### 代理作用

- 开发环境解决跨域问题
- 将 `/api/*` 请求代理到后端服务
- 生产环境需要 Nginx 配置

---

## 完整 API 模块示例

```javascript
// services/api.js
import axios from 'axios'
import { message } from 'antd'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isVerifyPasswordEndpoint = error.config?.url?.includes('/auth/verify-password')

    if (error.response?.status === 401 && !isVerifyPasswordEndpoint) {
      message.error('登录已过期，请重新登录')
      localStorage.removeItem('token')
      window.location.href = '/login'
    } else if (error.response?.status >= 500) {
      message.error('服务器错误，请稍后重试')
    }
    return Promise.reject(error)
  }
)

export default api
```
