const {execFileSync}=require('node:child_process');
const path=require('node:path');

exports.default=async context=>{
 const root=path.resolve(__dirname,'..');
 const executable=context.file?.endsWith('.exe')?context.file:context.electronPlatformName==='win32'?path.join(context.appOutDir,context.packager.appInfo.productFilename+'.exe'):null;
 if(executable)execFileSync('python3',[path.join(root,'tools/sign-release.py'),'--windows-file',executable],{stdio:'inherit'});
};
