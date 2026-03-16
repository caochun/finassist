var Drag = function (id, str) {
    this.el = document.getElementById(id);
    this.pa = document.getElementById(str);
   // this.el.style.position = "absolute"
    this.el.me = this; //保存自身的引用
    this.el.onmousedown = this.dragstart; //监听mousedown事件
}
Drag.prototype = {
    constructor: Drag,
    dragstart: function (e, self, el) {//事件在标准浏览器中被当作第一个参数传入
        e = e || event; //获得事件对象
        self = this.me; //获得拖动对象
        el = self.pa; //获得拖动元素
        el.offset_x = e.clientX - el.offsetLeft;
        el.offset_y = e.clientY - el.offsetTop;
        document.onmousemove = function (e) {
            self.drag(e, el)
        }
        document.onmouseup = function () {
            self.dragend()
        }
    },
    drag: function (e, el) {
        e = e || event; //获得事件对象
        with (el.style) {
            cursor = "pointer";
            var py = Math.max(document.body.scrollHeight, document.body.parentNode.clientHeight);// el.parentNode.offsetHeight;
            var px = Math.max(document.body.scrollWidth, document.body.parentNode.clientWidth); //el.parentNode.offsetWidth;
            var l = e.clientX - el.offset_x;
            var t = e.clientY - el.offset_y;
            l = l < 0 ? 0 : (l > px - el.offsetWidth ? px - el.offsetWidth : l);
            t = t < 0 ? 0 : (t > py - el.offsetHeight ? py - el.offsetHeight : t);
            left = l + "px";
            top = t + "px";

        }
        ! +"\v1" ? document.selection.empty() : window.getSelection().removeAllRanges();
    },
    dragend: function () {
        document.onmouseup = document.onmousemove = null;
    }
}

function closeMap() {
    document.getElementById("ctl00_ContentPlaceHolder1_hid_div").value = "0";
    ctl00_ContentPlaceHolder1_mapBgLayer
.style.display = ctl00_ContentPlaceHolder1_mapLayer.style.display = "none";
    //document.getElementById("t_xlh").innerText = "";
}
function showMap() {

//    document.getElementById("ctl00_ContentPlaceHolder1_txt_bmbhcx").value = "";
    document.getElementById("ctl00_ContentPlaceHolder1_hid_div").value = "1";
    ctl00_ContentPlaceHolder1_mapBgLayer
.style.display = ctl00_ContentPlaceHolder1_mapLayer.style.display = "block";
}


function ChangeAble() {
 
    new Drag('drag', 'ctl00_ContentPlaceHolder1_mapLayer');
    showMap();

}


function closeMap_UpdatePanel() {
    document.getElementById("hid_div").value = "0";
    mapBgLayer
.style.display = mapLayer.style.display = "none";
    //document.getElementById("t_xlh").innerText = "";
}
function showMap_UpdatePanel() {

    //    document.getElementById("ctl00_ContentPlaceHolder1_txt_bmbhcx").value = "";
    document.getElementById("hid_div").value = "1";
   mapBgLayer
.style.display = mapLayer.style.display = "block";
}


function ChangeAble_UpdatePanel() {

    new Drag('drag', 'mapLayer');
    showMap_UpdatePanel();

}
