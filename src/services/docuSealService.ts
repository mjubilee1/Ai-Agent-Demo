import { DocuSealSubmission } from "../types";

export class DocuSealService {
  private static readonly API_BASE = process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com';
  private static readonly API_KEY = process.env.DOCUSEAL_API_KEY;

  /**
   * Create a new submission in DocuSeal
   */
  static async createSubmission(data: {
    templateId: string;
    submitters: Array<{ email: string; name: string; role: string }>;
    values?: Record<string, any>;
  }): Promise<DocuSealSubmission> {
    if (!this.API_KEY) {
      throw new Error('DocuSeal API key not configured');
    }

    try {
      const response = await fetch(`${this.API_BASE}/submissions`, {
        method: "POST",
        headers: {
          "X-Auth-Token": this.API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: data.templateId,
          send_email: true,
          submitters: (data.submitters ?? [])
            .filter((s) => (s.role ?? "").trim().toLowerCase() === "buyer agent")
            .map((s) => ({
              email: "mjubil96@gmail.com",
              name: s.name,
              role: "Buyer Agent", // keep exact casing for DocuSeal
              fields: Object.entries(data.values || {}).map(([name, default_value]) => ({
                name,
                default_value,
              })),
            })),
        }),
      });          

      console.log(JSON.stringify({
        template_id: data.templateId,
        send_email: true,
        submitters: data.submitters.map((s) => ({
          email: s.email,
          name: s.name,
          role: this.normalizeRole(s.role),
          fields: Object.entries(data.values || {}).map(([name, default_value]) => ({
            name,
            default_value,
          })),
        })),
        // remove top-level fields when using submitter fields
      }))
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DocuSeal API error: ${response.status} - ${errorText}`);
      }

      const submission = await response.json();
      return this.normalizeSubmission(submission);
    } catch (error) {
      console.error('Error creating DocuSeal submission:', error);
      throw error;
    }
  }

  /**
   * Send multiple documents for signature
   */
  static async sendDocuments(request: {
    templateIds: string[];
    submitters: Array<{ email: string; name: string; role: string }>;
    values?: Record<string, any>;
  }): Promise<{
    submissionIds: string[];
    signingUrls: string[];
    status: string;
  }> {
    const submissions: DocuSealSubmission[] = [];
    const signingUrls: string[] = [];

    // Create submissions for each template
    for (const templateId of request.templateIds) {
      try {
        const submission = await this.createSubmission({
          templateId,
          submitters: request.submitters,
          values: request.values,
        });

        submissions.push(submission);
        
        if (submission.signingUrl) {
          signingUrls.push(submission.signingUrl);
        }
      } catch (error) {
        console.error(`Error creating submission for template ${templateId}:`, error);
        throw error;
      }
    }

    return {
      submissionIds: submissions.map(s => s.id),
      signingUrls,
      status: 'created',
    };
  }

  /**
   * Get submission status
   */
  static async getSubmissionStatus(submissionId: string): Promise<DocuSealSubmission> {
    if (!this.API_KEY) {
      throw new Error('DocuSeal API key not configured');
    }

    try {
      const response = await fetch(`${this.API_BASE}/submissions/${submissionId}`, {
        headers: {
          'Authorization': `Bearer ${this.API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`DocuSeal API error: ${response.status}`);
      }

