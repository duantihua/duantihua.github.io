# Bootstrap 4.6 → 5.3 模板迁移手册

> 用途：把一个还在用 Bootstrap 4.6 的旧项目迁到 BS 5.3。只讲**页面模板要改什么、怎么改、怎么查**，
> 不涉及构建、打包与静态资源部署。模板语言（FTL / JSP / Thymeleaf / 前端组件）不影响结论。

迁移有 5 步，顺序别调：

1. **属性**（`data-*` → `data-bs-*`）—— 漏一个就是"点了没反应"，但控制台干净。
2. **纯类名**（第 2 节对照表）—— 能搜能替的部分。
3. **结构**（第 3 节）—— 有 6 处不是改类名能解决的，要重写标签。
4. **自有主题 CSS**（第 4 节）—— 三个"默认值反转"陷阱，破坏面最大且不报错。
5. **扫描 + 逐页目视**（第 5 节）。

> 如果页面里的 `<div class="...">` 是**自己标签库生成的**，优先改生成端（模板/标签类），
> 而不是逐个调用页去改 —— 一次改动覆盖全部页面。

## 1. 属性：唯一"必须全改"的一类

| BS4 | BS5 |
|---|---|
| `data-toggle="…"` | `data-bs-toggle="…"` |
| `data-target` / `data-dismiss` / `data-ride` / `data-spy` / `data-parent` / `data-content` | 同样加 `bs-` 前缀：`data-bs-target` / `data-bs-dismiss` / … |
| `data-display="static"` | `data-bs-display="static"` |
| `data-original-title` | 删掉，统一写 `title` |

**BS5 的组件不再注册 jQuery 插件方法**，旧写法会报 `xxx is not a function`：

```js
// BS4
$(el).tab('show');  $el.modal('hide');  $el.dropdown('hide');
// BS5
bootstrap.Tab.getOrCreateInstance(el).show();
bootstrap.Modal.getOrCreateInstance(el).show();
bootstrap.Dropdown.getOrCreateInstance(el).hide();
```

注意 **JS 不是全部要换成原生**：只是"Bootstrap 组件挂在 jQuery 上那层壳"没了，
项目里其它用 jQuery 的地方（ajax、日期控件、第三方插件）照旧。

## 2. 类名对照

### 2.1 直接改名（一一对应）

| BS4 | BS5 |
|---|---|
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `float-left` / `float-right`（含 `float-sm-*` 变体） | `float-start` / `float-end` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `border-left` / `border-right` | `border-start` / `border-end` |
| `dropdown-menu-right` | `dropdown-menu-end` |
| `font-weight-*` | `fw-*` |
| `.custom-select` | `.form-select` |
| `.badge-{primary,danger,…}` | `.text-bg-{…}`（`.badge` 在 BS5 不再带背景色，不换就是"无色文字"） |
| `.form-group` | `mb-3` 之类普通间距类 |
| `.form-inline` | `d-flex flex-wrap align-items-center gap-2` |
| `.btn-block` | `w-100`（或外层 `d-grid`） |

### 2.2 不用动的部分

`table-striped / hover / sm / bordered / responsive`、`card / card-header / card-body / card-footer`、
`nav / nav-item / nav-link / nav-tabs`、`dropdown / dropdown-item / dropdown-toggle`、`btn-*`、
`form-control`、`input-group-text`、`border-*`、`p-N`、`d-flex`、`text-muted / small / body` —— 语义未变。
BS 5.3 的暗色主题 API `data-bs-theme="dark"` 也可以直接用。

## 3. 必须改结构：只改类名不够

### 3.1 关闭按钮 `.close` → `.btn-close`

BS4 的 `.close` 是"文字 ×"，BS5 的 `.btn-close` 是**背景图图标 + 绝对定位**，所以要连标签一起换：

```ftl
[#-- BS4 --]
<div class="alert alert-warning alert-dismissible">
  <button class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
  提示内容
</div>

[#-- BS5 --]
<div class="alert alert-warning alert-dismissible">
  <button class="btn-close" data-bs-dismiss="alert" aria-label="关闭"></button>
  提示内容
</div>
```

若主题 CSS 里给旧的 `.close` 写过内边距（例如 `0.75rem`），要挪到 `.btn-close` 上，否则图标会贴边。

### 3.2 input-group：删掉 `prepend` / `append` 包裹层

`.input-group-text` 和按钮必须是 `.input-group` 的**直接子元素**，否则圆角和 flex 规则不生效：

```ftl
[#-- BS4 --]
<div class="input-group">
  <div class="input-group-prepend"><span class="input-group-text">@</span></div>
  <input type="text" class="form-control"/>
  <div class="input-group-append"><button class="btn btn-outline-secondary">查询</button></div>
</div>

[#-- BS5 --]
<div class="input-group">
  <span class="input-group-text">@</span>
  <input type="text" class="form-control"/>
  <button class="btn btn-outline-secondary">查询</button>
</div>
```

### 3.3 按钮组单选：`.btn-group-toggle` 整套机制被删除

`btn-group-toggle` + `data-toggle="buttons"` 在 BS5 里没有了，改成 `.btn-check`（input 在前、label 用 `for` 关联，纯 CSS 生效，不需要 JS）：

