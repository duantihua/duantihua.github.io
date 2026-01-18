# CentOS 7 更换为国内镜像源
CentOS 7 已经停止更新，如果需要在国内服务器上安装 CentOS 7，建议使用华为的镜像源。日后维护的过程中，可以进行更新和维护。

## 1.替换为华为的镜像源
```shell
sudo curl -o /etc/yum.repos.d/CentOS-Base.repo https://repo.huaweicloud.com/repository/conf/CentOS-7-anon.repo
```

## 2.安装epel镜像
安装EPEL镜像源,并将其中的`http://download.fedoraproject.org/pub/epel`替换为`https://repo.huaweicloud.com/epel`。

```shell
sudo yum install epel-release
sudo sed -i 's|http://download.fedoraproject.org/pub/epel|https://repo.huaweicloud.com/epel|g' /etc/yum.repos.d/epel.repo
sudo sed -i 's|^#baseurl|baseurl|g' /etc/yum.repos.d/epel.repo
sudo sed -i 's|^metalink|#metalink|g' /etc/yum.repos.d/epel.repo
```

## 3.更新yum缓存
```shell
yum clean all
yum makecache
yum update
```

## 4.关于SCL
<span style="color: red; font-style: italic;">SCL</span>（Software Collections）是一个用于在CentOS 7上安装和管理多个版本的开发工具的工具集。它允许用户在同一台服务器上同时安装和使用不同版本的GCC、Python、Ruby等开发工具。使用如下命令：

```shell
sudo yum install centos-release-scl
```
但是目前这个镜像已经不能使用了。

---
<small>最后更新：2026-01-17</small>

