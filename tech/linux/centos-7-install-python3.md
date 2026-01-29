# CentOS 7 安装Python3

## 1.准备环境
```shell
sudo yum install -y centos-release-scl
sudo yum install -y devtoolset-9-gcc devtoolset-9-gcc-c++ devtooset-9-make
sudo yum erase python3

sudo yum -y install gcc gcc-C++ wget tar zlib zlib-devel libffi libffi-devel
sudo yum -y install bzip2 bzip2-devel readline-devel sqlite sqlite-devel xz xz-devel
sudo yum -y install ncurses-devel tk-devel db4-devel libpcap-devel
```
## 2.下载编译

```shell
cd /opt

wget https://www.python.org/ftp/python/3.15.0/Python-3.15.0a5.tgz
tar -xzf Python-3.15.0a5.tgz

cd Python-3.15.0a5/

./configure \
  --prefix=/usr/local \
  --libdir=/usr/local/lib64 \
  --enable-optimizations \
  --enable-shared \
  --with-openssl=/usr/local #manual installed

make -j16 && make install
```

## 3.安装文件
```shell
ls /usr/local/lib64/ |grep libpython3.15
ls /usr/local/lib64/pkgconfig |grep python3.pc

ln -s /usr/local/bin/python3 /usr/bin/python3
ln -s /usr/local/in/pip3 /usr/bin/pip3
```
## 4.配置库
编辑加载配置文件
```shell
sudo vi /etc/ld.so.conf
```
添加以下内容

    /usr/local/lib64

编辑环境变量配置文件
```shell
sudo vi /etc/profile
export PKG_CONFIG_PATH=/usr/local/lib64/pkgconfig:$PKG_CONFIG_PATH
export CMAKE_PREFIX_PATH=/usr/local:$CMAKE_PREFIX_PATH
```

最后加载配置
```shell
ldconfig

vi ~/.bashrc
alias python='python3'
source ~/.bashrc
```

## 5.验证
```shell
python3 --version
pkg-config --modversion python3
```

---
<div style="text-align: right;"><small>最后更新：2026-01-17</small></div>
