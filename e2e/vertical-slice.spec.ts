import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

/**
 * Critical journey: registration → sign-in → profile → KYC submission →
 * analyst approval → demo MT5 account request/provisioning → dashboard →
 * admin timeline. Mirrors docs/product-plan.md section 7.
 *
 * Requires a local Supabase stack seeded via `npm run db:seed` (staff
 * accounts) and the app running against it — see README.md "Running the
 * vertical slice". Local Supabase has email confirmation disabled
 * (supabase/config.toml), so sign-up completes without an inbox step.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_DOCUMENT = path.join(dirname, 'fixtures', 'sample-id-document.txt')

const DEMO_PASSWORD = 'AurionDemo!2026'
const KYC_ANALYST_EMAIL = 'noah.whitfield@aurion-markets.example'
const SUPER_ADMIN_EMAIL = 'ava.morgan@aurion-markets.example'

function uniqueClientEmail() {
  return `e2e.client.${Date.now()}@demo.aurion-markets.test`
}

async function signOut(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /sign out/i }).click()
  await page.waitForURL('/')
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
}

test('client registers, gets KYC-approved and provisions a demo MT5 account; admin sees the full timeline', async ({
  page,
}) => {
  const clientEmail = uniqueClientEmail()

  await test.step('Client registers', async () => {
    await page.goto('/register')
    await page.getByLabel('Email').fill(clientEmail)
    await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD)
    await page.getByLabel('Confirm password').fill(DEMO_PASSWORD)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: /create demo account/i }).click()
    await expect(page).toHaveURL('/verify-email')
    await expect(page.getByText(/check your inbox/i)).toBeVisible()
  })

  await test.step('Client signs in', async () => {
    await signIn(page, clientEmail, DEMO_PASSWORD)
    await expect(page).toHaveURL('/portal')
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible()
  })

  await test.step('Client completes profile', async () => {
    await page.goto('/portal/profile')
    await page.getByLabel('First name').fill('Elena')
    await page.getByLabel('Last name').fill('Voss')
    await page.getByLabel('Date of birth').fill('1992-04-18')
    await page.getByLabel('Phone number').fill('+1 555 010 0199')
    await page.getByLabel('Country of residence').click()
    await page.getByRole('option', { name: 'Canada' }).click()
    await page.getByLabel('Address line 1').fill('42 Simulation Street')
    await page.getByLabel('City').fill('Toronto')
    await page.getByLabel('Postal code').fill('M4B1B3')
    await page.getByRole('button', { name: /save and continue/i }).click()
    await expect(page).toHaveURL('/portal/kyc')
  })

  await test.step('Client submits simulated KYC application', async () => {
    await page.getByLabel('Employment status').click()
    await page.getByRole('option', { name: 'Employed' }).click()
    await page.getByLabel('Source of funds').click()
    await page.getByRole('option', { name: 'Salary' }).click()
    await page.getByLabel('Declared country').click()
    await page.getByRole('option', { name: 'Canada' }).click()
    await page.locator('#document').setInputFiles(SAMPLE_DOCUMENT)
    await page.getByLabel(/confirm the information provided is accurate/i).check()
    await page.getByRole('button', { name: /submit kyc application/i }).click()
    await expect(page.getByText(/under review/i)).toBeVisible()
  })

  await test.step('KYC analyst reviews and approves', async () => {
    await signOut(page)
    await signIn(page, KYC_ANALYST_EMAIL, DEMO_PASSWORD)
    await expect(page).toHaveURL('/admin')

    await page.goto('/admin/kyc')
    await page.getByRole('link', { name: new RegExp(clientEmail, 'i') }).click()
    await page.getByRole('button', { name: /^approve$/i }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^approve$/i })
      .click()
    await expect(page.getByText(/^approved$/i)).toBeVisible()

    await signOut(page)
  })

  await test.step('Client requests a demo MT5 account', async () => {
    await signIn(page, clientEmail, DEMO_PASSWORD)
    await page.goto('/portal/kyc')
    await expect(page.getByText(/you're verified for this demo/i)).toBeVisible()
    await page.getByRole('link', { name: /request a demo account/i }).click()
    await expect(page).toHaveURL('/portal/accounts')

    await page.getByRole('button', { name: /request demo account/i }).click()
    await expect(page).toHaveURL(/\/portal\/accounts\/[0-9a-f-]+/)
    await expect(page.getByText(/^\$10,000\.00$/)).toBeVisible()
  })

  await test.step('Client sees the account on the dashboard', async () => {
    await page.goto('/portal')
    await expect(page.getByText(/demo ·/i)).toBeVisible()
  })

  await test.step('Administrator inspects the complete timeline and audit evidence', async () => {
    await signOut(page)
    await signIn(page, SUPER_ADMIN_EMAIL, DEMO_PASSWORD)
    await page.goto('/admin/clients')
    await page.getByRole('link', { name: 'Elena Voss' }).click()

    await expect(page.getByText('profile.complete')).toBeVisible()
    await expect(page.getByText('kyc.submit')).toBeVisible()
    await expect(page.getByText('kyc.decide')).toBeVisible()
    await expect(page.getByText('trading_account.request')).toBeVisible()
    await expect(page.getByText('trading_account.provisioned')).toBeVisible()
  })
})
