import { DealIntent, DOCUMENT_RULES, DocumentRuleKey } from "../types";

export class DocumentAutomation {
  /**
   * Determine which documents should be included based on deal intent
   */
  static getSuggestedDocuments(dealIntent: DealIntent): {
    required: DocumentRuleKey[];
    suggested: DocumentRuleKey[];
    all: DocumentRuleKey[];
  } {
    const required: DocumentRuleKey[] = ['md-residential-contract'];
    const suggested: DocumentRuleKey[] = [];

    // Check financing addendum
    if (dealIntent.financingType && ['conventional', 'fha', 'va'].includes(dealIntent.financingType)) {
      suggested.push('financing-addendum');
    }

    // Check lead paint disclosure
    if (dealIntent.propertyYearBuilt && dealIntent.propertyYearBuilt < 1978) {
      suggested.push('lead-paint-disclosure');
    }

    // Check inspection addendum
    if (dealIntent.inspectionDays && dealIntent.inspectionDays > 0) {
      suggested.push('inspection-addendum');
    }

    return {
      required,
      suggested,
      all: [...required, ...suggested],
    };
  }

  /**
   * Get document templates that should be auto-included
   */
  static getAutoIncludeDocuments(dealIntent: DealIntent): DocumentRuleKey[] {
    const autoInclude: DocumentRuleKey[] = [];

    Object.entries(DOCUMENT_RULES).forEach(([key, rule]) => {
      if (!rule.autoInclude) return;

      const { autoInclude } = rule;
      let shouldInclude = false;

      // Check financing type rules
      if (autoInclude.financingType && dealIntent.financingType) {
        shouldInclude = autoInclude.financingType.includes(dealIntent.financingType);
      }

      // Check inspection days rules
      if (autoInclude.inspectionDays && dealIntent.inspectionDays) {
        shouldInclude = dealIntent.inspectionDays >= autoInclude.inspectionDays;
      }

      // Check property year built rules
      if (autoInclude.propertyYearBuilt && dealIntent.propertyYearBuilt) {
        shouldInclude = dealIntent.propertyYearBuilt < autoInclude.propertyYearBuilt;
      }

      if (shouldInclude) {
        autoInclude.push(key as DocumentRuleKey);
      }
    });

    return autoInclude;
  }

  /**
   * Validate if deal has all required fields for selected documents
   */
  static validateDocumentRequirements(
    selectedDocs: DocumentRuleKey[],
    dealIntent: DealIntent
  ): {
    valid: boolean;
    missingFields: Record<string, string[]>;
    suggestions: string[];
  } {
    const missingFields: Record<string, string[]> = {};
    const suggestions: string[] = [];

    selectedDocs.forEach(docKey => {
      const rule = DOCUMENT_RULES[docKey];
      if (!rule) return;

      const missing = rule.requiredFields.filter(field => !dealIntent[field as keyof DealIntent]);
      
      if (missing.length > 0) {
        missingFields[docKey] = missing;
        suggestions.push(`${rule.name} requires: ${missing.join(', ')}`);
      }
    });

    return {
      valid: Object.keys(missingFields).length === 0,
      missingFields,
      suggestions,
    };
  }

  /**
   * Generate document field mappings for DocuSeal
   */
  static generateFieldMappings(
    dealIntent: DealIntent,
    selectedDocs: DocumentRuleKey[]
  ): Record<string, any> {
    const mappings: Record<string, any> = {};

    // Map deal fields to document fields
    const fieldMappings: Record<string, string> = {
      purchasePrice: 'purchase_price',
      emd: 'earnest_money_deposit',
      closeDate: 'closing_date',
      financingType: 'financing_type',
      inspectionDays: 'inspection_period_days',
      propertyAddress: 'property_address',
      buyerName: 'buyer_name',
      buyerEmail: 'buyer_email',
      sellerName: 'seller_name',
      sellerEmail: 'seller_email',
      propertyYearBuilt: 'property_year_built',
    };

    // Create mappings for each field that exists
    Object.entries(dealIntent).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const mappedKey = fieldMappings[key] || key;
        mappings[mappedKey] = value;
      }
    });

    // Add computed fields
    if (dealIntent.purchasePrice && dealIntent.emd) {
      mappings.emd_percentage = Math.round((dealIntent.emd / dealIntent.purchasePrice) * 100);
    }

    if (dealIntent.closeDate) {
      const closeDate = new Date(dealIntent.closeDate);
      mappings.closing_date_formatted = closeDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Add document-specific mappings
    selectedDocs.forEach(docKey => {
      const rule = DOCUMENT_RULES[docKey];
      if (!rule) return;

      // Add document identifier
      mappings[`${docKey}_included`] = true;
      mappings[`${docKey}_name`] = rule.name;
    });

    return mappings;
  }

  /**
   * Generate signer roles for documents
   */
  static generateSignerRoles(dealIntent: DealIntent): Array<{
    email: string;
    name: string;
    role: string;
  }> {
    const signers: Array<{ email: string; name: string; role: string }> = [];

    // Add buyer if available
    if (dealIntent.buyerName && dealIntent.buyerEmail) {
      signers.push({
        email: dealIntent.buyerEmail,
        name: dealIntent.buyerName,
        role: 'buyer',
      });
    }

    // Add seller if available
    if (dealIntent.sellerName && dealIntent.sellerEmail) {
      signers.push({
        email: dealIntent.sellerEmail,
        name: dealIntent.sellerName,
        role: 'seller',
      });
    }

    // Add default roles if names/emails not provided
    if (!dealIntent.buyerName || !dealIntent.buyerEmail) {
      signers.push({
        email: 'buyer@example.com',
        name: 'Buyer Name',
        role: 'buyer',
      });
    }

    if (!dealIntent.sellerName || !dealIntent.sellerEmail) {
      signers.push({
        email: 'seller@example.com',
        name: 'Seller Name',
        role: 'seller',
      });
    }

    return signers;
  }

  /**
   * Get document preparation summary
   */
  static getDocumentSummary(
    selectedDocs: DocumentRuleKey[],
    dealIntent: DealIntent
  ): {
    totalDocuments: number;
    requiredFields: string[];
    missingFields: string[];
    estimatedTime: string;
    suggestions: string[];
  } {
    const allRequiredFields = new Set<string>();
    const missingFields = new Set<string>();

    selectedDocs.forEach(docKey => {
      const rule = DOCUMENT_RULES[docKey];
      if (!rule) return;

      rule.requiredFields.forEach(field => {
        allRequiredFields.add(field);
        if (!dealIntent[field as keyof DealIntent]) {
          missingFields.add(field);
        }
      });
    });

    const suggestions: string[] = [];
    
    if (missingFields.size > 0) {
      suggestions.push(`Missing required fields: ${Array.from(missingFields).join(', ')}`);
    }

    if (selectedDocs.includes('lead-paint-disclosure')) {
      suggestions.push('Lead paint disclosure requires special handling for properties built before 1978');
    }

    if (selectedDocs.includes('inspection-addendum')) {
      suggestions.push('Inspection addendum should specify exact inspection period dates');
    }

    // Estimate preparation time
    let estimatedMinutes = selectedDocs.length * 5; // 5 minutes per document
    if (missingFields.size > 0) {
      estimatedMinutes += missingFields.size * 2; // 2 minutes per missing field
    }

    return {
      totalDocuments: selectedDocs.length,
      requiredFields: Array.from(allRequiredFields),
      missingFields: Array.from(missingFields),
      estimatedTime: `${Math.ceil(estimatedMinutes / 5) * 5} minutes`,
      suggestions,
    };
  }
}
