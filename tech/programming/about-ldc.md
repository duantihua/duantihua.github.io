
直接添加 LDC 专用参数，强制动态链接标准库
```shell
ldc2 -v your_program.d -link-defaultlib-shared
```
可以看到最后链接时，链接了动态库(/usr/bin/cc ... -lphobos2-ldc-shared,-ldruntime-ldc-shared)
