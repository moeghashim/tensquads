import { test as base, expect } from '../e2e/support.ts';
import { installPinnedFonts } from '../e2e/fonts.ts';
export { expect };
export const test = base.extend({
 workspaceUser: async ({}, use) => { await use({ accountId: 'local-gate', userId: 'local-user' }); },
 accountId: [async ({ request }, use) => { const res = await request.post('/__local/reset'); expect(res.ok()).toBeTruthy(); await use('local-gate'); }, { auto: true }],
 capture: [async ({ page }, use, info) => { await use(); if (!page.isClosed()) await page.screenshot({path: `${process.env.LOCAL_EVIDENCE}/${info.title.replace(/[^a-z0-9]+/gi,'-')}.png`,fullPage:true}); }, {auto:true}],
});
export async function openWorkspace(page: any, _user: any) { await page.goto('/overview'); await expect(page.getByRole('navigation',{name:'Workspace'})).toBeVisible(); }
export async function installLocalFonts(page: any) { await installPinnedFonts(page, true); }
export async function generatedEvents() { throw new Error('not used by selected browser checks'); }
export type WorkspaceUser = {accountId:string,userId:string};
