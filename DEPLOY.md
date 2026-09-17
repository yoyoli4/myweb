# SICKSUCKWORLD 宝塔面板部署指南

## 架构

```
用户请求 → Nginx (80/443) → 反代 → Next.js (PM2, 端口 3000)
                                 ↓
                          留言板 data/messages.json
```

- **Next.js 服务器模式**（非静态导出）：留言板 API 可用
- **PM2**：进程守护，崩溃自动重启，开机自启
- **Nginx**：反向代理 + 静态资源直接分发（图片/音乐/JS 不走 Node）

---

## 一、服务器准备（宝塔面板）

### 1. 安装环境

宝塔面板 → 软件商店：

| 软件 | 版本 | 说明 |
|------|------|------|
| Node.js 版本管理器 | ≥ 18.17 | 装 **Node 20** |
| PM2 管理器 | 最新 | 进程守护 |
| Nginx | 任意 | 反向代理 |

安装 Node 后，在「Node 版本管理器」里把 Node 20 设为默认，并在终端确认：
```bash
node -v   # 应显示 v20.x.x
npm -v
```

### 2. 拉取代码

SSH 登录服务器，在宝塔的网站根目录下拉代码：

```bash
cd /www/wwwroot
git clone https://github.com/yoyoli4/myweb.git sicksuckworld
cd sicksuckworld
```

> 如果是私有仓库，用 SSH：`git clone git@github.com:yoyoli4/myweb.git sicksuckworld`
> 需要先把服务器的 SSH 公钥加到 GitHub（`cat ~/.ssh/id_ed25519.pub`）。

### 3. 安装依赖 + 首次构建

```bash
cd /www/wwwroot/sicksuckworld
npm install --omit=dev
npm run build
```

构建成功会看到 `Route (app)` 列表，包含 `/api/messages`。

### 4. 启动 PM2

```bash
cd /www/wwwroot/sicksuckworld
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # 按提示复制命令执行一次，实现开机自启
```

检查状态：
```bash
pm2 status
pm2 logs sicksuckworld --lines 30
```

### 5. 配置 Nginx 反代

**方式 A（推荐，图形化）：**
宝塔面板 → 网站 → 添加站点：
- 域名：填你的域名
- 根目录：`/www/wwwroot/sicksuckworld/public`
- PHP 版本：纯静态

创建后进入站点设置 → **反向代理** → 添加反向代理：
- 代理名称：`sicksuckworld`
- 目标 URL：`http://127.0.0.1:3000`
- 发送域名：`$host`
- 开启：带端口、保留路径

保存即可。

**方式 B（直接写配置）：**
把 `deploy/baota-nginx.conf` 里的 server block 粘到站点设置 → 配置文件，改 `server_name` 和路径。

### 6. 配置 SSL（HTTPS）

站点设置 → SSL → Let's Encrypt → 申请（勾选域名）→ 开启强制 HTTPS。

---

## 二、以后更新网站

### 方式 A：我帮你改代码 → 推送 → 你一键更新

1. 你告诉我要改什么
2. 我改完代码并推送到 GitHub
3. 你在服务器上执行：
```bash
cd /www/wwwroot/sicksuckworld
bash deploy.sh
```
完事。`deploy.sh` 会自动：git pull → 装依赖 → 构建 → 重启 PM2。

### 方式 B：你自己改代码

```bash
cd /www/wwwroot/sicksuckworld
# 改完代码后：
bash deploy.sh
```

---

## 三、常用命令

```bash
# 看服务状态
pm2 status

# 看实时日志
pm2 logs sicksuckworld

# 重启服务
pm2 restart sicksuckworld

# 停止服务
pm2 stop sicksuckworld

# 手动构建
npm run build
```

---

## 四、常见问题

**Q: 留言板提交没反应？**
A: 检查 `data/messages.json` 是否可写：
```bash
ls -la /www/wwwroot/sicksuckworld/data/
chmod 755 /www/wwwroot/sicksuckworld/data
chmod 644 /www/wwwroot/sicksuckworld/data/messages.json
```

**Q: 页面 502 Bad Gateway？**
A: PM2 进程没起来。`pm2 status` 看一下，`pm2 restart sicksuckworld`。

**Q: 更新后页面没变化？**
A: `npm run build` 成功了吗？看 `pm2 logs sicksuckworld` 是否有报错。可能需要 `pm2 restart`。

**Q: 内存不够构建失败？**
A: Next.js 构建需要约 1G 内存。服务器内存 < 1G 时加 swap：
```bash
dd if=/dev/zero of=/swapfile bs=1M count=1024
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```
