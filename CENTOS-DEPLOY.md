# CentOS隔离部署（端口3109）

此方案不修改Nginx、不修改防火墙、不停止或重启任何已有服务。项目使用独立用户、目录、systemd服务名及端口：

- 安全入口：`127.0.0.1:3109`
- 内部页面：`127.0.0.1:3110`
- 内部纸面引擎：`127.0.0.1:3111`
- 内部实盘引擎：`127.0.0.1:3112`
- 服务名：`trend-executor-gateway`、`trend-executor-ui`、`trend-executor-engine`、`trend-executor-live`

## 1. 只读预检查

```bash
cat /etc/centos-release
git --version || true
sudo ss -lntp | grep -E ':(3109|3110|3111|3112)\b' || true
```

如果最后一条有任何输出，说明端口已被占用。停止部署并更换本项目内部端口，不要结束已有进程。

只安装下载工具，不安装或升级系统Node.js：

```bash
sudo dnf install -y git curl ca-certificates
```

CentOS 7把 `dnf` 换成 `yum`。

安装本项目独享的Node.js 22，不覆盖 `/usr/bin/node`：

```bash
cd /tmp
NODE_VERSION=v22.23.2
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64) NODE_ARCH=arm64 ;;
  *) echo "不支持的CPU架构：$(uname -m)"; exit 1 ;;
esac
test "$NODE_ARCH" = x64 || { echo 'CentOS 7隔离包当前仅支持x86_64'; exit 1; }
NODE_FILE="node-${NODE_VERSION}-linux-x64-glibc-217.tar.xz"
NODE_BASE="https://unofficial-builds.nodejs.org/download/release/${NODE_VERSION}"
curl -fSLO "${NODE_BASE}/${NODE_FILE}"
curl -fSLO "${NODE_BASE}/SHASUMS256.txt"
grep " ${NODE_FILE}$" SHASUMS256.txt | sha256sum -c -
sudo mkdir -p /opt/trend-runtime
sudo tar -xJf "$NODE_FILE" -C /opt/trend-runtime
sudo ln -sfn "/opt/trend-runtime/node-${NODE_VERSION}-linux-x64-glibc-217" /opt/trend-runtime/node
/opt/trend-runtime/node/bin/node --version
```

必须输出 `v22.23.2`。这个glibc 2.17兼容运行时只供本项目使用，不改变系统glibc和其他服务的Node版本。

## 2. 创建独立用户和目录

```bash
sudo id trendexec >/dev/null 2>&1 || sudo useradd --system --home-dir /opt/trend-executor --shell /sbin/nologin trendexec
sudo test ! -e /opt/trend-executor || { echo '/opt/trend-executor 已存在，请先核对，部署已停止'; exit 1; }
sudo git clone --branch strategy-review https://github.com/renzhonghua8/binance-supertrend-strategy.git /opt/trend-executor
sudo chown -R trendexec:trendexec /opt/trend-executor
sudo -u trendexec env PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin /opt/trend-runtime/node/bin/npm --prefix /opt/trend-executor/dashboard ci
sudo -u trendexec env PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin /opt/trend-runtime/node/bin/npm --prefix /opt/trend-executor/dashboard test
sudo -u trendexec env PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin /opt/trend-runtime/node/bin/npm --prefix /opt/trend-executor/dashboard run build
```

## 3. 创建四个独立systemd服务

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
Environment=PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin
ExecStart=/opt/trend-runtime/node/bin/npm run start -- --hostname 127.0.0.1 --port 3110
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/trend-executor-engine.service >/dev/null <<'EOF'
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
ExecStart=/opt/trend-runtime/node/bin/node engine/server.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo install -d -m 700 /etc/trend-executor
sudo install -m 600 /dev/null /etc/trend-executor/live.env
read -r -s -p '请输入实盘访问密码: ' TREND_LIVE_PASSWORD
printf '\n'
printf 'LIVE_ACCESS_PASSWORD=%s\n' "$TREND_LIVE_PASSWORD" | sudo tee /etc/trend-executor/live.env >/dev/null
unset TREND_LIVE_PASSWORD
sudo chmod 600 /etc/trend-executor/live.env

sudo tee /etc/systemd/system/trend-executor-live.service >/dev/null <<'EOF'
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
Environment=LIVE_COOKIE_SECURE=false
EnvironmentFile=/etc/trend-executor/live.env
Environment=PATH=/opt/trend-runtime/node/bin:/usr/bin:/bin
ExecStart=/opt/trend-runtime/node/bin/node engine/server.mjs
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
After=trend-executor-ui.service trend-executor-engine.service trend-executor-live.service
Requires=trend-executor-ui.service trend-executor-engine.service trend-executor-live.service

[Service]
Type=simple
User=trendexec
Group=trendexec
WorkingDirectory=/opt/trend-executor/dashboard
Environment=GATEWAY_HOST=127.0.0.1
Environment=GATEWAY_PORT=3109
Environment=UI_PORT=3110
Environment=PAPER_ENGINE_PORT=3111
Environment=LIVE_ENGINE_PORT=3112
ExecStart=/opt/trend-runtime/node/bin/node engine/gateway.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

## 4. 只启动本项目服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now trend-executor-ui trend-executor-engine trend-executor-live trend-executor-gateway
sudo systemctl status trend-executor-ui trend-executor-engine trend-executor-live trend-executor-gateway --no-pager
curl -I http://127.0.0.1:3109/
curl http://127.0.0.1:3109/api/paper/snapshot
curl http://127.0.0.1:3109/api/live/snapshot
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
sudo journalctl -u trend-executor-live -f
sudo journalctl -u trend-executor-ui -f
sudo journalctl -u trend-executor-gateway -f
```

只停止本项目：

```bash
sudo systemctl stop trend-executor-gateway trend-executor-live trend-executor-engine trend-executor-ui
```

服务重启后API Key会从内存清除，策略不会自动恢复交易。需要重新通过页面连接账户并启动策略。
