# 认证 API

> 认证相关接口详细说明

---

## 用户注册

### 请求

```
POST /api/auth/register
```

### 请求体

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "张三"
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址，需为有效邮箱格式 |
| password | string | 是 | 密码，最少 8 个字符 |
| name | string | 是 | 用户名，2-50 个字符 |

### 成功响应

```json
{
  "message": "注册成功",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "张三"
  }
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 400 | 参数验证失败 |
| 409 | 用户已存在 |

---

## 用户登录

### 请求

```
POST /api/auth/login
```

### 请求体

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

或使用用户名登录：

```json
{
  "username": "张三",
  "password": "password123"
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 否* | 邮箱地址 |
| username | string | 否* | 用户名 |
| password | string | 是 | 密码 |

*email 和 username 至少提供一个

### 成功响应

```json
{
  "message": "登录成功",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "张三"
  }
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 400 | 参数验证失败 |
| 401 | 用户名或密码错误 |

---

## 获取当前用户

### 请求

```
GET /api/auth/me
Authorization: Bearer <token>
```

### 成功响应

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "张三"
  }
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 401 | 访问令牌缺失 |
| 403 | 无效的访问令牌 |

---

## 二次密码验证

用于敏感操作前的密码确认（如查看密码详情）。

### 请求

```
POST /api/auth/verify-password
Authorization: Bearer <token>
```

### 请求体

```json
{
  "password": "password123"
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| password | string | 是 | 当前用户密码 |

### 成功响应

```json
{
  "valid": true,
  "message": "密码验证成功"
}
```

### 错误响应

| 状态码 | 错误信息 |
|--------|----------|
| 400 | 参数验证失败 |
| 401 | 密码错误 |

---

## Token 说明

### JWT Payload

```json
{
  "id": 1,
  "userId": 1,
  "name": "张三",
  "email": "user@example.com",
  "iat": 1704067200,
  "exp": 1704672000
}
```

### Token 有效期

- 默认有效期：7 天
- 配置项：`JWT_EXPIRES_IN`

### Token 刷新

当前版本不提供刷新 Token 接口，Token 过期后需重新登录。
