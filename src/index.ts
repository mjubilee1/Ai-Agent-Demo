import Anthropic from "@anthropic-ai/sdk";
import 'dotenv/config';
import { Hono } from 'hono';
import { ingestChat } from "./ingest";
import { DealIntentParser } from './services/dealIntentParser';
import { DocumentAutomation } from './services/documentAutomation';
import { DocuSealService } from './services/docuSealService';
import { SessionManager } from './services/sessionManager';
import {
  ChatRequestSchema,
  DOCUMENT_RULES,
  DocumentRuleKey,
  ParseIntentRequestSchema,
  SendDocsRequestSchema
} from './types';
import { retrieve } from './utils';

const app = new Hono();

function extractJsonFromModel(raw: string) {
  // 1) remove markdown code fences if present
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // 2) find first { or [ and last } or ]
  const start = unfenced.search(/[\{\[]/);
  const endObj = unfenced.lastIndexOf("}");
  const endArr = unfenced.lastIndexOf("]");
  const end = Math.max(endObj, endArr);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON found in model response. Head: ${unfenced.slice(0, 60)}`);
  }

  const jsonStr = unfenced.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

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
    const baseDeal = context?.currentDeal ?? session?.currentDeal ?? {};

    // Parse deal intent from message
    const intentResult = await DealIntentParser.parseIntent(message);
    
    // merge: new fields override old, missing fields keep old
    const mergedDeal = { ...baseDeal, ...intentResult.values };

    // Update session with new deal intent
    SessionManager.updateDealIntent(sessionId, mergedDeal);
    
    // Get suggested documents based on deal intent
    let suggestedDocs;
    let docValidation;
    try {
      suggestedDocs = DocumentAutomation.getSuggestedDocuments(mergedDeal);
      docValidation = DocumentAutomation.validateDocumentRequirements(
        suggestedDocs.all,
        mergedDeal
      );
    } catch (error) {
      console.error('Error in document automation:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      suggestedDocs = { required: ['md-residential-contract'], suggested: [], all: ['md-residential-contract'] };
      docValidation = { valid: false, missingFields: {}, suggestions: [] };
    }

    // Generate follow-up questions for missing fields
    const followUpQuestions = DealIntentParser.generateFollowUpQuestions(
      intentResult.missingFields,
      mergedDeal
    );

    // Validate deal completeness
    let completeness;
    try {
      completeness = DealIntentParser.validateDealCompleteness(mergedDeal);
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
${JSON.stringify(mergedDeal, null, 2)}

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
          model: 'claude-sonnet-4-5-20250929',
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
                text: `I understand you're working on a real estate deal. Based on your message "${message}", I can help you with the following: ${mergedDeal.purchasePrice ? `Purchase price: $${mergedDeal.purchasePrice}` : 'Please provide purchase price'}, ${mergedDeal.emd ? `EMD: ${mergedDeal.emd}%` : 'Please provide EMD percentage'}, ${mergedDeal.closeDate ? `Close date: ${mergedDeal.closeDate}` : 'Please provide close date'}.`,
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
              text: `I understand you're working on a real estate deal. Based on your message "${message}", I can help you with the following: ${mergedDeal.purchasePrice ? `Purchase price: $${mergedDeal.purchasePrice}` : 'Please provide purchase price'}, ${mergedDeal.emd ? `EMD: ${mergedDeal.emd}%` : 'Please provide EMD percentage'}, ${mergedDeal.closeDate ? `Close date: ${mergedDeal.closeDate}` : 'Please provide close date'}.`,
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
    } catch (error) {
      console.error('Error parsing AI response:', error);
    }

    // Add system-generated actions based on deal state
    /*if (intentResult.missingFields.length > 0) {
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
    }*/

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
          dealIntent: mergedDeal,
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
          currentValues: mergedDeal,
          missingFields: intentResult.missingFields,
          flaggedIssues: completeness.flaggedIssues,
          suggestedAddenda: suggestedDocs.suggested,
        },
      },
    });
  } catch (error) {
    console.log('Error in chat endpoint:', error);
    console.log('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return c.json(
      { reply: { text: 'Sorry, I encountered an error. Please try again.', proposedActions: [], chunks: [] } },
      500
    );
  }
});

app.post("/approve", async (c) => {
  try {
    const body = await c.req.json();
    const { sessionId, actionId, action, payload, context } = body;
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
        result = await executeSendDocs(sessionId, context);
        break;
      /*case 'prefill-docs':
        result = await executePrefillDocs(sessionId, context);
        break;
      case 'request-info':
        result = await executeRequestInfo(sessionId, context);
        break;
      case 'attach-addendum':
        result = await executeAttachAddendum(sessionId, context);
        break;*/
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
  const fieldMappings = DocumentAutomation.generateFieldMappings(dealIntent, payload.selectedDocs || []);
  
  // Generate signer roles
  const signers = DocumentAutomation.generateSignerRoles(dealIntent);
  
  // Get template IDs for selected documents
  const templateIds = (payload.selectedDocs ?? [])
  .map((doc: any) => {
    // doc is like { id, label, templateId }
    const directKey = doc?.id as DocumentRuleKey | undefined;
    const directRule = directKey ? DOCUMENT_RULES[directKey] : undefined;

    // ✅ 1) direct match by key
    if (directRule) return directRule.templateId;

    // ✅ 2) fallback: find rule key by matching templateId
    const byTemplateId = Object.entries(DOCUMENT_RULES).find(
      ([, rule]) => rule?.templateId === doc?.templateId
    );

    if (byTemplateId) return byTemplateId[1].templateId;

    // ✅ 3) optional fallback: match by name/label (if templateId missing)
    const byName = Object.entries(DOCUMENT_RULES).find(
      ([, rule]) =>
        typeof doc?.label === "string" &&
        typeof rule?.name === "string" &&
        rule.name.toLowerCase().includes(doc.label.toLowerCase())
    );

    return byName?.[1]?.templateId ?? null;
  })
  .filter((x): x is string | number => x != null);

  if (templateIds.length === 0) {
    throw new Error('No valid templates found');
  }

  // Send documents
  const result = await DocuSealService.sendDocuments({
    templateIds,
    submitters: signers,
    values: fieldMappings,
  });

  return result;
}

async function executePrefillDocs(sessionId: string, payload: any) {
  const session = SessionManager.getSession(sessionId);
  const dealIntent = session.currentDeal;
  
  // Generate field mappings
  const fieldMappings = DocumentAutomation.generateFieldMappings(dealIntent, payload.selectedDocs || []);
  
  // Get document summary
  const summary = DocumentAutomation.getDocumentSummary(payload.selectedDocs || [], dealIntent);
  
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
