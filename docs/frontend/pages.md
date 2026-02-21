# 前端页面组件

> Level 3 文档 - 页面组件详细说明

---

## 页面列表

| 页面 | 文件 | 路由 | 访问权限 |
|------|------|------|----------|
| 登录 | [Login.jsx](../../web-client/src/pages/Login.jsx) | `/login` | 公开 |
| 注册 | [Register.jsx](../../web-client/src/pages/Register.jsx) | `/register` | 公开 |
| 仪表盘 | [Dashboard.jsx](../../web-client/src/pages/Dashboard.jsx) | `/dashboard` | 需登录 |
| 书签管理 | [Bookmarks.jsx](../../web-client/src/pages/Bookmarks.jsx) | `/bookmarks` | 需登录 |
| 密码管理 | [Passwords.jsx](../../web-client/src/pages/Passwords.jsx) | `/passwords` | 需登录 |
| 导入导出 | [ImportExport.jsx](../../web-client/src/pages/ImportExport.jsx) | `/import-export` | 需登录 |

---

## 登录页 (Login.jsx)

### 功能说明

用户登录界面，支持邮箱/用户名登录。

### 核心逻辑

```javascript
// 登录流程
const handleLogin = async (values) => {
  // 1. 调用登录 API
  const response = await api.post('/auth/login', values);
  
  // 2. 存储 Token
  localStorage.setItem('token', response.data.token);
  
  // 3. 更新认证状态
  login(response.data.user);
  
  // 4. 跳转到首页
  navigate('/dashboard');
};
```

### 表单字段

| 字段 | 类型 | 验证规则 |
|------|------|----------|
| email/username | string | 必填 |
| password | string | 必填 |

---

## 注册页 (Register.jsx)

### 功能说明

用户注册界面，创建新用户账号。

### 核心逻辑

```javascript
// 注册流程
const handleRegister = async (values) => {
  // 1. 调用注册 API
  const response = await api.post('/auth/register', values);
  
  // 2. 存储 Token
  localStorage.setItem('token', response.data.token);
  
  // 3. 更新认证状态
  login(response.data.user);
  
  // 4. 跳转到首页
  navigate('/dashboard');
};
```

### 表单字段

| 字段 | 类型 | 验证规则 |
|------|------|----------|
| name | string | 必填，2-50字符 |
| email | string | 必填，邮箱格式 |
| password | string | 必填，最少8字符 |
| confirmPassword | string | 必须与 password 一致 |

---

## 仪表盘 (Dashboard.jsx)

### 功能说明

用户首页，显示统计数据和快捷操作。

### 数据展示

- 书签总数
- 密码总数
- 最近添加的书签
- 最近添加的密码

### 核心逻辑

```javascript
// 加载统计数据
useEffect(() => {
  const loadStats = async () => {
    const [bookmarksRes, passwordsRes] = await Promise.all([
      api.get('/bookmarks'),
      api.get('/passwords')
    ]);
    
    setStats({
      bookmarkCount: bookmarksRes.data.bookmarks.length,
      passwordCount: passwordsRes.data.passwords.length,
      recentBookmarks: bookmarksRes.data.bookmarks.slice(0, 5),
      recentPasswords: passwordsRes.data.passwords.slice(0, 5)
    });
  };
  
  loadStats();
}, []);
```

---

## 书签管理 (Bookmarks.jsx)

### 功能说明

书签的增删改查界面。

### 核心功能

- 书签列表展示
- 搜索过滤
- 添加书签
- 编辑书签
- 删除书签
- 分类管理
- 标签管理

### 状态管理

```javascript
const [bookmarks, setBookmarks] = useState([]);
const [loading, setLoading] = useState(false);
const [searchText, setSearchText] = useState('');
const [selectedFolder, setSelectedFolder] = useState('');
const [modalVisible, setModalVisible] = useState(false);
const [editingBookmark, setEditingBookmark] = useState(null);
```

### CRUD 操作

