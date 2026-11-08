# CentOS 7 编译安装 OpenSSL 3.5.9 与 OpenSSH 10.6p2

本文记录在 CentOS 7 上独立安装 OpenSSL 3.5.9，并基于该版本编译安装 OpenSSH 10.6p2 的完整过程。

系统原有 OpenSSL 安装在 `/usr/local/openssl`，`sshd` 当前链接的是该版本。本次操作的目标是：

- 将 OpenSSL 3.5.9 安装到独立目录，不修改全局 `ldconfig`，不覆盖 `/usr/local/openssl`。
- 编译 OpenSSH 10.6p2 并链接新的 OpenSSL，替换现有 `sshd`。
- 全程不影响 `yum`、`curl` 等依赖系统 OpenSSL 的服务，并保留完整的回滚路径。

> 以下命令默认以 root 身份执行。涉及重启 `sshd` 的步骤，务必保持当前 SSH 会话不关闭，并立即新开终端验证。

## 一、现状确认

操作前先确认当前 `sshd`、OpenSSL 及其库的实际链接情况：

```bash
# 当前 sshd 链接的 OpenSSL
ldd $(which sshd) | grep -E 'ssl|crypto'

# 全局库缓存
ldconfig -p | grep -E 'libssl|libcrypto'

# 当前 openssl 命令
which openssl
openssl version
```

确认结果如下：

- `/usr/bin/openssl` 指向 `/usr/local/openssl/bin/openssl`。
- `sshd`、`ssh` 均链接 `/usr/local/openssl/lib` 下的库。
- `/etc/ld.so.conf.d/` 中已包含 `/usr/local/openssl/lib`。

基于以上现状，新的 OpenSSL 3.5.9 必须安装到独立目录，避免影响现有 SSH 环境和其他系统服务。

## 二、安装 OpenSSL 3.5.9

### 1. 安装依赖

```bash
sudo yum install -y gcc gcc-c++ glibc make autoconf pcre-devel pam-devel perl-Digest-SHA
sudo yum install -y zlib zlib-devel perl-IPC-Cmd perl-Data-Dumper perl-Time-Piece
```

### 2. 下载并解压

```bash
mkdir -p /root/software
cd /root/software
wget --no-check-certificate https://github.com/openssl/openssl/releases/download/openssl-3.5.9/openssl-3.5.9.tar.gz
tar -xvzf openssl-3.5.9.tar.gz
rm -f openssl-3.5.9.tar.gz
cd openssl-3.5.9
```

### 3. 配置编译参数

```bash
./config shared zlib \
  --prefix=/usr/local/openssl-3.5.9 \
  --openssldir=/usr/local/openssl-3.5.9/ssl \
  -Wl,-rpath,/usr/local/openssl-3.5.9/lib64
```

参数说明：

- `--prefix` 和 `--openssldir` 都指向独立目录，避免覆盖系统现有 OpenSSL。
- `-Wl,-rpath,...` 让二进制自带库搜索路径，运行时无需依赖全局 `ldconfig` 即可找到 `libssl.so.3`。
- 未启用 `enable-fips`，以降低首次编译失败的概率。

### 4. 编译安装

```bash
make -j4
make install
```

### 5. 验证安装结果

```bash
/usr/local/openssl-3.5.9/bin/openssl version -a
ldd /usr/local/openssl-3.5.9/bin/openssl | grep -E 'ssl|crypto'
readelf -d /usr/local/openssl-3.5.9/bin/openssl | grep -i rpath
```

预期结果：

- 版本显示为 OpenSSL 3.5.9。
- `libssl.so.3`、`libcrypto.so.3` 指向 `/usr/local/openssl-3.5.9/lib64`。
- RPATH 包含 `/usr/local/openssl-3.5.9/lib64`。

> 如果首次编译时漏加了 `-Wl,-rpath`，运行会报 `libssl.so.3: cannot open shared object file`。可先用 `LD_LIBRARY_PATH=/usr/local/openssl-3.5.9/lib64` 临时验证，然后执行 `make clean`，带上 rpath 参数重新编译。

