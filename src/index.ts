import Anthropic from "@anthropic-ai/sdk";
import 'dotenv/config';
import { Hono } from 'hono';
import { ingestChat } from "./ingest";
import { retrieve } from './utils';
import { 
  ChatRequestSchema, 
  ParseIntentRequestSchema, 
  SendDocsRequestSchema, 
  ApproveRequestSchema,
  DocuSealWebhookSchema,
  DealIntentSchema,
  DOCUMENT_RULES,
  DocumentRuleKey
} from './types';
import { DealIntentParser } from './services/dealIntentParser';
import { DocumentAutomation } from './services/documentAutomation';
import { DocuSealService } from './services/docuSealService';
import { SessionManager } from './services/sessionManager';

const app = new Hono();

// Initialize Anthropic client lazily to handle missing API keys gracefully
function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY not set, using mock responses');
    return null;
  }
  try {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (error) {
    console.warn('Anthropic initialization failed:', error);
    return null;
  }
}

app.get('/', (c) => c.text('🤖 AI Agent backend running!'));

app.post('/chat', async (c) => {
  try {
    const body = await c.req.json();
    const validatedBody = ChatRequestSchema.parse(body);
    const { sessionId, message, jurisdiction, context } = validatedBody;

    if (!message?.trim()) {
      return c.json(
        { reply: { text: 'Please provide a message.', proposedActions: [], chunks: [] } },
        400
      );
    }

    // Get current session
    const session = SessionManager.getSession(sessionId);
    
    // Parse deal intent from message
    const intentResult = await DealIntentParser.parseIntent(message);
    
    // Update session with new deal intent
    SessionManager.updateDealIntent(sessionId, intentResult.values);
    
    // Get suggested documents based on deal intent
    let suggestedDocs;
    let docValidation;
    try {
      console.log('Getting suggested documents for:', intentResult.values);
      suggestedDocs = DocumentAutomation.getSuggestedDocuments(intentResult.values);
      console.log('Suggested docs result:', suggestedDocs);
      docValidation = DocumentAutomation.validateDocumentRequirements(
        suggestedDocs.all,
        intentResult.values
      );
      console.log('Document validation result:', docValidation);
    } catch (error) {
      console.error('Error in document automation:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      suggestedDocs = { required: ['md-residential-contract'], suggested: [], all: ['md-residential-contract'] };
      docValidation = { valid: false, missingFields: {}, suggestions: [] };
    }

    // Generate follow-up questions for missing fields
    const followUpQuestions = DealIntentParser.generateFollowUpQuestions(
      intentResult.missingFields,
      intentResult.values
    );

    // Validate deal completeness
    let completeness;
    try {
      completeness = DealIntentParser.validateDealCompleteness(intentResult.values);
    } catch (error) {
      console.error('Error in deal completeness validation:', error);
      completeness = { isComplete: false, missingRequired: [], flaggedIssues: [] };
    }

    // 1) Retrieval for context
    const chunks = await retrieve(message, 6);

    // 2) Generate AI response with deal context
    const contextBlock = chunks
      .slice(0, 6)
      .map((c, i) => `#${i + 1} [${c.source}] ${c.snippet}`)
      .join('\n---\n');

    const dealContext = `
Current Deal State:
${JSON.stringify(intentResult.values, null, 2)}

Missing Fields: ${intentResult.missingFields.join(', ')}
Confidence: ${intentResult.confidence}
`;

    const sys = `You are an expert real estate deal assistant. Help users complete their deals by:
1. Acknowledging their intent
2. Asking for missing information when needed
3. Suggesting relevant documents and actions
4. Providing clear next steps

Current jurisdiction: ${jurisdiction || 'MD'}

Return STRICT JSON:
{
  "text": string,               // helpful response
  "actions": [                  // optional actions
    { "title": string, "desc": string, "tool": string }
  ]
}`;

    const userContent = `User message:\n${message}\n\nDeal Context:\n${dealContext}\n\nRetrieved evidence:\n${contextBlock}`;

    const anthropicClient = getAnthropic();
    let msg;
    
    if (anthropicClient) {
      try {
        msg = await anthropicClient.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 800,
          system: sys,
          messages: [{ role: 'user', content: userContent }],
        });
      } catch (error) {
        console.warn('Anthropic API call failed, using mock response:', error);
        msg = {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                text: `I understand you're working on a real estate deal. Based on your message "${message}", I can help you with the following: ${intentResult.values.purchasePrice ? `Purchase price: $${intentResult.values.purchasePrice}` : 'Please provide purchase price'}, ${intentResult.values.emd ? `EMD: ${intentResult.values.emd}%` : 'Please provide EMD percentage'}, ${intentResult.values.closeDate ? `Close date: ${intentResult.values.closeDate}` : 'Please provide close date'}.`,
                actions: []
              })
            }
          ]
        };
      }
    } else {
      // Mock response when Anthropic is not available
      msg = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              text: `I understand you're working on a real estate deal. Based on your message "${message}", I can help you with the following: ${intentResult.values.purchasePrice ? `Purchase price: $${intentResult.values.purchasePrice}` : 'Please provide purchase price'}, ${intentResult.values.emd ? `EMD: ${intentResult.values.emd}%` : 'Please provide EMD percentage'}, ${intentResult.values.closeDate ? `Close date: ${intentResult.values.closeDate}` : 'Please provide close date'}.`,
              actions: []
            })
          }
        ]
      };
    }

    // 3) Parse Claude JSON safely
    let text = `I understand you're working on a real estate deal. Let me help you with that.`;
    let proposedActions: Array<{ title: string; desc?: string; tool?: string }> = [];

    try {
      const raw = msg.content
        .map((p) => ('text' in p ? p.text : ''))
        .join('')
        .trim();

      const jsonStrMatch = raw.match(/\{[\s\S]*\}$/);
      const parsed = JSON.parse(jsonStrMatch ? jsonStrMatch[0] : raw);

      if (parsed?.text) text = parsed.text;
      if (Array.isArray(parsed?.actions)) {
        proposedActions = parsed.actions.map((a: any) => ({
          title: String(a.title || 'Proposed action'),
          desc: a.desc ? String(a.desc) : undefined,
          tool: a.tool ? String(a.tool) : undefined,
        }));
      }
    } catch (error) {
      console.error('Error parsing AI response:', error);
    }

    // Add system-generated actions based on deal state
    if (intentResult.missingFields.length > 0) {
      proposedActions.push({
        title: 'Request Missing Information',
        desc: `Need: ${intentResult.missingFields.join(', ')}`,
        tool: 'request-info',
      });
    }

    if (completeness.isComplete && suggestedDocs.all.length > 0) {
      proposedActions.push({
        title: 'Prepare Documents',
        desc: `Ready to prepare ${suggestedDocs.all.length} document(s)`,
        tool: 'prefill-docs',
      });
    }

    if (docValidation.valid && suggestedDocs.all.length > 0) {
      proposedActions.push({
        title: 'Send for Signature',
        desc: `Send ${suggestedDocs.all.length} document(s) to parties`,
        tool: 'send-docs',
      });
    }

    // Add actions to session
    const withIds = proposedActions.map((a) => {
      const id = crypto.randomUUID();
      const action = { 
        id, 
        title: a.title, 
        desc: a.desc, 
        status: "proposed" as const,
        tool: a.tool,
        payload: {
          suggestedDocs: suggestedDocs.all,
          dealIntent: intentResult.values,
        },
      };
      SessionManager.addAction(sessionId, action);
      return action;
    });

    // Store messages
    SessionManager.addMessage(sessionId, 'user', message);
    SessionManager.addMessage(sessionId, 'assistant', text);

    await ingestChat(sessionId, [
      { role: "user", text: message, ts: Date.now() },
      { role: "assistant", text: text, ts: Date.now() + 1 },
    ]);

    return c.json({
      reply: {
        text,
        proposedActions: withIds,
        chunks: chunks.map((c) => ({ source: c.source, snippet: c.snippet })),
        dealSummary: {
          currentValues: intentResult.values,
          missingFields: intentResult.missingFields,
          flaggedIssues: completeness.flaggedIssues,
          suggestedAddenda: suggestedDocs.suggested,
        },
      },
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return c.json(
      { reply: { text: 'Sorry, I encountered an error. Please try again.', proposedActions: [], chunks: [] } },
      500
    );
  }
});

