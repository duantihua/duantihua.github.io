# Scala 中缀和后缀操作符
所谓中缀操作符、后缀操作符只不过想给`自定义方法`以操作符的待遇。例如中缀操作符 a+b 中的+号属于二元操作符，位置位于操作数之间，后缀操作符 a++ 中的++ 属于一元操作符，位置位于操作数之后。由于Scala可以在方法名使用符号，可以实现类似C++的操作符重载的效果。

## 1. 中缀操作符
Scala 3 中缀操作符是对象调用的简便用法，它作为对象的单参数的函数出现。使用时可以忽略点，中缀操作符的定义如下：
```scala
class MyClass:
    infix def infixOperator(operand2: T): R
```
其中，`infixOperator` 是中缀操作符的名称，`this` 和 `operand2` 是操作数，`R` 是操作的结果类型。形式上类似普通函数，推荐的做法是在函数前面增加`infix`关键字(忽略也可以，编译时会报警)。

中缀操作符的使用方式如下：
```scala
val myObj = new MyClass
val result = myObj infixOperator operand2
//等价于这样调用
val result2 = myObj.infixOperator(operand2)
```
其中，`result` 是操作的结果，`myObj` 和 `operand2` 是操作数。如果一个中缀操作符的运算结果R还有这样的函数，也可以级联使用下去。详细参考：[Scala 中缀操作符](https://docs.scala-lang.org/scala3/reference/changed-features/operators.html)

这里的infixOperator既可以是一个普通的方法，也可以是一个操作符(例如：+、-、*、/等)。为了让Java也能使用这个方法，可以在方法上增加@targetName注解，指定方法的名称。例如：
```scala
import scala.annotation.targetName

class Matrix:
  @targetName("multiple")
  def *(operand2: Matrix): Matrix =
    // do some matrix operation
    // return new matrix
```

## 2. 后缀操作符
Scala 3 后缀操作符是对象调用的简便用法，它作为对象的无参数,无括号的函数出现，后缀操作符的定义如下：
```scala
class MyClass:
    def suffixOperator: R
```
其中，`suffixOperator` 是后缀操作符的名称，`this` 是操作数，`R` 是操作的结果类型。

后缀操作符的使用方式如下：
```scala
val myObj = new MyClass
//一定要增加这个语言特性的导入说明，否则编译报错
import language.postfixOps
val result = myObj suffixOperator
//等价于这样调用
val result2 = myObj.suffixOperator()
```
*虽然可以通过开启语言特性进行使用，但是后缀操作符不能进行级联使用，例如：`myObj suffixOperator1 suffixOperator2` 是错误的。虽然在对象上用dot(.)实现这种效果，例如：`myObj.toString.length` 是正确的。如果`myObj toString length`能够编译通过，这将带来歧义，不知道该解释为`myObj.toString.length`还是`myObj.toString(length)`。*

## 3. 中缀操作符和后缀操作符在标准库中的例子
Scala的scala.concurrent.duration包中定义了一些时间单位，例如：`1.seconds`、`2.minutes`、`3.hours`等。如果写成后缀操作符的样子需要这样：
```scala
import scala.concurrent.duration._
import language.postfixOps
val duration = 1 seconds
```
为了方便，如果不想引入language.postfixOps,标准库定义了一些时间的中缀函数，例如：
```scala
//实质上调用1.seconds(span)
val duration = 1 seconds span
```
*这里实际还隐含了一个整形`Int`到`DurationInt`的隐式转换。*
详细的调用代码演示如下：
```scala
def duration(): Unit = {
  import scala.concurrent.duration.{DurationInt, fromNow}
  //1）调用的是隐式转换DurationInt后的无参方法seconds，转换为FiniteDuration 2)调用FiniteDuration.fromNow无参方法
  val deadline1 = (3.seconds).fromNow
  //这里调用的是DurationInt的seconds有参方法,接受一个fromNow对象。
  val deadline2 = 3.seconds(fromNow)
  //所以这里没有魔法，就是普通的中缀运算符
  val deadline3 = 3 seconds fromNow
  import language.postfixOps
  4 senconds
}
```

## 4. 自己实现一个例子
为了方便理解，我们自己实现一个中缀操作符和后缀操作符的例子，我们可以定义一个简单的类，例如：
```scala
object Http {
  implicit final class StatusInt(private val n: Int) extends AnyVal {
    def status: Status = {
      new Status(n)
    }
    def status(any: Status): Boolean = {
      isOk == any
    }
  }

  def httpTest(): Unit = {
    //隐式转换+链式调用(isOk是个方法)
    (200.status).isOk
    //隐式转换+普通函数调用(isOk是个对象)
    200.status(isOk)
    //隐式转换+中缀操作符(isOk是个对象）
    500 status isOk
  }

  val isOk = new Status(200)

  class Status(val code: Int) {
    def isOk: Boolean = 200 == code
    def format(pattern: String) = "200"
  }
}
```