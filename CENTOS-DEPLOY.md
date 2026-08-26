# CentOS隔离部署（端口3109）

此方案不修改Nginx、不修改防火墙、不停止或重启任何已有服务。项目使用独立用户、目录、systemd服务名及端口：

- 安全入口：`127.0.0.1:3109`
- 内部页面：`127.0.0.1:3110`
- 内部交易引擎：`127.0.0.1:3111`
- 服务名：`trend-executor-gateway`、`trend-executor-ui`、`trend-executor-engine`

## 1. 只读预检查

```bash
cat /etc/centos-release
node --version || true
npm --version || true
git --version || true
sudo ss -lntp | grep -E ':(3109|3110|3111)\b' || true
```

如果最后一条有任何输出，说明端口已被占用。停止部署并更换本项目内部端口，不要结束已有进程。

Node.js必须为22.13或更高版本。缺少依赖时才安装：

```bash
sudo dnf install -y git curl ca-certificates
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
```

CentOS 7把上面的 `dnf` 换成 `yum`。安装后再次执行 `node --version`，必须是22.13或更高版本。

## 2. 创建独立用户和目录

```bash
sudo id trendexec >/dev/null 2>&1 || sudo useradd --system --home-dir /opt/trend-executor --shell /sbin/nologin trendexec
sudo test ! -e /opt/trend-executor || { echo '/opt/trend-executor 已存在，请先核对，部署已停止'; exit 1; }
sudo git clone --branch strategy-review https://github.com/renzhonghua8/binance-supertrend-strategy.git /opt/trend-executor
sudo chown -R trendexec:trendexec /opt/trend-executor
sudo -u trendexec npm --prefix /opt/trend-executor/dashboard ci
sudo -u trendexec npm --prefix /opt/trend-executor/dashboard test
sudo -u trendexec npm --prefix /opt/trend-executor/dashboard run build
```

## 3. 创建三个独立systemd服务

```bash
sudo tee /etc/systemd/system/trend-executor-ui.service >/dev/null <<'EOF'
[Unit]
Description=Trend Executor UI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=trendexec
Group=trendexec
WorkingDirectory=/opt/trend-executor/dashboard
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3110
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/trend-executor-engine.service >/dev/null <<'EOF'
[Unit]
Description=Trend Executor Engine
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=trendexec
Group=trendexec
WorkingDirectory=/opt/trend-executor/dashboard
Environment=NODE_ENV=production
Environment=ENGINE_PORT=3111
ExecStart=/usr/bin/node engine/server.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/trend-executor-gateway.service >/dev/null <<'EOF'
[Unit]
Description=Trend Executor Private Gateway
After=trend-executor-ui.service trend-executor-engine.service
Requires=trend-executor-ui.service trend-executor-engine.service

[Service]
Type=simple
User=trendexec
Group=trendexec
WorkingDirectory=/opt/trend-executor/dashboard
Environment=GATEWAY_HOST=127.0.0.1
Environment=GATEWAY_PORT=3109
Environment=UI_PORT=3110
Environment=ENGINE_PORT=3111
ExecStart=/usr/bin/node engine/gateway.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

确认Node和npm路径。如果结果不是 `/usr/bin/node` 和 `/usr/bin/npm`，只修改上述新建服务的 `ExecStart`：

```bash
command -v node
command -v npm
```

## 4. 只启动本项目服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now trend-executor-ui trend-executor-engine trend-executor-gateway
sudo systemctl status trend-executor-ui trend-executor-engine trend-executor-gateway --no-pager
curl -I http://127.0.0.1:3109/
curl http://127.0.0.1:3109/api/snapshot
```

这些命令不会重启Nginx、Docker、数据库或其他已有服务。

## 5. 从本地电脑访问

不要开放3109公网端口。在本地电脑建立SSH加密隧道：

```bash
ssh -N -L 3109:127.0.0.1:3109 服务器用户名@服务器IP
```

保持终端运行，在本地浏览器打开：

```text
http://localhost:3109
```

## 6. 日志、停止和卸载

```bash
sudo journalctl -u trend-executor-engine -f
sudo journalctl -u trend-executor-ui -f
sudo journalctl -u trend-executor-gateway -f
```

只停止本项目：

```bash
sudo systemctl stop trend-executor-gateway trend-executor-engine trend-executor-ui
```

服务重启后API Key会从内存清除，策略不会自动恢复交易。需要重新通过页面连接账户并启动策略。
