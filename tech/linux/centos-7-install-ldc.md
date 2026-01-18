# Centos 7 安装LDC
LDC 是 D 语言基于LLVM的编译器，用于将 D 代码编译为可执行文件。他的预编译版本可能会使用Glibc的高版本，所以需要手工编译。

## 1.下载LDC
```shell
cd /opt
git clone --depth 1  https://gitee.com/mirrors/LDC.git ldc
cd ldc
git submodule  update --init
git checkout -b v1.41.0
```
## 2.开始编译
```shell
export DC=dmd
export CC=gcc
export CXX=g++

cmake -G Ninja \
  -DCMAKE_INSTALL_PREFIX=/usr/local \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=gcc\
  -DCMAKE_CXX_COMPILER=g++\
  -DLIB_SUFFIX=64 \
  -DLLVM_TARGETS_TO_BUILD="X86"\
  -S . \
  -B build

```

## 3.进行安装
```shell
ninja -j$(nproc)
ninja install
```
---
<small>最后更新：2026-01-18</small>
