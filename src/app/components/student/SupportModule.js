'use client';

import { HelpCircle, CheckCircle, Loader2, Send } from 'lucide-react';

export default function SupportModule({ 
  supportCategory, setSupportCategory,
  supportSubject, setSupportSubject,
  supportMessage, setSupportMessage,
  submittingSupport,
  supportTicketSent, setSupportTicketSent,
  handleSupportSubmit,
  userEmail
}) {
  return (
    <div className="content-card">
      <div className="content-card-header">
        <h2 className="content-card-title">
          <HelpCircle size={26} style={{ color: 'var(--primary)' }} />
          Submit Support Ticket
        </h2>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '28px' }}>
        Have questions about your exam, course contents, or technical issues? Send a message and our support team will respond shortly.
      </p>

      {supportTicketSent ? (
        <div style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid var(--success)',
          color: '#065f46',
          padding: '24px',
          borderRadius: '12px',
          textAlign: 'center',
          marginBottom: '24px'
        }}>
          <CheckCircle size={40} style={{ color: 'var(--success)', margin: '0 auto 16px auto' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: '600', marginBottom: '8px' }}>Support Ticket Submitted</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            We received your message! A member of CyberPurview support team will contact you at <strong>{userEmail}</strong>.
          </p>
          <button className="btn btn-outline" onClick={() => setSupportTicketSent(false)} type="button">
            Submit Another Request
          </button>
        </div>
      ) : (
        <form onSubmit={handleSupportSubmit} style={{ maxWidth: '600px' }}>
          <div className="input-group">
            <label className="input-label" htmlFor="support-category">Help Category</label>
            <select
              className="select-field"
              id="support-category"
              value={supportCategory}
              onChange={(e) => setSupportCategory(e.target.value)}
            >
              <option value="technical">Technical Issue (System / Exam Taker)</option>
              <option value="course">Course & Exam Question Explanations</option>
              <option value="billing">Account / Access Problems</option>
              <option value="feedback">General Feedback & Suggestions</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="support-subject">Subject</label>
            <input
              className="input-field"
              type="text"
              id="support-subject"
              placeholder="Brief summary of your query"
              value={supportSubject}
              onChange={(e) => setSupportSubject(e.target.value)}
              required
            />
          </div>

          <div className="input-group" style={{ marginBottom: '24px' }}>
            <label className="input-label" htmlFor="support-message">Message Details</label>
            <textarea
              className="input-field"
              id="support-message"
              rows="6"
              placeholder="Describe your issue or query in detail..."
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              required
            ></textarea>
          </div>

          <button className="btn btn-primary" type="submit" disabled={submittingSupport}>
            {submittingSupport ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Sending...
              </>
            ) : (
              <>
                <Send size={16} /> Submit Ticket
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
