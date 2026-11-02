import { test as base, expect, waitForHydration } from './support.ts';
export { expect };
export { mainSection, installLocalFonts } from './workspace.ts';
export interface WorkspaceUser { accountId: string }
export const test = base.extend({
 workspaceUser: async ({},use) => { await use({accountId:'demo'}); },
 accountId: [async ({page}, use) => { await page.request.get('http://localhost:3000/__test?action=reset'); await use('demo'); }, {auto:true}],
});
export async function openWorkspace(page,user) { await page.goto('/overview'); await expect(page.getByRole('heading',{name:'Good morning, Moe'})).toBeVisible(); }
export async function generatedEvents(accountId) { return fetch('http://localhost:3000/__test?action=events').then(r=>r.json()); }