## 三、备份现有 SSH 环境

必须在 OpenSSH 执行 `make install` 覆盖现有文件之前完成备份。

### 1. 备份二进制文件

```bash
cp -a /usr/sbin/sshd /usr/sbin/sshd.bak_$(date +%F)
cp -a /usr/bin/ssh /usr/bin/ssh.bak_$(date +%F)
for f in ssh-keygen scp sftp ssh-add ssh-agent ssh-keyscan; do
  [ -f /usr/bin/$f ] && cp -a /usr/bin/$f /usr/bin/$f.bak_$(date +%F)
done
```

### 2. 备份配置文件

```bash
cp -a /etc/ssh /etc/ssh.bak_$(date +%F)
cp -a /etc/pam.d/sshd /etc/pam.d/sshd.bak_$(date +%F) 2>/dev/null
```

### 3. 备份 init 脚本

CentOS 7 上 `sshd` 由 SysV 脚本管理，`/usr/lib/systemd/system/` 下没有对应的 unit 文件：

```bash
systemctl status sshd
# 输出显示 Loaded: /etc/rc.d/init.d/sshd

cp -a /etc/rc.d/init.d/sshd /etc/rc.d/init.d/sshd.bak_$(date +%F)
```

### 4. 确认备份文件

```bash
ls -l /usr/sbin/sshd.bak_* /etc/ssh.bak_* /etc/rc.d/init.d/sshd.bak_*
```

## 四、编译安装 OpenSSH 10.6p2

### 1. 下载源码

```bash
cd /root/software
wget https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-10.6p2.tar.gz
tar -xzf openssh-10.6p2.tar.gz
cd openssh-10.6p2
```

### 2. 配置编译参数

指定 OpenSSL 3.5.9，并将 RPATH 写入最终二进制：

```bash
export LDFLAGS="-Wl,-rpath,/usr/local/openssl-3.5.9/lib64 -L/usr/local/openssl-3.5.9/lib64"
export CPPFLAGS="-I/usr/local/openssl-3.5.9/include"

./configure \
  --prefix=/usr \
  --sysconfdir=/etc/ssh \
  --with-ssl-dir=/usr/local/openssl-3.5.9 \
  --with-pam \
  --with-zlib \
  LDFLAGS="-Wl,-rpath,/usr/local/openssl-3.5.9/lib64 -L/usr/local/openssl-3.5.9/lib64"
```

关键点：

- `--with-ssl-dir` 必须指向新安装的 OpenSSL 3.5.9。
- `LDFLAGS` 同时通过环境变量和 `configure` 命令行参数传入，确保 rpath 写入最终二进制。
- `--with-pam` 必须保留，避免受到 OpenSSH 10.6p2 修复的“禁用 PAM 时认证绕过”漏洞影响。

### 3. 编译安装

```bash
make -j4
make install
```

安装过程中会看到以下信息：

- `/etc/ssh/ssh_config`、`sshd_config`、`moduli` 已存在，因此不会被覆盖。
- 自动生成新的主机密钥 `ssh_host_mldsa44_ed25519_key`（后量子混合密钥），原有密钥保留。
- 自动执行 `/usr/sbin/sshd -t -f /etc/ssh/sshd_config`，无报错。

### 4. 安装后验证（重启前必做）

```bash
ldd /usr/sbin/sshd | grep -E 'ssl|crypto'
# 预期：libcrypto.so.3 => /usr/local/openssl-3.5.9/lib64/libcrypto.so.3

readelf -d /usr/sbin/sshd | grep -i rpath
# 预期：RPATH: [/usr/local/openssl-3.5.9/lib64]

/usr/sbin/sshd -V
# 预期：OpenSSH_10.6p2, OpenSSL 3.5.9 29 Sep 2026

/usr/sbin/sshd -t
# 无输出即表示配置语法通过

ls -l /etc/ssh/ssh_host_*
# 确认原有 RSA/ECDSA/Ed25519/DSA 密钥仍在，并新增 mldsa44_ed25519 密钥
```

确认以上结果无误后，再重启 `sshd`。

