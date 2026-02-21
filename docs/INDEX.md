# 文档索引

> 渐进式分层次 AI 文档导航

---

## 文档层级说明

| 层级 | 说明 | 目标读者 |
|------|------|----------|
| **Level 1** | 系统概览 | 了解项目整体架构 |
| **Level 2** | 模块说明 | 理解各组件职责 |
| **Level 3** | 组件详情 | 深入具体实现 |
| **Level 4** | 函数/接口 | 开发参考 |

---

## 快速导航

### 系统级文档 (Level 1)

| 文档 | 路径 | 说明 |
|------|------|------|
| 系统概览 | [system/overview.md](system/overview.md) | 项目架构、技术栈、数据流 |
| 项目清单 | [manifest.json](manifest.json) | 结构化项目元数据 |

### 模块文档 (Level 2-3)

| 模块 | 路径 | 说明 |
|------|------|------|
| 后端服务 | [backend/](backend/) | API 服务、路由、中间件 |
| Web 客户端 | [frontend/](frontend/) | 页面组件、状态管理 |
| 浏览器扩展 | [extension/](extension/) | 扩展脚本、权限配置 |

### 数据文档 (Level 2-3)

| 文档 | 路径 | 说明 |
|------|------|------|
| 数据模型 | [database/schema.md](database/schema.md) | 表结构、关系 |
| API 参考 | [api/](api/) | REST API 接口文档 |

---

## 按角色导航

### 新开发者

1. [系统概览](system/overview.md) - 了解项目整体
2. [后端概览](backend/overview.md) - 理解 API 结构
3. [前端概览](frontend/overview.md) - 理解页面结构
4. [API 参考](api/README.md) - 查阅接口

### 后端开发者

1. [后端概览](backend/overview.md)
2. [路由模块](backend/routes.md)
3. [中间件](backend/middleware.md)
4. [WebSocket 服务](backend/websocket.md)
5. [数据库模型](database/schema.md)

### 前端开发者

1. [前端概览](frontend/overview.md)
2. [页面组件](frontend/pages.md)
3. [状态管理](frontend/contexts.md)
4. [API 服务](frontend/services.md)

### 扩展开发者

1. [扩展概览](extension/overview.md)
2. [后台脚本](extension/background.md)
3. [内容脚本](extension/content.md)
4. [WebSocket 管理](extension/websocket.md)

---

## 文件结构

```
docs/
├── INDEX.md                    # 本文件 - 文档导航
├── manifest.json               # 项目清单
├── system/
│   └── overview.md             # 系统概览
├── backend/
│   ├── overview.md             # 后端概览
│   ├── routes.md               # 路由模块
│   ├── middleware.md           # 中间件
│   └── websocket.md            # WebSocket 服务
├── frontend/
│   ├── overview.md             # 前端概览
│   ├── pages.md                # 页面组件
│   ├── contexts.md             # 状态管理
│   └── services.md             # API 服务
├── extension/
│   ├── overview.md             # 扩展概览
│   ├── background.md           # 后台脚本
│   ├── content.md              # 内容脚本
│   └── websocket.md            # WebSocket 管理
├── database/
│   └── schema.md               # 数据模型
└── api/
    ├── README.md               # API 概览
    ├── auth.md                 # 认证接口
    ├── bookmarks.md            # 书签接口
    ├── passwords.md            # 密码接口
    └── import-export.md        # 导入导出接口
```
