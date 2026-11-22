# Picklist Group

- 2026-11-23：只维护 main 和 strategy-template。strategy-2026 的最后提交归档于 archive/strategy-2026 标签，本地未提交内容保留在归档工作区。
- main 2026.1.81 与 strategy-template 0.0.15 都用 Cloudflare D1 作为 Worker 业务数据库。生产 Group 储存在现有 app_settings，写入通过 Durable Object。模板使用独立配置，打包测试默认为占位资源，不执行自动部署。
- 本地 Worker 已验证权限、撤权、并发保存和提交快照。上线前确认飞书应用读取和目录可见范围；模板部署需先配置赛季专用 Worker、D1、R2 和 Scout Worker。
- 2026-11-23：Picklist 选人改用 Cyber Pit 的飞书通讯录查询流程，优先部门遍历，支持部门 ID 类型切换、逐级递归与应用可见范围回退。飞书不可用时显示 Strategy 已登录成员。main 2026.1.82；strategy-template 0.0.16，仅 main 跟随 GitHub Actions 部署。