app.post("/approve", async (c) => {
  try {
    const body = await c.req.json();
    const { sessionId, actionId, action, payload } = body;

    if (!sessionId || !actionId) {
      return c.json({ error: "Missing sessionId or actionId" }, 400);
    }

    const sessionAction = SessionManager.updateActionStatus(sessionId, actionId, "approved");
    if (!sessionAction) {
      return c.json({ error: "Action not found" }, 404);
    }

    // Execute the approved action
    let result = null;
    
    switch (action) {
      case 'send-docs':
        result = await executeSendDocs(sessionId, payload);
        break;
      case 'prefill-docs':
        result = await executePrefillDocs(sessionId, payload);
        break;
      case 'request-info':
        result = await executeRequestInfo(sessionId, payload);
        break;
      case 'attach-addendum':
        result = await executeAttachAddendum(sessionId, payload);
        break;
      default:
        console.log("✅ Executing action:", sessionAction);
    }

    return c.json({ action: sessionAction, result });
  } catch (error) {
    console.error('Error in approve endpoint:', error);
    return c.json({ error: "Failed to execute action" }, 500);
  }
});

app.get("/actions", (c) => {
  const sessionId = c.req.query("sessionId");
  if (!sessionId) {
    return c.json({ error: "Missing sessionId" }, 400);
  }
  
  const actions = SessionManager.getActions(sessionId);
  return c.json({ actions });
});

