import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
// Fonts are served by the site itself: no request to Google, so no visitor IP sent to a third party.
import '@fontsource/special-elite/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './style.css';

createApp(App).use(router).mount('#app');
