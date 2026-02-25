```shell
## 生成公钥
ssh-keygen -t ed25519 -f ~/.ssh/ems_rsa -N "" -C "ems-server-to-server"
## 如果遇到 libcrypto 错误，可以尝试使用 RSA 密钥：
## ssh-keygen -t rsa -b 4096 -f ~/.ssh/ems_rsa -N "" -C "ems-server-to-server"

## 私钥和公钥只能自己使用
chmod 600 ~/.ssh/ems_rsa*
## 将公钥复制到服务器
ssh-copy-id -i ~/.ssh/ems_rsa.pub openurp@192.168.1.16
## 手动添加服务器公钥到 known_hosts
ssh-keyscan -H 192.168.1.16 >> ~/.ssh/known_hosts

## 测试登录
ssh -i ~/.ssh/ems_rsa openurp@192.168.1.16
```

---

<div style="text-align: right;"><small>最后更新：2026-01-29</small></div>
