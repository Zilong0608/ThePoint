# 使用 Render 部署 THE POINT

## 先解释“自动断开”

如果你使用 Free Web Service，连续 15 分钟无访问后会休眠，下一次访问时重新启动，通常需要约一分钟。这是免费实例规则，不等于代码崩溃。免费额度耗尽或进程异常也可能导致服务不可用；应在 Dashboard 的 Events、Logs 和 Billing 中核对实际原因。

免费实例还有两个与本项目直接相关的限制：不能挂持久磁盘；重启、休眠、重新部署会丢失本地 SQLite 和上传文件。它还封锁常见 SMTP 端口 25、465、587，因此当前 SMTP 发信方案也不能直接按默认端口在免费实例上使用。

官方说明：https://render.com/docs/free

## 当前建议：付费 Web Service + 持久磁盘

保留现有 SQLite，不需要额外开一个 PostgreSQL 服务。付费计算实例取消免费实例的闲置休眠限制，磁盘负责保存数据库、上传图片和本地备份。二者是不同配置：单纯升级实例但不挂磁盘，仍不能持久保存本地数据。

磁盘只保证挂载路径内的数据持久化；它不是异机备份。此方案只运行一个实例；挂盘服务的重新部署仍可能有短暂中断，不能当作零停机方案。

官方说明：https://render.com/docs/disks

## 从 GitHub 创建服务

本次代码位于 `Zilong0608/ThePoint` 的 `feature/ads-and-vendor-roles` 分支。

在 Render 新建 **Web Service**，选择仓库与上述分支。因为仓库也包含 Dockerfile，手动创建时请明确选择 **Node** 运行环境；不要选择 Static Site。

| 配置 | 值 |
|---|---|
| Root Directory | 留空，项目根目录 |
| Runtime | Node |
| Node 版本 | 根目录 `.node-version` 指定 24 |
| Region | Singapore，或自行决定；创建后不能直接修改 |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |
| Instance | 选择支持持久磁盘的付费计算实例 |
| Disk Mount Path | `/var/data` |
| Disk Size | 初期可从 1 GB 开始，留意上传图片及备份占用 |

必填环境变量：

```ini
NODE_ENV=production
TP_DATA_DIR=/var/data
TP_BACKUP_DIR=/var/data/backups
TP_AUTO_BACKUP=1
COOKIE_SECURE=1
TRUST_PROXY=1
ADMIN_INITIAL_PASSWORD=自行设置至少12位的新密码
```

Render 自动提供 `PORT` 和 `RENDER_EXTERNAL_URL`，不需要照抄本地 `.env` 中的 `PORT=3000` 或 `PUBLIC_SITE_URL=http://localhost:3000`。应用在未手工配置站点 URL 时会使用 Render 的 HTTPS 地址。绑定正式域名后再填写正式 `PUBLIC_SITE_URL`，同时核对后台的站点 URL。

不要将 SMTP 密码、API Key 或生产管理员密码放进 GitHub。SMTP 配置可在部署后填写。

## 也可以使用 Blueprint

仓库根目录的 `render.yaml` 已声明 Node 服务、健康检查和 `/var/data` 持久磁盘。在 Render 的 Blueprint 创建流程选择本分支并审阅配置；提示时自行填写管理员初始密码。

**应用该模板会创建付费服务和磁盘。** 本次仅准备并上传配置，没有在 Render 开通服务或产生费用。套餐和价格以创建时控制台为准。模板默认关闭自动部署，先迁移并验收数据，再决定是否开启按提交自动部署。

模板使用当前官方 Blueprint 文档中的 `0.5c-512mb` 计算规格；控制台展示名称可能不同。如套餐规格调整，按官方文档和账户可用选项更新。

参考：https://render.com/docs/blueprint-spec

## 现有三套房源需要单独迁移

GitHub 上传的是代码，**不含 `storage/data.sqlite`、上传图片和备份**。因此新服务首次启动时是空业务数据库，不会自动显示本地三套房源。不要因此再把数据库提交到 GitHub。

迁移步骤：

1. 本地执行 `npm run backup`，取得完整快照目录，并用 `node scripts/backup.js verify "备份目录"` 校验。
2. 在新 Render 服务尚未对外正式使用时，通过该服务的 SSH/SCP 或控制台支持的安全传输方式，将完整快照传到持久磁盘的独立目录，例如 `/var/data/imports/initial`。保留整个目录结构。
3. 在 Render Shell 中执行 `node scripts/backup.js verify /var/data/imports/initial`。
4. 还原到新的空目录：`node scripts/backup.js restore /var/data/imports/initial /var/data/live`。不要覆盖运行中的 SQLite 文件。
5. 在 Render 环境变量中将 `TP_DATA_DIR` 改为 `/var/data/live`，保持 `TP_BACKUP_DIR=/var/data/backups`，保存并重新部署。两者都在挂载磁盘内。
6. 恢复的是已有数据库，管理员密码也随原库恢复；不是刚创建空库时设置的初始密码。请修改为自己的正式密码。
7. 检查 Albany 2 套、Dairy Flat 1 套、图片、账号和后台权限；再次重启验证数据仍然存在。

数据目录迁移后，若继续使用 Blueprint，同步修改 `render.yaml` 的 `TP_DATA_DIR`，避免下一次同步把路径改回空库目录。旧空库先保留用于核对，确认无误后再单独清理。

安全传输参考：https://render.com/docs/disks#transferring-files

## 如何区分故障

- 空闲后第一次访问慢，稍后恢复：先核对是否为免费实例休眠。
- 日志出现程序异常、内存超限或反复重启：需要看具体错误，不是只靠付费就一定解决。
- 服务显示 Suspended：检查额度、账单或平台通知。
- 重启后内容消失：核对持久磁盘，以及 `TP_DATA_DIR` 和上传目录是否位于挂载路径内。

付费服务和持久磁盘也需要监控、独立备份与容量管理。当前没有访问你的 Render 账户或日志，因此不能替某一次历史中断确定原因。
