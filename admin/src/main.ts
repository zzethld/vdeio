import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';

// Design tokens MUST be imported before Element Plus CSS so EP variables can reference them.
import './styles/design-tokens.css';
import 'element-plus/dist/index.css';
// Element Plus variable overrides must come after the base Element Plus CSS.
import './styles/element-variables.css';
// Global component overrides and utility classes.
import './styles/global.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(ElementPlus, { locale: zhCn });

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.mount('#app');
