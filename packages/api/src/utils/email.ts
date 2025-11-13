import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const emailConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };

    // In development, use ethereal email for testing
    if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
      // For development without SMTP config, we'll create a test account
      this.createTestAccount();
      return;
    }

    try {
      this.transporter = nodemailer.createTransport(emailConfig);
      console.log('Email transporter initialized');
    } catch (error) {
      console.error('Failed to initialize email transporter:', error);
    }
  }

  private async createTestAccount() {
    try {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log('Development email account created:', testAccount.user);
    } catch (error) {
      console.error('Failed to create test email account:', error);
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email transporter not initialized');
      return false;
    }

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@timetrack.local',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);
      
      // In development, log the preview URL
      if (process.env.NODE_ENV === 'development') {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          console.log('Preview URL:', previewUrl);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
    const resetUrl = `${process.env.APPLICATION_URL || 'http://localhost:3010'}/reset-password?token=${resetToken}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>You have requested to reset your password for your TimeTrack account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}" style="display: inline-block; background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p style="margin-top: 32px; color: #666; font-size: 14px;">
          This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
        </p>
        <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message from TimeTrack. Please do not reply to this email.
        </p>
      </div>
    `;

    const textContent = `
Password Reset Request

You have requested to reset your password for your TimeTrack account.

Please click the following link to reset your password:
${resetUrl}

This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.

This is an automated message from TimeTrack. Please do not reply to this email.
    `;

    return this.sendEmail({
      to: email,
      subject: 'TimeTrack - Password Reset Request',
      text: textContent,
      html: htmlContent,
    });
  }
}

export const emailService = new EmailService();