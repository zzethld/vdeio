# 连锁门店视频管理系统 — Windows 客户端安装脚本
param(
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,
    [string]$InstallPath = "$env:ProgramFiles\VdeioPlayer",
    [string]$InstallerUrl = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host " 门店视频播放系统 — 客户端安装"
Write-Host "=========================================="
Write-Host ""

# 验证服务器可达
Write-Host "[检查] 验证服务器连接: $ServerUrl"
try {
    $response = Invoke-WebRequest -Uri "$ServerUrl/health" -TimeoutSec 10 -UseBasicParsing
    Write-Host "[OK] 服务器连接正常"
} catch {
    Write-Host "[错误] 无法连接到服务器: $ServerUrl"
    Write-Host "  请检查网络连接和服务器地址"
    exit 1
}

# 创建安装目录
if (-not (Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath | Out-Null
    Write-Host "[OK] 创建安装目录: $InstallPath"
}

# 下载安装包（如果有URL）
if ($InstallerUrl -ne "") {
    Write-Host "[下载] 下载客户端安装包..."
    $installerPath = "$env:TEMP\vdeio-player-setup.exe"
    Invoke-WebRequest -Uri $InstallerUrl -OutFile $installerPath
    Write-Host "[OK] 下载完成"
    
    # 运行安装
    Write-Host "[安装] 运行安装程序（静默安装）..."
    Start-Process -FilePath $installerPath -ArgumentList "/S", "/D=$InstallPath" -Wait
    Write-Host "[OK] 安装完成"
} else {
    Write-Host "[提示] 未指定安装包URL，请手动复制安装包到 $InstallPath"
}

# 写入服务器配置
$configDir = Join-Path $InstallPath "resources"
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

$configFile = Join-Path $configDir "server-config.json"
@{
    serverUrl = $ServerUrl
    apiBaseUrl = "$ServerUrl/api/v1"
    mqttBrokerUrl = "mqtt://$($ServerUrl -replace 'https?://', '')"
} | ConvertTo-Json | Set-Content -Path $configFile

Write-Host "[OK] 服务器配置已写入: $configFile"

# 创建桌面快捷方式
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\门店视频播放系统.lnk")
$Shortcut.TargetPath = Join-Path $InstallPath "vdeio-client.exe"
$Shortcut.WorkingDirectory = $InstallPath
$Shortcut.Description = "门店视频播放系统"
$Shortcut.Save()
Write-Host "[OK] 桌面快捷方式已创建"

# 完成
Write-Host ""
Write-Host "=========================================="
Write-Host " 安装完成！"
Write-Host "=========================================="
Write-Host ""
Write-Host "  双击桌面「门店视频播放系统」图标启动"
Write-Host "  首次使用请使用钉钉扫码登录"
Write-Host ""
