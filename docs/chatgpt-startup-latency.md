# ChatGPT.app 启动耗时约 50 秒：排查结论

这是一条与门控插件相邻、但不属于插件的排障记录，来自 2026-11 对同一台机器的实测。保留在这里是因为它解释了「为什么设置页会显示地区不可用」，也避免下次重复排查。

## 症状

- 从 Codex++ 启动 `/Applications/ChatGPT.app`，冷启动约 50 秒才可用。
- 设置页「电脑操控 / 浏览器」显示「已被你的组织停用，或在你所在地区不可用」。

## 根因

出口 IP 在中国大陆（河南移动）。启动期间：

- `ab.chatgpt.com` 的 TCP 连接一直超时，累计约 50 秒；
- Statsig 相关域名 `featureassets.org`、`prodregistryv2.org`、`api.statsigcdn.com`、`statsigapi.net`、`cloudflare-dns.com` 返回 403。

功能是否可用是服务端按地区判定的；「不可用」文案由 ChatGPT.app 自己渲染，不是 Codex++ 注入的。

## 当时的修复（用户确认有效）

在 Codex++ 菜单 → 设置 → 启动参数里，每行一个参数：

```
--host-resolver-rules=MAP ab.chatgpt.com 127.0.0.1,MAP featureassets.org 127.0.0.1,MAP prodregistryv2.org 127.0.0.1,MAP api.statsigcdn.com 127.0.0.1,MAP statsigapi.net 127.0.0.1,MAP cloudflare-dns.com 127.0.0.1
--proxy-server=http://127.0.0.1:7890
```

要点：

- `normalize_codex_extra_args`（`crates/codex-plus-core/src/settings.rs`，约 2241 行）不做内容过滤，参数只按换行切分；逗号留在同一个参数里，所以整条 `--host-resolver-rules` 必须写在一行。
- `--host-resolver-rules` **不会**挡住代理流量：hostname 直接交给代理，不做本地 DNS。所以代理开着时全部走 7890；代理关着时 Statsig 域名瞬间失败，启动同样快。两行都要留。
- 旧的 `codexAppFastStartup` 内置快速启动在提交 `056492ec` 里被移除；它的实现（提交 `a114ae5c`，`crates/codex-plus-core/src/launcher.rs` 约 1607 行）就是注入同样的 `--host-resolver-rules` 参数。管理器里的手动启动参数是现在的等价替代。
- 自建门控服务 + `/etc/hosts` 方案不可行（TLS pinning / Statsig 响应校验 / 账号级地区 enforcement），没有继续。

## 验证

```bash
ps -o command= -p $(pgrep -x ChatGPT)          # 确认参数已生效
lsof -nP -a -p <pid> -i TCP                    # 看启动阶段还有没有卡住的连接
curl -x http://127.0.0.1:7890 -m 6 https://chatgpt.com/ -o /dev/null -w '%{http_code}\n'
```

## 与本插件的关系

启动参数解决「启动慢、Statsig 拉不到配置」；本插件解决「配置拉到了但客户端判定仍为不可用」。两者互不替代：

- 不配启动参数：启动慢，Statsig 可能一直拿不到配置；
- 只配启动参数：启动快，但地区/组织判定仍可能让设置页显示不可用；
- 两者都配：启动快，客户端读取门控返回 true，功能入口可用。

服务端仍可能在真正调用功能时做账号级拦截，这种情况下客户端包装无能为力。
