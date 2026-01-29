# 如何在CentOS 7上安装GCC9
CentOS 7默认的GCC版本是4.8.5，如果需要编译很多新的开源软件，建议安装GCC9，以下是如何手工安装GCC9.5.0。

## 1.安装开发工具
```shell
sudo yum install -y gcc gcc-c++ make wget tar bzip2
sudo yum install -y gmp-devel mpfr-devel libmpc-devel zlib-devel
```

## 2.编译GCC9
编译优先只支持C/C++语言，这样可以加快编译速度。
```shell
sudo su - 
cd /opt
wget https://ftp.gnu.org/gnu/gcc/gcc-9.5.0/gcc-9.5.0.tar.gz
tar xvf gcc-9.5.0.tar.gz
cd gcc-9.5.0
mkdir build && cd build
../configure \
  --prefix=/usr/local/gcc-9.5.0 \
  --enable-bootstrap \
  --enable-languages=c,c++ \
  --disable-multilib \
  --with-gmp=/usr \
  --with-mpfr=/usr \
  --with-mpc=/usr

make -j16
make install
```

## 3.全局设置
编辑 `/etc/profile` 文件，添加如下内容：
```shell
export PATH=/usr/local/gcc-9.5.0/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/gcc-9.5.0/lib64:$LD_LIBRARY_PATH
```
## 4.验证安装
```shell
gcc --version
```

## 5.清理
这个目录/opt/gcc-9.5.0/ 包含了GCC9.5.0的所有文件，如果验证完成后，建议删除该目录。
```shell
rm -rf /opt/gcc-9.5.0
```

---
<div style="text-align: right;"><small>最后更新：2026-01-17</small></div>
