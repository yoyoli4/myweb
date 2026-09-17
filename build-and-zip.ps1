# ---------------------------------------------------------------------------
# 一键静态导出 + 打包脚本（用于上传腾讯云 EdgeOne Pages / 任何静态托管）
#
# 用法：在项目文件夹右键 → 用 PowerShell 运行，或：
#   powershell -ExecutionPolicy Bypass -File .\build-and-zip.ps1
#
# 产物：sicksuckworld-site.zip（zip 根目录直接是 index.html，可直接上传）
# ---------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# 1) 准备 Node：优先用系统 node，否则用便携版（%LOCALAPPDATA%\node-portable）
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  $portable = Join-Path $env:LOCALAPPDATA 'node-portable'
  if (Test-Path (Join-Path $portable 'node.exe')) {
    $env:Path = "$portable;$env:Path"
    Write-Host "[info] 使用便携 Node: $portable" -ForegroundColor Cyan
  } else {
    Write-Host "[error] 未找到 Node.js。请安装 Node 18+，或把便携版放到 $portable" -ForegroundColor Red
    exit 1
  }
}

# 2) 静态导出不支持服务端 API（留言板 /api/messages），构建时临时禁用，结束后恢复
$apiDir = Join-Path $root 'src\app\api'
$bakDir = Join-Path $root 'src\app\_api_disabled'
$buildOk = $false

try {
  if (Test-Path $apiDir) {
    Move-Item $apiDir $bakDir -Force
    Write-Host "[info] 临时禁用 API 目录（静态导出不支持）" -ForegroundColor Cyan
  }

  # 3) 构建静态产物到 out/
  Write-Host "[info] npm run build ..." -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "构建失败（exit $LASTEXITCODE）" }
  $buildOk = $true
}
finally {
  # 无论成功失败都恢复 api 目录，避免工程停留在半迁移状态
  if (Test-Path $bakDir) {
    Move-Item $bakDir $apiDir -Force
    Write-Host "[info] 已恢复 API 目录" -ForegroundColor Cyan
  }
}

if (-not $buildOk) { exit 1 }

# 4) 打包 out 目录【内容】为 zip（zip 根直接是 index.html，不套 out 文件夹）
# 注意：必须逐个条目添加并把路径分隔符统一成正斜杠 /（zip 标准）。
# 不能用 ZipFile.CreateFromDirectory —— 它在 Windows 上会写入反斜杠 \，
# 腾讯云 EdgeOne 等 Linux 后端会把 \ 判为非法字符而拒收。
$zipPath = Join-Path $root 'sicksuckworld-site.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$outDir = Join-Path $root 'out'
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem $outDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($outDir.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $zip.Dispose()
}

$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "[done] 打包完成: $zipPath ($sizeMB MB)" -ForegroundColor Green
Write-Host "[next] 把这个 zip 上传到 EdgeOne Pages 即可（zip 根已是 index.html）" -ForegroundColor Green
