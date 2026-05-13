import React, { FC, ReactNode } from 'react'
import superPaperLogo from '@/shared/images/superpaper-icon.png'

type Props = { children: ReactNode }

const CiamLayout: FC<Props> = ({ children }: Props) => (
  <div className="ciam-layout ciam-enabled">
    <header className="ciam-logo">
      <a href="/" className="brand superpaper-ds-logo ciam-image-link">
        <img src={superPaperLogo} alt="superPaper" />
      </a>
    </header>
    <div className="ciam-container">
      <main className="ciam-card" id="main-content">
        {children}
        <section className="ciam-card-footer">
          <hr className="ciam-card-separator" />
          <p className="ciam-footer-copy">superPaper</p>
        </section>
      </main>
    </div>
    <footer>
      <div className="footer-links">
        <a href="/legal#Privacy">Privacy</a>
        <a href="/legal#Terms">Terms</a>
      </div>
    </footer>
  </div>
)

export default CiamLayout
