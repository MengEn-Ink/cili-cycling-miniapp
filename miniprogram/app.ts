import { initializeCloud } from './config/cloud-init';
import { appStore } from './store/app-store';

App({
  globalData: { store: appStore },
  onLaunch() {
    appStore.bootstrap();
    const cloud = initializeCloud(wx.cloud) === 'initialized' ? wx.cloud : undefined;
    void appStore.ensureIdentity(cloud);
  },
});
