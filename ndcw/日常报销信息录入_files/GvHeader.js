/*!
* ----JGQ2019 固定表头Gridview
*/
(function ($) {
    //1、定义一个jQuery实例方法，也是我们调用这个插件的入口
    $.fn.Scrollable = function (options) {
        var defaults = {
            ScrollHeight: 300,
            Width: 0
        };
        //2、扩展集合，如果外部没有传入ScrollHeight的值，就默认使用300这个值，如果传入，就用传入的ScrollHeight值
        var options = $.extend(defaults, options);
        return this.each(function () {
            //3、获取当前gridview控件的对象
            var grid = $(this).get(0);
            //4、获取gridview的宽度
            var gridWidth = grid.offsetWidth;
            var headerCellWidths = new Array();
            //5、创建了一个存储表头各个标题列的宽度的数组
            for (var i = 0; i < grid.getElementsByTagName("TH").length; i++) {
                headerCellWidths[i] = grid.getElementsByTagName("TH")[i].offsetWidth;
            }
            //6、在文档中gridview的同级位置最后加一个div元素
            grid.parentNode.appendChild(document.createElement("div"));
            //7、gridview的父节点，是个div
            var parentDiv = grid.parentNode;

            //8、在dom中创建一个table元素
            var table = document.createElement("table");
            //9、把gridview的所有属性加到新创建的table元素上
            for (i = 0; i < grid.attributes.length; i++) {
                if (grid.attributes[i].specified && grid.attributes[i].name != "id") {
                    table.setAttribute(grid.attributes[i].name, grid.attributes[i].value);
                }
            }
            //10、将样式也加到table元素上
            table.style.cssText = grid.style.cssText;
            //11、为table元素设置与gridview同样的宽
            table.style.width = gridWidth + "px";
            //12、为table元素加一个tbody元素
            table.appendChild(document.createElement("tbody"));
            //13、把gridview中的第一行数据加到tbody元素中，即table里现在存着一行gridview的标题元素，
            //同时在gridview里删除了标题这一行的元素
            table.getElementsByTagName("tbody")[0].appendChild(grid.getElementsByTagName("TR")[0]);
            //14、取得表格标题列的集合
            var cells = table.getElementsByTagName("TH");

            //15、gridview中第一行数据列的集合
            var gridRow = grid.getElementsByTagName("TR")[0];
            for (var i = 0; i < cells.length; i++) {
                var width;
                //16、如果标题格的宽度大于数据列的宽度
                if (headerCellWidths[i] > gridRow.getElementsByTagName("TD")[i].offsetWidth) {
                    width = headerCellWidths[i];
                }
                    //17、如果标题格的宽度小于数据列的宽度
                else {
                    width = gridRow.getElementsByTagName("TD")[i].offsetWidth;
                }
                cells[i].style.width = parseInt(width - 3) + "px";
                //18、将每个标题列和数据列的宽度均调整为取其中更宽的一个，-3是出于对表格的样式进行微调考虑，不是必须
                gridRow.getElementsByTagName("TD")[i].style.width = parseInt(width - 3) + "px";
            }
            //19、删除gridview控件（注意只是从文档流中删除，实际还在内存当中，注意27条，现在的情况是table里只有一个表头
            parentDiv.removeChild(grid);
            //20、在文档中再创建一个div元素
            var dummyHeader = document.createElement("div");
            //21、把表头table加入其中
            dummyHeader.appendChild(table);
            //22、把这个div插入到原来gridview的位置里 
            parentDiv.appendChild(dummyHeader);
            //23、如果我们最初传入了一个想要的表格宽度值，就将gridWidth赋上这个值
            if (options.Width > 0) {
                gridWidth = options.Width;
            }
            //24、再创建一个div
            var scrollableDiv = document.createElement("div");
            //25、在原基础上+17是因为这是一个具有滑动条的table，当出现滑动条的时候，
            //会在宽度上多出一个条的宽度，为了使数据列与标题列保持一致，要把这个宽度算进行，
            //17这个值也不是必须，这个可以试验着来。
            gridWidth = parseInt(gridWidth) + 17;
            //26、给具有滚动条的div加上样式，height就是我们想让它在多大的长度时出现滚动条
            //scrollableDiv.style.cssText = "height:" + options.ScrollHeight + "px;width:" + gridWidth + "px";
            scrollableDiv.style.cssText = "overflow:auto;height:" + options.ScrollHeight + "px;width:" + gridWidth + "px";
            //27、将gridview（目前只存在数据存在数据列）加到这个带有滚动条的div中，这里是从内存中将grid取出
            scrollableDiv.appendChild(grid);
            //28、将带有滚动条的div加到table的下面
            parentDiv.appendChild(scrollableDiv);
        });
    };
})(jQuery);