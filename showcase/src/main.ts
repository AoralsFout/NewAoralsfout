/** 展示站启动入口：加载自托管字体，注册滚动与文字乱码插件，挂载 Vue 主体并加载全站设计与展区纹理样式。 */
import { createApp } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
// 英文大字使用带宽度轴的 Archivo；中文标题只加载 900 字重，按 unicode-range 分片按需下载。
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/noto-sans-sc/900.css";
import App from "./App.vue";
import "./style.css";
import "./background.css";

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);
createApp(App).mount("#app");
