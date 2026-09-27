# Virt-Manager 迁移笔记：开启 3D 加速与配置虚拟机访问宿主机服务

## 一、背景与迁移原因

- **原始环境**：Fedora 系统，使用 GNOME Boxes 管理虚拟机（CentOS 7 / Ubuntu 22.04 / Arch Linux 等）
- **遇到的问题**：
  1. GNOME Boxes 界面过于简洁，无法找到 3D 加速选项
  2. Boxes 对 CentOS 7 这类较老系统的支持不完善，3D 加速开关被自动隐藏
  3. 需要更精细的虚拟机配置控制（网络、存储、显示等）
- **解决方案**：迁移到 Virt-Manager，同时保留原有 Boxes 镜像

## 二、镜像迁移：从 GNOME Boxes 到 Virt-Manager

### 2.1 镜像文件位置

- **系统包版 Boxes 镜像路径**：`~/.local/share/gnome-boxes/images/`
- **Flatpak 版 Boxes 镜像路径**：`~/.var/app/org.gnome.Boxes/data/gnome-boxes/images/`

### 2.2 导入到 Virt-Manager

**方法一：自动发现（推荐）**

1. 以用户会话模式启动 Virt-Manager：`virt-manager -c qemu:///session`
2. 点击 `文件` → `添加连接`，选择 `QEMU/KVM 用户会话`
3. Boxes 中的虚拟机应自动出现在列表中

**方法二：手动导入**

1. 在 Virt-Manager 中选择 `新建虚拟机` → `导入现有磁盘映像`
2. 浏览到上述 `images` 目录，选择 `.qcow2` 镜像文件
3. 选择操作系统类型和版本
4. **关键步骤**：在最后一步勾选 `安装前自定义配置`

### 2.3 权限问题处理

如果遇到「模拟程序可能没有对路径的搜索权限」错误：

1. 使用用户会话模式启动：`virt-manager -c qemu:///session`
2. 或修改 Virt-Manager 默认连接：`编辑` → `偏好设置` → `连接` → `默认 URI` → 选择 `qemu:///session`

## 三、开启 3D 加速 (VirGL)

### 3.1 配置步骤

在虚拟机**未运行**的状态下，进入硬件配置界面：

1. **视频设备配置**：
   - 左侧选择 `视频` (Video) 设备
   - 型号改为 `virtio`
   - **勾选 `3D 加速`**
2. **显示器设备配置**：
   - 左侧选择 `显示器` (Display) / `Spice 服务器`
   - 监听类型改为 `无` (None)
   - **勾选 `OpenGL`**
   - 选择渲染节点：`renderD128`（对应宿主机的 GPU）
3. 点击 `应用` 保存配置

### 3.2 验证 3D 加速是否生效

在 Linux 虚拟机内执行：

```shell
# 安装 glx-utils
sudo yum install glx-utils -y   # CentOS 7
# 或
sudo apt install mesa-utils -y   # Ubuntu/Debian

# 验证
glxinfo -B | grep "OpenGL renderer"
```

**预期输出**：包含 `virgl` 字样，如 `OpenGL renderer string: virgl`

### 3.3 注意事项

- 3D 加速主要对 **Linux 客户机** 有效，Windows 虚拟机无法使用此功能
- CentOS 7 等较老系统可能需要安装更新的 Mesa 驱动
- 如果启动失败，可尝试将 `显示器` 类型改为 `VNC Server` 测试

## 四、网络配置：虚拟机访问宿主机 80 端口服务

### 4.1 问题现象

- 宿主机上有服务监听 80 端口
- 宿主机本地访问 `127.0.0.1:80` 正常
- 虚拟机使用 `curl http://192.168.124.1` 返回 `连接被拒绝`

### 4.2 排查步骤

**第一步：检查 TCP 连通性**

```shell
# 在虚拟机中测试
nc -zv 192.168.124.1 80
```

**第二步：检查代理设置**

```shell
env | grep -i proxy
# 如果存在代理变量，执行 unset
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
```

**第三步：检查 no_proxy 配置**

