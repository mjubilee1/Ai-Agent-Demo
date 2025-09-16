import 'dotenv/config';
import Anthropic from "@anthropic-ai/sdk";
import { DealIntentSchema, DealIntent, ParseIntentResponseSchema } from "../types";

const anthropic = new Anthropic({ 
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export class DealIntentParser {
  private static readonly SYSTEM_PROMPT = `You are an expert real estate deal parser. Extract structured deal information from plain English text.

CRITICAL RULES:
1. NEVER hallucinate values - if a field is not mentioned, mark it as missing
2. Use exact values mentioned (e.g., if they say "520k", use 520000)
3. Normalize dates to ISO format (YYYY-MM-DD)
4. Normalize addresses to standard format
5. Categorize financing types: conventional, fha, va, cash, other
6. Return confidence scores based on clarity of information

Return ONLY valid JSON in this exact format:
{
  "values": {
    "purchasePrice": number | null,
    "emd": number | null,
    "closeDate": "YYYY-MM-DD" | null,
    "financingType": "conventional" | "fha" | "va" | "cash" | "other" | null,
    "inspectionDays": number | null,
    "propertyAddress": string | null,
    "buyerName": string | null,
    "buyerEmail": string | null,
    "sellerName": string | null,
    "sellerEmail": string | null,
    "propertyYearBuilt": number | null
  },
  "confidence": number (0-1),
  "missingFields": ["field1", "field2"],
  "suggestedQuestions": ["question1", "question2"]
}`;

  static async parseIntent(text: string): Promise<{
    values: DealIntent;
    confidence: number;
    missingFields: string[];
    suggestedQuestions: string[];
  }> {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        system: this.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
      });

      const responseText = message.content
        .map((p) => ('text' in p ? p.text : ''))
        .join('')
        .trim();

      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate with Zod
      const validated = ParseIntentResponseSchema.parse(parsed);
      
      return {
        values: validated.values,
        confidence: validated.confidence,
        missingFields: validated.missingFields,
        suggestedQuestions: validated.suggestedQuestions,
      };
    } catch (error) {
      console.error('Error parsing deal intent:', error);
      
      // Return safe fallback
      return {
        values: {},
        confidence: 0,
        missingFields: ['purchasePrice', 'emd', 'closeDate', 'propertyAddress'],
        suggestedQuestions: [
          'What is the purchase price?',
          'What is the earnest money deposit amount?',
          'When do you want to close?',
          'What is the property address?',
        ],
      };
    }
  }

  static generateFollowUpQuestions(missingFields: string[], currentDeal: DealIntent): string[] {
    const questions: string[] = [];
    
    const fieldQuestions: Record<string, string> = {
      purchasePrice: 'What is the purchase price?',
      emd: 'What is the earnest money deposit amount?',
      closeDate: 'When do you want to close? (e.g., "30 days", "March 15th")',
      financingType: 'What type of financing? (conventional, FHA, VA, cash, or other)',
      inspectionDays: 'How many days for inspection period?',
      propertyAddress: 'What is the property address?',
      buyerName: 'What is the buyer\'s name?',
      buyerEmail: 'What is the buyer\'s email?',
      sellerName: 'What is the seller\'s name?',
      sellerEmail: 'What is the seller\'s email?',
      propertyYearBuilt: 'What year was the property built?',
    };

    missingFields.forEach(field => {
      if (fieldQuestions[field]) {
        questions.push(fieldQuestions[field]);
      }
    });

    // Add contextual questions based on current deal
    if (currentDeal.financingType === 'conventional' && !currentDeal.inspectionDays) {
      questions.push('How many days for the inspection period?');
    }

    if (currentDeal.propertyYearBuilt && currentDeal.propertyYearBuilt < 1978) {
      questions.push('Do you need a Lead-Based Paint Disclosure? (Required for properties built before 1978)');
    }

    return questions.slice(0, 5); // Limit to 5 questions
  }

  static validateDealCompleteness(deal: DealIntent): {
    isComplete: boolean;
    missingRequired: string[];
    flaggedIssues: string[];
  } {
    const requiredFields = ['purchasePrice', 'emd', 'closeDate', 'propertyAddress'];
    const missingRequired = requiredFields.filter(field => !deal[field as keyof DealIntent]);
    
    const flaggedIssues: string[] = [];
    
    // Check for potential issues
    if (deal.purchasePrice && deal.emd && deal.emd > deal.purchasePrice * 0.1) {
      flaggedIssues.push('EMD amount seems high (>10% of purchase price)');
    }
    
    if (deal.closeDate) {
      const closeDate = new Date(deal.closeDate);
      const today = new Date();
      const daysDiff = Math.ceil((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff < 7) {
        flaggedIssues.push('Close date is very soon (<7 days)');
      }
      if (daysDiff > 90) {
        flaggedIssues.push('Close date is far in the future (>90 days)');
      }
    }
    
    if (deal.inspectionDays && deal.inspectionDays > 30) {
      flaggedIssues.push('Inspection period is unusually long (>30 days)');
    }
    
    return {
      isComplete: missingRequired.length === 0,
      missingRequired,
      flaggedIssues,
    };
  }
}
