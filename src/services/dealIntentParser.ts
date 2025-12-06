import Anthropic from "@anthropic-ai/sdk";
import 'dotenv/config';
import { DealIntent, ParseIntentResponseSchema } from "../types";

// Initialize Anthropic client lazily to handle missing API keys gracefully
function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY not set, using mock parsing');
    return null;
  }
  try {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (error) {
    console.warn('Anthropic initialization failed in DealIntentParser:', error);
    return null;
  }
}

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

  static async parseIntent(text: string, existing?: Partial<DealIntent>): Promise<{
    values: DealIntent;
    confidence: number;
    missingFields: string[];
    suggestedQuestions: string[];
  }> {
    const anthropicClient = getAnthropic();
    
    if (!anthropicClient) {
      // Use mock parsing when Anthropic is not available
      console.log('Using mock parsing');
      return this.mockParseIntent(text);
    }

    try {
      const message = await anthropicClient.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1000,
        system: this.SYSTEM_PROMPT,
        messages: [{ role: 'user',  content: `Existing deal (may be partial):\n${JSON.stringify(existing ?? {}, null, 2)}\n\nNew message:\n${text}`
        }],
      });

      const responseText = message.content
        .map((p) => ('text' in p ? p.text : ''))
        .join('')
        .trim();

      // Extract JSON from response
      const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
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
      
      // Fall back to mock parsing
      return this.mockParseIntent(text);
    }
  }

  private static mockParseIntent(text: string): {
    values: DealIntent;
    confidence: number;
    missingFields: string[];
    suggestedQuestions: string[];
  } {
    try {
      console.log('Mock parsing text:', text);
      // Simple regex-based parsing for testing
      const values: DealIntent = {};
      const missingFields: string[] = [];
    
    // Extract purchase price - handle multiple formats
    let priceMatch = text.match(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i);
    if (!priceMatch) {
      priceMatch = text.match(/purchase\s+price\s+(?:is|of)\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i);
    }
    if (!priceMatch) {
      priceMatch = text.match(/(\d+(?:\.\d+)?)\s*k/i);
    }
    if (!priceMatch) {
      priceMatch = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:thousand|k)/i);
    }
    if (!priceMatch) {
      priceMatch = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*dollars/i);
    }
    console.log('Price match:', priceMatch);
    if (priceMatch) {
      let priceStr = priceMatch[1].replace(/,/g, '');
      let price = parseFloat(priceStr);
      console.log('Price string:', priceStr, '-> Parsed:', price);
      
      // Only check for k/thousand if the pattern matched k/thousand in the first place
      // Look for patterns like "520k", "520 thousand", etc.
      const patternHasK = /(\d+)\s*k\b/i.test(text);
      const patternHasThousand = /(\d+)\s+thousand/i.test(text);
      
      console.log('Checking multiplier - patternHasK:', patternHasK, 'patternHasThousand:', patternHasThousand);
      
      if (patternHasK || patternHasThousand) {
        price *= 1000;
        console.log('Applied k/thousand multiplier, new price:', price);
      } else {
        console.log('No k/thousand found in price pattern, keeping original price:', price);
      }
      
      values.purchasePrice = price;
      console.log('Final extracted price:', values.purchasePrice);
    } else {
      missingFields.push('purchasePrice');
    }
    
    // Extract EMD percentage - handle multiple formats  
    let emdMatch = text.match(/earnest\s+money\s+(?:is\s+)?(\d+(?:\.\d+)?)\s*%/i);
    if (!emdMatch) {
      emdMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:earnest|emd)/i);
    }
    if (!emdMatch) {
      emdMatch = text.match(/emd\s+(?:is\s+)?(\d+(?:\.\d+)?)\s*%/i);
    }
    if (!emdMatch) {
      emdMatch = text.match(/earnest\s+.*?(\d+(?:\.\d+)?)\s*%/i);
    }
    console.log('EMD match:', emdMatch);
    if (emdMatch) {
      const emdPercentage = parseFloat(emdMatch[1]);
      // Convert percentage to dollar amount if purchase price is available
      if (values.purchasePrice) {
        values.emd = (emdPercentage / 100) * values.purchasePrice;
        console.log('Extracted EMD (as dollars):', values.emd);
      } else {
        // Store as percentage for now if no purchase price
        values.emd = emdPercentage;
        console.log('Extracted EMD (as percentage):', values.emd);
        missingFields.push('purchasePrice');
      }
    } else {
      missingFields.push('emd');
    }
    
    // Extract close date - handle multiple formats
    let closeMatch = text.match(/close\s+(?:date\s+)?(?:is\s+)?(December|January|February|March|April|May|June|July|August|September|October|November)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})/i);
    if (closeMatch) {
      const month = closeMatch[1];
      const day = closeMatch[2];
      const year = closeMatch[3];
      const dateStr = `${year}-${String(new Date(`${month} 1, ${year}`).getMonth() + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
      values.closeDate = dateStr;
      console.log('Extracted close date:', values.closeDate);
    } else {
      closeMatch = text.match(/close\s+in\s+(\d+)\s+days/i);
      if (closeMatch) {
        const days = parseInt(closeMatch[1]);
        const closeDate = new Date();
        closeDate.setDate(closeDate.getDate() + days);
        values.closeDate = closeDate.toISOString().split('T')[0];
        console.log('Extracted close date (relative):', values.closeDate);
      } else {
        missingFields.push('closeDate');
      }
    }
    
    // Check for financing type
    if (text.toLowerCase().includes('conventional')) {
      values.financingType = 'conventional';
    } else if (text.toLowerCase().includes('fha')) {
      values.financingType = 'fha';
    } else if (text.toLowerCase().includes('va')) {
      values.financingType = 'va';
    } else if (text.toLowerCase().includes('cash')) {
      values.financingType = 'cash';
    }
    
    // Check for inspection days
    const inspectionMatch = text.match(/(\d+)\s*day\s*inspection/i);
    console.log('Inspection match:', inspectionMatch);
    if (inspectionMatch) {
      values.inspectionDays = parseInt(inspectionMatch[1]);
      console.log('Extracted inspection days:', values.inspectionDays);
    }
    
    // Extract property address
    const addressMatch = text.match(/(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Way|Place|Pl|Court|Ct|Circle|Cir|Boulevard|Blvd))/i);
    if (addressMatch) {
      values.propertyAddress = addressMatch[1];
    } else {
      missingFields.push('propertyAddress');
    }
    
    // Extract buyer info - handle multiple formats
    let buyerMatch = text.match(/buyer\s+is\s+([A-Za-z\s]+)\s*(?:at|\(|@)\s*([^\s\)]+@[^\s\)]+)/i);
    if (buyerMatch) {
      values.buyerName = buyerMatch[1].trim();
      values.buyerEmail = buyerMatch[2].replace(/\.$/, '').trim(); // Remove trailing period
      console.log('Extracted buyer:', values.buyerName, values.buyerEmail);
    }
    
    // Extract seller info - handle multiple formats
    let sellerMatch = text.match(/seller\s+is\s+([A-Za-z\s]+)\s*(?:at|\(|@)\s*([^\s\)]+@[^\s\)]+)/i);
    if (sellerMatch) {
      values.sellerName = sellerMatch[1].trim();
      values.sellerEmail = sellerMatch[2].replace(/\.$/, '').trim(); // Remove trailing period
      console.log('Extracted seller:', values.sellerName, values.sellerEmail);
    }
    
    // Extract property year built
    const yearMatch = text.match(/built\s+in\s+(\d{4})/i);
    if (yearMatch) {
      values.propertyYearBuilt = parseInt(yearMatch[1]);
    }
    
    const suggestedQuestions = this.generateFollowUpQuestions(missingFields, values);
    
    return {
      values,
      confidence: missingFields.length === 0 ? 0.9 : 0.6,
      missingFields,
      suggestedQuestions,
    };
    } catch (error) {
      console.error('Error in mock parsing:', error);
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
    // EMD is stored as dollar amount, so compare directly to purchase price
    if (deal.purchasePrice && deal.emd && deal.emd / deal.purchasePrice > 0.1) {
      flaggedIssues.push('EMD amount seems high (>10% of purchase price)');
    }
    
    if (deal.closeDate) {
      const closeDate = new Date(deal.closeDate);
      const today = new Date();
      const daysDiff = Math.ceil((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Only flag if date is in the future and very soon
      if (daysDiff > 0 && daysDiff < 7) {
        flaggedIssues.push('Close date is very soon (<7 days)');
      }
      if (daysDiff < 0) {
        flaggedIssues.push('Close date is in the past');
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
