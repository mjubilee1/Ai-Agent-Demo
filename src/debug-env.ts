import 'dotenv/config';

console.log('🔍 Debugging Environment Variables:');
console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Not set');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set');
console.log('PINECONE_API_KEY:', process.env.PINECONE_API_KEY ? '✅ Set' : '❌ Not set');
console.log('DOCUSEAL_API_KEY:', process.env.DOCUSEAL_API_KEY ? '✅ Set' : '❌ Not set');

if (process.env.ANTHROPIC_API_KEY) {
  console.log('ANTHROPIC_API_KEY length:', process.env.ANTHROPIC_API_KEY.length);
  console.log('ANTHROPIC_API_KEY starts with:', process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...');
}
