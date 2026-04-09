import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#080808' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link href="/" className="font-mono text-sm text-[#555555] hover:text-[#F5F5F5] transition-colors mb-8 inline-block">
          <span className="text-[#00FF94]">&#x2588;</span> getanynumberonline
        </Link>

        <h1 className="text-3xl font-bold mb-2" style={{ color: '#F5F5F5' }}>Privacy Policy</h1>
        <p className="text-sm mb-10" style={{ color: '#555555' }}>Last updated: April 2026</p>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>1. What Data We Collect</h2>
            <p className="text-sm leading-relaxed mb-3" style={{ color: '#A0A0A0' }}>
              We collect only the data necessary to provide our Service:
            </p>
            <ul className="list-disc list-inside text-sm space-y-1.5" style={{ color: '#A0A0A0' }}>
              <li><strong>Email address</strong> — for account creation and authentication</li>
              <li><strong>Transaction history</strong> — records of wallet top-ups, order costs, and refunds</li>
              <li><strong>Order details</strong> — service type, country, phone number, and SMS codes received</li>
              <li><strong>Usage data</strong> — basic analytics to improve the Service (page views, error logs)</li>
            </ul>
            <p className="text-sm leading-relaxed mt-3" style={{ color: '#A0A0A0' }}>
              We do not collect, store, or process the content of SMS messages beyond the verification code itself.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>2. How We Use Your Data</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#A0A0A0' }}>
              Your data is used exclusively for:
            </p>
            <ul className="list-disc list-inside text-sm space-y-1.5" style={{ color: '#A0A0A0' }}>
              <li>Creating and managing your account</li>
              <li>Processing payments and maintaining your wallet balance</li>
              <li>Providing phone numbers and delivering SMS verification codes</li>
              <li>Resolving disputes and processing refund requests</li>
              <li>Improving the Service and detecting abuse or fraud</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>3. Third-Party Services</h2>
            <p className="text-sm leading-relaxed mb-3" style={{ color: '#A0A0A0' }}>
              We work with the following third-party providers, each of which has its own privacy policy:
            </p>
            <ul className="list-disc list-inside text-sm space-y-2" style={{ color: '#A0A0A0' }}>
              <li><strong>Supabase</strong> — database hosting and authentication. Stores your account data and transaction records. <a href="https://supabase.com/privacy" className="text-[#00FF94] hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
              <li><strong>Flutterwave</strong> — payment processing. Handles all wallet top-up transactions. We do not store your payment card details. <a href="https://flutterwave.com/privacy" className="text-[#00FF94] hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
              <li><strong>SMSPool</strong> — phone number and SMS delivery provider. Processes your verification requests. <a href="https://smspool.net/privacy" className="text-[#00FF94] hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>4. Data Retention</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#A0A0A0' }}>
              We retain your account data and transaction history for as long as your account is active. Inactive
              accounts may be purged after 24 months of no activity. SMS verification codes are deleted from our
              systems within 30 days of receipt. You may request deletion of your account and associated data at any
              time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>5. Your Rights</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#A0A0A0' }}>
              You have the right to access, correct, or delete your personal data at any time. To exercise these
              rights, contact us at{' '}
              <span className="font-mono text-[#00FF94]">support@getanynumberonline.com</span>. We will respond within
              30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ color: '#F5F5F5' }}>6. Contact</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#A0A0A0' }}>
              For any privacy-related inquiries, data access requests, or concerns, please reach out to us at:{' '}
              <a href="mailto:support@getanynumberonline.com" className="text-[#00FF94] hover:underline">
                support@getanynumberonline.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t" style={{ borderColor: '#1A1A1A' }}>
          <p className="text-xs text-center" style={{ color: '#555555' }}>
            This Privacy Policy may be updated periodically. Continued use of the Service constitutes acceptance of any changes.
          </p>
        </div>
      </div>
    </div>
  )
}