## 五、重启 sshd 并验证新连接

### 1. 重启 sshd

保持当前 SSH 会话不关闭，执行：

```bash
systemctl restart sshd
```

### 2. 立刻新开终端测试登录

新窗口登录成功后，执行：

```bash
sshd -V
# OpenSSH_10.6p2, OpenSSL 3.5.9

systemctl status sshd --no-pager
# Active: active (running)
```

### 3. 日志中的正常提示

日志中可能出现：

```text
WARNING: connection ... is not using a post-quantum key exchange algorithm: "curve25519-sha256"
```

这是 OpenSSH 10.6p2 对客户端未启用后量子密钥交换的提示，并非错误，不影响登录。

### 4. 新连接失败时立即回滚

在尚未断开的旧会话中执行以下命令。若跨天操作，请将 `$(date +%F)` 替换为实际备份文件中的日期：

```bash
cp -a /usr/sbin/sshd.bak_$(date +%F) /usr/sbin/sshd
systemctl restart sshd
```

## 六、清理与收尾

### 1. 清理截断的主机密钥文件

先确认该文件未被配置引用：

```bash
grep -i ecdsa_key.pu /etc/ssh/sshd_config
# 无输出，确认未被引用
```

然后删除多余的截断文件：

```bash
rm -f /etc/ssh/ssh_host_ecdsa_key.pu
```

清理后，`/etc/ssh/ssh_host_*` 应为每种密钥的“私钥 + `.pub`”一一对应，没有多余文件。

### 2. 最终确认

```bash
/usr/sbin/sshd -t
systemctl status sshd --no-pager
```

### 3. 备份保留策略

回滚文件至少保留一周，确认服务稳定后再清理：

```bash
ls -l /usr/sbin/sshd.bak_* /etc/ssh.bak_* /etc/rc.d/init.d/sshd.bak_*
```

## 七、关键经验与维护提醒

- **隔离安装**：OpenSSL 3.5.9 安装在 `/usr/local/openssl-3.5.9`，不修改全局 `ldconfig`，不覆盖 `/usr/bin/openssl` 和 `/usr/local/openssl`。
- **RPATH 是核心**：编译 OpenSSL 和 OpenSSH 时都必须带上 `-Wl,-rpath,/usr/local/openssl-3.5.9/lib64`，否则运行时会找不到 `.so.3`。
- **不要为 RPM 依赖修改全局库路径**：例如 `basctl` 等 RPM 报缺少 `libssl.so.3` 时，可使用 `rpm -ivh --nodeps` 安装，运行时通过 `LD_LIBRARY_PATH` 指定新库，不要把 `.so.3` 软链接进 `/usr/lib64/`。
- **升级 OpenSSL 3.5.9 时**：覆盖 `/usr/local/openssl-3.5.9/lib64` 下的库会直接影响 `sshd`。升级前备份库文件，升级后先执行 `ldd`、`sshd -t` 验证，再重启服务。
- **以后升级 OpenSSH 时**：重新编译同样需要带 `--with-ssl-dir` 和 rpath 参数，否则可能回退链接系统库。
- **systemd 管理方式**：本机 `sshd` 由 `/etc/rc.d/init.d/sshd` 管理，`systemctl restart sshd` 实际调用该脚本。`make install` 不会覆盖它，但回滚时如需完整恢复，可一并还原。

## 八、最终状态

| 项目 | 状态 |
|---|---|
| OpenSSL 3.5.9 | 安装于 `/usr/local/openssl-3.5.9`，带 RPATH，独立运行 |
| OpenSSH 10.6p2 | `/usr/sbin/sshd` 链接 OpenSSL 3.5.9，已重启并验证新连接 |
| 系统原有 OpenSSL | `/usr/local/openssl` 保持原样，继续服务 `yum`、`curl` 等 |
| 主机密钥 | 原有密钥保留，新增 ML-DSA 混合密钥 |
| 备份 | 二进制、配置、init 脚本均已备份，回滚路径可用 |

---
<div style="text-align: right;"><small>最后更新：2026-11-08</small></div>
