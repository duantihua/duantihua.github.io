# Centos 7 安装CMake4

## 1.准备环境
```shell
sudo yum install gcc gcc-c++
sudo yum install make git gdb
sudo yum install zip zlib-devel wget
```
## 2.安装CMake4
CMake4 是一个跨平台的构建工具，用于管理软件项目的构建过程。它支持多种编程语言和构建系统，包括C、C++、Java、Python等。他广泛用于生成构建规则，然后使用Make, Ninja等构建系统进行编译。

CentOS 7 安装CMake4,需要事先安装[高版本GCC](/tech/linux/centos-7-install-gcc9.md)和以及[OpenSSL](/tech/linux/centos-7-install-openssl3.md),以及[Python3](/tech/linux/centos-7-install-python3.md),步骤如下：

```shell
sudo su - 
mkdir -p /opt/cmake
cd /opt/cmake
wget https://cmake.org/files/v4.2/cmake-4.2.1.zip
unzip cmake-4.2.1.zip
cd cmake-4.2.1
./configure --prefix=/usr/local
make && make install
```

## 3.安装Ninja
Ninja 是一个快速的构建系统，由Google开发，用于管理项目的构建过程。它的设计目标是提供快速的构建速度和简单的配置。

在CentOS 7 上安装Ninja,可以使用以下命令：
```shell
sudo yum install ninja-build
```
---
<small>最后更新：2026-01-17</small>
