# Scala trait 的 mixin forwarder 与 JVM 默认方法

升级 Scala 3.3 → 3.9 时踩到一个坑：一个反射工具按 `isBridge` / `isSynthetic` 过滤"编译器生成的方法"，
升级后突然开始把 `head`、`size`、`toList` 这些集合 API 当成 Bean 属性注册。翻字节码才发现，
同一个类里方法**一个没多、一个没少**，变的只是标志位。

顺着这条线把背后的机制整理一下：Scala 的 trait 方法到底编译成什么、为什么类里会凭空多出一份
forwarder、JVM 怎么解析它、3.8 起又改了什么。

> 下面所有结论都在本机用 `javap` 实测过，例子可以照着重跑。

## 1. 现象：方法没变，标志位变了

拿 `org.beangle.commons.collection.page.SinglePage` 做样本，比较"旧编译器产出的已发布 jar"和新编译的 class：

| 方法 | 3.3.8 | 3.9.0 |
|---|---|---|
| `head()Ljava/lang/Object;` | `0x1041` PUBLIC\|BRIDGE\|SYNTHETIC | `0x0001` PUBLIC |
| `tail()` / `seq()` / `toList()` | 同上 | PUBLIC |
| `size()I` / `isEmpty()Z` | 同上 | PUBLIC / PUBLIC\|FINAL |
| `nonEmpty()` / `knownSize()` / `mkString(...)` | 同上 | PUBLIC |

方法集合做差集：两边各 240 个，**互相独有的是空集**；随便挑一个看字节码体，也一字未改。

诡异的是：这些方法在 `SinglePage` 的源码里根本不存在。

## 2. 一份实现，三个落点

```scala
trait Page[E] extends collection.immutable.Seq[E]:
  def totalPages: Int
  // ...

class SinglePage[E](...) extends Page[E]:
  // 只写了 totalPages/next/previous/apply/length/iterator，没有 head/size/toList
```

`javap` 一路看下去，`head` 一共出现在三处：

```
SinglePage.head()                        aload_0
                                         invokestatic IterableOps.head$:(Lscala/collection/IterableOps;)Ljava/lang/Object;

scala.collection.IterableOps.head()      aload_0                            ← 接口 default 方法，真身
  [default]                              invokeinterface iterator()
                                         invokeinterface Iterator.next()

scala.collection.IterableOps.head$(...)  aload_0                            ← 接口里的 static 跳板
  [static]                               invokespecial head()
```

也就是「**一份实现 + 两个跳板**」：

- 实现只有一份，在接口 `IterableOps` 的 `default` 方法里；
- `head$` 是接口自带的 `static` 中转，作用是执行 `invokespecial head()`（非虚调用，避免又绕回类里的
  forwarder 造成死循环）；
- `SinglePage.head()` 是编译器补在类里的 forwarder，内容就是一行转调。

**为什么不直接 `invokespecial IterableOps.head()`？** 因为 `SinglePage` 的直接父接口是 `Page`，
不是 `IterableOps`；JVM 规定 `invokespecial` 指向的接口方法必须由**直接**父接口声明，跨级不行，
所以只能用 `$` 静态方法兜一层。

**反射看到几条？** `Class.getMethods()` 里 `head` **只有一条**，declaringClass 就是 `SinglePage`
—— 接口那条 default 被它覆盖掉了，不会重复出现。所以"子类里有两个 head"是错觉。
真正会同名共存的另有其事：`SinglePage` 里的 `apply(int)`（源码真身）和 `apply(Object)`（泛型擦除桥），
descriptor 不同才共存，而且到 3.9 依然带着 `ACC_BRIDGE|ACC_SYNTHETIC`。

## 3. 为什么编译器要在类里补这一份

### 3.1 JVM 的解析规则给不出 Scala 线性化的答案

JVM 层面根本没有 trait 这个概念：它只有类的单继承、接口的 default 方法，以及一套自己的解析顺序。
这套顺序和 Scala 的 trait 线性化在两种情况下会不一致 —— 编译器源码把这两条写在注释里
（`dotty/tools/dotc/transform/MixinOps.scala` 的 `needsMixinForwarder`）：

- `invokevirtual` 解析时，**父类**的方法（哪怕它是 abstract）会压过接口的 default。于是

  ```scala
  abstract class C { def f: Int }
  trait T extends C { def f: Int = 1 }
  class D extends T
  ```

  编译出来是 `public class D extends C implements T`。不补 forwarder 的话，`D.f` 会被 JVM 解析到
  `C.f`（还是抽象的），而 Scala 的语义是 `T.f` 赢。

