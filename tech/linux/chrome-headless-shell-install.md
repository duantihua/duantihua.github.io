# chrome-headless-shell 安装指南

## 1. 背景

在 Linux 服务器上通过 CDP（Chrome DevTools Protocol）驱动浏览器渲染 PDF 时，通常需要启动常驻进程、复用 tab、打开页面、等待网络空闲，再调用 `Page.printToPDF`。

`chrome-headless-shell` 是官方从 Chrome 中拆出的精简无头二进制，与 Chrome 同版本号发布，CDP 能力一致（`Page.navigate` / `Page.printToPDF` 等自动化接口完整支持），但启动更快、内存占用更小，适合只做 PDF 渲染等自动化任务的服务器环境。

> 注意：本文只说明服务器安装与验证，不涉及具体程序的调用和参数配置。

## 2. 各发行版安装方式总览

| 系统 | 推荐方式 | 命令/来源 |
| --- | --- | --- |
| Fedora | 原生 RPM | `dnf install chromium-headless` |
| CentOS Stream 8 / Rocky 8 / Alma 8 | EPEL RPM | `dnf install epel-release`，再 `dnf install chromium-headless` |
| RHEL 9 / 10 系 | EPEL RPM | 同上 |
| Debian 12 / 13 | 原生 deb | `apt install chromium-headless-shell` |
| Ubuntu 24.04 | CfT 官方 zip（推荐） | 官方 apt 无此包（chromium 已转 snap），见第 3 节 |
| CentOS 7 | 不支持二进制方案 | glibc 2.17 过老，见第 5 节 |

`chromium-headless`（Fedora/EPEL）与 `chromium-headless-shell`（Debian）本质相同：Chromium 的 headless shell 精简二进制，与 Chrome for Testing 发布的 `chrome-headless-shell` 等价。

## 3. 推荐方案：Chrome for Testing 二进制（跨发行版统一）

### 3.1 下载源

官方源：

```text
https://storage.googleapis.com/chrome-for-testing-public/{version}/linux64/chrome-headless-shell-linux64.zip
```

可用镜像（实测 307 重定向到上述官方地址，内容一致）：

```text
https://cdn.playwright.dev/builds/cft/{version}/linux64/chrome-headless-shell-linux64.zip
```

版本说明：

