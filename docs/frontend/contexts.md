# 前端状态管理

> Level 3 文档 - React Context 详细说明

---

## Context 列表

| Context | 文件 | 说明 |
|---------|------|------|
| AuthContext | [contexts/AuthContext.jsx](../../web-client/src/contexts/AuthContext.jsx) | 用户认证状态 |
| ThemeContext | [contexts/ThemeContext.jsx](../../web-client/src/contexts/ThemeContext.jsx) | 主题切换 |

---

## AuthContext

### 功能说明

管理用户认证状态，提供登录、登出、用户信息等功能。

### Provider 结构

```javascript
// contexts/AuthContext.jsx
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 初始化时检查 Token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      loadUserInfo();
    } else {
      setLoading(false);
    }
  }, []);

  // 加载用户信息
  const loadUserInfo = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data.user);
    } catch (error) {
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  // 登录
  const login = (userData) => {
    setUser(userData);
  };

  // 登出
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

### 导出的值

| 属性/方法 | 类型 | 说明 |
|-----------|------|------|
| user | object/null | 当前用户信息 |
| loading | boolean | 加载状态 |
| login | function | 登录方法 |
| logout | function | 登出方法 |
| isAuthenticated | boolean | 是否已认证 |

### 用户对象结构

```javascript
user = {
  id: number,      // 用户 ID
  name: string,    // 用户名
  email: string    // 邮箱
};
```

### 使用示例

```javascript
import { useAuth } from '../contexts/AuthContext';

const MyComponent = () => {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return (
    <div>
      <p>欢迎, {user.name}</p>
      <button onClick={logout}>退出登录</button>
    </div>
  );
};
```

### 路由保护

```javascript
// App.jsx
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>加载中...</div>;
  }
  
  return user ? children : <Navigate to="/login" />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>加载中...</div>;
  }
  
  return user ? <Navigate to="/dashboard" /> : children;
};
```

---

## ThemeContext

### 功能说明

管理应用主题，支持亮色/暗色模式切换。

### Provider 结构

```javascript
// contexts/ThemeContext.jsx
const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    // 从 localStorage 读取主题设置
    const saved = localStorage.getItem('theme');
    return saved === 'dark';
  });

  // 切换主题
  const toggleTheme = () => {
    setIsDark(prev => {
      const newValue = !prev;
      localStorage.setItem('theme', newValue ? 'dark' : 'light');
      return newValue;
    });
  };

  // 应用主题
  useEffect(() => {
    document.body.className = isDark ? 'dark-theme' : 'light-theme';
  }, [isDark]);

  const value = {
    isDark,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
```

### 导出的值

| 属性/方法 | 类型 | 说明 |
|-----------|------|------|
| isDark | boolean | 是否暗色主题 |
| toggleTheme | function | 切换主题 |

### 使用示例

```javascript
import { useTheme } from '../contexts/ThemeContext';
import { Switch } from 'antd';

const ThemeToggle = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <Switch
      checked={isDark}
      onChange={toggleTheme}
      checkedChildren="暗"
      unCheckedChildren="亮"
    />
  );
};
```

### 主题样式

```css
/* index.css */
.light-theme {
  --bg-color: #ffffff;
  --text-color: #333333;
}

.dark-theme {
  --bg-color: #1a1a1a;
  --text-color: #ffffff;
}

body {
  background-color: var(--bg-color);
  color: var(--text-color);
}
```

---

## Context 嵌套结构

```javascript
// App.jsx
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Layout>
          {/* 应用内容 */}
        </Layout>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

---

## 最佳实践

### 1. 在组件顶层使用 Provider

```javascript
// 正确
<AuthProvider>
  <App />
</AuthProvider>

// 错误 - 在组件内部使用
const App = () => {
  return (
    <AuthProvider>  {/* 不要这样做 */}
      <Routes>...</Routes>
    </AuthProvider>
  );
};
```

### 2. 使用自定义 Hook 访问 Context

```javascript
// 正确
const { user } = useAuth();

// 不推荐
const { user } = useContext(AuthContext);
```

### 3. 处理加载状态

```javascript
const MyComponent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <Spin />;
  }

  // 渲染内容
};
```

### 4. Token 持久化

```javascript
// 登录时存储
localStorage.setItem('token', token);

// 登出时清除
localStorage.removeItem('token');

// 初始化时检查
const token = localStorage.getItem('token');
```
