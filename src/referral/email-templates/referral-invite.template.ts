import { Injectable } from '@nestjs/common';

/**
 * Email template for referral invitation
 */
export interface ReferralInviteTemplateData {
  referrerName: string;
  refereeEmail: string;
  referralCode: string;
  referralUrl: string;
  message?: string;
}

@Injectable()
export class ReferralEmailTemplates {
  /**
   * Generate HTML for referral invitation email
   */
  generateReferralInviteEmail(data: ReferralInviteTemplateData): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .code-box { background: #fff; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; font-family: monospace; font-size: 16px; text-align: center; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .message-box { background: #fff; padding: 15px; border-radius: 5px; margin: 20px 0; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 You've Been Invited!</h1>
            </div>
            <div class="content">
              <p>Hello!</p>
              <p><strong>${this.escapeHtml(data.referrerName)}</strong> has invited you to join StellAIverse - the AI-powered agent platform.</p>
              
              ${data.message ? `<div class="message-box"><p>"${this.escapeHtml(data.message)}"</p></div>` : ''}
              
              <p>Join thousands of users leveraging AI agents for trading, analysis, and automation.</p>
              
              <p style="text-align: center;">
                <a href="${data.referralUrl}" class="button">Accept Invitation</a>
              </p>
              
              <p>Or use this referral code during registration:</p>
              <div class="code-box">${data.referralCode}</div>
              
              <p><strong>Benefits of joining through referral:</strong></p>
              <ul>
                <li>✨ Exclusive welcome bonus</li>
                <li>🚀 Early access to premium features</li>
                <li>🎯 Personalized AI agent recommendations</li>
              </ul>
              
              <p>This invitation is exclusively for <strong>${this.escapeHtml(data.refereeEmail)}</strong>.</p>
              
              <p>If you have any questions, feel free to reach out to ${this.escapeHtml(data.referrerName)} or our support team.</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} StellAIverse. All rights reserved.</p>
              <p>You received this email because someone invited you to join StellAIverse.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate plain text version
   */
  generateReferralInviteEmailText(data: ReferralInviteTemplateData): string {
    return `
You've Been Invited to Join StellAIverse!

Hello!

${data.referrerName} has invited you to join StellAIverse - the AI-powered agent platform.

${data.message ? `Message from ${data.referrerName}: "${data.message}"` : ''}

Join thousands of users leveraging AI agents for trading, analysis, and automation.

Accept your invitation: ${data.referralUrl}

Or use this referral code during registration: ${data.referralCode}

Benefits of joining through referral:
- Exclusive welcome bonus
- Early access to premium features
- Personalized AI agent recommendations

This invitation is exclusively for ${data.refereeEmail}.

© ${new Date().getFullYear()} StellAIverse. All rights reserved.
    `.trim();
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
