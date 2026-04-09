import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#080808' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link href="/" className="font-mono text-sm text-[#555555] hover:text-[#F5F5F5] transition-colors mb-8 inline-block">
          <span className="text-[#00FF94]">&#x2588;</span> getanynumberonline
        </Link>

        <h1 className="text-3xl font-bold mb-2" style={{ color: '#F5F5F5' }}>Terms of Service</h1>
        <p className="text-sm mb-10" style={{ color: '#555555' }}>Last updated: April 2026</p>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>1. Service Description</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#A0A0A0' }}>
              GetAnyNumberOnline (&quot;the Service&quot;) provides temporary phone numbers for SMS verification purposes.
              Users may purchase access to virtual phone numbers to receive one-time verification codes from third-party
              services. The Service is intended for legitimate verification use only — creating accounts, recovering
              passwords, and verifying identity with platforms that require SMS confirmation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>2. Acceptable Use</h2>
            <p className="text-sm leading-relaxed mb-3" style={{ color: '#A0A0A0' }}>
              You agree not to use the Service for:
            </p>
            <ul className="list-disc list-inside text-sm space-y-1.5" style={{ color: '#A0A0A0' }}>
              <li>Spam, phishing, or unsolicited messaging</li>
              <li>Fraud, identity theft, or impersonation</li>
              <li>Any illegal activity or violation of applicable laws</li>
              <li>Circumventing bans or restrictions on other platforms</li>
              <li>Harassment, threats, or abuse</li>
            </ul>
            <p className="text-sm leading-relaxed mt-3" style={{ color: '#A0A0A0' }}>
              We reserve the right to suspend or terminate access without notice if we detect violations of these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>3. Payment Terms</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#A0A0A0' }}>
              All prices are displayed in USD before purchase. You are only charged when an SMS is successfully received
              on your ordered number. Failed orders (no number returned) are not charged. Payment is processed securely
              through Flutterwave. By topping up your wallet, you agree to the stated pricing and any applicable fees
              shown at checkout.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>4. Refund Policy</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#A0A0A0' }}>
              You are eligible for a full refund if no SMS is received within the active window of your order. Refunds
              are automatically credited to your wallet balance. Wallet top-ups are non-refundable once processed,
              except in cases of duplicate charges or service errors. To request a refund, contact us at
              <span className="font-mono text-[#00FF94]"> support@getanynumberonline.com</span>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>5. Limitation of Liability</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#A0A0A0' }}>
              The Service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee availability,
              accuracy, or success rate of any phone number or SMS delivery. GetAnyNumberOnline shall not be liable for
              any indirect, incidental, or consequential damages arising from your use of the Service. Our total
              liability shall not exceed the amount you have paid to us in the preceding 12 months.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>6. Governing Law</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#A0A0A0' }}>
              These Terms are governed by the laws of the jurisdiction in which GetAnyNumberOnline is registered,
              without regard to conflict of law principles. Any disputes shall be resolved in the courts of that
              jurisdiction.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t" style={{ borderColor: '#1A1A1A' }}>
          <p className="text-xs text-center" style={{ color: '#555555' }}>
            For questions about these terms, contact{' '}
            <a href="mailto:support@getanynumberonline.com" className="text-[#00FF94] hover:underline">
              support@getanynumberonline.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
