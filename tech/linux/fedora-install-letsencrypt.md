# Fedora 安装LetsEncrypt证书
如果你有个阿里云的域名(youdomain.cn)需要自动申请证书，需要先配置好阿里云的AccessKey ID和AccessKey Secret。这里记录下Fedora系统下如何一步步配置。
## 准备
使用root用户：
```shell
mkdir -p /etc/letsencrypt
vim /etc/letsencrypt/aliyun.ini
#把如下内容放入aliyun.ini
dns_aliyun_access_key = 你的AccessKey ID
dns_aliyun_access_key_secret = 你的AccessKey Secret
# 更改文件访问权限
chmod 600 /etc/letsencrypt/aliyun.ini
```

## 1. 切换到 root 用户
```shell
sudo -i  # 直接进入root的交互式会话
```

## 2. 在 root 用户下安装插件（pip3 安装）
```shell
# 先安装pip3（如果root用户下没有）
dnf install -y python3-pip
# 先卸载旧版本（如果有）
pip3 uninstall -y certbot-dns-aliyun
# 安装阿里云DNS插件（root用户全局安装）
pip3 install certbot-dns-aliyun
# 查看插件安装路径（复制输出的路径，后续需要）
pip3 show certbot-dns-aliyun | grep Location
```

## 3. 配置PYTHONPATH
```shell
# 编辑/root/.bashrc,添加一行
export PYTHONPATH=/usr/local/lib/python3.13/site-packages:$PYTHONPATH
# 执行source
source /root/.bashrc
echo $PYTHONPATH
```
## 4. 验证插件
```shell
# 如果出现 * dns-aliyun这一段就说明成功了
certbot plugins
```
## 5. 执行证书申请命令
```shell
certbot certonly  --dns-aliyun-credentials /etc/letsencrypt/aliyun.ini -d youdomain.cn -d *.youdomain.cn --email duantihua@163.com
```
会提示如下内容：
```shell
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/youdomain.cn/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/youdomain.cn/privkey.pem
This certificate expires on 2026-03-21.
```
## 6. 启用定时任务
```shell
# 启动定时器
systemctl start certbot-renew.timer
# 设置开机自启
systemctl enable certbot-renew.timer
# 查看
systemctl list-timers *certbot*
```
## 7. 配置 HAProxy 专属的续期钩子

```shell
vim /etc/letsencrypt/renewal-hooks/deploy/haproxy-deploy.sh
# 填入一下内容
#!/bin/bash
mkdir -p /etc/haproxy/certs/
# 合并私钥和证书链为 HAProxy 可用的 pem 文件
cat /etc/letsencrypt/live/youdomain.cn/privkey.pem /etc/letsencrypt/live/youdomain.cn/fullchain.pem > /etc/haproxy/certs/youdomain.cn.pem
# 设置证书文件权限（HAProxy 要求只读，避免权限过高）
chmod 600 /etc/haproxy/certs/youdomain.cn.pem
chown root:root /etc/haproxy/certs/youdomain.cn.pem
# 平滑重启 HAProxy（不中断业务）
systemctl reload haproxy

chmod +x /etc/letsencrypt/renewal-hooks/deploy/haproxy-deploy.sh
```

## 8. 模拟续期/强制续期
```shell
certbot renew --dry-run
certbot renew --force-renewal
```

---
<div style="text-align: right;"><small>最后更新：2026-01-29</small></div>
