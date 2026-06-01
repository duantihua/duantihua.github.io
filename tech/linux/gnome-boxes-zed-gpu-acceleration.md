# Ubuntu 22（GNOME Boxes）运行 Zed 卡死问题排查

在 Ubuntu 22.04 虚拟机（GNOME Boxes / KVM）中安装 Zed 后，若终端卡死、窗口不显示、需强制结束进程，多半是虚拟机未启用 GPU 加速，导致 OpenGL 走 llvmpipe 软件渲染。本文记录从现象到根因的排查过程，以及通过开启 3D 加速的解决办法。

## 问题现象

安装并启动 Zed：

```shell
curl -f https://zed.dev/install.sh | sh
zed
```

出现：

- Terminal 卡死
- Zed 窗口不显示
- 无法正常启动
- 需要强制结束进程

## 环境信息

### 宿主机

Fedora 44，显卡工作正常：

```shell
glxinfo | grep "OpenGL renderer"
```

```text
OpenGL renderer string: AMD Radeon 680M (radeonsi, rembrandt, ACO, DRM ...)
```

```shell
vulkaninfo | grep deviceName
```

```text
deviceName = AMD Radeon 680M (RADV REMBRANDT)
```

### 虚拟机

```text
GNOME Boxes / KVM-QEMU
Ubuntu 22.04 Desktop
CPU: 16 vCPU
Memory: 8GB
```

## 排查过程

### 1. 查看 Zed 版本

```shell
zed --version
```

```text
Zed 1.4.4
```

### 2. 检查桌面环境

```shell
echo $XDG_SESSION_TYPE
```

```text
x11
```

可排除 Wayland 兼容问题。

### 3. 检查显卡

```shell
lspci | grep -E "VGA|Display|3D"
```

```text
00:01.0 VGA compatible controller: Red Hat, Inc. QXL paravirtual graphic card
```

虚拟机使用的是 QXL 虚拟显卡。

### 4. 检查 OpenGL

```shell
sudo apt install mesa-utils
glxinfo | grep "OpenGL renderer"
```

```text
OpenGL renderer string: llvmpipe (LLVM ...)
```

说明没有 GPU 加速，正在使用 CPU 软件渲染。

## 根因

GNOME Boxes 对应 VM 的 XML 配置类似：

```xml
<graphics type="spice">
    <gl enable="no"/>
</graphics>

<video>
    <model type="qxl">
        <acceleration accel3d="no"/>
    </model>
</video>
```

即：QXL 显卡 + OpenGL 禁用 + 3D 加速禁用 → llvmpipe 软件渲染。Zed 依赖现代 GPU 渲染（wgpu/OpenGL），因此在该环境下启动会卡死。

## 解决方案

关闭虚拟机，在 GNOME Boxes 中打开：

```text
Ubuntu VM → Preferences → Resources
```

启用 **3D Acceleration**，保存并重启虚拟机。

## 验证结果

再次检查 OpenGL：

```shell
glxinfo | grep "OpenGL renderer"
```

```text
OpenGL renderer string: virgl (AMD Radeon 680M ...)
```

宿主机 AMD Radeon 680M 经 virgl 透传到虚拟机，GPU 加速已生效。

启动 Zed：

```shell
zed
```

可正常启动，界面显示正常。

## Vulkan 状态（可选）

虚拟机内：

```shell
vulkaninfo | grep deviceName
```

```text
deviceName = llvmpipe
```

即 OpenGL 已走 virgl，Vulkan 仍为 llvmpipe。对 Zed、VS Code、Chrome、Firefox、JetBrains IDE 等日常使用一般无影响。

## 当前状态小结

| 环境 | OpenGL | Vulkan | 备注 |
|------|--------|--------|------|
| 宿主机 | ✓ | ✓ | AMD Radeon 680M |
| 虚拟机 | ✓ virgl | ✗ llvmpipe | Zed / GNOME / 浏览器正常 |

## 常用检查命令

查看 OpenGL（正常应为 `virgl`，异常多为 `llvmpipe`）：

```shell
glxinfo | grep "OpenGL renderer"
```

查看 Vulkan：

```shell
vulkaninfo | grep deviceName
```

查看显卡：

```shell
lspci | grep -E "VGA|Display|3D"
```

查看 Zed 版本：

```shell
zed --version
```

## 经验总结

虚拟机中若遇到 Zed 无法启动、VS Code 黑屏、Chrome GPU 问题、Electron 应用卡死、JetBrains UI 卡顿，可先执行：

```shell
glxinfo | grep "OpenGL renderer"
```

若输出为 `llvmpipe`，优先在 GNOME Boxes 中检查是否已启用 **3D Acceleration**——多数情况是虚拟机未开启 GPU 加速所致。

---

<div style="text-align: right;"><small>最后更新：2026-06-01</small></div>
