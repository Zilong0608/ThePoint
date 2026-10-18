# THE POINT 一点

网站前台、管理后台和 API。当前使用 Node.js、Express、SQLite 与本地图片存储。

## 启动

安装 Node.js 22.13 或以上版本，在项目根目录执行：

```sh
npm ci
npm start
```

- 网站：http://localhost:3000
- 管理后台：http://localhost:3000/admin/
- Windows PowerShell 如限制 npm 脚本，可使用 `npm.cmd start`。
- 根目录 `server.js` 是稳定启动入口，也支持 `node server.js`。

首次新建数据库会创建板块、分类、地区和管理员，不会填充示例房源、账号、商家或文章。生产环境首次启动必须提供至少 12 位的 `ADMIN_INITIAL_PASSWORD`；已有数据库使用原有账号，不会重置密码。

## 目录

```text
public/                  浏览器可访问的前端文件，网址保持不变
  admin/                 管理后台
  media/                 站点图片和品牌资源
  vendor/leaflet/         固定版本的第三方地图库及许可证
src/                     服务器代码，不对浏览器公开
  config/                配置与数据路径
  database/              建表、迁移、基础分类初始化
  domain/                房源和发布时间规则
  routes/                已独立的房源和后台内容路由
  security/              密码与后台角色权限
  services/              地址定位和详情页初始渲染
  app.js                 Express 组装、其余业务路由及启动
scripts/                 备份、校验等维护命令
tests/                   自动化回归测试；样本仅写入临时数据库
docs/                    部署、上线清单和架构说明
storage/                 私有数据库、上传图片和备份，不提交代码仓库
server.js                启动入口
.env.example             配置模板，不含真实密钥
```

## 配置与数据

默认使用 `storage/data.sqlite`、`storage/uploads/` 和 `storage/backups/`。现有数据已迁入该目录，不需要重新导入。`public/media/` 是随代码发布的站点资源，不能作为缓存删除。

需要设置邮件或正式域名时，将 `.env.example` 复制为 `.env` 后修改；服务启动会读取它。已有进程环境变量优先。后台保存的站点和 SMTP 配置优先于环境变量，修改后需检查后台设置。`TP_DATA_DIR` 可指定独立目录，改目录之前必须迁移数据库与上传图片。

**不要直接打开 HTML 文件或只启动静态文件服务器。** 登录、后台保存、收藏、地图搜索等功能需要 Node 服务。

## 常用命令

```sh
npm run dev           # 修改后自动重启
npm run check         # JavaScript 语法检查
npm test              # 隔离数据库回归测试
npm run test:browser  # Chrome / Edge 浏览器回归
npm run backup        # 一致性数据库快照、上传图片及校验清单
```

测试不会读写 `storage/` 的业务数据库，也不会向公共地图服务发送测试地址或批量请求底图。测试数据运行后自动清除；截图仅在显式使用 `--capture` 时生成到被忽略的 `.preview/`。

## 上线文档

- [按顺序完成上线准备](docs/LAUNCH_CHECKLIST.md)
- [域名、发信、HTTPS 与异机备份](docs/上线配置说明.md)
- [部署与恢复](docs/DEPLOYMENT.md)
- [Render 部署与休眠说明](docs/RENDER.md)
- [代码结构与维护约定](docs/ARCHITECTURE.md)
- [此次目录与数据清理记录](docs/CLEANUP_REPORT.md)

目前主要业务功能已实现。本地回归通过不代表已经完成公网部署、真实邮件投递、异机备份或生产环境验收。