// Parse intent endpoint
app.post("/parse-intent", async (c) => {
  try {
    const body = await c.req.json();
    const { text } = ParseIntentRequestSchema.parse(body);

    const result = await DealIntentParser.parseIntent(text);
    
    return c.json({
      values: result.values,
      confidence: result.confidence,
      missingFields: result.missingFields,
      suggestedQuestions: result.suggestedQuestions,
    });
  } catch (error) {
    console.error('Error in parse-intent endpoint:', error);
    return c.json({ error: "Failed to parse intent" }, 500);
  }
});

// Send documents endpoint
app.post("/send-docs", async (c) => {
  try {
    const body = await c.req.json();
    const { templateIds, submitters, values, dealIntent } = SendDocsRequestSchema.parse(body);

    // Use mock service for development (replace with real DocuSeal in production)
    const result = await DocuSealService.mockSendDocuments({
      templateIds,
      submitters,
      values,
    });

    return c.json(result);
  } catch (error) {
    console.error('Error in send-docs endpoint:', error);
    return c.json({ error: "Failed to send documents" }, 500);
  }
});

// DocuSeal webhook endpoint
app.post("/docuseal/webhook", async (c) => {
  try {
    const body = await c.req.json();
    const { event, submission } = DocuSealService.processWebhook(body);

    // Update submission status in session
    // Note: You'll need to implement a way to map submission IDs to session IDs
    // For now, we'll just log the webhook
    console.log(`DocuSeal webhook: ${event} for submission ${submission.id}`);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error in DocuSeal webhook:', error);
    return c.json({ error: "Failed to process webhook" }, 500);
  }
});

// Get session summary
app.get("/session/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = SessionManager.getSession(sessionId);
  const summary = SessionManager.getSessionSummary(sessionId);
  
  return c.json({
    session: {
      sessionId: session.sessionId,
      messageCount: session.messages.length,
      currentDeal: session.currentDeal,
      selectedDocs: session.selectedDocs,
      submissions: session.submissions,
    },
    summary,
  });
});

// Get available documents
app.get("/documents", (c) => {
  return c.json({
    documents: Object.entries(DOCUMENT_RULES).map(([key, rule]) => ({
      id: key,
      name: rule.name,
      category: rule.category,
      requiredFields: rule.requiredFields,
      autoInclude: rule.autoInclude,
    })),
  });
});

// Helper functions for action execution
async function executeSendDocs(sessionId: string, payload: any) {
  const session = SessionManager.getSession(sessionId);
  const dealIntent = session.currentDeal;
  
  // Generate field mappings
  const fieldMappings = DocumentAutomation.generateFieldMappings(dealIntent, payload.suggestedDocs || []);
  
  // Generate signer roles
  const signers = DocumentAutomation.generateSignerRoles(dealIntent);
  
  // Get template IDs for selected documents
  const templateIds = (payload.suggestedDocs || []).map((docKey: string) => {
    const rule = DOCUMENT_RULES[docKey as DocumentRuleKey];
    return rule?.templateId;
  }).filter(Boolean);

  if (templateIds.length === 0) {
    throw new Error('No valid templates found');
  }

  // Send documents
  const result = await DocuSealService.mockSendDocuments({
    templateIds,
    submitters: signers,
    values: fieldMappings,
  });

  // Store submissions in session
  for (const submissionId of result.submissionIds) {
    const mockSubmission = await DocuSealService.mockCreateSubmission({
      templateId: templateIds[0], // Simplified for mock
      submitters: signers,
      values: fieldMappings,
    });
    mockSubmission.id = submissionId;
    SessionManager.addSubmission(sessionId, mockSubmission);
  }

  return result;
}

async function executePrefillDocs(sessionId: string, payload: any) {
  const session = SessionManager.getSession(sessionId);
  const dealIntent = session.currentDeal;
  
  // Generate field mappings
  const fieldMappings = DocumentAutomation.generateFieldMappings(dealIntent, payload.suggestedDocs || []);
  
  // Get document summary
  const summary = DocumentAutomation.getDocumentSummary(payload.suggestedDocs || [], dealIntent);
  
  return {
    fieldMappings,
    summary,
    message: `Documents prepared with ${Object.keys(fieldMappings).length} fields. ${summary.estimatedTime} estimated preparation time.`,
  };
}

async function executeRequestInfo(sessionId: string, payload: any) {
  const session = SessionManager.getSession(sessionId);
  const dealIntent = session.currentDeal;
  
  // Generate follow-up questions
  const questions = DealIntentParser.generateFollowUpQuestions(
    payload.missingFields || [],
    dealIntent
  );
  
  return {
    questions,
    message: `Please provide the following information: ${questions.join(', ')}`,
  };
}

async function executeAttachAddendum(sessionId: string, payload: any) {
  const session = SessionManager.getSession(sessionId);
  const dealIntent = session.currentDeal;
  
  // Get suggested addenda
  const suggestedDocs = DocumentAutomation.getSuggestedDocuments(dealIntent);
  
  return {
    suggestedAddenda: suggestedDocs.suggested,
    message: `Suggested addenda: ${suggestedDocs.suggested.join(', ')}`,
  };
}
  
export default app;