- 两个接口都提供同名 default、且彼此没有继承关系时，JVM 的 "maximally-specific method"
  （JVMS §5.4.3.3）选不出赢家。

第二条在纯 Scala 代码里会被编译期报 `inherits conflicting members` 挡掉，但绕开很容易 —— 比如 self-type：

```scala
trait U1 { def f: Int = 1 }
trait U2 { self: U1 => override def f: Int = 2 }
class D2 extends U1 with U2
```

```
javap U2  →  public interface U2                     ← 字节码层面 U2 根本不 extends U1
javap D2  →  public int f(); aload_0; invokestatic U2.f$:(LU2;)I
```

`U2` 在字节码里和 `U1` 毫无关系，JVM 无从判断谁更具体，但 Scala 的线性化认定"右边赢"，
所以 `D2` 必须自己带一份 `f()`。把 `-Xmixin-force-forwarders:false` 关掉它也在 —— 这是**真需要**的情形。

### 3.2 "不需要也生成"是编译器的默认开关

那 `SinglePage.head` 呢？它全链只有 `IterableOps` 一家提供，严格讲不需要 forwarder，可它还是生成了。
原因是一个默认打开的编译选项：

```scala
// dotty/tools/dotc/config/ScalaSettings.scala
val XmixinForceForwarders = ChoiceSetting(
  AdvancedSetting,
  name = "Xmixin-force-forwarders",
  helpArg = "mode",
  descr = "Generate forwarder methods in classes inheriting concrete methods from traits.",
  choices = List("true", "junit", "false"),
  default = "true")   // ← 默认 true
```

为 `true` 时，编译器对**每一个从 mixin 继承来的具体方法**无条件补一份 forwarder，不做"是否真的需要"的判断。
同一份源码编译两遍，差别一目了然：

```scala
trait T1 { def f: Int = 1 }
abstract class Base { def f: Int }
trait T3 extends Base { override def f: Int = 3 }
class A extends T1                 // 无竞争
class D extends Base with T3       // 父类有同名方法

// java 侧：interface JDef { default int g() { return 7; } }
class S extends JDef               // Java 接口的 default 方法
```

| 类 | 默认（force=true） | `-Xmixin-force-forwarders:false` | 说明 |
|---|---|---|---|
| `A` | 有 `f()` | **无** | 多余也生成 |
| `D` | 有 `f()` | 有 `f()` | 真需要 |
| `S` | 有 `g()` | **无** | Java 接口 default 一视同仁 |

三种情况下 flags 都是 `0x0001 ACC_PUBLIC` —— 和 `SinglePage.head` 一模一样。

所以"多继承 → 每个方法抄一份"的说法不准。准确的说法是：**JVM 只有"单继承 + 最大具体父接口"这一种归约方式，
凡是它算出的答案可能与 Scala 线性化不同的地方，编译器就必须把答案写死在类里。**
默认开关只是把这个保护从"按需"扩大到"全量"——因为要不要补取决于当前继承链长什么样，
而父类、trait 可能是另外编译的，以后还会变。

顺带对照：Java 遇到同样的 default 冲突是直接编译报错让你手写 override，Scala 选择替你生成。

## 4. Java 接口的 default 方法也一样

forwarder 不是 Scala trait 的特产。`scala-library` 里的 `JavaCollectionWrappers$IteratorWrapper`
源码只写了 `hasNext/next/hasMoreElements/nextElement/remove`，字节码里却多出两个方法：

```
public void forEachRemaining(java.util.function.Consumer<? super A>);
    invokespecial java/util/Iterator.forEachRemaining      ← 直接调接口 default
public java.util.Iterator<A> asIterator();
    invokespecial java/util/Enumeration.asIterator
```

区别只在跳板：`IteratorWrapper` 直接 `implements ju.Iterator with ju.Enumeration`，是直接父接口，
`invokespecial` 一步到位；Scala trait 那侧因为要跨级，才需要 `$` 静态方法中转。

## 5. 3.8.0：不再标 bridge/synthetic，以及它踩坏了什么

同一个例子在三个编译器下：

| `trait T1 { def f: Int = 1 }` + `class A extends T1` | `A.f()` 的 flags |
|---|---|
| 3.3.8 | `0x1041` PUBLIC\|BRIDGE\|SYNTHETIC |
| 3.8.4 | `0x0001` PUBLIC |
| 3.9.0 | `0x0001` PUBLIC |