```ftl
[#-- BS4 --]
<div class="btn-group btn-group-toggle" data-toggle="buttons">
  [#list items as it]
  <label class="btn btn-outline-primary">
    <input type="radio" name="status" value="${it}"/>${it}
  </label>
  [/#list]
</div>

[#-- BS5 --]
<div class="btn-group">
  [#list items as it]
  <input type="radio" class="btn-check" name="status" id="status_${it_index}" value="${it}"/>
  <label class="btn btn-outline-primary" for="status_${it_index}">${it}</label>
  [/#list]
</div>
```

⚠️ `id` 必须唯一（循环里别忘了索引），否则 `label[for]` 会全部指向第一个 input。

### 3.4 文件选择：`.custom-file*` → `.form-control`

```ftl
[#-- BS4 --]
<div class="custom-file">
  <input type="file" class="custom-file-input" id="attach"/>
  <label class="custom-file-label" for="attach">选择文件</label>
</div>

[#-- BS5 --]
<input type="file" class="form-control" id="attach"/>
```

### 3.5 `.media` → `d-flex`

```ftl
[#-- BS4 --]
<div class="media"><img class="mr-3" src="…"/><div class="media-body">正文</div></div>
[#-- BS5 --]
<div class="d-flex"><img class="me-3" src="…"/><div class="flex-grow-1">正文</div></div>
```

### 3.6 `.jumbotron` → 二选一

BS5 删掉了 `.jumbotron`。两条路，建议后者：

- 逐个页面改成 `p-5 bg-body-tertiary rounded`；
- 或**在自有主题 CSS 里补一个轻量实现**（十几行即可），旧页面一个字都不用改：

```css
.jumbotron { padding: 2rem 1rem; margin-bottom: 2rem; background-color: var(--bs-tertiary-bg); border-radius: .5rem; }
.jumbotron-fluid { padding-right: 0; padding-left: 0; border-radius: 0; }
```

## 4. 自有主题 CSS：三个静默陷阱

自有主题 CSS（往往是从 BS4 发行版抄了一部分规则再改的）是**最容易出问题**的一类文件。
下面前三条都是"默认值/实现方式反转"，**不报错、不告警**，只能肉眼或量测发现。

排查通用手法：从 BS4 发行版 CSS 里把同名规则捞出来对照。

```bash
# BS4 的压缩 CSS 里，label 之类的规则就这么查
grep -o 'label{[^}]*}'  bootstrap-4.6.1.min.css
grep -o '\.col-lg-6{[^}]*}' bootstrap-4.6.1.min.css
```

### 4.1 `<a>` 突然全带下划线

`$link-decoration` 的默认值从 `none` 翻成 `underline`，同时 BS4 里各组件自带的 hover 复位
（`.nav-link:hover`、`.dropdown-item:hover`、`.page-link:hover`、`a.badge:hover`…）在 BS5 里被删掉了。

```css
/* 主题 CSS 里补回 BS4 观感：正文链接无下划线，悬停出现 */
a { text-decoration: none; }
a:hover, a:focus { text-decoration: underline; }
/* 组件类链接悬停也不要下划线 */
:is(.nav-link, .dropdown-item, .dropdown-toggle, .navbar-brand, .page-link, .page-item,
    .list-group-item-action, .btn, .badge, .btn-close, .card-title):is(:hover, :focus) {
  text-decoration: none;
}
```

- 只写 `a { text-decoration: none }` 不够：`a:hover`（0,1,1）会压过 `.nav-link`（0,1,0），
  导航/下拉/分页悬停时照样冒出下划线。
- 别想改 CSS 变量绕过去：BS 5.3 的 `:root` 里虽然有 `--bs-link-decoration: underline`，
  但 `a` 规则写的是硬编码的 `text-decoration: underline`，**没引用这个变量**（死变量）。
- 覆盖依赖样式表顺序：bootstrap 在前、主题 CSS 在后，同优先级后者生效。

### 4.2 `.col-*` 的列宽从 `max-width` 换成 `width`

BS4 是两段式，BS5 改成一段式，`width:100%` 上移到了 `.row > *`：

```css
/* BS4 */  .col-lg-6 { flex: 0 0 50%; max-width: 50%; }
/* BS5 */  .row > *  { flex-shrink: 0; width: 100%; max-width: 100%; padding: 0 calc(var(--bs-gutter-x) * .5); }
           .col-lg-6 { flex: 0 0 auto; width: 50%; }
```

于是主题 CSS 里抄自 BS4 的基础规则 `.col-* { width: 100% }`（BS4 下"写了也无害"，因为 `max-width` 说了算），
到 BS5 就变成硬覆盖：**所有列都堆成整行**。

```css
/* 只保留想覆盖的列间距，不要再声明列宽 */
.col, .col-1, /* …省略… */ .col-xl-auto {
  position: relative;
  padding-right: 7.5px;
  padding-left: 7.5px;
}
```

### 4.3 `label` 的 `margin-bottom` 被搬进了 `.form-label`

