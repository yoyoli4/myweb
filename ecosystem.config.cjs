/**
 * PM2 进程守护配置（宝塔/服务器部署用）
 *
 * 使用：
 *   首次启动：  pm2 start ecosystem.config.cjs
 *   查看状态：  pm2 status
 *   看日志：    pm2 logs sicksuckworld
 *   重启：      pm2 restart sicksuckworld
 *   停止：      pm2 stop sicksuckworld
 *   开机自启：  pm2 save && pm2 startup （按提示复制命令执行一次即可）
 */
module.exports = {
  apps: [
    {
      name: 'sicksuckworld',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 0.0.0.0',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      // 留言板数据目录（与 src/lib/messages.ts 里 process.cwd()/data 一致）
      // 宝塔上确保项目目录对运行用户可写
    },
  ],
}
