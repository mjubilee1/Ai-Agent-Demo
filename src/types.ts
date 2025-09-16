import { z } from 'zod';

// Core deal intent parsing schemas
export const DealIntentSchema = z.object({
  purchasePrice: z.number().positive().optional(),
  emd: z.number().positive().optional(),
  closeDate: z.string().optional(), // ISO date string
  financingType: z.enum(['conventional', 'fha', 'va', 'cash', 'other']).optional(),
  inspectionDays: z.number().min(0).optional(),
  propertyAddress: z.string().optional(),
  buyerName: z.string().optional(),
  buyerEmail: z.string().email().optional(),
  sellerName: z.string().optional(),
  sellerEmail: z.string().email().optional(),
  propertyYearBuilt: z.number().min(1800).max(new Date().getFullYear()).optional(),
});

export type DealIntent = z.infer<typeof DealIntentSchema>;

// Document automation schemas
export const DocumentTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  templateId: z.string(), // DocuSeal template ID
  category: z.enum(['contract', 'addendum', 'disclosure']),
  requiredFields: z.array(z.string()),
  autoInclude: z.object({
    financingType: z.array(z.string()).optional(),
    inspectionDays: z.number().optional(),
    propertyYearBuilt: z.number().optional(),
  }).optional(),
});

export type DocumentTemplate = z.infer<typeof DocumentTemplateSchema>;

// DocuSeal integration schemas
export const DocuSealSubmissionSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  status: z.enum(['draft', 'sent', 'viewed', 'completed', 'declined']),
  createdAt: z.string(),
  updatedAt: z.string(),
  signers: z.array(z.object({
    email: z.string(),
    name: z.string(),
    role: z.string(),
    status: z.enum(['pending', 'viewed', 'signed', 'declined']),
  })),
  signingUrl: z.string().optional(),
});

export type DocuSealSubmission = z.infer<typeof DocuSealSubmissionSchema>;

// API request/response schemas
export const ChatRequestSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  jurisdiction: z.string().default('MD'),
  context: z.object({
    selectedDocs: z.array(z.string()).optional(),
    parties: z.record(z.string(), z.string()).optional(),
    currentDeal: DealIntentSchema.optional(),
  }).optional(),
});

export const ParseIntentRequestSchema = z.object({
  text: z.string(),
});

export const SendDocsRequestSchema = z.object({
  templateIds: z.array(z.string()),
  submitters: z.array(z.object({
    email: z.string().email(),
    name: z.string(),
    role: z.string(),
  })),
  values: z.record(z.string(), z.any()).optional(),
  dealIntent: DealIntentSchema.optional(),
});

export const ApproveRequestSchema = z.object({
  sessionId: z.string(),
  actionId: z.string(),
  action: z.enum(['send-docs', 'prefill-docs', 'request-info', 'attach-addendum']),
  payload: z.record(z.string(), z.any()).optional(),
});

export const DocuSealWebhookSchema = z.object({
  event: z.enum(['submission.created', 'submission.sent', 'submission.viewed', 'submission.completed', 'submission.declined']),
  submission: DocuSealSubmissionSchema,
});

// Response schemas
export const ChatResponseSchema = z.object({
  reply: z.object({
    text: z.string(),
    proposedActions: z.array(z.object({
      id: z.string(),
      title: z.string(),
      desc: z.string().optional(),
      status: z.enum(['proposed', 'approved', 'rejected']),
      tool: z.string().optional(),
      payload: z.record(z.string(), z.any()).optional(),
    })),
    chunks: z.array(z.object({
      source: z.string(),
      snippet: z.string(),
    })),
    dealSummary: z.object({
      currentValues: DealIntentSchema,
      missingFields: z.array(z.string()),
      flaggedIssues: z.array(z.string()),
      suggestedAddenda: z.array(z.string()),
    }).optional(),
  }),
});

export const ParseIntentResponseSchema = z.object({
  values: DealIntentSchema,
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
  suggestedQuestions: z.array(z.string()),
});

export const SendDocsResponseSchema = z.object({
  submissionIds: z.array(z.string()),
  signingUrls: z.array(z.string()),
  status: z.string(),
});

// Internal types
export type ProposedAction = {
  id: string;
  title: string;
  desc?: string;
  status: 'proposed' | 'approved' | 'rejected';
  tool?: string;
  payload?: any;
};

export type ChatSession = {
  sessionId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    text: string;
    ts: number;
  }>;
  currentDeal: DealIntent;
  selectedDocs: string[];
  submissions: DocuSealSubmission[];
};

// Document automation rules
export const DOCUMENT_RULES = {
  'md-residential-contract': {
    name: 'MD Residential Contract of Sale',
    templateId: 'md-contract-template',
    category: 'contract' as const,
    requiredFields: ['purchasePrice', 'emd', 'closeDate', 'propertyAddress', 'buyerName', 'sellerName'],
  },
  'financing-addendum': {
    name: 'Financing Addendum',
    templateId: 'financing-addendum-template',
    category: 'addendum' as const,
    autoInclude: {
      financingType: ['conventional', 'fha', 'va'],
    },
  },
  'lead-paint-disclosure': {
    name: 'Lead-Based Paint Disclosure',
    templateId: 'lead-paint-disclosure-template',
    category: 'disclosure' as const,
    autoInclude: {
      propertyYearBuilt: 1978, // Include if property built before 1978
    },
  },
  'inspection-addendum': {
    name: 'Inspection Addendum',
    templateId: 'inspection-addendum-template',
    category: 'addendum' as const,
    autoInclude: {
      inspectionDays: 1, // Include if inspection days > 0
    },
  },
} as const;

export type DocumentRuleKey = keyof typeof DOCUMENT_RULES;