BS4 reboot 是 `label{display:inline-block;margin-bottom:.5rem}`；BS5 只留 `display:inline-block`，
把 margin 挪给了可选类 `.form-label`。模板里输出的是**裸 `<label>`** 时，全站就少了这 8px
（表单变挤、搜索条变矮）。

**补在哪一层很关键**，实测（Chrome，同一条搜索项，BS5 样式表在前、主题 CSS 在后）：

| 写法 | 外层容器高 | 搜索项高 |
|---|---|---|
| BS4 原样 | 34.5 | 32.5 |
| BS5（不补） | 27 | 25 |
| `.search-item { margin-bottom: .5rem }` | 35 | 25 |
| `.search-item { margin-bottom: 6px }` | 33 | 25 |
| `.search-item > label { margin-bottom: .5rem }` | **34.5** | **32.5** |

- 只有补在 `label` 上才等价：BS4 那 8px 落在项**内部**，补在项上则落在**外部**，
  高度对不上（8px 多 0.5px，凭感觉调的 6px 反而矮 1.5px）。
- 补在项上还会波及本来就没有 `<label>` 的写法（例如 `<td class="search-item">院系:<select>`），
  它们在 BS4 下本来就没有这 8px。
- 想整站恢复 BS4 观感，可以做全局 `label{margin-bottom:.5rem}`，但**必须同时**补回
  BS4 也删掉的复位 `.form-check-label{margin-bottom:0}`，否则每个 checkbox/radio 标签下都多 8px。

## 5. 扫描与验收

### 5.1 扫描

```bash
# ① 属性：必须全改，漏了只是"点了没反应"
rg -n 'data-(toggle|target|dismiss|ride|spy|parent|display)='
# ② 类名：对照第 2 节
rg -n '\b(class="[^"]*(close|badge-[a-z]+|input-group-(prepend|append)|form-group|form-inline|custom-(select|file|control)|btn-group-toggle|jumbotron|btn-block|dropdown-menu-right|float-(sm-)?(left|right)|text-(left|right)|border-(left|right)|font-weight-[a-z]+|media)[^"]*")'
# ③ 旧间距类
rg -n '\b[mr][lr]-[0-9a] |\b[mp][lr]-[0-9a]"'
# ④ JS：Bootstrap 的 jQuery 插件调用
rg -n '\$\([^)]*\)\.(tab|modal|dropdown|tooltip|popover|collapse|carousel|alert|button)\('
# ⑤ 图标整体不见了：先确认 css 本身 200（浏览器只报 404，不报错）
curl -s -o /dev/null -w '%{http_code}\n' <static_base>/font-awesome/<ver>/css/all.min.css
```

建议在改前/改后各跑一次 ①②③，用数量对比确认没有漏网（改完这两条应为 0 或只剩白名单里的）。

### 5.2 结构改动较多时，先做 HTML 配平检查

改 `input-group-prepend`、`.media`、`.btn-group-toggle` 这类涉及增删标签的改动时，
最容易多删一个 `</div>`，而页面上只是"后面整体错位"。无浏览器时可以先数配对：

```bash
python3 -c "
import re,sys
s=open(sys.argv[1],encoding='utf-8').read()
print('div:',len(re.findall(r'<div\b',s)),'/',len(re.findall(r'</div>',s)))" path/to/page.ftl
```

### 5.3 逐页目视（必须做）

属性改名属于**静默失效**，编译和模板渲染都不会报错，只能点一遍：

- 下拉菜单、tab 切换、tooltip、modal 打开/关闭、alert 的关闭按钮；
- 表单：label 与控件的间距、input-group 的圆角、按钮组单选能否选中；
- 栅格：随手量一个 `.col-md-3` 的宽度是不是 25%；
- 暗色模式（`data-bs-theme`）下再看一遍。

需要"像素级"确认时，可以用无头 Chrome 量：

```bash
google-chrome --headless=new --disable-gpu --virtual-time-budget=4000 --dump-dom file:///tmp/probe.html
# probe.html 里把要量的元素写进 <pre>，或直接比较 BS4 / BS5 两份 CSS 下的高度
```

## 6. 其它坑

- **`data-toggle` 改错不报错**，下拉点不开、tab 切不动，但控制台干净。
- **AdminLTE 的类不是 Bootstrap 的类**：`card-tools`、`btn-tool`、`data-card-widget`、`user-footer`、
  `navbar-badge`、`.wrapper / .main-sidebar / .main-header` 都来自 AdminLTE 3/4，
  升级 Bootstrap 不会破坏它们，但**不加载 AdminLTE 时它们也没有任何行为**。
  遇到"按钮点了没反应"，先分清它到底是谁的组件。
- **`bootstrap.bundle.js` 才有 Popper**：dropdown / tooltip / popover 必须用 bundle 版；
  BS5 起不用再单独引 `popper.js`。
- **反向升级提醒**：BS5 的 `.form-label`、`.text-bg-*`、逻辑属性等新写法在 BS4 下不存在，
  如果目标是"BS4/BS5 双跑"（灰度期），要选**两边都成立**的写法，或给主题 CSS 补别名。

---
<div style="text-align: right;"><small>最后更新：2026-09-20</small></div>
