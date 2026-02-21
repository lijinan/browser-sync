# Web 客户端概览

> Level 2 文档 - 前端模块整体说明

---

## 模块信息

| 属性 | 值 |
|------|-----|
| **路径** | `web-client/` |
| **技术栈** | React 18 + Vite + Ant Design |
| **端口** | 3002 |
| **入口文件** | [src/main.jsx](../../web-client/src/main.jsx) |

---

## 目录结构

```
web-client/
├── src/
│   ├── main.jsx              # 应用入口
│   ├── App.jsx               # 根组件 (路由配置)
│   ├── index.css             # 全局样式
│   ├── pages/                # 页面组件
│   │   ├── Dashboard.jsx     # 仪表盘
│   │   ├── Bookmarks.jsx     # 书签管理
│   │   ├── Passwords.jsx     # 密码管理
│   │   ├── Login.jsx         # 登录页
│   │   ├── Register.jsx      # 注册页
│   │   └── ImportExport.jsx  # 导入导出
│   ├── components/
│   │   └── Layout/
│   │       └── AppLayout.jsx # 主布局
│   ├── contexts/             # React Context
│   │   ├── AuthContext.jsx   # 认证状态
│   │   └── ThemeContext.jsx  # 主题状态
│   ├── services/
│   │   └── api.js            # Axios 实例
│   └── hooks/
│       └── useKeyboardShortcuts.js  # 快捷键
├── dist/                     # 构建输出
├── vite.config.js            # Vite 配置
├── package.json              # 依赖配置
└── index.html                # HTML 模板
```

---

## 核心模块

### 页面组件

| 页面 | 文件 | 路由 | 说明 |
|------|------|------|------|
| 仪表盘 | [pages/Dashboard.jsx](../../web-client/src/pages/Dashboard.jsx) | `/dashboard` | 统计概览 |
| 书签管理 | [pages/Bookmarks.jsx](../../web-client/src/pages/Bookmarks.jsx) | `/bookmarks` | 书签 CRUD |
| 密码管理 | [pages/Passwords.jsx](../../web-client/src/pages/Passwords.jsx) | `/passwords` | 密码 CRUD |
| 登录 | [pages/Login.jsx](../../web-client/src/pages/Login.jsx) | `/login` | 用户登录 |
| 注册 | [pages/Register.jsx](../../web-client/src/pages/Register.jsx) | `/register` | 用户注册 |
| 导入导出 | [pages/ImportExport.jsx](../../web-client/src/pages/ImportExport.jsx) | `/import-export` | 数据导入导出 |

### 状态管理

| Context | 文件 | 说明 |
|---------|------|------|
| AuthContext | [contexts/AuthContext.jsx](../../web-client/src/contexts/AuthContext.jsx) | 用户认证状态 |
| ThemeContext | [contexts/ThemeContext.jsx](../../web-client/src/contexts/ThemeContext.jsx) | 主题切换 |

### 服务

| 服务 | 文件 | 说明 |
|------|------|------|
| API | [services/api.js](../../web-client/src/services/api.js) | Axios HTTP 客户端 |

---

## 路由结构

```javascript
// App.jsx 路由配置
<Routes>
  {/* 公开路由 */}
  <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
  <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
  
  {/* 受保护路由 */}
  <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
    <Route index element={<Navigate to="/dashboard" />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="bookmarks" element={<Bookmarks />} />
    <Route path="passwords" element={<Passwords />} />
    <Route path="import-export" element={<ImportExport />} />
  </Route>
</Routes>
```

---

## 组件层级

```
App
├── ThemeProvider
│   └── AuthProvider
│       └── Layout
│           ├── PublicRoute
│           │   ├── Login
│           │   └── Register
│           └── ProtectedRoute
│               └── AppLayout
│                   ├── Sider (侧边栏)
│                   ├── Header (顶部栏)
│                   └── Content
│                       ├── Dashboard
│                       ├── Bookmarks
│                       ├── Passwords
│                       └── ImportExport
```

---

## 认证流程

```
┌─────────────┐
│   登录页面   │
│   Login.jsx │
└──────┬──────┘
       │ POST /api/auth/login
       ▼
┌─────────────┐
│  获取 Token │
│  存储 Token │
└──────┬──────┘
       │ localStorage.setItem('token')
       ▼
┌─────────────┐
│ AuthContext │
│  更新状态   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  跳转首页   │
│  /dashboard │
└─────────────┘
```

---

## API 请求流程

```
组件调用 API
      │
      ▼
┌─────────────┐
│ api.js      │
│ 请求拦截器  │ ─── 添加 Token 到 Header
└─────────────┘
      │
      ▼
┌─────────────┐
│  后端 API   │
└─────────────┘
      │
      ▼
┌─────────────┐
│ 响应拦截器  │ ─── 处理 401 错误
└─────────────┘
      │
      ├── 401 ──► 清除 Token, 跳转登录
      │
      └── 成功 ──► 返回数据
```

---

## 依赖包

### 生产依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| react | ^18.2.0 | UI 框架 |
| react-dom | ^18.2.0 | React DOM 渲染 |
| react-router-dom | ^6.15.0 | 路由管理 |
| axios | ^1.5.0 | HTTP 客户端 |
| antd | ^5.8.6 | UI 组件库 |
| @ant-design/icons | ^5.2.6 | 图标库 |
| crypto-js | ^4.1.1 | 加密工具 |
| js-cookie | ^3.0.5 | Cookie 管理 |

### 开发依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| vite | ^4.4.9 | 构建工具 |
| @vitejs/plugin-react | ^4.0.4 | React 插件 |

---

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 预览构建
npm run preview

# 代码检查
npm run lint
```

---

## Vite 配置

```javascript
// vite.config.js
export default defineConfig({
  plugins: [react()],
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

## 详细文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 页面组件 | [pages.md](pages.md) | 各页面详细说明 |
| 状态管理 | [contexts.md](contexts.md) | Context 详细说明 |
| API 服务 | [services.md](services.md) | API 服务详细说明 |
