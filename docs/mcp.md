# MCP 接入

在**设置 → MCP 接入**创建令牌，将当前账号可访问的网站统计提供给 MCP 客户端。此功能适用于自托管部署，无需提供账号密码给客户端。

## 创建连接

1. 填写令牌名称，选择至少一个网站和有效期。默认有效期为 30 天，最长 365 天。
2. 默认只授予 `analytics:read`。按需要添加访问明细或事件规则编辑权限。
3. 创建后立即复制完整令牌。它只在当前页面显示一次，不写入 localStorage 或 sessionStorage；隐藏或刷新后无法从管理页面再次查看。遗失时撤销旧令牌并重新创建。
4. 在支持 **Streamable HTTP** 和自定义请求头的客户端中配置：

| 配置项 | 值 |
| --- | --- |
| 服务器地址 | 设置页显示的完整地址，例如 `https://analytics.example.com/api/mcp` |
| 传输方式 | Streamable HTTP |
| 请求头 | `Authorization: Bearer <MCP_TOKEN>` |

部署了 `BASE_PATH` 时，应直接复制设置页地址，其中已包含该路径。客户端自行完成 MCP 初始化和协议版本协商，然后调用 `connection_status` 验证账号与权限，调用 `list_websites` 查看授权网站。

当前使用独立的 Bearer 令牌，不提供 OAuth 授权发现或登录流程。仅支持 OAuth、不能设置请求头的客户端暂不能直接连接。HTTP 接口使用无状态 JSON 响应，不提供独立的 GET 事件订阅流。

## 权限与工具

| 权限 | 可用能力 |
| --- | --- |
| `analytics:read`（默认） | 连接检查、网站列表、概览、时序、流量、新老访客与互动度、事件统计、页面排名、地域分布、读取事件绑定规则 |
| `sessions:read`（可选） | 分页访问明细，包含 IP 地址 |
| `event-rules:write`（可选） | 创建、修改、删除事件绑定规则；同时要求账号仍有网站编辑权限 |

只读工具包括 `connection_status`、`list_websites`、`get_overview`、`get_time_series`、`get_traffic`、`get_engagement`、`get_events`、`get_pages`、`get_geography`、`list_event_rules`。附加工具为 `get_sessions`、`create_event_rule`、`update_event_rule`、`delete_event_rule`。

统计查询使用 ISO 8601 起止时间，可指定 IANA 时区；单次日期范围最长 5 年（1830 天），支持最近 24 个月的月度流量分析。时序查询仍受分桶数量限制，长时间范围请使用日、周或月粒度。排名和访问列表分页返回。新老访客基于现存页面浏览记录及轮换的访客身份，不代表永久身份识别。

每个令牌最多授权 100 个网站，每个账号最多 20 个有效令牌。每次工具调用重新检查有效期、撤销状态、网站范围和账号当前权限。移出团队、网站删除或权限收回后，旧令牌不会保留相应访问权限。

## 撤销与故障排查

在令牌列表中核对权限、有效期和网站数量；将鼠标移到网站数量可查看网站名称。点击**撤销**后，后续请求立即失效。列表只展示令牌标识前缀，不会返回完整令牌或数据库中的令牌摘要。

- **HTTP 401**：令牌缺失、已撤销、过期，或使用了账号登录令牌。请使用该页面生成的 `xlist_mcp_` 令牌。
- **HTTP 403 / Origin 不允许**：浏览器来源未获允许。运维可在 `MCP_ALLOWED_ORIGINS` 配置允许的完整来源，以逗号分隔，例如 `https://client.example.com`，重启服务生效。不带 Origin 的桌面或服务端客户端无需该配置。
- **HTTP 400 / 413**：检查 JSON 请求及协议格式；单次 MCP 请求体不得超过 64 KiB。
- **HTTP 200，但工具结果 `isError: true`**：连接已认证，工具执行失败。查看返回的 `content` 文字；常见原因是缺少权限、网站不在授权范围、账号已失去网站权限，或时间范围超限。HTTP 200 不代表工具执行成功。
- **JSON-RPC `error`**：检查工具名称、参数类型和必填项，并依据返回的错误说明修正。

API 路由：`GET/POST /api/me/mcp-tokens` 管理本人令牌，`DELETE /api/me/mcp-tokens/:id` 撤销，`POST /api/mcp` 执行 MCP 请求。管理接口要求完成登录，统计分享链接和未完成双重验证的临时凭证不能创建令牌。

## 反向代理

MCP 与令牌管理路由必须保留应用返回的 `Cache-Control: no-store` 和来源校验结果。不要给它们统一覆盖 `Access-Control-Allow-Origin: *`，也不要由代理直接响应全部 OPTIONS 请求。

本项目部署环境的 Nginx 已为 `/api/mcp` 和 `/api/me/mcp-tokens` 增加独立转发规则，将跨域和鉴权响应交给应用处理。迁移部署时，应一并检查反向代理和 CDN 的响应头规则。
