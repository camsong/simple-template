/**
 * 第一种方法，使用字符串与此正则替换
 */
function format(str, object) {
  var array = Array.prototype.slice.call(arguments, 1);
  return str.replace(/\<\%([^{}]+)\%\>/gm, function(match, name) {
    console.log(match, name);
    var index =  Number(name);
    if (index >= 0) return array[index];
    if (object && object[name] !== void 0) return object[name];
    return '';
  })
}

var tpl = '你好，我的名字是 <%name%>, 今年已经 <%age%>岁了';

console.log(format(tpl, { name: 'cam', age: 21 }));
console.log(format('你好，我的名字是 <%0%>, 今年已经 <%1%>岁了', 'cam', 21));

// 以上例子通过使用 #{} 来划分静态内容和动态内容，它们被称为定界符（delimiter）

/**
 * 第二种方法，先 tokenize 再拼接。类似这样的方法
 var array = ['return ']
 array.push('你好,我的名字叫'）
 array.push(data.name)
 array.push(', 今年已经')
 array.push(data.info.age)
 array.push( '岁了')
 var render = new Function('data', array.join('+'))
 */

function tokenize(str) {
  var openTag = '<%';
  var closeTag = '%>';
  var ret = [];
  do {
    var index = str.indexOf(openTag);
    index = index === -1 ? str.length : index;
    var value = str.slice(0, index);
    // 拿到 openTag 前面的静态内容
    ret.push({
      expr: value,
      type: 'text',
    });
    // 改变 str 字符串本身
    str = str.slice(index + openTag.length);
    if (str) {
      index = str.indexOf(closeTag);
      var value = str.slice(0, index);
      // 抽取 openTag closeTag 中间的动态内容
      value = value.trim(); // js 逻辑两旁的空白可以省去
      if (/^(if|for|})/.test(value)) {
        // 支持 for/if 这样的原生语法，`}`是结尾的标志
        ret.push({
          expr: value,
          type: 'logic',
        })
      } else if (value.charAt(0) === '#') {
        // 支持 #eachEnd, #ifEnd, if, #each 这样的语法糖
        if (value === '#ifEnd' || value === '#eachEnd') {
          ret.push({
            expr: '}',
            type: 'logic',
          })
        } else if (value.slice(0, 4) === '#if ') {
          ret.push({
            expr: 'if(' + value.slice(4) + '){',
            type: 'logic',
          });
        } else if (value.slice(0, 6) === '#each ') {
          // 支持 #each (el, index) in @list
          var arr = value.slice(6).split(' in ');
          var arrayName = arr[1];
          var args = arr[0].match(/[$\w_]+/g); // 匹配单词
          var itemName = args[0]; // 第一个单词为 itemName
          var indexName = args[1] || '__index'; // 第二个单词为 indexName，若没有则设置默认名
          value = ['for(var ', ' = 0;', ' < ' + arrayName + '.length;', '++) {'].join(indexName) + '\nvar ' + itemName + ' = ' + arrayName + '[' + indexName + '];';
          ret.push({
           expr: value,
           type: 'logic',
          });
        }
      } else {
        ret.push({
          expr: value,
          type: 'js'
        });
      }
      str = str.slice(index + closeTag.length); // 改变 str 字符串本身
    }
  } while (str.length);
  return ret;
}

console.log(tokenize(tpl));

// 渲染函数，目的就是拼接成一个大的函数
// 这个函数有两个缺点，一是 token 为text时直接用引号拼接可能会出问题，二是这里面的都是直接变量，外层需要套一层 data，改进后的参考 render2
function render(str) {
  var tokens = tokenize(str);
  var ret = [];
  for (var i = 0, token; token = tokens[i++];) {
    if (token.type === 'text')
      ret.push('"' + token.expr + '"');
    else
      ret.push(token.expr);
  }
  console.log("data", "return " + ret.join('+'));
}

console.log(render(tpl));