边界是 3.8.0。上游 PR（`scala/scala3#23942`，milestone 3.8.0，2025-09 合并）标题就是
*Emit mixin forwarders as ordinary, non-bridge methods again*（把 mixin forwarder 重新发成普通的非 bridge 方法）。

动机是 issue `scala/scala3#19270`：Play 的 `InjectedController` trait 里定义了具体方法
`setControllerComponents`，本意是让 Guice 注入后调用；但 Scala 3 在实现类里生成的 forwarder 带了
`ACC_BRIDGE|ACC_SYNTHETIC`，而 Guice 的 `InjectionPoint` 会跳过 `isSynthetic() || isBridge()`
的方法，注入就静默失效了（同样代码在 Scala 2.13 下正常，因为 2.13 生成的 forwarder 是普通方法）。
修法（`#21890` 一次、`#23942` 二次）就是把 forwarder 重新发成普通 public 方法。

代价是又把 `scala/bug#8905` 那类"泛型 trait 继承后 `NoSuchMethodError`"的老问题翻了回来。

**对反射代码的实际影响：** 任何靠 `isBridge` / `isSynthetic` 判断"这是编译器补的、不是用户写的"的逻辑，
从 3.8 起全部失效。Beangle `commons` 的 `MetaLoaderLite` 就是这么中招的 —— 它用 `clazz.getMethods`
扫零参方法当属性，3.7 及之前靠 `!method.isBridge` 把 `head/size/toList` 这类 forwarder 挡在门外，
3.8+ 挡不住了，`MetaLoaderLiteTest` / `PropertyCompletenessTest` 四个用例挂掉。

修的时候注意别图省事"按名字过滤"：库里同名的 **abstract** 方法必须保留，因为那正是应用类自己的实现
（如 `IterableOnce.iterator`、`SeqOps.length`）；只有库超类型里的**具体**方法才是 forwarder 的候选。
`MetaLoaderLite` 最终改成沿继承链收集"`scala.`/`java.` 类型声明的非抽象零参方法名"，再据此收窄。

## 6. javap 速查

```bash
javap -p -c  Cls                                 # 方法表 + 字节码
javap -v -p  Cls | grep -A3 'head()'             # 看某个方法的 flags
javap -p -cp lib.jar pkg.Cls                     # 直接看 jar 里的类
unzip -p lib.jar pkg/Cls.class > /tmp/x.class && javap -v -p /tmp/x.class
```

想复现 3.3.8 / 3.8.4 / 3.9.0 的对比，不用装 sbt，直接用 coursier 缓存里的编译器：

```bash
CC=~/.cache/coursier/v1/https/repo1.maven.org/maven2
V=3.3.8                      # 换 3.8.4 / 3.9.0 即可
CP=$CC/org/scala-lang/scala3-compiler_3/$V/scala3-compiler_3-$V.jar:\
$CC/org/scala-lang/scala3-library_3/$V/scala3-library_3-$V.jar:\
$CC/org/scala-lang/scala3-interfaces/$V/scala3-interfaces-$V.jar:\
$CC/org/scala-lang/tasty-core_3/$V/tasty-core_3-$V.jar:\
<scala-library>.jar:<scala-asm>.jar:<compiler-interface>.jar:<util-interface>.jar

java -cp "$CP" dotty.tools.dotc.Main -usejavacp -d out Test.scala
javap -v -p -cp out A | grep -A2 'int f();'
```

> 3.8 起 `scala-library` 与编译器同版本号（`scala-library-3.9.0.jar`）；3.3.8 要配 2.13.x。

## 7. 小结

- trait 的具体方法只有一份实现，放在接口的 `default` 方法里；类里的是编译器补的 forwarder，
  本体只有一行跳转。
- forwarder 存在的根本原因：JVM 的解析规则（父类压接口、maximally-specific 选不出）
  表达不了 Scala 的线性化，编译器只能把结果钉死在类里。
- "全量补"是 `-Xmixin-force-forwarders` 默认 `true` 的保守策略，跟是否真的需要无关。
- 3.8.0 起这些 forwarder 不再带 `ACC_BRIDGE`/`ACC_SYNTHETIC`，那是"编译器生成物"的标记消失，
  不是生成机制变了。
- 因此反射代码不要再用 bridge/synthetic 判断 forwarder，要按"库超类型里是否存在同名具体方法"判断。

---
<div style="text-align: right;"><small>最后更新：2026-09-19</small></div>
