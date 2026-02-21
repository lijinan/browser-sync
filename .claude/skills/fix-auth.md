# 修复认证模块 Bug

> 专门用于诊断和修复用户认证相关的 bug

---

## 使用场景

当遇到以下问题时使用此 skill：
- 用户无法登录或注册
- Token 验证失败
- JWT 相关错误
- 密码验证问题
- 认证中间件错误

---

## 相关文件

| 类型 | 文件路径 | 说明 |
|------|----------|------|
| 后端路由 | [backend/src/routes/auth.js](../../../backend/src/routes/auth.js) | 认证 API 路由 |
| 中间件 | [backend/src/middleware/auth.js](../../../backend/src/middleware/auth.js) | JWT 验证中间件 |
| 前端页面 | [web-client/src/pages/Login.jsx](../../../web-client/src/pages/Login.jsx) | 登录页面 |
| 前端页面 | [web-client/src/pages/Register.jsx](../../../web-client/src/pages/Register.jsx) | 注册页面 |
| 状态管理 | [web-client/src/contexts/AuthContext.jsx](../../../web-client/src/contexts/AuthContext.jsx) | 认证状态管理 |
| API 服务 | [web-client/src/services/api.js](../../../web-client/src/services/api.js) | API 请求拦截器 |

---

## 常见 Bug 与修复

### 1. Token 验证失败 (401/403)

**症状：**
```
错误: 无效的访问令牌
状态码: 403
```

**可能原因：**
- JWT Token 过期
- JWT_SECRET 配置不一致
- Token 格式错误

**修复步骤：**
1. 检查后端 `.env` 中的 `JWT_SECRET` 配置
2. 检查前端请求头中的 Token 格式：`Authorization: Bearer <token>`
3. 检查 Token 是否正确存储在 localStorage

**相关代码位置：**
- 后端：[backend/src/middleware/auth.js:36-72](../../../backend/src/middleware/auth.js#L36-L72)
- 前端：[web-client/src/services/api.js:41-52](../../../web-client/src/services/api.js#L41-L52)

---

### 2. 登录请求返回 400 错误

**症状：**
```
错误: 参数验证失败
```

**可能原因：**
- 请求参数不满足 Joi 验证规则
- 缺少必填字段

**修复步骤：**
1. 检查请求参数是否包含 email/username 和 password
2. 检查密码长度是否 ≥ 8 字符
3. 检查邮箱格式是否正确

**验证规则：**
```javascript
// backend/src/routes/auth.js
const loginSchema = Joi.object({
  email: Joi.string().optional(),
  username: Joi.string().optional(),
  password: Joi.string().required()
}).or('email', 'username');
```

---

### 3. 密码对比失败

**症状：**
```
登录返回 401: 邮箱或密码错误
```

**可能原因：**
- 密码哈希轮数不匹配
- bcrypt.compare 执行失败

**修复步骤：**
1. 确认数据库中存储的是 bcrypt 哈希值
2. 检查哈希轮数是否为 12 轮
3. 检查 compare 方法是否正确使用

**相关代码：**
```javascript
// backend/src/routes/auth.js
const isValidPassword = await bcrypt.compare(password, user.password);
```

---

### 4. 注册时邮箱已存在

**症状：**
```
错误: 数据已存在
状态码: 409
```

**修复步骤：**
1. 检查数据库 `users` 表的 `email` 唯一约束
2. 在注册前检查邮箱是否已存在
3. 返回友好的错误提示

---

### 5. JWT 用户 ID 兼容性问题

**症状：**
```
错误: 用户不存在 / userId 为 undefined
```

**可能原因：**
- JWT Token 中 userId 字段名不统一（id vs userId）

**修复代码：**
```javascript
// backend/src/middleware/auth.js
const userId = decoded.id || decoded.userId;
```

---

### 6. 401 自动跳转死循环

**症状：**
登录页面不断刷新，无法正常显示

**可能原因：**
- API 响应拦截器在登录页也触发跳转
- Token 过期后未正确清除

**修复步骤：**
1. 检查 [api.js](../../../web-client/src/services/api.js#L74-L92) 中的 401 处理逻辑
2. 确保当前页面是 /login 时不跳转
3. 检查 AuthContext 的 loading 状态处理

**修复代码：**
```javascript
// web-client/src/services/api.js
if (error.response?.status === 401 && !isVerifyPasswordEndpoint) {
  // 检查当前不在登录页
  if (window.location.pathname !== '/login') {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }
}
```

---

### 7. 二次密码验证失败

**症状：**
查看密码详情时验证失败

**相关代码：**
- 后端：[backend/src/routes/auth.js](../../../backend/src/routes/auth.js) 中的 `/verify-password` 路由
- 前端：需要确保此接口的 401 错误不触发跳转

---

## 调试技巧

### 后端调试

```bash
# 查看 JWT Token 内容
node -e "console.log(require('jsonwebtoken').decode('your_token_here'))"

# 检查环境变量
cd backend && cat .env | grep JWT
```

### 前端调试

```javascript
// 浏览器控制台
console.log('Token:', localStorage.getItem('token'))
console.log('User:', JSON.parse(localStorage.getItem('user')))
```

---

## 环境变量检查清单

```bash
# backend/.env
JWT_SECRET=your-jwt-secret-key-here
JWT_EXPIRES_IN=7d
```

---

## 数据库检查

```sql
-- 检查用户是否存在
SELECT id, email, name FROM users WHERE email = 'user@example.com';

-- 检查密码哈希格式
SELECT id, email, substring(password, 1, 20) as pwd_hash FROM users LIMIT 1;
```
