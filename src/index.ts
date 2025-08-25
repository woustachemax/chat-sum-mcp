import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema,ListToolsRequestSchema} from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class SlackMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "slack-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_slack_summary",
            description: "Get a summary of recent Slack messages from channels",
            inputSchema: {
              type: "object",
              properties: {
                team_id: {
                  type: "string",
                  description: "Slack team ID to query",
                },
                channel: {
                  type: "string",
                  description: "Channel name or ID to summarize (optional, defaults to general channels)",
                },
                hours: {
                  type: "number",
                  description: "How many hours back to look (default: 24)",
                  default: 24
                },
                limit: {
                  type: "number", 
                  description: "Max messages to fetch (default: 100)",
                  default: 100
                }
              },
              required: ["team_id"],
            },
          },
          {
            name: "search_slack_messages",
            description: "Search Slack messages with a query",
            inputSchema: {
              type: "object",
              properties: {
                team_id: {
                  type: "string",
                  description: "Slack team ID to search in",
                },
                query: {
                  type: "string",
                  description: "Search query for Slack messages",
                },
                count: {
                  type: "number",
                  description: "Number of results to return (default: 20)",
                  default: 20
                }
              },
              required: ["team_id", "query"],
            },
          },
          {
            name: "list_slack_channels",
            description: "List available Slack channels for a team",
            inputSchema: {
              type: "object",
              properties: {
                team_id: {
                  type: "string",
                  description: "Slack team ID",
                },
              },
              required: ["team_id"],
            },
          },
          {
            name: "list_connected_teams",
            description: "List all connected Slack teams/workspaces",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "list_connected_teams",
            description: "List all connected Slack teams/workspaces",
            inputSchema: {
              type: "object",
              properties: {},
            },
          }
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "get_slack_summary":
            return await this.getSlackSummary(args as any);
          case "search_slack_messages":
            return await this.searchSlackMessages(args as any);
          case "list_slack_channels":
            return await this.listSlackChannels(args as any);
          case "list_connected_teams":
            return await this.listConnectedTeams();
          case "list_connected_teams":
            return await this.listConnectedTeams();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  private async getSlackToken(teamId: string): Promise<string> {
    const token = await prisma.slackToken.findUnique({
      where: { team_id: teamId }
    });
    
    if (!token) {
      throw new Error(`No Slack token found for team ${teamId}. Please authenticate first at http://localhost:3000/auth/slack/login`);
    }
    
    return token.access_token;
  }

  private async makeSlackRequest(endpoint: string, token: string, params: Record<string, any> = {}) {
    const url = new URL(`https://slack.com/api/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error || 'Unknown error'}`);
    }
    
    return data;
  }

  private async listConnectedTeams() {
    const teams = await prisma.slackToken.findMany({
      select: {
        team_id: true,
        team_name: true,
        createdAt: true
      }
    });

    let result = `**Connected Slack Workspaces** (${teams.length} total)\n\n`;
    
    if (teams.length === 0) {
      result += "No Slack workspaces connected yet.\n";
      result += "Visit http://localhost:3000/auth/slack/login to connect a workspace.\n";
    } else {
      teams.forEach(team => {
        const connected = team.createdAt.toLocaleDateString();
        result += `**${team.team_name}**\n`;
        result += `Team ID: \`${team.team_id}\`\n`;
        result += `Connected: ${connected}\n\n`;
      });
    }

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }

  private async getSlackSummary(args: { team_id: string; channel?: string; hours?: number; limit?: number }) {
    const token = await this.getSlackToken(args.team_id);
    const hours = args.hours || 24;
    const limit = args.limit || 100;
    const oldest = Math.floor((Date.now() - hours * 60 * 60 * 1000) / 1000);

    let channelId = args.channel;
    
    if (!channelId) {
      const channelsResponse = await this.makeSlackRequest('conversations.list', token, {
        types: 'public_channel',
        limit: 5
      });
      
      const channels = channelsResponse.channels.slice(0, 3);
      let allMessages: any[] = [];
      
      for (const channel of channels) {
        try {
          const historyResponse = await this.makeSlackRequest('conversations.history', token, {
            channel: channel.id,
            oldest: oldest.toString(),
            limit: Math.floor(limit / channels.length)
          });
          
          const channelMessages = historyResponse.messages.map((msg: any) => ({
            ...msg,
            channel_name: channel.name,
            channel_id: channel.id
          }));
          
          allMessages = [...allMessages, ...channelMessages];
        } catch (error) {
          console.warn(`Failed to fetch messages from channel ${channel.name}:`, error);
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: this.formatSlackSummary(allMessages, hours, channels.map((c: any) => c.name)),
          },
        ],
      };
    } else {
      // Handle specific channel
      if (!channelId.startsWith('C')) {
        const channelsResponse = await this.makeSlackRequest('conversations.list', token);
        const channel = channelsResponse.channels.find((c: any) => 
          c.name.toLowerCase() === channelId!.toLowerCase()
        );
        
        if (!channel) {
          throw new Error(`Channel "${channelId}" not found`);
        }
        channelId = channel.id;
      }

      const historyResponse = await this.makeSlackRequest('conversations.history', token, {
        channel: channelId,
        oldest: oldest.toString(),
        limit
      });

      return {
        content: [
          {
            type: "text",
            text: this.formatSlackSummary(historyResponse.messages, hours, [channelId!]),
          },
        ],
      };
    }
  }

  private async searchSlackMessages(args: { team_id: string; query: string; count?: number }) {
    const token = await this.getSlackToken(args.team_id);
    const count = args.count || 20;

    const searchResponse = await this.makeSlackRequest('search.messages', token, {
      query: args.query,
      count,
      sort: 'timestamp'
    });

    const messages = searchResponse.messages?.matches || [];
    
    return {
      content: [
        {
          type: "text",
          text: this.formatSearchResults(messages, args.query),
        },
      ],
    };
  }

  private async listSlackChannels(args: { team_id: string }) {
    const token = await this.getSlackToken(args.team_id);

    const channelsResponse = await this.makeSlackRequest('conversations.list', token, {
      types: 'public_channel,private_channel',
      limit: 100
    });

    const channels = channelsResponse.channels.map((channel: any) => ({
      id: channel.id,
      name: channel.name,
      is_private: channel.is_private,
      member_count: channel.num_members,
      topic: channel.topic?.value || '',
      purpose: channel.purpose?.value || ''
    }));

    return {
      content: [
        {
          type: "text",
          text: this.formatChannelsList(channels),
        },
      ],
    };
  }

  private formatSlackSummary(messages: any[], hours: number, channels: string[]): string {
    if (!messages.length) {
      return `No messages found in the last ${hours} hours across channels: ${channels.join(', ')}`;
    }

    messages.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));

    let summary = ` **Slack Summary** (Last ${hours} hours)\n`;
    summary += `Channels: ${channels.join(', ')}\n`;
    summary += `Messages found: ${messages.length}\n\n`;

    if (channels.length > 1) {
      const messagesByChannel = messages.reduce((acc, msg) => {
        const channelName = msg.channel_name || msg.channel_id;
        if (!acc[channelName]) acc[channelName] = [];
        acc[channelName].push(msg);
        return acc;
      }, {});

      Object.entries(messagesByChannel).forEach(([channelName, channelMessages]) => {
        summary += `\n**#${channelName}** (${(channelMessages as any[]).length} messages)\n`;
        summary += this.formatMessagesForChannel(channelMessages as any[]);
      });
    } else {
      summary += this.formatMessagesForChannel(messages);
    }

    return summary;
  }

  private formatMessagesForChannel(messages: any[]): string {
    const recentMessages = messages.slice(0, 10);
    
    let formatted = '';
    
    recentMessages.forEach(msg => {
      if (msg.text && msg.text.trim()) {
        const timestamp = new Date(parseFloat(msg.ts) * 1000).toLocaleTimeString();
        const user = msg.user || 'Unknown';
        const text = msg.text.length > 100 ? msg.text.substring(0, 100) + '...' : msg.text;
        formatted += `[${timestamp}] ${user}: ${text}\n`;
      }
    });
    
    return formatted + '\n';
  }

  private formatSearchResults(messages: any[], query: string): string {
    if (!messages.length) {
      return `No messages found for query: "${query}"`;
    }

    let result = ` **Search Results for "${query}"**\n`;
    result += `Found ${messages.length} messages\n\n`;

    messages.slice(0, 10).forEach((msg, index) => {
      const timestamp = new Date(parseFloat(msg.ts) * 1000).toLocaleString();
      const channel = msg.channel?.name || msg.channel?.id || 'Unknown';
      const user = msg.user || 'Unknown';
      const text = msg.text?.length > 150 ? msg.text.substring(0, 150) + '...' : msg.text;
      
      result += `**${index + 1}.** #${channel} - ${user} (${timestamp})\n`;
      result += `${text}\n\n`;
    });

    return result;
  }

  private formatChannelsList(channels: any[]): string {
    let result = `**Available Slack Channels** (${channels.length} total)\n\n`;
    
    channels.forEach(channel => {
      const privacy = channel.is_private ? ' Private' : ' Public';
      const members = channel.member_count ? ` • ${channel.member_count} members` : '';
      const topic = channel.topic ? ` • ${channel.topic}` : '';
      
      result += `**#${channel.name}** (${channel.id})\n`;
      result += `${privacy}${members}${topic}\n\n`;
    });

    return result;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Slack MCP server running on stdio");
  }
}

const server = new SlackMCPServer();
server.run().catch(console.error);