      const submission = await response.json();
      return this.normalizeSubmission(submission);
    } catch (error) {
      console.error('Error getting submission status:', error);
      throw error;
    }
  }

  /**
   * Resend submission to signers
   */
  static async resendSubmission(submissionId: string): Promise<void> {
    if (!this.API_KEY) {
      throw new Error('DocuSeal API key not configured');
    }

    try {
      const response = await fetch(`${this.API_BASE}/submissions/${submissionId}/resend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`DocuSeal API error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error resending submission:', error);
      throw error;
    }
  }

  /**
   * Cancel submission
   */
  static async cancelSubmission(submissionId: string): Promise<void> {
    if (!this.API_KEY) {
      throw new Error('DocuSeal API key not configured');
    }

    try {
      const response = await fetch(`${this.API_BASE}/submissions/${submissionId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`DocuSeal API error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error canceling submission:', error);
      throw error;
    }
  }

  /**
   * Get signing URL for submission
   */
  static async getSigningUrl(submissionId: string, signerEmail: string): Promise<string> {
    if (!this.API_KEY) {
      throw new Error('DocuSeal API key not configured');
    }

    try {
      const response = await fetch(`${this.API_BASE}/submissions/${submissionId}/signing_url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: signerEmail,
        }),
      });

      if (!response.ok) {
        throw new Error(`DocuSeal API error: ${response.status}`);
      }

      const data = await response.json();
      return data.signing_url;
    } catch (error) {
      console.error('Error getting signing URL:', error);
      throw error;
    }
  }

  /**
   * Process webhook events from DocuSeal
   */
  static processWebhook(payload: any): {
    event: string;
    submission: DocuSealSubmission;
  } {
    try {
      // Normalize webhook payload
      const event = payload.event || 'submission.updated';
      const submission = this.normalizeSubmission(payload.submission || payload);

      return {
        event,
        submission,
      };
    } catch (error) {
      console.error('Error processing DocuSeal webhook:', error);
      throw error;
    }
  }

  private static normalizeRole(role?: string) {
    if (!role) return role;
  
    const key = role.trim().toLowerCase();
  
    const ROLE_MAP: Record<string, string> = {
      "buyer": "Buyer",
      "buyer agent": "Buyer Agent",
      "seller agent": "Seller Agent",
      "seller": "Seller",
      // add your template roles here exactly as DocuSeal expects them
    };
  
    return ROLE_MAP[key] ?? role; // fallback to original if unknown
  }

  /**
   * Normalize submission data from DocuSeal API
   */
  private static normalizeSubmission(data: any): DocuSealSubmission {
    return {
      id: data.id || data.submission_id,
      templateId: data.template_id || data.templateId,
      status: this.normalizeStatus(data.status),
      createdAt: data.created_at || data.createdAt,
      updatedAt: data.updated_at || data.updatedAt,
      signers: (data.submitters || data.signers || []).map((signer: any) => ({
        email: signer.email,
        name: signer.name,
        role: signer.role,
        status: this.normalizeSignerStatus(signer.status),
      })),
      signingUrl: data.signing_url || data.signingUrl,
    };
  }

  /**
   * Normalize submission status
   */
  private static normalizeStatus(status: string): DocuSealSubmission['status'] {
    const statusMap: Record<string, DocuSealSubmission['status']> = {
      'draft': 'draft',
      'sent': 'sent',
      'viewed': 'viewed',
      'completed': 'completed',
      'declined': 'declined',
      'cancelled': 'declined',
    };
    
    return status ? statusMap[status.toLowerCase()] : 'draft';
  }

  /**
   * Normalize signer status
   */
  private static normalizeSignerStatus(status: string): DocuSealSubmission['signers'][0]['status'] {
    const statusMap: Record<string, DocuSealSubmission['signers'][0]['status']> = {
      'pending': 'pending',
      'viewed': 'viewed',
      'signed': 'signed',
      'declined': 'declined',
    };

    return statusMap[status.toLowerCase()] || 'pending';
  }

  /**
   * Mock implementation for development/testing
   */
  static async mockCreateSubmission(data: {
    templateId: string;
    submitters: Array<{ email: string; name: string; role: string }>;
    values?: Record<string, any>;
  }): Promise<DocuSealSubmission> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const submissionId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id: submissionId,
      templateId: data.templateId,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      signers: data.submitters.map(submitter => ({
        email: submitter.email,
        name: submitter.name,
        role: submitter.role,
        status: 'pending',
      })),
      signingUrl: `https://app.docuseal.co/sign/${submissionId}`,
    };
  }

  /**
   * Mock send documents for development/testing
   */
  static async mockSendDocuments(request: {
    templateIds: string[];
    submitters: Array<{ email: string; name: string; role: string }>;
    values?: Record<string, any>;
  }): Promise<{
    submissionIds: string[];
    signingUrls: string[];
    status: string;
  }> {
    const submissionIds: string[] = [];
    const signingUrls: string[] = [];

    for (const templateId of request.templateIds) {
      const submission = await this.mockCreateSubmission({
        templateId,
        submitters: request.submitters,
        values: request.values,
      });

      submissionIds.push(submission.id);
      if (submission.signingUrl) {
        signingUrls.push(submission.signingUrl);
      }
    }

    return {
      submissionIds,
      signingUrls,
      status: 'created',
    };
  }
}
