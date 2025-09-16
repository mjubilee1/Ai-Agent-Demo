import { ChatSession, DealIntent, DocuSealSubmission, ProposedAction, DocumentRuleKey } from "../types";

export class SessionManager {
  // In-memory storage - replace with database in production
  private static sessions = new Map<string, ChatSession>();
  private static actions = new Map<string, Map<string, ProposedAction>>();

  /**
   * Get or create a chat session
   */
  static getSession(sessionId: string): ChatSession {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        messages: [],
        currentDeal: {},
        selectedDocs: [],
        submissions: [],
      });
    }
    return this.sessions.get(sessionId)!;
  }

  /**
   * Update session with new message
   */
  static addMessage(sessionId: string, role: 'user' | 'assistant', text: string): void {
    const session = this.getSession(sessionId);
    session.messages.push({
      role,
      text,
      ts: Date.now(),
    });
  }

  /**
   * Update deal intent for session
   */
  static updateDealIntent(sessionId: string, dealIntent: Partial<DealIntent>): void {
    const session = this.getSession(sessionId);
    session.currentDeal = { ...session.currentDeal, ...dealIntent };
  }

  /**
   * Update selected documents for session
   */
  static updateSelectedDocs(sessionId: string, selectedDocs: DocumentRuleKey[]): void {
    const session = this.getSession(sessionId);
    session.selectedDocs = selectedDocs;
  }

  /**
   * Add submission to session
   */
  static addSubmission(sessionId: string, submission: DocuSealSubmission): void {
    const session = this.getSession(sessionId);
    session.submissions.push(submission);
  }

  /**
   * Update submission status
   */
  static updateSubmissionStatus(sessionId: string, submissionId: string, status: DocuSealSubmission['status']): void {
    const session = this.getSession(sessionId);
    const submission = session.submissions.find(s => s.id === submissionId);
    if (submission) {
      submission.status = status;
      submission.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Get all sessions (for admin/debugging)
   */
  static getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Delete session
   */
  static deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    this.actions.delete(sessionId);
    return deleted;
  }

  /**
   * Get actions for session
   */
  static getActions(sessionId: string): ProposedAction[] {
    const sessionActions = this.actions.get(sessionId);
    return sessionActions ? Array.from(sessionActions.values()) : [];
  }

  /**
   * Add action to session
   */
  static addAction(sessionId: string, action: ProposedAction): void {
    if (!this.actions.has(sessionId)) {
      this.actions.set(sessionId, new Map());
    }
    this.actions.get(sessionId)!.set(action.id, action);
  }

  /**
   * Update action status
   */
  static updateActionStatus(sessionId: string, actionId: string, status: ProposedAction['status']): ProposedAction | null {
    const sessionActions = this.actions.get(sessionId);
    if (!sessionActions) return null;

    const action = sessionActions.get(actionId);
    if (!action) return null;

    action.status = status;
    return action;
  }

  /**
   * Get session summary
   */
  static getSessionSummary(sessionId: string): {
    messageCount: number;
    dealComplete: boolean;
    documentsSelected: number;
    submissionsActive: number;
    lastActivity: Date;
  } {
    const session = this.getSession(sessionId);
    
    const messageCount = session.messages.length;
    const dealComplete = Object.keys(session.currentDeal).length >= 4; // At least 4 key fields
    const documentsSelected = session.selectedDocs.length;
    const submissionsActive = session.submissions.filter(s => 
      ['draft', 'sent', 'viewed'].includes(s.status)
    ).length;
    
    const lastActivity = session.messages.length > 0 
      ? new Date(session.messages[session.messages.length - 1].ts)
      : new Date();

    return {
      messageCount,
      dealComplete,
      documentsSelected,
      submissionsActive,
      lastActivity,
    };
  }

  /**
   * Clean up old sessions (older than 24 hours)
   */
  static cleanupOldSessions(): number {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    let deletedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastMessage = session.messages[session.messages.length - 1];
      if (lastMessage && lastMessage.ts < cutoff) {
        this.deleteSession(sessionId);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Export session data (for debugging/backup)
   */
  static exportSession(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Import session data (for debugging/restore)
   */
  static importSession(session: ChatSession): void {
    this.sessions.set(session.sessionId, session);
  }
}