- curl **不支持** CIDR 格式（如 `192.168.0.0/16`）
- 应使用通配符：`export no_proxy='localhost,127.0.0.1,192.168.*'`

**第四步：检查宿主机防火墙**

```shell
# 查看 virbr0 所属 zone
sudo firewall-cmd --get-zone-of-interface=virbr0
# 输出：libvirt

# 查看 libvirt zone 配置
sudo firewall-cmd --zone=libvirt --list-all
```

### 4.3 解决方案

在 `libvirt` zone 中添加优先级更高的允许规则：

```shell
# 添加允许 80 端口的规则
sudo firewall-cmd --permanent --zone=libvirt --add-rich-rule='rule priority="1" family="ipv4" port protocol="tcp" port="80" accept'
sudo firewall-cmd --reload
```

### 4.4 验证修复

```shell
# 在虚拟机中测试
nc -zv 192.168.124.1 80
# 预期输出：Connected to 192.168.124.1:80

curl http://192.168.124.1
# 预期输出：HTTP 响应
```

### 4.5 开放其他端口

```shell
sudo firewall-cmd --permanent --zone=libvirt --add-rich-rule='rule priority="1" family="ipv4" port protocol="tcp" port="443" accept'
sudo firewall-cmd --reload
```

### 4.6 重要说明

- `libvirt` zone 使用 **白名单模式**，默认拒绝所有（`rule priority="32767" reject`）
- **不建议删除** 默认拒绝规则，它提供安全保护
- 使用 `--permanent` 参数添加的规则重启后永久生效

## 五、两个核心概念对比

### 5.1 Virt-Manager vs GNOME Boxes

| 特性 | Virt-Manager | GNOME Boxes |
| --- | --- | --- |
| 设计目标 | 专业虚拟化管理 | 开箱即用的简洁体验 |
| 3D 加速开关 | 始终可见，可手动控制 | 自动判断，老旧系统会隐藏 |
| 快照功能 | 稳定可靠 | 容易失败 |
| 网络配置 | 完整（NAT/桥接/隔离） | 仅用户模式 NAT |
| 配置深度 | 极高 | 极低 |

### 5.2 用户会话 vs 系统连接

| 特性 | 用户会话 (qemu:///session) | 系统连接 (qemu:///system) |
| --- | --- | --- |
| 权限范围 | 仅当前用户目录 | 整个系统 |
| 镜像默认位置 | `~/.local/share/libvirt/images/` | `/var/lib/libvirt/images/` |
| 自动启动虚拟机 | 不支持 | 支持 |
| Boxes 镜像访问 | 可直接访问 | 需要复制或修改权限 |
| 适用场景 | 个人桌面用户 | 服务器/生产环境 |

## 六、常用命令速查

```shell
# 以用户会话模式启动 Virt-Manager
virt-manager -c qemu:///session

# 查看虚拟网络状态
sudo virsh net-list --all
sudo virsh net-dumpxml default

# 查看防火墙配置
sudo firewall-cmd --zone=libvirt --list-all
sudo firewall-cmd --permanent --zone=libvirt --list-rich-rules

# 开放端口（libvirt zone）
sudo firewall-cmd --permanent --zone=libvirt --add-rich-rule='rule priority="1" family="ipv4" port protocol="tcp" port="<PORT>" accept'
sudo firewall-cmd --reload

# 查看宿主机监听端口
sudo ss -tlnp | grep :<PORT>

# 查看宿主机虚拟网桥
ip addr show | grep -A2 "virbr"
```

## 七、总结

1. **镜像迁移**：Boxes 和 Virt-Manager 共用 KVM/QEMU 后端，镜像可直接导入，无需转换
2. **3D 加速**：需配置 `视频` 设备为 `virtio` + 勾选 3D 加速，以及 `显示器` 设备勾选 OpenGL
3. **网络访问**：虚拟机访问宿主机服务需要配置 `libvirt` zone 的防火墙规则，添加优先级较高的允许规则
4. **安全性**：保留 `reject` 默认规则，采用白名单模式开放端口，兼顾功能与安全
5. **持久性**：使用 `--permanent` 参数添加的防火墙规则重启后依然有效