// 搞一个 dig 和 fill 方法，把子级属性变成 ??12 这样的字符串
var rident = /[$a-zA-Z_][$a-zA-Z0-9_]/g; // 匹配变量名，以_,$或字母数字开头
var rproperty = /\.\s*[\w\.\$]+/g; // 匹配属性名，以.开头
var rattribute = /[$a-zA-Z_][$a-zA-Z0-9_][\.\s\w]*/g // 匹配 foo 或者 foo.bar
var number = 1;
var rfill = /\?\?\d+/g;
// 把字符串名存起来
var stringPool = {};
// 添加 `data.` 后的 render 方法
function render2(str) {
  var tokens = tokenize(str);
  var ret = [];
  for (var i = 0, token; token = tokens[i++];) {
    if (token.type === 'text')
      ret.push(JSON.stringify(token.expr));
    else {
      // 去掉对象的子级属性，减少干扰因素
      // 把 foo 替换成 data.foo；把 foo.bar 替换成 data.foo.bar
      var js = token.expr.replace(rattribute, function(a) {
        return 'data.' + a;
      });
      ret.push(js);
    }
  }
  console.log('return ' + ret.join('+'));
  return new Function("data", "return " + ret.join('+'));
}

tpl = '你好，我的"名字"是 <%name%>, 今年已经 <%info.age%>岁了';
console.log(render2(tpl)({name: 'cam', info: {age: 18}}));


/**
 * 支持 for 和 if
 * 遇到的问题：for 和 if 中间的变量也会被加上 `data.`，这样就会出问题，怎么区分呢？
 * 两种方法：1. 使用 `with`，这样就不需要加 `data.`。很多模块都是使用with减少替换工作
 * 2. 使用引导符 `@`，中间变量不加。这样模板也要改一下。这样的优势在于，性能更高。
 * 下面使用方法2
 */
tpl = '你好，我的"名字"是 <% @name %>, 我喜欢 <%for(var i = 0, el;el = @list[i++];) {%><% el %><% } %>';

function addView(s) {
  return '__data__.push(' + s + ');';
}
function addPrefix(s) {
  return s.replace(/(^|[^\w\u00c0-\uFFFF_])(@|##)(?=[$\w])/g, '$1data.');
}
// 支持 logic 逻辑表达式的 render
function render3(str) {
  var tokens = tokenize(str);
  var ret = ['var __data__ = [];']; // 因为 push 和 if/for 混着写，这里不能直接使用空数组了
  for (var i = 0, token; token = tokens[i++];) {
    if (token.type === 'text') {
      ret.push(addView(JSON.stringify(token.expr)));
    } else if (token.type === 'logic') {
      ret.push(addPrefix(token.expr)); // 对于 if/for 这样的语法要能直接执行
    } else {
      // 去掉对象的子级属性，减少干扰因素
      // 把 foo 替换成 data.foo；把 foo.bar 替换成 data.foo.bar
      ret.push(addView(addPrefix(token.expr)));
    }
  }
  ret.push('return __data__.join("")');
  return new Function("data", ret.join('\n'));
}
fn = render3(tpl);
console.log(fn + '');
console.log(fn({name: 'cam', list: ['foo', 'bar']}))


/**
 * 支持 #if, #endIf 的类型
 */
tpl = '你好，我的"名字"是 <% @name %>，我的年龄是 <% @age %>，年龄是 <% #if @age % 2 === 0 %>偶数<%#ifEnd%><% #if @age % 2 === 1 %>奇数<%#ifEnd%> '

fn = render3(tpl);
console.log(fn + '');
console.log(fn({name: 'cam', age: 18}))

/**
 * 支持 #each, #eachEnd 的类型
 */
tpl = '你好，我的"名字"是 <% @name %>，我的爱好是 <% #each (el, index) in @list %><% index + ": " + el + "; " %><%#eachEnd%>';

fn = render3(tpl);
console.log(fn + '');
console.log(fn({name: 'cam', list: ['foo', 'bar']}))


// Thanks to https://segmentfault.com/a/1190000006990480