- 可用版本号可直接访问 [Chrome for Testing availability](https://googlechromelabs.github.io/chrome-for-testing/) 查看。页面按 Stable / Beta / Dev / Canary 列出当前版本，并给出 `chrome-headless-shell` 的 `linux64` 下载地址；选定版本后，将其版本号填入下方的 `VERSION`。
- 本指南撰写时（2026-08）使用 `151.0.7922.34`；版本号会持续更新，请以上述页面展示为准。
- 部署时应**锁定具体版本号**，不要每次都取最新，避免二进制变化导致渲染结果漂移。
- 如需由脚本自动获取当前 stable 版本号，可查询：
  `https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json`
  （`channels.Stable.version`，及 `channels.Stable.downloads["chrome-headless-shell"]` 中 `platform == "linux64"` 的 URL）。

### 3.2 安装脚本

以下脚本将二进制安装到 `/opt/chrome-headless-shell`：

```bash
VERSION=151.0.7922.34
INSTALL_DIR=/opt/chrome-headless-shell

mkdir -p "$INSTALL_DIR"
curl -sL "https://cdn.playwright.dev/builds/cft/${VERSION}/linux64/chrome-headless-shell-linux64.zip" \
  -o /tmp/chrome-headless-shell.zip
unzip -q -o /tmp/chrome-headless-shell.zip -d "$INSTALL_DIR"

# 解压后的二进制实际路径：
# $INSTALL_DIR/chrome-headless-shell-linux64/chrome-headless-shell
```

生产环境建议先把 zip 缓存到内网（服务器本地目录或制品库），部署脚本优先使用本地文件，避免每次安装依赖外网；下载完成后用 `sha256sum` 记录并比对，防止文件被篡改或下载损坏。

### 3.3 系统依赖

Ubuntu / Debian：

```bash
apt-get update
apt-get install -y ca-certificates fonts-liberation libnss3 libnspr4 \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64
```

（Debian 12 / Ubuntu 22.04 及更早版本中包名为 `libasound2`；Ubuntu 24.04 起为 `libasound2t64`。）

RHEL 8 / 9 / Fedora：

```bash
dnf install -y nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon \
  libXcomposite libXdamage libXfixes libXrandr mesa-libgbm alsa-lib \
  fontconfig liberation-fonts
```

## 4. 验证

```bash
# 1. 基本版本
/opt/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell --version

# 2. 验证 CDP 服务能启动（程序使用的方式）
/opt/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell \
  --remote-debugging-port=9222 --no-first-run --no-default-browser-check
# 看到 "DevTools listening on ws://..." 即成功
```

启动报错排查：

```bash
# 缺动态库时，查看缺失项，按包名安装
ldd /opt/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell | grep "not found"

# 查看二进制对 glibc 的要求（判断系统能否运行）
strings /opt/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell \
  | grep -o 'GLIBC_[0-9.]*' | sort -V | uniq | tail -3
```

若服务进程以 root 运行，需要加 `--no-sandbox`（存在安全权衡，建议使用专门的非 root 系统用户运行）。

## 5. CentOS 7 特殊说明

CentOS 7 的 glibc 为 2.17，而现代 Chrome / chrome-headless-shell 要求更高（早在 2021 年前后就已要求 2.18+），且 CentOS 7 已于 2024-06 停止维护，EPEL7 也没有 chromium 包，因此**无法安装新版二进制**。

可行替代：

1. 容器化：使用现成镜像（如 `chromedp/headless-shell:stable`，内含 Chrome for Testing 的 headless shell），通过 `podman run -p 9222:9222` 暴露 CDP 端口，宿主机保持 CentOS 7 即可。
2. 系统迁移：CentOS 7 -> Rocky/Alma 8 或 9，再按第 2、3 节安装。

## 6. 部署注意事项

- 锁定版本号，避免每次部署取最新版本导致渲染结果漂移。
- 生产环境将 zip 缓存到内网，部署脚本优先用本地文件。
- 下载后记录并校验 sha256。
- 使用非 root 用户运行服务；如必须 root，加 `--no-sandbox`。

## 7. 与完整 Chrome 对比验证（服务器上自查）

怀疑"PDF 不如 Chrome 清晰、字体不对"时，用同一页面分别跑三个命令比对。shell 与 Chrome 的差异只应体现在页眉页脚（浏览器绘制的那一行），正文必须一致：

```bash
BASE="--no-sandbox --disable-gpu --hide-scrollbars --no-first-run"
URL="https://your-site/report"
SHELL=/opt/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell

# A. shell 默认参数（升级后的现状）
$SHELL $BASE --user-data-dir=/tmp/ud-a --print-to-pdf=/tmp/a-default.pdf "$URL"

# B. shell + 推荐参数（期望与 C 一致）
$SHELL $BASE --font-render-hinting=none --force-color-profile=srgb \
  --user-data-dir=/tmp/ud-b --print-to-pdf=/tmp/b-fixed.pdf "$URL"

# C. 完整 Chrome，作为基准
/usr/bin/google-chrome --headless=new $BASE \
  --user-data-dir=/tmp/ud-c --print-to-pdf=/tmp/c-chrome.pdf "$URL"

# 1) 字体是否相同：看字体名与 Type。名字不同说明是 fontconfig 字体解析差异（查字体包与 fc-match），
#    名字相同但 "Type" 不同（Type 3 / CID TrueType）说明是字形来源差异。
pdffonts /tmp/a-default.pdf; pdffonts /tmp/b-fixed.pdf; pdffonts /tmp/c-chrome.pdf

# 2) 像素是否一致：B 与 C 应完全相同（页眉页脚带时间戳时除外）
pdftoppm -r 300 -png -f 1 -l 1 /tmp/b-fixed.pdf /tmp/b
pdftoppm -r 300 -png -f 1 -l 1 /tmp/c-chrome.pdf /tmp/c
cmp /tmp/b-1.png /tmp/c-1.png && echo "B == C" || echo "B != C"
```

排版类差异还可以用文字坐标定位，例如：

```bash
pdftotext -bbox /tmp/b-fixed.pdf /tmp/b.xml && pdftotext -bbox /tmp/c-chrome.pdf /tmp/c.xml
diff /tmp/b.xml /tmp/c.xml
```

注意：CI/生产环境应保证 shell 与 Chrome 版本号一致，版本不同本身就会让 Skia 字体栈输出漂移。

## 8. PDF 正文发虚

如果 PDF 正文发虚、字形像屏幕点阵字（粗体标题尤其明显），通常不是 `chrome-headless-shell` 本身的问题，而是字体自带的点阵字模被 Chromium/Skia 启用了。可先用 `pdffonts` 检查 PDF 中的字体类型（出现大量 `Type 3` 时优先排查字体），再检查系统安装的 CJK 字体及其点阵字模。
