# 已部署服务器升级为纸面+实盘双通道

升级后的端口与服务：

| 用途 | 地址 | systemd服务 | 是否开放公网 |
|---|---|---|---|
| 统一页面入口 | `0.0.0.0:3109` | `trend-executor-gateway` | 当前需要 |
| 内部页面 | `127.0.0.1:3110` | `trend-executor-ui` | 禁止 |
| 纸面引擎 | `127.0.0.1:3111` | `trend-executor-engine` | 禁止 |
| 实盘引擎 | `127.0.0.1:3112` | `trend-executor-live` | 禁止 |

## 升级前必须确认

不要在实盘持仓期间升级。先在Binance确认实盘仓位为0，并在旧页面点击“停止新开仓”。升级会重启本项目服务并清除内存中的API Key，但不会操作Nginx、数据库、Docker或其他服务。

检查新增内部端口没有被占用：

```bash
ss -lntp | grep ':3112\b' || true
```

必须没有输出；如果有输出，停止升级，不要结束该进程。

## 拉取、测试和构建

```bash
cd /opt/trend-executor
git status --short
```

必须没有输出。然后执行：

```bash
git fetch origin
git pull --ff-only origin strategy-review
chown -R trendexec:trendexec /opt/trend-executor

sudo -u trendexec env \
  PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin \
  /opt/trend-runtime/node/bin/npm \
  --prefix /opt/trend-executor/dashboard ci

sudo -u trendexec env \
  PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin \
  /opt/trend-runtime/node/bin/npm \
  --prefix /opt/trend-executor/dashboard test

sudo -u trendexec env \
  PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin \
  /opt/trend-runtime/node/bin/npm \
  --prefix /opt/trend-executor/dashboard run build
```

## 更新纸面引擎

```bash
tee /etc/systemd/system/trend-executor-engine.service >/dev/null <<'EOF'
[Unit]
Description=Trend Executor Paper Engine
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=trendexec
Group=trendexec
WorkingDirectory=/opt/trend-executor/dashboard
Environment=NODE_ENV=production
Environment=ENGINE_MODE=paper
Environment=ENGINE_PORT=3111
Environment=PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin
ExecStart=/opt/trend-runtime/node/bin/node engine/server.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

## 新增实盘引擎

```bash
tee /etc/systemd/system/trend-executor-live.service >/dev/null <<'EOF'
[Unit]
Description=Trend Executor Live Engine
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=trendexec
Group=trendexec
WorkingDirectory=/opt/trend-executor/dashboard
Environment=NODE_ENV=production
Environment=ENGINE_MODE=live
Environment=ENGINE_PORT=3112
Environment=PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin
ExecStart=/opt/trend-runtime/node/bin/node engine/server.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

## 更新统一入口

```bash
tee /etc/systemd/system/trend-executor-gateway.service >/dev/null <<'EOF'
[Unit]
Description=Trend Executor Dual Channel Gateway
After=trend-executor-ui.service trend-executor-engine.service trend-executor-live.service
Requires=trend-executor-ui.service trend-executor-engine.service trend-executor-live.service

[Service]
Type=simple
User=trendexec
Group=trendexec
WorkingDirectory=/opt/trend-executor/dashboard
Environment=GATEWAY_HOST=0.0.0.0
Environment=GATEWAY_PORT=3109
Environment=UI_PORT=3110
Environment=PAPER_ENGINE_PORT=3111
Environment=LIVE_ENGINE_PORT=3112
Environment=PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin
ExecStart=/opt/trend-runtime/node/bin/node engine/gateway.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

## 只重启本项目

```bash
systemctl daemon-reload
systemctl enable trend-executor-live
systemctl restart trend-executor-ui trend-executor-engine trend-executor-live
systemctl restart trend-executor-gateway
```

检查：

```bash
systemctl is-active trend-executor-ui
systemctl is-active trend-executor-engine
systemctl is-active trend-executor-live
systemctl is-active trend-executor-gateway

ss -lntp | grep -E ':(3109|3110|3111|3112)\b'
curl http://127.0.0.1:3109/api/paper/snapshot
curl http://127.0.0.1:3109/api/live/snapshot
curl -I http://127.0.0.1:3109/
```

预期：纸面接口返回 `"mode":"paper"`，实盘接口返回 `"mode":"live"`，页面返回 `HTTP 200`。

升级后刷新 `http://服务器公网IP:3109`，分别启用纸面账户和连接实盘账户，再独立点击两个“启动”按钮。服务重启后两套策略默认都不会自动交易。

查看日志：

```bash
journalctl -u trend-executor-engine -f
journalctl -u trend-executor-live -f
```
