# CentOS 7 安装LLVM20

## 1.准备环境
编译LLVM需要CMake4，可以参考[CentOS 7 安装CMake4](/tech/linux/centos-7-install-cmake4.md)，以及高版本的GCC。

## 下载或者克隆相应的版本
```shell
git clone --depth 1 https://github.com/llvm/llvm-project.git
```

## 开始编译
最好准备8核，8G内存以上，200G以上的磁盘，编译过程预计需要15-20分钟。
```shell
cd llvm-project
export PKG_CONFIG_PATH=/usr/local/lib64/pkgconfig:$PKG_CONFIG_PATH
export CMAKE_PREFIX_PATH=/usr/local:$CMAKE_PREFIX_PATH

mkdir build && cd build
cmake \
  -DCMAKE_C_COMPILER=/usr/local/gcc-9.5.0/bin/gcc \
  -DCMAKE_CXX_COMPILER=/usr/local/gcc-9.5.0/bin/g++ \
  -DCMAKE_INSTALL_PREFIX=/usr/local \
  -DCMAKE_INSTALL_LIBDIR=lib64 \
  -DLLVM_ENABLE_PROJECTS="llvm;clang;lldb" \
  -DLLVM_TARGETS_TO_BUILD="X86" \
  -S llvm -B build -G "Ninja" 
```

配置好后，执行编译
```shell
ninja -j$(nproc)
ninja install
```

---
<small>最后更新：2026-01-18</small>
