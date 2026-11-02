import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='/Users/moeghashim/.no-mistakes/evidence/01M6E1MX216VYJ1R76P4Y74P86';
const browser=await chromium.launch();
const page=await browser.newPage({deviceScaleFactor:1});
const reports=[];
for(const width of [1440,390]){
 const design=readFileSync(`${dir}/design-${width}.png`);
 const build=readFileSync(`${dir}/overview-seed-${width}.png`);
 const h=Math.max(design.readUInt32BE(20),build.readUInt32BE(20));
 await page.setViewportSize({width:width*2,height:h});
 await page.setContent(`<body style="margin:0;display:flex"><img src="data:image/png;base64,${design.toString('base64')}"><img src="data:image/png;base64,${build.toString('base64')}"></body>`);
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 await page.screenshot({path:`${dir}/isolated-side-by-side-${width}.png`,fullPage:true});
 const diff=await page.evaluate(()=>{
 const imgs=[...document.images];const w=imgs[0].naturalWidth,h=Math.max(...imgs.map(i=>i.naturalHeight));
 const pixels=imgs.map(i=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,w,h).data;});
 let different=0;for(let i=0;i<pixels[0].length;i+=4){if([0,1,2,3].some(k=>pixels[0][i+k]!==pixels[1][i+k]))different++;}
 return {width:w,height:h,differentPixels:different,ratio:different/(w*h)};
 });
 reports.push(diff);
}
writeFileSync(`${dir}/visual-comparison.json`,JSON.stringify(reports,null,2));console.log(reports);
await browser.close();
