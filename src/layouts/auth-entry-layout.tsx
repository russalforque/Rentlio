import { ArrowUpRight, DoorOpen, ReceiptText, ShieldCheck, Wallet } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { Brand } from '@/components/app/brand'
import { ThemeToggle } from '@/components/app/theme-toggle'
import './auth-entry.css'

const FEATURES = [
  { icon: DoorOpen, title: 'A place for your rental details', description: 'Rooms, tenancy information and the things that matter.' },
  { icon: ReceiptText, title: 'Every bill, clearly explained', description: 'Rent and utilities together, with a clear breakdown.' },
  { icon: Wallet, title: 'Payments you can keep track of', description: 'Payment updates, proof and receipts in one place.' },
]

/** Presentation only: the existing auth routes and form handlers stay in charge. */
export function AuthEntryLayout() {
  const registering = useLocation().pathname.replace(/\/+$/, '') === '/register'

  return (
    <div className={`auth-entry${registering ? ' auth-entry-register' : ''}`}>
      <a href="#auth-main" className="auth-skip-link">Skip to form</a>
      <div className="auth-entry-container">
        <header className="auth-entry-header">
          <Link to="/login" aria-label="Rentlio sign in" className="auth-brand"><Brand /></Link>
          <div className="auth-appearance"><ThemeToggle /></div>
        </header>

        <div className="auth-entry-body">
          <aside className="auth-editorial" aria-labelledby="auth-product-heading">
            <div>
              <p className="auth-editorial-eyebrow"><span aria-hidden />RENTAL LIFE, SIMPLIFIED</p>
              <h2 id="auth-product-heading">Less admin.<br /><span>More living.</span></h2>
              <p className="auth-editorial-description">A little more clarity. A little more peace of mind. One place for every part of your rental.</p>
            </div>

            <ul className="auth-feature-list">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li key={title}>
                  <span className="auth-feature-icon" aria-hidden><Icon strokeWidth={1.5} /></span>
                  <div><h3>{title}</h3><p>{description}</p></div>
                </li>
              ))}
            </ul>

            <div className="auth-editorial-note">
              <ShieldCheck className="size-4 shrink-0" strokeWidth={1.6} aria-hidden />
              <p>Tenant accounts are verified by the landlord.<br /><span>Your rental records stay private.</span></p>
              <ArrowUpRight className="ml-auto size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            </div>
          </aside>

          <main id="auth-main" tabIndex={-1} className="auth-entry-main">
            <div className="auth-entry-form"><Outlet /></div>
          </main>
        </div>

        <footer className="auth-entry-footer">
          <span>© {new Date().getFullYear()} Rentlio</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden />Your rental, in good order.</span>
        </footer>
      </div>
    </div>
  )
}
