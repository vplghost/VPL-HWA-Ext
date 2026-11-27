import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

const app = createApp(App);
app.config.errorHandler = (err, instance, info) => {
  const comp = (instance?.$options as any)?.__name || (instance?.$options as any)?.name || 'UnknownComponent';
  console.error(`[Vue ${info}] <${comp}>:`, err);
};
app.mount('#app');
