# 服务器部署（外部访问端口 3109）

推荐使用 Ubuntu/Debian、systemd、Nginx 和 SSH 隧道。Nginx 只监听服务器回环地址 `127.0.0.1:3109`，避免 API Key 通过明文公网传输。

## 1. 安装依赖并拉取代码

```bash
sudo apt-get update
sudo apt-get install -y git nginx curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo mkdir -p /opt/binance-supertrend-strategy
sudo chown "$USER":"$USER" /opt/binance-supertrend-strategy
git clone --branch strategy-review https://github.com/renzhonghua8/binance-supertrend-strategy.git /opt/binance-supertrend-strategy
cd /opt/binance-supertrend-strategy/dashboard
npm ci
npm test
npm run build
```

## 2. 创建 systemd 服务

页面服务内部使用3110，交易引擎内部使用3111。

```bash
sudo tee /etc/systemd/system/trend-ui.service >/dev/null <<'EOF'
[Unit]
Description=Trend Executor UI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/binance-supertrend-strategy/dashboard
Environment=NODE_ENV=production
Environment=PORT=3110
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/trend-engine.service >/dev/null <<'EOF'
[Unit]
Description=Trend Executor Engine
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/binance-supertrend-strategy/dashboard
Environment=NODE_ENV=production
Environment=ENGINE_PORT=3111
ExecStart=/usr/bin/node engine/server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

如果服务器登录用户名不是 `ubuntu`，把两个服务中的 `User=ubuntu` 改成实际用户名，并确保该用户拥有项目目录。

## 3. 配置 Nginx 统一入口3109

```bash
sudo tee /etc/nginx/sites-available/trend-executor >/dev/null <<'EOF'
server {
    listen 127.0.0.1:3109;
    server_name localhost;

    location /api/ {
        proxy_pass http://127.0.0.1:3111;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3110;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
EOF

sudo ln -sfn /etc/nginx/sites-available/trend-executor /etc/nginx/sites-enabled/trend-executor
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now trend-ui trend-engine nginx
```

## 4. 验证服务器

```bash
curl -I http://127.0.0.1:3109/
curl http://127.0.0.1:3109/api/snapshot
sudo systemctl status trend-ui trend-engine nginx --no-pager
```

## 5. 从本地电脑安全访问

在本地电脑执行，替换服务器用户名和IP：

```bash
ssh -N -L 3109:127.0.0.1:3109 ubuntu@SERVER_IP
```

保持终端窗口开启，然后访问：

```text
http://localhost:3109
```

## 6. 日志和更新

```bash
sudo journalctl -u trend-engine -f
sudo journalctl -u trend-ui -f
```

更新代码：

```bash
cd /opt/binance-supertrend-strategy
git pull origin strategy-review
cd dashboard
npm ci
npm test
npm run build
sudo systemctl restart trend-engine trend-ui
```

服务重启后，内存中的 API Key 会被清除，策略处于未连接状态。需要重新打开页面、连接测试网或实盘账户并启动策略。正式输入 API Key 前必须使用 SSH 隧道或 HTTPS，不要直接通过公网 HTTP 页面提交密钥。
