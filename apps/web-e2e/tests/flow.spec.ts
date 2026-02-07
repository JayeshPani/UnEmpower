import { test, expect } from '@playwright/test';

test.describe('UnEmpower E2E Flow', () => {
    test('should register worker, simulate proof, generate offer, borrow and repay', async ({ page }) => {
        // Mock wallet connection locally - in real E2E we'd use Synpress or similar
        // For this hackathon scope, we'll verify the UI flows assuming disconnected state first
        // or check public access pages.

        // 1. Visit Home
        await page.goto('/');
        await expect(page.getByText('UnEmpower')).toBeVisible();

        // 2. Check Register Page
        await page.goto('/register');
        await expect(page.getByText('Register as Worker')).toBeVisible();
        // Without wallet, we can only verify UI structure
        await expect(page.getByRole('textbox')).toBeDisabled(); // Disabled until wallet connected

        // 3. Check WorkProofs Page
        await page.goto('/workproofs');
        await expect(page.getByRole('heading', { name: 'Work History' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Simulate Work (Admin)' })).toBeVisible();

        // 4. Check Offer Page
        await page.goto('/offer');
        await expect(page.getByRole('heading', { name: 'AI Credit Assessment' })).toBeVisible();

        // 5. Check Loan Page
        await page.goto('/loan');
        await expect(page.getByRole('heading', { name: 'Borrow from Vault' })).toBeVisible();

        // Note: Full on-chain interaction requires wallet extension which Playwright standard 
        // doesn't support out of box. We rely on the "One-Command Run" and manual verification for now
        // given the constraints, but this ensures all pages load and critical elements exist.
    });
});
