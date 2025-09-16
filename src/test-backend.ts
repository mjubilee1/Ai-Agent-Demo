import { DealIntentParser } from './services/dealIntentParser';
import { DocumentAutomation } from './services/documentAutomation';
import { DocuSealService } from './services/docuSealService';
import { SessionManager } from './services/sessionManager';

async function testBackend() {
  console.log('🧪 Testing Real Estate Deal Automation Backend\n');

  // Test 1: Deal Intent Parsing
  console.log('1. Testing Deal Intent Parsing...');
  const testMessage = "Offer 520k, 3% EMD, close in 30 days, conventional financing, 7-day inspection period at 1234 Main Street, Baltimore MD 21201. Buyer is John Smith (john@email.com), seller is Jane Doe (jane@email.com). Property built in 1975.";
  
  try {
    const intentResult = await DealIntentParser.parseIntent(testMessage);
    console.log('✅ Intent parsing successful:');
    console.log('   Purchase Price:', intentResult.values.purchasePrice);
    console.log('   EMD:', intentResult.values.emd);
    console.log('   Financing Type:', intentResult.values.financingType);
    console.log('   Confidence:', intentResult.confidence);
    console.log('   Missing Fields:', intentResult.missingFields);
  } catch (error) {
    console.log('❌ Intent parsing failed:', error);
  }

  // Test 2: Document Automation
  console.log('\n2. Testing Document Automation...');
  const dealIntent = {
    purchasePrice: 520000,
    emd: 15600,
    closeDate: '2024-02-15',
    financingType: 'conventional' as const,
    inspectionDays: 7,
    propertyAddress: '1234 Main Street, Baltimore MD 21201',
    buyerName: 'John Smith',
    buyerEmail: 'john@email.com',
    sellerName: 'Jane Doe',
    sellerEmail: 'jane@email.com',
    propertyYearBuilt: 1975,
  };

  try {
    const suggestedDocs = DocumentAutomation.getSuggestedDocuments(dealIntent);
    console.log('✅ Document automation successful:');
    console.log('   Required Documents:', suggestedDocs.required);
    console.log('   Suggested Addenda:', suggestedDocs.suggested);
    console.log('   Total Documents:', suggestedDocs.all);

    const fieldMappings = DocumentAutomation.generateFieldMappings(dealIntent, suggestedDocs.all);
    console.log('   Field Mappings:', Object.keys(fieldMappings).length, 'fields');

    const signers = DocumentAutomation.generateSignerRoles(dealIntent);
    console.log('   Signers:', signers.length, 'parties');
  } catch (error) {
    console.log('❌ Document automation failed:', error);
  }

  // Test 3: Session Management
  console.log('\n3. Testing Session Management...');
  const sessionId = 'test-session-' + Date.now();
  
  try {
    SessionManager.getSession(sessionId);
    SessionManager.addMessage(sessionId, 'user', testMessage);
    SessionManager.updateDealIntent(sessionId, dealIntent);
    
    const session = SessionManager.getSession(sessionId);
    const summary = SessionManager.getSessionSummary(sessionId);
    
    console.log('✅ Session management successful:');
    console.log('   Session ID:', session.sessionId);
    console.log('   Messages:', session.messages.length);
    console.log('   Deal Complete:', summary.dealComplete);
  } catch (error) {
    console.log('❌ Session management failed:', error);
  }

  // Test 4: DocuSeal Mock Service
  console.log('\n4. Testing DocuSeal Mock Service...');
  try {
    const mockSubmission = await DocuSealService.mockCreateSubmission({
      templateId: 'md-contract-template',
      submitters: [
        { email: 'buyer@example.com', name: 'John Buyer', role: 'buyer' },
        { email: 'seller@example.com', name: 'Jane Seller', role: 'seller' },
      ],
      values: {
        purchase_price: 520000,
        earnest_money_deposit: 15600,
      },
    });

    console.log('✅ DocuSeal mock service successful:');
    console.log('   Submission ID:', mockSubmission.id);
    console.log('   Status:', mockSubmission.status);
    console.log('   Signers:', mockSubmission.signers.length);
  } catch (error) {
    console.log('❌ DocuSeal mock service failed:', error);
  }

  // Test 5: Deal Validation
  console.log('\n5. Testing Deal Validation...');
  try {
    const completeness = DealIntentParser.validateDealCompleteness(dealIntent);
    console.log('✅ Deal validation successful:');
    console.log('   Is Complete:', completeness.isComplete);
    console.log('   Missing Required:', completeness.missingRequired);
    console.log('   Flagged Issues:', completeness.flaggedIssues);
  } catch (error) {
    console.log('❌ Deal validation failed:', error);
  }

  console.log('\n🎉 Backend testing completed!');
  console.log('\nNote: Some features require API keys to be configured in .env file');
  console.log('Required environment variables:');
  console.log('- ANTHROPIC_API_KEY (for intent parsing)');
  console.log('- OPENAI_API_KEY (for embeddings)');
  console.log('- PINECONE_API_KEY (for vector search)');
  console.log('- DOCUSEAL_API_KEY (for production DocuSeal integration)');
}

// Run tests if this file is executed directly
if (require.main === module) {
  testBackend().catch(console.error);
}

export { testBackend };
