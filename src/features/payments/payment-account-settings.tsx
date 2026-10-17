import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/app/native-select'
import { ErrorState } from '@/components/app/states'
import { SettingsSection } from '@/components/app/panel'
import { useProfile } from '@/hooks/use-auth'
import { getErrorMessage } from '@/lib/errors'
import type { Enums } from '@/lib/database.types'
import { STORAGE_BUCKETS, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  METHOD_LABEL,
  uploadPaymentQr,
  usePaymentAccounts,
  usePaymentQrUrl,
  useSavePaymentAccount,
  validateQrImage,
  type PaymentAccount,
} from './api'

type AccountMethod = Extract<Enums<'payment_method'>, 'gcash' | 'maya' | 'bank_transfer'>

function accountMethod(method: Enums<'payment_method'>): AccountMethod {
  if (method === 'gcash' || method === 'maya' || method === 'bank_transfer') return method
  throw new Error('This payment account has an unsupported method.')
}

interface Draft {
  id: string | null
  method: AccountMethod
  accountHolder: string
  accountNumber: string
  bankName: string
  qrPath: string
  active: boolean
  isDefault: boolean
}

const blankDraft = (): Draft => ({
  id: null,
  method: 'gcash',
  accountHolder: '',
  accountNumber: '',
  bankName: '',
  qrPath: '',
  active: true,
  isDefault: false,
})

function fromAccount(account: PaymentAccount): Draft {
  return {
    id: account.id,
    method: accountMethod(account.method),
    accountHolder: account.account_holder,
    accountNumber: account.account_number,
    bankName: account.bank_name ?? '',
    qrPath: account.qr_path,
    active: account.is_active,
    isDefault: account.is_default,
  }
}

function QrImage({ path }: { path: string }) {
  const { data, isPending, error } = usePaymentQrUrl(path)
  if (isPending) return <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />
  if (error || !data) return <p className="text-xs text-destructive">QR image could not be loaded.</p>
  return <img src={data} alt="Uploaded payment QR code" className="mx-auto aspect-square max-h-48 w-full rounded-xl bg-white object-contain p-2" />
}

export function PaymentAccountSettings() {
  const profile = useProfile()
  const accounts = usePaymentAccounts()
  const save = useSavePaymentAccount()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const startEdit = (account?: PaymentAccount) => {
    setDraft(account ? fromAccount(account) : blankDraft())
    setQrFile(null)
    setQrError(null)
    setFormError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    setFormError(null)

    const number = draft.accountNumber.trim().replace(/[ ()-]/g, '')
    const validMobile = /^(09\d{9}|\+639\d{9})$/.test(number)
    if (!draft.accountHolder.trim()) return setFormError('Enter the account holder name.')
    if (draft.method !== 'bank_transfer' && !validMobile) return setFormError('Enter a valid Philippine mobile wallet number.')
    if (draft.method === 'bank_transfer' && (!draft.bankName.trim() || !/^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,49}$/.test(number))) {
      return setFormError('Enter the bank name and a valid account number.')
    }
    if (!qrFile && !draft.qrPath) return setQrError('Upload a QR code image for this account.')

    let uploadedPath: string | null = null
    try {
      const qrPath = qrFile ? (uploadedPath = await uploadPaymentQr(profile.id, qrFile)) : draft.qrPath
      await save.mutateAsync({
        accountId: draft.id,
        method: draft.method,
        accountHolder: draft.accountHolder.trim(),
        accountNumber: number,
        bankName: draft.method === 'bank_transfer' ? draft.bankName.trim() : null,
        qrPath,
        active: draft.active,
        isDefault: draft.isDefault,
      })
      toast.success(draft.id ? 'Payment account updated' : 'Payment account added')
      setDraft(null)
      setQrFile(null)
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from(STORAGE_BUCKETS.paymentQrCodes).remove([uploadedPath])
        if (cleanupError) console.error('Could not remove the unclaimed QR upload:', cleanupError)
      }
      toast.error(getErrorMessage(error))
    }
  }

  const deactivate = async (account: PaymentAccount) => {
    try {
      await save.mutateAsync({
        accountId: account.id,
        method: accountMethod(account.method),
        accountHolder: account.account_holder,
        accountNumber: account.account_number,
        bankName: account.bank_name,
        qrPath: account.qr_path,
        active: false,
        isDefault: false,
      })
      toast.success('Payment account deactivated')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <SettingsSection
      id="payment-accounts"
      title="Payment methods"
      description="Manage the GCash, Maya, and bank accounts tenants can use. Tenants only see active accounts."
    >
      <div className="space-y-4">
        {accounts.error && <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />}
        {accounts.isPending ? (
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {accounts.data?.map((account) => (
              <li key={account.id} className="rounded-2xl border p-4">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{METHOD_LABEL[account.method]}</h3>
                      <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', account.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
                        {account.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {account.is_default && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Default</span>}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{account.account_holder}</p>
                    <p className="mt-0.5 break-all text-sm tabular text-muted-foreground">{account.account_number}</p>
                    {account.bank_name && <p className="text-sm text-muted-foreground">{account.bank_name}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEdit(account)}>Edit</Button>
                      {account.is_active && (
                        <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={save.isPending} onClick={() => void deactivate(account)}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </div>
                  <QrImage path={account.qr_path} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {!draft ? (
          <Button type="button" variant="outline" onClick={() => startEdit()}>
            Add payment account
          </Button>
        ) : (
          <form key={draft.id ?? 'new'} onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 rounded-2xl border bg-muted/20 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{draft.id ? 'Edit payment account' : 'Add payment account'}</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="account-method">Payment method</Label>
                <NativeSelect id="account-method" value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value as AccountMethod })}>
                  <option value="gcash">GCash</option>
                  <option value="maya">Maya</option>
                  <option value="bank_transfer">Bank transfer</option>
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="account-holder">Account holder name</Label>
                <Input id="account-holder" maxLength={120} autoComplete="name" value={draft.accountHolder} onChange={(e) => setDraft({ ...draft, accountHolder: e.target.value })} />
              </div>
              {draft.method === 'bank_transfer' && (
                <div className="grid gap-1.5">
                  <Label htmlFor="bank-name">Bank name</Label>
                  <Input id="bank-name" maxLength={120} value={draft.bankName} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="account-number">{draft.method === 'bank_transfer' ? 'Account number' : 'Mobile wallet number'}</Label>
                <Input id="account-number" inputMode={draft.method === 'bank_transfer' ? 'text' : 'tel'} maxLength={50} autoComplete="off" value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account-qr">Payment QR code</Label>
              <Input
                id="account-qr"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="min-h-12 cursor-pointer py-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  const issue = file ? validateQrImage(file) : null
                  setQrError(issue)
                  setQrFile(issue ? null : file)
                }}
              />
              <p className="text-xs text-muted-foreground">JPG, PNG, or WebP · up to 4 MB. Stored privately; tenants with active leases can view active account QR codes.</p>
              {qrError && <p role="alert" className="text-sm text-destructive">{qrError}</p>}
              {draft.qrPath && !qrFile && <div className="mt-2 max-w-40"><QrImage path={draft.qrPath} /></div>}
            </div>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked, isDefault: e.target.checked && draft.isDefault })} />
                Active for tenants
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.isDefault} disabled={!draft.active} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
                Default payment account
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save account'}</Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>Cancel</Button>
            </div>
          </form>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">Changing an account does not process a payment. Tenants must transfer money with their wallet or banking app and submit proof for verification.</p>
      </div>
    </SettingsSection>
  )
}
