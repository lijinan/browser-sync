# 修复前端 API 服务模块 Bug

> 专门用于诊断和修复前端 API 服务相关的 bug

---

## 使用场景

当遇到以下问题时使用此 skill：
- API 请求失败
- 拦截器错误
- 请求/响应格式错误
- CORS 问题
- Token 注入失败
- 错误处理异常

---

## 相关文件

| 类型 | 文件路径 | 说明 |
|------|----------|------|
| API 服务 | [web-client/src/services/api.js](../../../web-client/src/services/api.js) | Axios 配置 |
| 认证上下文 | [web-client/src/contexts/AuthContext.jsx](../../../web-client/src/contexts/AuthContext.jsx) | 认证状态 |
| Vite 配置 | [web-client/vite.config.js](../../../web-client/vite.config.js) | 代理配置 |

---

## 常见 Bug 与修复

### 1. 401 自动跳转死循环

**症状：**
- 登录页面不断刷新
- 控制台显示无限跳转

**修复代码：**
```javascript
// web-client/src/services/api.js
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isVerifyPasswordEndpoint = error.config?.url?.includes('/auth/verify-password');

    // 检查当前不在登录页
    const isLoginPage = window.location.pathname === '/login';

    if (error.response?.status === 401 && !isVerifyPasswordEndpoint && !isLoginPage) {
      message.error('登录已过期，请重新登录');
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else if (error.response?.status >= 500) {
      message.error('服务器错误，请稍后重试');
    }
    return Promise.reject(error);
  }
);
```

---

### 2. Token 未正确注入

**症状：**
```
后端返回: 访问令牌缺失
```

**修复代码：**
```javascript
// web-client/src/services/api.js
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
```

---

### 3. CORS 错误

**症状：**
```
Access to XMLHttpRequest at 'http://localhost:3001' from origin 'http://localhost:3002'
has been blocked by CORS policy
```

**修复步骤：**

**后端配置：**
```javascript
// backend/src/app.js
const cors = require('cors');

app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('不允许的跨域请求'));
    }
  },
  credentials: true
}));
```

**前端 Vite 代理配置：**
```javascript
// web-client/vite.config.js
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
});
```

---

### 4. 请求超时

**症状：**
```
Error: timeout of 10000ms exceeded
```

**修复代码：**
```javascript
// web-client/src/services/api.js
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,  // 增加到 30 秒
});
```

---

### 5. 响应数据格式不正确

**症状：**
- 无法访问 response.data
- 数据结构不符合预期

**修复代码：**
```javascript
// 标准化响应处理
const handleResponse = (response) => {
  // 后端返回格式: { message, data } 或 { bookmarks, passwords }
  return response.data;
};

api.interceptors.response.use(
  (response) => {
    return handleResponse(response);
  },
  (error) => {
    // 错误处理
    if (error.response) {
      // 服务器响应错误
      return Promise.reject(error.response.data);
    } else if (error.request) {
      // 请求已发送但无响应
      return Promise.reject({ error: '网络错误，请检查连接' });
    } else {
      // 请求配置错误
      return Promise.reject({ error: error.message });
    }
  }
);
```

---

### 6. 文件下载失败

**症状：**
- 导出文件无法下载
- 下载的文件内容异常

**修复代码：**
```javascript
// 正确的文件下载方式
const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// 使用示例
const exportBookmarks = async () => {
  try {
    const response = await api.get('/import-export/bookmarks/export', {
      responseType: 'blob'  // 必须设置
    });
    downloadFile(response.data, `bookmarks_${date}.json`);
  } catch (error) {
    message.error('导出失败');
  }
};
```

---

### 7. FormData 上传失败

**症状：**
- 文件上传请求失败
- 后端无法解析文件

**修复代码：**
```javascript
// 正确的 FormData 设置
const importBookmarks = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/import-export/bookmarks/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'  // 重要
    },
    // 不手动设置 Content-Type，让浏览器自动设置
    // axios 会自动处理 boundary
  });

  return response.data;
};
```

---

### 8. 并发请求问题

**症状：**
- 多个请求同时发出
- 状态更新冲突

**修复代码：**
```javascript
// 使用 Promise.all 并发请求
const loadDashboardData = async () => {
  try {
    const [bookmarksRes, passwordsRes] = await Promise.all([
      api.get('/bookmarks'),
      api.get('/passwords')
    ]);

    return {
      bookmarks: bookmarksRes.bookmarks,
      passwords: passwordsRes.passwords
    };
  } catch (error) {
    message.error('数据加载失败');
    throw error;
  }
};

// 使用请求锁防止重复请求
const requestLocks = new Map();

const lockedRequest = async (key, requestFn) => {
  if (requestLocks.has(key)) {
    return requestLocks.get(key);
  }

  const promise = requestFn().finally(() => {
    requestLocks.delete(key);
  });

  requestLocks.set(key, promise);
  return promise;
};
```

---

### 9. 错误消息重复显示

**症状：**
- 同一个错误显示多次
- 错误消息堆叠

**修复代码：**
```javascript
// 使用防抖或唯一标识
const errorMessages = new Map();

const showError = (error) => {
  const key = error.message || error;

  if (errorMessages.has(key)) {
    return;  // 已显示过，不再重复显示
  }

  message.error(key);
  errorMessages.set(key, true);

  // 3 秒后清除记录
  setTimeout(() => {
    errorMessages.delete(key);
  }, 3000);
};
```

---

## API 调用模式

### 基础模式

```javascript
// 在组件中使用
const { data, error, loading } = useApiCall(() => api.get('/bookmarks'));

if (loading) return <Spin />;
if (error) return <Error message={error} />;
return <BookmarksList data={data} />;
```

### 请求/响应封装

```javascript
// 统一的 API 调用封装
const apiCall = async (fn, options = {}) => {
  const { successMsg, errorMsg, showLoading = true } = options;

  if (showLoading) {
    setLoading(true);
  }

  try {
    const result = await fn();
    if (successMsg) message.success(successMsg);
    return result;
  } catch (error) {
    if (errorMsg) message.error(errorMsg);
    throw error;
  } finally {
    if (showLoading) {
      setLoading(false);
    }
  }
};

// 使用
await apiCall(
  () => api.post('/bookmarks', data),
  { successMsg: '创建成功', errorMsg: '创建失败' }
);
```

---

## 调试技巧

### 查看请求详情

```javascript
// 添加请求日志
api.interceptors.request.use((config) => {
  console.log('API Request:', {
    method: config.method,
    url: config.url,
    data: config.data,
    headers: config.headers
  });
  return config;
});

api.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      status: response.status,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return Promise.reject(error);
  }
);
```

### 浏览器网络面板

```
1. 打开开发者工具 (F12)
2. 切换到 Network 面板
3. 筛选 XHR 请求
4. 查看请求/响应详情
```

---

## 环境变量配置

```javascript
// web-client/vite.config.js
export default defineConfig(({ mode }) => {
  return {
    server: {
      port: 3002,
      proxy: {
        '/api': {
          target: mode === 'production'
            ? 'https://api.example.com'
            : 'http://localhost:3001',
          changeOrigin: true
        }
      }
    }
  };
});
```

---

## 常见 HTTP 状态码处理

```javascript
const statusHandlers = {
  400: '请求参数错误',
  401: '登录已过期',
  403: '权限不足',
  404: '资源不存在',
  409: '数据已存在',
  429: '请求过于频繁',
  500: '服务器错误',
  502: '网关错误',
  503: '服务暂时不可用'
};

const getErrorMessage = (status) => {
  return statusHandlers[status] || '未知错误';
};
```
