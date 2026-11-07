# CentOS 8 源码编译安装 HAProxy 2.0

## 结论先行

在 CentOS 8 上安装 HAProxy 2.0 必须从源码编译，因为官方仓库仅提供 1.8.15 版本。

编译时**必须先安装 `systemd-devel` 包**，并加上 `USE_SYSTEMD=1` 参数，否则 systemd 服务启动时会报：

```text
master-worker mode with systemd support (-Ws) requested, but not compiled
```

## 1. 安装编译依赖

CentOS 8 的 PowerTools 仓库包含部分必要依赖，需先启用：

```shell
dnf config-manager --enable PowerTools
```

单独先装上 `systemd-devel`（`USE_SYSTEMD=1` 所需的头文件由它提供，漏装会导致编译期找不到 sdnotify 支持）：

```shell
yum install -y systemd-devel
```

然后安装完整的编译工具链和库文件：

```shell
dnf install -y gcc openssl-devel readline-devel systemd-devel make pcre-devel tar lua lua-devel
```

关键依赖说明：

- `systemd-devel`：提供 `USE_SYSTEMD=1` 所需的头文件（**必须**）
- `openssl-devel`：支持 SSL/TLS
- `pcre-devel`：支持正则表达式

## 2. 下载源码

```shell
cd /root
curl -O https://www.haproxy.org/download/2.0/src/haproxy-2.0.35.tar.gz
tar xf haproxy-2.0.35.tar.gz
cd haproxy-2.0.35
```

## 3. 编译（关键步骤）

务必使用完整编译参数，特别是 `USE_SYSTEMD=1`：

```shell
make clean
make -j $(nproc) \
  TARGET=linux-glibc \
  USE_OPENSSL=1 \
  USE_ZLIB=1 \
  USE_PCRE=1 \
  USE_SYSTEMD=1 \
  USE_LUA=1 \
  USE_THREAD=1
```

参数含义：

- `USE_SYSTEMD=1`：启用 systemd 的 sdnotify 支持，**默认不开启**
- `USE_OPENSSL=1`：支持 HTTPS
- `USE_ZLIB=1`：支持 zlib 压缩
- `USE_PCRE=1`：启用 PCRE 正则
- `USE_LUA=1`：启用 Lua 脚本
- `USE_THREAD=1`：启用多线程（CentOS 8 默认支持）

## 4. 安装

```shell
make PREFIX=/opt/haproxy-2.0.35 install
ln -s /opt/haproxy-2.0.35/sbin/haproxy /usr/sbin/haproxy
```

## 5. 验证编译结果

```shell
haproxy -vv | grep -i systemd
```

输出中应包含 `+SYSTEMD` 标志，表示 systemd 支持已成功编译进去。如果没有，则 `-Ws` 参数仍然无法使用。

## 6. 创建服务用户和目录

```shell
groupadd -g 992 haproxy 2>/dev/null
useradd -g 992 -u 995 -m -d /var/lib/haproxy -s /sbin/nologin -c haproxy haproxy 2>/dev/null
mkdir -p /etc/haproxy
mkdir -p /var/lib/haproxy
touch /var/lib/haproxy/stats
chown -R haproxy:haproxy /var/lib/haproxy
```

## 7. 创建 Systemd 服务文件

HAProxy 源码中自带 systemd 服务模板，可直接使用：

```shell
cd /root/haproxy-2.0.35/contrib/systemd/
make
cp haproxy.service /etc/systemd/system/
```

或者手动创建 `/etc/systemd/system/haproxy.service`：

```ini
[Unit]
Description=HAProxy Load Balancer
After=syslog.target network.target

[Service]
Type=notify
EnvironmentFile=-/etc/sysconfig/haproxy
ExecStart=/usr/sbin/haproxy -Ws -f $CONFIG_FILE -p $PID_FILE $CLI_OPTIONS
ExecReload=/bin/kill -USR2 $MAINPID
KillMode=mixed

[Install]
WantedBy=multi-user.target
```

创建环境变量文件 `/etc/sysconfig/haproxy`：

```shell
CONFIG_FILE=/etc/haproxy/haproxy.cfg
PID_FILE=/run/haproxy.pid
CLI_OPTIONS=""
```

## 8. 配置防火墙

```shell
firewall-cmd --permanent --zone=public --add-service=http
firewall-cmd --permanent --zone=public --add-port=8181/tcp
firewall-cmd --reload
```

## 9. 启动验证

```shell
systemctl daemon-reload
systemctl enable haproxy
systemctl start haproxy
systemctl status haproxy
```

## 关于 "-Ws" 报错的原因

`-Ws` 参数要求 HAProxy 以 master-worker 模式运行，并支持 systemd 的 `Type=notify` 机制。

官方编译默认不启用 `USE_SYSTEMD`，因此源码安装时如果漏掉这个参数（以及它依赖的 `systemd-devel` 包），服务启动就会报错。

解决方案只有一个：安装 `systemd-devel` 后重新编译并确保加上 `USE_SYSTEMD=1`；或者改用 `-W` 参数（但会失去 systemd 的进程监控能力）。
