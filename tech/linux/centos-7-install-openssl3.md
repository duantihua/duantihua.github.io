# CentOS 7 安装OpenSSL3
CentOS 自带的OpenSSL版本为1.0.2k，而我们需要安装的是3.5.4 LTS版本。

## 1.安装依赖包
```shell
sudo yum install -y gcc gcc-c++ glibc make autoconf pcre-devel pam-devel perl-Digest-SHA
sudo yum install -y zlib zlib-devel perl-IPC-Cmd perl-Data-Dumper perl-Time-Piece 
```

## 2.编译安装
```shell
sudo su - 
cd /opt
wget --no-check-certificate https://github.com/openssl/openssl/releases/download/openssl-3.5.4/openssl-3.5.4.tar.gz
tar -xvzf openssl-3.5.4.tar.gz
rm -f openssl-3.5.4.tar.gz
cd openssl-3.5.4
./config shared zlib enable-fips --prefix=/usr/local --openssldir=/usr/local/ssl shared zlib
make -j4 && make install
```
## 3.备份原来的OpenSSL
```shell
mv /usr/bin/openssl /usr/bin/openssl.bak
mv /usr/include/openssl /usr/include/openssl.bak
```
## 4.创建软连接
因为源码安装默认安装的位置是 /usr/local/ssl 需要将创建软链接到系统位置:
```shell
ln -sf /usr/local/bin/openssl /usr/bin/openssl
ln -sf /usr/local/include/openssl /usr/include/openssl
```
## 5.修改链接库

通过 find / -name libcrypto.so.3 和 ibssl.so.3 查找到对应so文件的位置，并建立软连接
```shell
ln -sf /usr/local/lib64/libssl.so.3 /usr/lib/libssl.so.3
ln -sf /usr/local/lib64/libcrypto.so.3 /usr/lib/libcrypto.so.3

ldconfig
```
## 6.验证
```shell
openssl version -a
```

---
<small>最后更新：2026-01-17</small>
