import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {appId:'dev.voyage.workbench', appName:'Voyage Workbench', webDir:'dist',
  android:{allowMixedContent:false}, server:{androidScheme:'https'}};
export default config;
