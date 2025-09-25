#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { initializeTokens } from './src/services/tokenManager.js';
import { initializeCache } from './src/services/cache.js';
import { initializeAuditLog } from './src/services/auditLog.js';
import { initializeBudgetStorage } from './src/services/budgetStorage.js';
import * as FreeeClient from './src/services/freeeClient.js';

// Load environment variables
dotenv.config();

class FreeeMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'freee-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.freeeClient = null;
    this.setupToolHandlers();
  }

  async initialize() {
    try {
      // Initialize services
      await Promise.all([
        initializeTokens(),
        initializeCache(),
        initializeAuditLog(),
        initializeBudgetStorage()
      ]);

      console.error('Freee MCP Server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Freee MCP Server:', error);
      throw error;
    }
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_account_items',
            description: '勘定科目マスタを取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                }
              },
              required: ['company_id']
            }
          },
          {
            name: 'get_partners',
            description: '取引先マスタを取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                }
              },
              required: ['company_id']
            }
          },
          {
            name: 'get_items',
            description: '品目マスタを取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                }
              },
              required: ['company_id']
            }
          },
          {
            name: 'get_sections',
            description: '部門マスタを取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                }
              },
              required: ['company_id']
            }
          },
          {
            name: 'get_taxes',
            description: '税区分マスタを取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                }
              },
              required: ['company_id']
            }
          },
          {
            name: 'get_tags',
            description: 'メモタグマスタを取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                }
              },
              required: ['company_id']
            }
          },
          {
            name: 'get_monthly_trends',
            description: '月次推移表を取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                },
                start_date: {
                  type: 'string',
                  description: '開始日 (YYYY-MM-DD)'
                },
                end_date: {
                  type: 'string',
                  description: '終了日 (YYYY-MM-DD)'
                }
              },
              required: ['company_id', 'start_date', 'end_date']
            }
          },
          {
            name: 'get_variance_analysis',
            description: '増減要因分析を取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                },
                current_start: {
                  type: 'string',
                  description: '当期開始日 (YYYY-MM-DD)'
                },
                current_end: {
                  type: 'string',
                  description: '当期終了日 (YYYY-MM-DD)'
                },
                previous_start: {
                  type: 'string',
                  description: '前期開始日 (YYYY-MM-DD)'
                },
                previous_end: {
                  type: 'string',
                  description: '前期終了日 (YYYY-MM-DD)'
                }
              },
              required: ['company_id', 'current_start', 'current_end', 'previous_start', 'previous_end']
            }
          },
          {
            name: 'get_entry_route_analysis',
            description: '計上ルート別集計を取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                },
                start_date: {
                  type: 'string',
                  description: '開始日 (YYYY-MM-DD)'
                },
                end_date: {
                  type: 'string',
                  description: '終了日 (YYYY-MM-DD)'
                }
              },
              required: ['company_id', 'start_date', 'end_date']
            }
          },
          {
            name: 'get_partner_yearly_summary',
            description: '取引先別年間集計を取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                },
                year: {
                  type: 'string',
                  description: '年 (YYYY)'
                }
              },
              required: ['company_id', 'year']
            }
          },
          {
            name: 'get_budgets',
            description: '予算データを取得します',
            inputSchema: {
              type: 'object',
              properties: {
                year: {
                  type: 'string',
                  description: '年'
                },
                month: {
                  type: 'string',
                  description: '月'
                }
              },
              required: ['year', 'month']
            }
          },
          {
            name: 'get_budget_comparison',
            description: '予実比較を取得します',
            inputSchema: {
              type: 'object',
              properties: {
                company_id: {
                  type: 'string',
                  description: '会社ID'
                },
                year: {
                  type: 'string',
                  description: '年'
                },
                month: {
                  type: 'string',
                  description: '月'
                }
              },
              required: ['company_id', 'year', 'month']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_account_items':
            return await this.handleGetAccountItems(args);
          case 'get_partners':
            return await this.handleGetPartners(args);
          case 'get_items':
            return await this.handleGetItems(args);
          case 'get_sections':
            return await this.handleGetSections(args);
          case 'get_taxes':
            return await this.handleGetTaxes(args);
          case 'get_tags':
            return await this.handleGetTags(args);
          case 'get_monthly_trends':
            return await this.handleGetMonthlyTrends(args);
          case 'get_variance_analysis':
            return await this.handleGetVarianceAnalysis(args);
          case 'get_entry_route_analysis':
            return await this.handleGetEntryRouteAnalysis(args);
          case 'get_partner_yearly_summary':
            return await this.handleGetPartnerYearlySummary(args);
          case 'get_budgets':
            return await this.handleGetBudgets(args);
          case 'get_budget_comparison':
            return await this.handleGetBudgetComparison(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async handleGetAccountItems(args) {
    const data = await FreeeClient.getAccountItems(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetPartners(args) {
    const data = await FreeeClient.getPartners(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetItems(args) {
    const data = await FreeeClient.getItems(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetSections(args) {
    const data = await FreeeClient.getSections(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetTaxes(args) {
    const data = await FreeeClient.getTaxes(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetTags(args) {
    const data = await FreeeClient.getTags(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetMonthlyTrends(args) {
    const data = await this.freeeClient.getMonthlyTrends(
      args.company_id,
      args.start_date,
      args.end_date
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetVarianceAnalysis(args) {
    const data = await this.freeeClient.getVarianceAnalysis(
      args.company_id,
      args.current_start,
      args.current_end,
      args.previous_start,
      args.previous_end
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetEntryRouteAnalysis(args) {
    const data = await this.freeeClient.getEntryRouteAnalysis(
      args.company_id,
      args.start_date,
      args.end_date
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetPartnerYearlySummary(args) {
    const data = await this.freeeClient.getPartnerYearlySummary(
      args.company_id,
      args.year
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetBudgets(args) {
    const data = await this.freeeClient.getBudgets(args.year, args.month);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async handleGetBudgetComparison(args) {
    const data = await this.freeeClient.getBudgetComparison(
      args.company_id,
      args.year,
      args.month
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Freee MCP Server running on stdio');
  }
}

// Start the server
const server = new FreeeMCPServer();
server.initialize().then(() => {
  server.run().catch(console.error);
}).catch(console.error);
