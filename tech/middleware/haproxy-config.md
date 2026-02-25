# Haproxy 配置

## 启用gzip压缩
在 `defaults` 部分添加以下配置：
```
defaults
    compression algo gzip
    compression type text/html text/css text/plain text/xml application/json application/javascript application/xml+rss application/vnd.api+json
```

## 启用http/2协议
在 `frontend` 部分的bind语句后追加`alpn h2,http/1.1`：
```
bind *:443 ssl crt /etc/haproxy/certs/your-cert.pem alpn h2,http/1.1
```