import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3000',{waitUntil:'networkidle'});await page.screenshot({path:'artifacts/dashboard-desktop.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log('PASS: desktop dashboard',await page.title());
 const state=await page.evaluate(async()=>{const r=await fetch('/api/spj?route=state');return r.json();});assert.equal(state.transactions.length,0);assert.equal(state.needsSetup,true);console.log('PASS: no permanent sample data');
 await page.getByRole('button',{name:'Tambah Transaksi',exact:true}).click();await page.getByRole('heading',{name:'Tambah transaksi',exact:true}).waitFor();await page.screenshot({path:'artifacts/category-picker.png'});await page.getByRole('button',{name:/Pembayaran Internet/}).click();await page.getByRole('heading',{name:'Amankan ruang kerja sekolah'}).waitFor();await page.getByRole('button',{name:'Tutup dialog',exact:true}).click();
 for(const label of ['Identitas Sekolah','Template Dokumen','Backup & Restore','Laporan & Rekap','Arsip Tahunan']){await page.getByRole('button',{name:label,exact:true}).click();await page.screenshot({path:`artifacts/view-${label.toLowerCase().replaceAll(/[^a-z]/g,'-')}.png`,fullPage:true});}
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 for(const width of [1280,1024,768,390]){await page.setViewportSize({width,height:width===390?844:900});await page.waitForTimeout(350);await page.screenshot({path:`artifacts/dashboard-${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}`);console.log(`PASS: responsive ${width}px`);}
 await page.getByRole('button',{name:'Buka navigasi'}).click();await page.getByRole('button',{name:'Transaksi',exact:true}).click();assert.equal(await page.locator('.sidebar').evaluate(el=>el.classList.contains('is-open')),false);console.log('PASS: mobile navigation');assert.deepEqual(errors,[]);console.log('PASS: no browser runtime errors');
} finally {await browser.close();}
