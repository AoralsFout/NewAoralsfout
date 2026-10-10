/** 展示站启动入口：注册滚动动画插件，挂载 Vue 主体并加载全站设计与展区纹理样式。 */
import { createApp } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import App from "./App.vue";
import "./style.css";
import "./background.css";

gsap.registerPlugin(ScrollTrigger);
createApp(App).mount("#app");