```javascript
// 获取书签列表
const loadBookmarks = async () => {
  setLoading(true);
  const response = await api.get('/bookmarks');
  setBookmarks(response.data.bookmarks);
  setLoading(false);
};

// 创建书签
const createBookmark = async (values) => {
  await api.post('/bookmarks', values);
  loadBookmarks();
  setModalVisible(false);
};

// 更新书签
const updateBookmark = async (id, values) => {
  await api.put(`/bookmarks/${id}`, values);
  loadBookmarks();
  setModalVisible(false);
};

// 删除书签
const deleteBookmark = async (id) => {
  await api.delete(`/bookmarks/${id}`);
  loadBookmarks();
};
```

### 表格列定义

| 列名 | 字段 | 说明 |
|------|------|------|
| 标题 | title | 书签标题 |
| URL | url | 书签链接 |
| 分类 | folder | 所属文件夹 |
| 标签 | tags | 标签数组 |
| 创建时间 | created_at | 创建日期 |
| 操作 | - | 编辑、删除按钮 |

---

## 密码管理 (Passwords.jsx)

### 功能说明

密码的增删改查界面，支持安全查看密码。

### 核心功能

- 密码列表展示
- 搜索过滤
- 添加密码
- 编辑密码
- 删除密码
- 安全查看密码（需二次验证）
- 复制密码

### 安全特性

```javascript
// 列表不显示实际密码
const passwords = response.data.passwords.map(p => ({
  ...p,
  password: '******'  // 隐藏密码
}));

// 查看密码需要二次验证
const viewPassword = async (id) => {
  // 1. 弹出密码验证框
  const verified = await verifyPassword();
  
  if (verified) {
    // 2. 获取完整密码
    const response = await api.get(`/passwords/${id}`);
    // 3. 显示密码
    showPasswordModal(response.data.password);
  }
};
```

### 表格列定义

| 列名 | 字段 | 说明 |
|------|------|------|
| 网站名称 | site_name | 网站名 |
| 网站地址 | site_url | URL |
| 用户名 | username | 登录用户名 |
| 分类 | category | 密码分类 |
| 创建时间 | created_at | 创建日期 |
| 操作 | - | 查看、编辑、删除 |

---

## 导入导出 (ImportExport.jsx)

### 功能说明

数据的导入导出功能。

### 核心功能

- 导出书签为 JSON
- 导出书签为 HTML (浏览器兼容格式)
- 导入书签 (JSON/HTML)
- 导出密码为 JSON
- 导入密码

### 导出功能

```javascript
// 导出书签 JSON
const exportBookmarks = async () => {
  const response = await api.get('/import-export/bookmarks/export', {
    responseType: 'blob'
  });
  
  // 下载文件
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bookmarks_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
};

// 导出书签 HTML
const exportBookmarksHtml = async () => {
  const response = await api.get('/import-export/bookmarks/export/html', {
    responseType: 'blob'
  });
  
  // 下载文件
  // ...
};
```

### 导入功能

```javascript
// 导入书签
const importBookmarks = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/import-export/bookmarks/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  
  message.success(`成功导入 ${response.data.imported} 个书签`);
};
```

### 支持的文件格式

| 操作 | 格式 | 说明 |
|------|------|------|
| 导出书签 | JSON | 完整数据格式 |
| 导出书签 | HTML | Netscape 书签格式 |
| 导入书签 | JSON | 应用导出格式 |
| 导入书签 | HTML | 浏览器导出格式 |
| 导入书签 | CSV | CSV 格式 |

---

## 布局组件 (AppLayout.jsx)

### 功能说明

应用主布局，包含侧边栏和顶部栏。

### 布局结构

```
┌─────────────────────────────────────────┐
│                  Header                  │
│  [用户信息]              [主题切换] [退出] │
├──────────┬──────────────────────────────┤
│          │                              │
│  Sider   │          Content             │
│          │                              │
│  仪表盘  │      (页面内容区域)           │
│  书签    │                              │
│  密码    │                              │
│  导入导出│                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

### 侧边栏菜单

```javascript
const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/bookmarks', icon: <BookOutlined />, label: '书签管理' },
  { key: '/passwords', icon: <KeyOutlined />, label: '密码管理' },
  { key: '/import-export', icon: <ImportOutlined />, label: '导入导出' }
];
```

### 顶部栏功能

- 用户信息显示
- 主题切换按钮
- 退出登录按钮
