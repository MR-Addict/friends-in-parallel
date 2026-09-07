import { expect, type Page } from '@playwright/test';

export async function selectDate(page: Page, date: string) {
  await page.getByRole('button', { name: '选择日期', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: '翻到哪一天？' });
  await calendar.getByLabel('选择月份').fill(date.slice(0, 7));
  await calendar.getByRole('button', { name: new RegExp(`^${date}，`) }).click();
  await expect(calendar).toHaveCount(0);
}
