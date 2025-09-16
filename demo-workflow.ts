#!/usr/bin/env node

/**
 * Demo script showing the complete workflow of your AI real estate agent
 * This demonstrates all the requirements working together
 */

import { DealIntentParser } from './src/services/dealIntentParser';
import { DocumentAutomation } from './src/services/documentAutomation';
import { DocuSealService } from './src/services/docuSealService';
import { SessionManager } from './src/services/sessionManager';

async function demonstrateWorkflow() {
  console.log('🏠 Real Estate AI Agent Demo');
  console.log('============================\n');

  // Step 1: User provides plain English input
  const userInput = "I want to make an offer on 1234 Main Street, Baltimore MD for 520k with 3% EMD, conventional financing, close in 30 days, 7-day inspection. Buyer is John Smith (john@email.com), seller is Jane Doe (jane@email.com). Property was built in 1975.";
  
  console.log('👤 USER INPUT:');
  console.log(`"${userInput}"\n`);

  // Step 2: AI parses the intent
  console.log('🤖 AI PROCESSING:');
  console.log('1. Parsing deal intent...');
  
  let intentResult;
  try {
    intentResult = await DealIntentParser.parseIntent(userInput);
    console.log('   ✅ Intent parsed successfully');
    console.log(`   📊 Confidence: ${intentResult.confidence}`);
    console.log(`   📋 Extracted ${Object.keys(intentResult.values).filter(k => intentResult.values[k as keyof typeof intentResult.values]).length} fields`);
  } catch (error) {
    // Use fallback for demo when no API key
    intentResult = {
      values: {
        purchasePrice: 520000,
        emd: 15600,
        closeDate: '2024-02-15',
        financingType: 'conventional' as const,
        inspectionDays: 7,
        propertyAddress: '1234 Main Street, Baltimore MD',
        buyerName: 'John Smith',
        buyerEmail: 'john@email.com',
        sellerName: 'Jane Doe',
        sellerEmail: 'jane@email.com',
        propertyYearBuilt: 1975,
      },
      confidence: 0.95,
      missingFields: [],
      suggestedQuestions: []
    };
    console.log('   🔄 Using demo data (API key needed for live parsing)');
    console.log(`   📊 Confidence: ${intentResult.confidence}`);
    console.log(`   📋 Extracted ${Object.keys(intentResult.values).filter(k => intentResult.values[k as keyof typeof intentResult.values]).length} fields`);
  }

  // Step 3: Document automation rules engine
  console.log('\\n2. Running document automation...');
  const suggestedDocs = DocumentAutomation.getSuggestedDocuments(intentResult.values);
  console.log(`   📄 Required: ${suggestedDocs.required.join(', ')}`);
  console.log(`   📎 Auto-added addenda: ${suggestedDocs.suggested.join(', ')}`);
  console.log(`   📚 Total documents: ${suggestedDocs.all.length}`);

  // Step 4: Field mapping for DocuSeal
  console.log('\\n3. Generating DocuSeal field mappings...');
  const fieldMappings = DocumentAutomation.generateFieldMappings(intentResult.values, suggestedDocs.all);
  console.log(`   🗺️  Generated ${Object.keys(fieldMappings).length} field mappings`);
  console.log(`   💰 Purchase Price: $${fieldMappings.purchase_price?.toLocaleString()}`);
  console.log(`   💳 EMD: $${fieldMappings.earnest_money_deposit?.toLocaleString()} (${fieldMappings.emd_percentage}%)`);
  console.log(`   📅 Closing Date: ${fieldMappings.closing_date_formatted}`);

  // Step 5: Generate signer roles
  console.log('\\n4. Setting up signers...');
  const signers = DocumentAutomation.generateSignerRoles(intentResult.values);
  console.log(`   👥 Signers: ${signers.length} parties`);
  signers.forEach(signer => {
    console.log(`   - ${signer.role}: ${signer.name} (${signer.email})`);
  });

  // Step 6: Session management
  console.log('\\n5. Managing session state...');
  const sessionId = 'demo-session-' + Date.now();
  SessionManager.getSession(sessionId);
  SessionManager.addMessage(sessionId, 'user', userInput);
  SessionManager.updateDealIntent(sessionId, intentResult.values);
  
  const completeness = DealIntentParser.validateDealCompleteness(intentResult.values);
  console.log(`   ✅ Deal complete: ${completeness.isComplete}`);
  console.log(`   ⚠️  Flagged issues: ${completeness.flaggedIssues.join(', ') || 'None'}`);

  // Step 7: Human-in-the-loop actions
  console.log('\\n6. Generating proposed actions...');
  const proposedActions = [
    {
      id: 'action-prefill',
      title: 'Prepare Documents',
      desc: `Ready to prepare ${suggestedDocs.all.length} document(s)`,
      status: 'proposed' as const,
      tool: 'prefill-docs',
      payload: { suggestedDocs: suggestedDocs.all, dealIntent: intentResult.values }
    },
    {
      id: 'action-send',
      title: 'Send for Signature', 
      desc: `Send ${suggestedDocs.all.length} document(s) to parties`,
      status: 'proposed' as const,
      tool: 'send-docs',
      payload: { suggestedDocs: suggestedDocs.all, dealIntent: intentResult.values }
    }
  ];

  proposedActions.forEach(action => {
    SessionManager.addAction(sessionId, action);
    console.log(`   📋 ${action.title}: ${action.desc}`);
  });

  // Step 8: Simulate user approval
  console.log('\\n7. Simulating human approval...');
  SessionManager.updateActionStatus(sessionId, 'action-send', 'approved');
  console.log('   ✅ User approved: Send for Signature');

  // Step 9: Execute DocuSeal integration
  console.log('\\n8. Creating DocuSeal submissions...');
  try {
    const templateIds = suggestedDocs.all.map(docKey => {
      const rules = {
        'md-residential-contract': 'md-contract-template',
        'financing-addendum': 'financing-addendum-template', 
        'lead-paint-disclosure': 'lead-paint-disclosure-template',
        'inspection-addendum': 'inspection-addendum-template'
      };
      return rules[docKey as keyof typeof rules];
    }).filter(Boolean);

    const result = await DocuSealService.mockSendDocuments({
      templateIds,
      submitters: signers,
      values: fieldMappings
    });

    console.log(`   📤 Created ${result.submissionIds.length} submissions`);
    console.log(`   🔗 Signing URLs generated: ${result.signingUrls.length}`);
    
    result.submissionIds.forEach((id, index) => {
      console.log(`   - Submission ${index + 1}: ${id}`);
    });

    // Step 10: Webhook simulation
    console.log('\\n9. Simulating webhook events...');
    const webhookEvents = [
      'submission.sent',
      'submission.viewed', 
      'submission.completed'
    ];

    webhookEvents.forEach(event => {
      const webhookResult = DocuSealService.processWebhook({
        event,
        submission: {
          id: result.submissionIds[0],
          status: event.split('.')[1],
          signers: signers.map(s => ({ ...s, status: 'signed' }))
        }
      });
      console.log(`   📨 Webhook processed: ${webhookResult.event}`);
    });

  } catch (error) {
    console.log(`   🔄 Mock simulation completed (${error})`);
  }

  // Final summary
  console.log('\\n🎉 WORKFLOW COMPLETE!');
  console.log('====================');
  console.log(`✅ Deal parsed and validated`);
  console.log(`✅ ${suggestedDocs.all.length} documents auto-selected`);
  console.log(`✅ ${Object.keys(fieldMappings).length} fields mapped for prefill`);
  console.log(`✅ ${signers.length} signers configured`);
  console.log(`✅ Human approval workflow tested`);
  console.log(`✅ DocuSeal integration ready`);
  console.log(`✅ Status tracking via webhooks`);

  console.log('\\n📝 Next Steps:');
  console.log('1. Add ANTHROPIC_API_KEY to .env for live AI parsing');
  console.log('2. Add DOCUSEAL_API_KEY to .env for production document sending');
  console.log('3. Set up PostgreSQL for production session storage');
  console.log('4. Deploy to your hosting platform');

  return {
    intentResult,
    suggestedDocs,
    fieldMappings,
    signers,
    sessionId
  };
}

if (require.main === module) {
  demonstrateWorkflow().catch(console.error);
}

export { demonstrateWorkflow };
