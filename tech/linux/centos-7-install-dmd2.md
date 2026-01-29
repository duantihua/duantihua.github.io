# Centos 7 安装DMD2

DMD2是D语言的编译器，用于将D代码编译为可执行文件。他一般不需要编译的，本次只是安装到系统目录中，方便使用。

# 1.下载DMD2
```shell
sudo wget https://dlang.org/install.sh
sudo chmod +x install.sh
sudo ./install.sh dmd-2.112.0
```
# 2.检查dmd所依赖的GLIB版本
CentOS 7中的GLIBC版本为2.17，dmd-2.112.0依赖的GLIBC版本为2.17，所以可以直接使用。
如果不能使用，请降级使用dmd的其他版本。
```shell
sudo readelf -s ~/dlang/dmd-2.112.0/linux/bin64/dmd|grep -E 'GLIBC_2.'
```
# 3.安装
将可执行文件、库以及头文件复制到系统目录中。
```shell
sudo cp ~/dlang/dmd-2.112.0/linux/bin64/{dmd,rdmd,ddemangle,dub,dustmite} /usr/local/bin
sudo cp -P ~/dlang/dmd-2.112.0/linux/lib64/* /usr/local/lib64/
sudo mkdir -p /usr/local/include/d/dmd/{phobos,druntime}
sudo cp -r ~/dlang/dmd-2.112.0/src/phobos/{std,etc} /usr/local/include/d/dmd/phobos/
sudo cp -r ~/dlang/dmd-2.112.0/src/druntime/import/* /usr/local/include/d/dmd/druntime/
```
## 4.编辑配置
sudo vi /etc/dmd.conf
```ini
[Environment]
DFLAGS=-I/usr/local/include/d/dmd/phobos -I/usr/local/include/d/dmd/druntime -L-L/usr/local/l
ib64 -L--export-dynamic -fPIC
```
---
<div style="text-align: right;"><small>最后更新：2026-01-18</small></div>
