# 代码结构与维护约定

## 请求与数据流

`server.js` → `src/app.js` → 数据库初始化、认证、路由、静态资源与异常处理。浏览器通过原有 `/api/...` 接口获取数据；`public/` 下页面路径保持原样，例如 `/properties.html` 和 `/admin/`。

`src/config/paths.js` 统一读取 `.env` 和运行路径。`src/database/schema.js` 建表并补充旧库字段，`bootstrap.js` 只初始化管理员、栏目、分类、地区及兼容迁移，不插入演示业务内容。

`src/domain/` 保存输入校验和业务规则；`src/security/` 管理密码和角色；`src/services/` 提供地图定位、HTML 详情初始渲染。`src/routes/` 通过明确的参数接收数据库和认证等依赖，保持路由注册顺序。尚未拆出的账号、审核、留言等路由集中在 `src/app.js`，后续按业务域逐步拆分。

前台 HTML 页面放在 `public/`，脚本集中在 `public/assets/js/`，样式集中在 `public/assets/css/`。后台页面位于 `public/admin/index.html`，对应脚本和样式分别放在其 `js/`、`css/` 子目录。页面使用从网站根目录开始的资源路径，避免相对路径随目录变化失效。

前后台共用的安全正文渲染器放在 `public/assets/js/content.js`，浏览器直接加载，服务器通过 CommonJS 引入。第三方 Leaflet 文件放在 `public/vendor/leaflet/`，保留许可证，升级时同时核对 package-lock 和打包文件。

## 数据与发布边界

- `public/` 才是静态根目录，后端代码、配置、文档和数据库不作为网站文件发布。额外的路径白名单仍然保留。
- `storage/data.sqlite`、`storage/uploads/` 是私有运行数据，必须一起备份和迁移；`storage/backups/` 存放完整快照。它们均被 Git 和 Docker 构建上下文排除。
- `public/media/` 是原有页面依赖的站点资源，随代码部署；`docs/reference/` 是保留的原始资料，不参与生产构建。
- 网站不再包含 GitHub Pages 演示模式和演示数据导出器。后端为唯一的数据保存入口。
- `tests/fixtures/` 仅供测试显式创建隔离样本，应用不会加载这些文件。Docker 不包含测试目录。

## 修改约定

1. 新业务优先放入对应 domain、service 或 route 模块，避免继续向启动入口堆放实现。
2. 后台权限与服务端校验必须同时生效，不能只隐藏前端按钮。
3. HTML、CSS、JavaScript、JSON 使用 UTF-8、LF；编辑器格式遵循根目录 `.editorconfig`。
4. 路径或接口变动后运行语法检查与接口回归；影响界面、登录或表单时再运行浏览器回归。
5. 测试使用系统临时目录；不要把测试账号、留言或上传文件写入业务数据库。清理数据前先生成并校验完整备份。
6. 整理过程中不改 Git 历史、不自动提交，不把 `.env`、备份和私人用户资料加入仓库。
7. 新增脚本、样式需放入对应资源目录，同时登记 `src/app.js` 的精确静态文件白名单。临时测试使用系统临时目录，项目内预览截图只放 `.preview/`；不要在根目录保留一次性脚本和调试输出。
