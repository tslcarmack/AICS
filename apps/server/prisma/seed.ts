import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@aics.com' },
    update: {},
    create: {
      email: 'admin@aics.com',
      name: 'Admin',
      passwordHash: adminPassword,
      role: 'admin',
    },
  });
  console.log(`  ✓ Admin user: ${admin.email}`);

  // Seed system preset intents
  const presetIntents = [
    { name: 'Greeting', description: 'Customer sends a greeting or general hello message' },
    { name: 'Order Inquiry', description: 'Customer asks about their order status, tracking, or delivery' },
    { name: 'Return/Refund', description: 'Customer wants to return a product or request a refund' },
    { name: 'Product Question', description: 'Customer asks about product features, specifications, or availability' },
    { name: 'Complaint', description: 'Customer expresses dissatisfaction or files a complaint' },
    { name: 'Shipping Inquiry', description: 'Customer asks about shipping methods, costs, or delivery time' },
    { name: 'Account Issue', description: 'Customer has issues with their account, login, or password' },
    { name: 'Technical Support', description: 'Customer needs help with technical issues or troubleshooting' },
    { name: 'Billing Issue', description: 'Customer has questions about charges, payments, or invoices' },
    { name: 'General Inquiry', description: 'General questions that do not fit other categories' },
  ];

  for (const intent of presetIntents) {
    await prisma.intent.upsert({
      where: { id: `preset-${intent.name.toLowerCase().replace(/[\s/]+/g, '-')}` },
      update: {},
      create: {
        id: `preset-${intent.name.toLowerCase().replace(/[\s/]+/g, '-')}`,
        name: intent.name,
        description: intent.description,
        type: 'preset',
        exampleUtterances: [],
        enabled: true,
      },
    });
  }
  console.log(`  ✓ ${presetIntents.length} preset intents`);

  // Migrate existing Intent.boundAgentId to IntentAction records
  const intentsWithAgent = await prisma.intent.findMany({
    where: { boundAgentId: { not: null } },
    select: { id: true, boundAgentId: true },
  });
  for (const intent of intentsWithAgent) {
    const existing = await prisma.intentAction.findFirst({
      where: { intentId: intent.id },
    });
    if (!existing && intent.boundAgentId) {
      await prisma.intentAction.create({
        data: {
          intentId: intent.id,
          type: 'execute_agent',
          config: { agentId: intent.boundAgentId },
          order: 1,
        },
      });
    }
  }
  if (intentsWithAgent.length > 0) {
    console.log(`  ✓ Migrated ${intentsWithAgent.length} intent(s) from boundAgentId to IntentAction`);
  }

  // Seed system preset variables
  const presetVariables = [
    { name: 'CustomerName', type: 'value' },
    { name: 'CustomerEmail', type: 'value' },
    { name: 'OrderNumber', type: 'value', smartExtractionEnabled: true },
    { name: 'ProductName', type: 'value' },
    { name: 'Platform', type: 'list' },
    { name: 'Category', type: 'list', smartExtractionEnabled: true },
    { name: 'Language', type: 'value' },
    { name: 'TicketPriority', type: 'list' },
  ];

  for (const variable of presetVariables) {
    await prisma.variable.upsert({
      where: { name: variable.name },
      update: {},
      create: {
        name: variable.name,
        type: variable.type,
        isSystem: true,
        smartExtractionEnabled: variable.smartExtractionEnabled || false,
      },
    });
  }
  console.log(`  ✓ ${presetVariables.length} preset variables`);

  // Seed Platform list items
  const platformVar = await prisma.variable.findUnique({ where: { name: 'Platform' } });
  if (platformVar) {
    const platforms = ['Amazon', 'eBay', 'Shopify', 'AliExpress', 'Walmart', 'Other'];
    for (const p of platforms) {
      await prisma.variableListItem.upsert({
        where: { id: `platform-${p.toLowerCase()}` },
        update: {},
        create: {
          id: `platform-${p.toLowerCase()}`,
          variableId: platformVar.id,
          value: p,
          keywords: [p.toLowerCase()],
        },
      });
    }
  }

  // Seed built-in safety rules
  const safetyRules = [
    { name: 'Fabricated Link Check', description: 'Check if reply contains URLs not found in knowledge base', checkType: 'llm', severity: 'high', action: 'block' },
    { name: 'Fabricated Escalation Check', description: 'Detect AI claiming escalation to human without actual action', checkType: 'llm', severity: 'high', action: 'block' },
    { name: 'Invalid Help Check', description: 'Detect unhelpful responses like "unable to assist"', checkType: 'llm', severity: 'medium', action: 'flag' },
    { name: 'Customer Service Stance Check', description: 'Detect unfriendly content that may upset customers', checkType: 'llm', severity: 'medium', action: 'flag' },
    { name: 'Repeated Response Check', description: 'Detect repeated questions or identical phrasing (threshold: 3)', checkType: 'keyword', severity: 'medium', action: 'flag' },
    { name: 'Service Attitude Check', description: 'Detect rudeness, threats, sarcasm, or aggressive content', checkType: 'llm', severity: 'high', action: 'block' },
    { name: 'Language Consistency Check', description: 'Verify reply language matches customer message language', checkType: 'llm', severity: 'medium', action: 'flag' },
  ];

  for (const rule of safetyRules) {
    const ruleId = `builtin-${rule.name.toLowerCase().replace(/\s+/g, '-')}`;
    await prisma.safetyRule.upsert({
      where: { id: ruleId },
      update: {},
      create: {
        id: ruleId,
        name: rule.name,
        description: rule.description,
        type: 'builtin',
        checkType: rule.checkType,
        severity: rule.severity,
        action: rule.action,
        enabled: true,
      },
    });
  }
  console.log(`  ✓ ${safetyRules.length} built-in safety rules`);

  // Seed default settings
  const defaultSettings = [
    { key: 'llm_provider', value: 'openai' },
    { key: 'llm_model', value: 'gpt-4' },
    { key: 'llm_embedding_model', value: 'text-embedding-ada-002' },
    { key: 'auto_reply_enabled', value: true },
    { key: 'auto_learning_enabled', value: false },
    { key: 'safety_strictness', value: 'normal' },
    { key: 'pipeline_max_retries', value: 3 },
    { key: 'pipeline_timeout_ms', value: 300000 },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as any },
    });
  }
  console.log(`  ✓ ${defaultSettings.length} default settings`);

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
